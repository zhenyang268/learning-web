#!/bin/zsh
# learning-web 知识库流水线总控
#
# 【WorkBuddy 沙盒内】用 wb* 命令（codebuddy --bg 派发 + transcript 回收，2026-09-24 实测）：
#   zsh build/orchestrate/pipeline.zsh wbsmoke               # 冒烟：--bg 链路 + 回收验证
#   zsh build/orchestrate/pipeline.zsh wbdispatch <batch>    # 派发批内缺口单元（至多 MAXPAR 个 --bg 会话）
#   zsh build/orchestrate/pipeline.zsh wbreview  <batch>     # 批内 gen 全 ok 后派发评审会话（glm-5.3）
#   zsh build/orchestrate/pipeline.zsh wbcollect  <batch> [--wait]  # 回收已完成会话的输出并落盘
#   zsh build/orchestrate/pipeline.zsh wbstatus   <batch>    # 查看批内每单元 gen/review 状态
#   zsh build/orchestrate/pipeline.zsh wbtask <name> <model> <prompt_file> [max_turns]
#                                                          # 带工具权限的 --bg 任务会话（前端开发等，产物=文件改动）
#
# 【WorkBuddy 之外的终端/tmux】用以下前台命令（沙盒里嵌套 -p 会假死，勿用）：
#   zsh build/orchestrate/pipeline.zsh smoke                 # 冒烟：验证 CLI 链路
#   zsh build/orchestrate/pipeline.zsh batch_hij 等          # 批生成+评审（每批结束停下，检查点）
#   zsh build/orchestrate/pipeline.zsh status [batchN]       # 查看某批状态
#   zsh build/orchestrate/pipeline.zsh fix <code> <round>    # 修复：round ∈ 1,2（修复 prompt 需先用 make_fix 生成）
#   zsh build/orchestrate/pipeline.zsh make_fix <code>       # 组装修复 prompt（prefix+草稿+评审指令）
#   zsh build/orchestrate/pipeline.zsh arbitrate <code> "升级理由"   # kimi-k3-2 仲裁
#
# 约定：批定义在 build/orchestrate/batches/<batch>.tsv，每行 "<code> <model>"。
# 幂等：输出已存在且合法 → 跳过。失败 → done 标记写 fail ec=N，不污染 json/。
# wb* 命令的会话清单在 build/state/bg/<batch>.manifest.tsv（kind/code/name/shortid/派发时间）。
# 注意：PY 必须经 pyrun 函数调用（zsh 不对 $PY 变量做分词，直接 $PY 会把
#       "uv run python" 当成一个命令名——2026-09-24 冒烟实测踩过）。

set -u
setopt TYPESET_SILENT   # 否则 `local x y`（无初值）会向 stdout 打 x='' 噪点
cd "$(dirname $0)/../.."   # learning-web 根目录

# 生成模型可配（deepseek-v4.1-flash 2026-09-24 被限额，默认换 glm-5.3-flashx；
# 额度恢复后可 GEN_MODEL=deepseek-v4.1-flash zsh pipeline.zsh ... 覆盖）
GEN_MODEL="${GEN_MODEL:-glm-5.3-flashx}"

PREFIX=build/prompts/gen_prefix.md
REVIEW_TASK=build/prompts/review_task.md
BATCHES=build/orchestrate/batches
DONE=build/state/done
LOGS=build/logs
REVIEWS=build/state/review
ARBIT=build/state/arbitration
TIMEOUT_SECS=1800
MAXPAR=${MAXPAR:-3}
RETRIES=1        # 每单元自动重试次数（首次失败后再试 1 次）
BGSTATE=build/state/bg
FALLBACK_MODEL="${FALLBACK_MODEL:-}"   # 非空时给 --bg 会话加 --fallback-model（过载自动降级）
mkdir -p "$DONE" "$LOGS" "$REVIEWS" "$ARBIT" "$BGSTATE"

# ---------- 基础函数 ----------

pyrun() { uv run python "$@"; }

# 生成单元切片文件拼接（组码 A2 → A2/*.md 全部；小目码 A1.1 → 精确文件）
slice_files() {
  local code=$1
  local chapter="${code%%.*}"
  local d="build/slices/$chapter"
  if [ -f "$d/$code.md" ] && [ "$code" != "$chapter" ]; then
    echo "$d/$code.md"    # 小目粒度：只要精确文件
  else
    echo "$d/$code"*.md   # 组粒度：全部孩子
  fi
}

# attempt_once <id> <model> <pf> <raw> <err> —— 单次 CLI 调用，返回 0 表示 raw 可解析
attempt_once() {
  local id=$1 model=$2 pf=$3 raw=$4 err=$5
  codebuddy -p --model "$model" --max-turns 1 --tools "" "$(cat $pf)" > "$raw" 2> "$err" &
  local pid=$!
  ( sleep $TIMEOUT_SECS; kill $pid 2>/dev/null ) & local wpid=$!
  wait $pid; local ec=$?
  kill $wpid 2>/dev/null; wait $wpid 2>/dev/null
  [ $ec -ne 0 ] && return $ec
  # raw 可直接解析？
  pyrun -m json.tool "$raw" >/dev/null 2>&1 && return 0
  # DSML 包裹/围栏 → 提取器
  pyrun build/orchestrate/extract_json.py < "$raw" > "${raw%.raw}.extracted" 2>/dev/null && return 0
  return 1
}

# settle_raw <raw> <out> —— 把 raw 或其提取结果规范化写入 out
settle_raw() {
  local raw=$1 out=$2 ext="${1%.raw}.extracted"
  mkdir -p "$(dirname "$out")"   # json/<章节>/ 目录可能不存在（2026-09-24 实测踩坑）
  if [ -f "$ext" ] && [ -s "$ext" ]; then
    pyrun -m json.tool "$ext" > "$out"
  else
    pyrun -m json.tool "$raw" > "$out"
  fi
}

# run_llm <id> <model> <prompt_file> <out_json> —— 含幂等跳过、提取、自动重试
run_llm() {
  local id=$1 model=$2 pf=$3 out=$4
  rm -f "$DONE/$id.done"
  if [ -f "$out" ] && pyrun -m json.tool "$out" >/dev/null 2>&1; then
    echo ok > "$DONE/$id.done"; echo "[skip] $id（已有合法产物）"; return 0
  fi
  local raw="$LOGS/$id.raw" err="$LOGS/$id.err" try=0
  while [ $try -le $RETRIES ]; do
    echo "[run ] $id ($model) 第 $((try+1)) 次尝试 ..."
    rm -f "${raw%.raw}.extracted"
    if attempt_once "$id" "$model" "$pf" "$raw" "$err"; then
      settle_raw "$raw" "$out" && { echo ok > "$DONE/$id.done"; echo "[done] $id"; return 0; }
    fi
    try=$((try+1))
    [ $try -le $RETRIES ] && echo "[retry] $id ..."
  done
  echo "fail ec=1" > "$DONE/$id.done"
  echo "[FAIL] $id —— raw: $(wc -c < $raw 2>/dev/null || echo 0) 字节；err 尾部："
  tail -3 "$err" 2>/dev/null
  return 1
}

# 并行跑一批（MAXPAR 上限）：参数为 "id|model|prompt|out" 四元组列表
run_batch() {
  local running=0
  local -a pids=()
  for spec in "$@"; do
    local id model pf out
    IFS='|' read -r id model pf out <<< "$spec"
    if [ -f "$DONE/$id.done" ] && [ "$(cat $DONE/$id.done)" = "ok" ]; then
      echo "[skip] $id"; continue
    fi
    run_llm "$id" "$model" "$pf" "$out" &
    pids+=($!); running=$((running+1))
    if [ $running -ge $MAXPAR ]; then
      wait "${pids[1]}"; pids=("${pids[@]:1}"); running=$((running-1))
    fi
  done
  wait
}

check_batch() {  # 参数：code 列表
  local ok=0 fail=0 pend=0
  for code in "$@"; do
    if [ -f "$DONE/gen_$code.done" ]; then
      if [ "$(cat $DONE/gen_$code.done)" = "ok" ]; then ok=$((ok+1)); else fail=$((fail+1)); fi
    else pend=$((pend+1)); fi
  done
  echo "生成：ok=$ok fail=$fail pending=$pend"
  [ $fail -eq 0 ] && [ $pend -eq 0 ]
}

# ---------- 组装 prompt ----------

gen_prompt_for() {  # <code> —— 输出 prompt 文件路径（前缀 + 切片，逐字节拼接）
  local code=$1
  local pf="build/prompts/gen_$code.md"
  { cat "$PREFIX"; for f in $(slice_files "$code"); do cat "$f"; echo; done; } > "$pf"
  echo "$pf"
}

review_prompt_for() {  # <code>
  local code=$1
  local pf="build/prompts/review_$code.md"
  local draft="json/${code%%.*}/$code.json"
  { cat "$REVIEW_TASK"
    echo; echo "# 待评审草稿（$code）"; echo '```json'; cat "$draft"; echo '```'
    echo; echo "# 对应原文切片"; for f in $(slice_files "$code"); do cat "$f"; echo; done
  } > "$pf"
  echo "$pf"
}

# ---------- WorkBuddy 沙盒内：--bg 派发 + transcript 回收 ----------

# unit_product_ok <kind> <code> —— 产物已存在且是合法 JSON？
unit_product_ok() {
  local kind=$1 code=$2 f
  if [ "$kind" = gen ]; then f="json/${code%%.*}/$code.json"; else f="$REVIEWS/$code.json"; fi
  [ -f "$f" ] && pyrun -m json.tool "$f" >/dev/null 2>&1
}

# unit_done_ok <kind> <code> —— done 标记或产物任一成立即视为完成（幂等安全垫）
unit_done_ok() {
  local kind=$1 code=$2
  if [ -f "$DONE/${kind}_$code.done" ] && [ "$(cat $DONE/${kind}_$code.done)" = "ok" ]; then
    return 0
  fi
  unit_product_ok "$kind" "$code" && { echo ok > "$DONE/${kind}_$code.done"; return 0; }
  return 1
}

# bg_launch <kind> <code> <model> <pf> —— 派发一个 --bg 会话，幂等（已 ok/在跑则跳过）
bg_launch() {
  local kind=$1 code=$2 model=$3 pf=$4
  local name="kb-$kind-$code"
  unit_done_ok "$kind" "$code" && { echo "[skip] $name（已完成）"; return 1; }
  if pyrun build/orchestrate/collect_bg.py --probe "$name" >/dev/null 2>&1; then
    echo "[skip] $name（已在跑）"; return 0   # 占用一个并发槽
  fi
  codebuddy rm "$name" >/dev/null 2>&1
  local out sid
  out=$(codebuddy --bg --name "$name" -p --model "$model" \
        ${FALLBACK_MODEL:+--fallback-model "$FALLBACK_MODEL"} \
        --max-turns 1 --tools "" "$(cat "$pf")" 2>&1)
  sid=$(print -r -- "$out" | awk '/backgrounded/{print $3}')
  if [ -z "$sid" ]; then
    echo "[FAIL] $name 派发失败：$out" | head -3; return 1
  fi
  echo "$kind	$code	$name	$sid	$(date +%s)" >> "$BGSTATE/manifest.tsv"
  echo "[dispatched] $name ($sid, $model)"
  return 0
}

# bg_collect_one <kind> <code> —— 回收一个会话的输出并落盘；返回 0=已落盘 2=在跑 1=失败
bg_collect_one() {
  local kind=$1 code=$2
  local name="kb-$kind-$code" raw ext out
  unit_done_ok "$kind" "$code" && return 0
  if [ "$kind" = gen ]; then
    raw="$LOGS/gen_$code.raw"; out="json/${code%%.*}/$code.json"
  else
    raw="$LOGS/review_$code.raw"; out="$REVIEWS/$code.json"
  fi
  pyrun build/orchestrate/collect_bg.py "$name" "$raw" 2>/dev/null
  local ec=$?
  [ $ec -ne 0 ] && return $ec
  # 提取 + 规范化落盘
  rm -f "${raw%.raw}.extracted"
  if pyrun -m json.tool "$raw" >/dev/null 2>&1; then
    :
  elif [ "$kind" = gen ] && pyrun build/orchestrate/extract_json.py < "$raw" > "${raw%.raw}.extracted" 2>/dev/null; then
    :
  elif [ "$kind" = review ] && pyrun build/orchestrate/strip_fence.py < "$raw" | pyrun -m json.tool > /dev/null 2>&1; then
    pyrun build/orchestrate/strip_fence.py < "$raw" > "${raw%.raw}.extracted"
  else
    echo "[FAIL] $name 输出不是合法 JSON（raw: $(wc -c < "$raw") 字节）"
    echo "fail ec=1" > "$DONE/${kind}_$code.done"; return 1
  fi
  settle_raw "$raw" "$out" && { echo ok > "$DONE/${kind}_$code.done"; echo "[collect] $name -> $out"; return 0; }
  echo "fail ec=1" > "$DONE/${kind}_$code.done"; return 1
}

# wb_dispatch_cmd <kind> <batch> —— 派发批内缺口，至多 MAXPAR 个在跑
wb_dispatch_cmd() {
  local kind=$1 b=$2
  local tsv="$BATCHES/$b.tsv"
  [ -f "$tsv" ] || { echo "批次文件不存在: $tsv"; exit 1; }
  local slots=$MAXPAR code model pf
  while read -r code model; do
    [ -z "$code" ] && continue; [[ "$code" == \#* ]] && continue
    [ $slots -le 0 ] && break
    if [ "$kind" = review ]; then
      unit_done_ok gen "$code" || continue        # gen 没完成不评审
      pf="$(review_prompt_for "$code")"; model=glm-5.3
    else
      pf="$(gen_prompt_for "$code")"
    fi
    bg_launch "$kind" "$code" "$model" "$pf" && slots=$((slots-1))
    # 注意：bg_launch 返回 1 = 已完成跳过（不占槽）；返回 0 = 新派发或已在跑（占槽）
  done < "$tsv"
}

# wb_collect_cmd <batch> [--wait] —— 回收批内所有会话；--wait 时阻塞到全部终结或超时
wb_collect_cmd() {
  local b=$1 waitflag=${2:-}
  local tsv="$BATCHES/$b.tsv"
  [ -f "$tsv" ] || { echo "批次文件不存在: $tsv"; exit 1; }
  local deadline=$(( SECONDS + TIMEOUT_SECS ))
  while true; do
    local pend=0 fail=0 ok=0 code model
    while read -r code model; do
      [ -z "$code" ] && continue; [[ "$code" == \#* ]] && continue
      for kind in gen review; do
        unit_done_ok "$kind" "$code" && continue
        # 只回收已派发的（会话存在）；未派发的不算 pending
        pyrun build/orchestrate/collect_bg.py --probe "kb-$kind-$code" >/dev/null 2>&1
        local pe=$?
        [ $pe -eq 3 ] && continue
        bg_collect_one "$kind" "$code"
        case $? in
          0) ok=$((ok+1));;
          2) pend=$((pend+1));;
          *) fail=$((fail+1));;
        esac
      done
    done < "$tsv"
    echo "--- wbcollect $b：本轮落盘 $ok，在跑 $pend，失败 $fail ---"
    [ "$waitflag" != "--wait" ] && break
    [ $pend -eq 0 ] && break
    [ $SECONDS -ge $deadline ] && { echo "超时（${TIMEOUT_SECS}s），仍有 $pend 个在跑；稍后重跑 wbcollect $b --wait"; break; }
    sleep 15
  done
  # 汇总
  local go=0 ro=0 code model
  while read -r code model; do
    [ -z "$code" ] && continue; [[ "$code" == \#* ]] && continue
    unit_done_ok gen "$code" && go=$((go+1))
    unit_done_ok review "$code" && ro=$((ro+1))
  done < "$tsv"
  echo "=== $b 汇总：gen ok=$go review ok=$ro ==="
}

# wb_status_cmd <batch>
wb_status_cmd() {
  local b=$1
  local tsv="$BATCHES/$b.tsv"
  [ -f "$tsv" ] || { echo "批次文件不存在: $tsv"; exit 1; }
  local code model g r live
  while read -r code model; do
    [ -z "$code" ] && continue; [[ "$code" == \#* ]] && continue
    g="-"; r="-"; live=""
    unit_done_ok gen "$code" && g=ok
    [ -f "$DONE/gen_$code.done" ] && [ "$g" = "-" ] && g=$(cat "$DONE/gen_$code.done")
    unit_done_ok review "$code" && r=ok
    [ -f "$DONE/review_$code.done" ] && [ "$r" = "-" ] && r=$(cat "$DONE/review_$code.done")
    pyrun build/orchestrate/collect_bg.py --probe "kb-gen-$code" >/dev/null 2>&1 && live="gen在跑"
    pyrun build/orchestrate/collect_bg.py --probe "kb-review-$code" >/dev/null 2>&1 && live="$live review在跑"
    echo "$code: gen=$g review=$r $live"
  done < "$tsv"
}

# ---------- 命令分发 ----------

cmd=${1:-help}; shift || true
case "$cmd" in
  wbsmoke)
    mkdir -p /tmp/kb_smoke
    printf '输出一个 JSON：{"ping":"pong"}。不要任何其他文字，不要调用任何工具。\n' > /tmp/kb_smoke/p.md
    rm -f build/state/smoke.json "$LOGS/gen_smoke.raw"
    codebuddy rm kb-gen-smoke >/dev/null 2>&1
    out=$(codebuddy --bg --name kb-gen-smoke -p --model "$GEN_MODEL" --max-turns 1 --tools "" "$(cat /tmp/kb_smoke/p.md)" 2>&1)
    print -r -- "$out" | grep backgrounded || { echo "派发失败：$out"; exit 1; }
    SECONDS=0; ec=2
    while [ $SECONDS -lt 300 ]; do
      pyrun build/orchestrate/collect_bg.py kb-gen-smoke "$LOGS/gen_smoke.raw" 2>/dev/null; ec=$?
      [ $ec -ne 2 ] && break
      sleep 10
    done
    if [ $ec -eq 0 ] && pyrun -m json.tool "$LOGS/gen_smoke.raw" > build/state/smoke.json 2>/dev/null; then
      echo "wbsmoke 通过："; cat build/state/smoke.json
    else
      echo "冒烟失败（ec=$ec）：看 $LOGS/gen_smoke.raw 与 collect_bg.py 输出"; exit 1
    fi
    ;;
  wbdispatch)
    wb_dispatch_cmd gen "${1:?用法: wbdispatch <batch>}"
    echo "提示：用 wbcollect ${1} --wait 阻塞等回收；或稍后手动 wbcollect ${1}"
    ;;
  wbreview)
    wb_dispatch_cmd review "${1:?用法: wbreview <batch>}"
    ;;
  wbcollect)
    wb_collect_cmd "${1:?用法: wbcollect <batch> [--wait]}" "${2:-}"
    ;;
  wbstatus)
    wb_status_cmd "${1:?用法: wbstatus <batch>}"
    ;;
  wbtask)
    # 带工具权限的 --bg 任务会话：给「需要读写文件」的任务（如前端开发）用。
    # 与 wbdispatch 的区别：不禁工具（无 --tools ""），加 -y 跳过权限弹窗（headless 必需），
    # --max-turns 默认 25。产物是文件改动，不由 wbcollect 落盘——主控用 git status/tsc 验收；
    # 会话的总结文本用 collect_bg.py 手动回收（命令见派发输出）。
    name="${1:?用法: wbtask <name> <model> <prompt_file> [max_turns]}"
    model="${2:?缺 model（如 glm-5.3-flashx / deepseek-v4.1-flash）}"
    pf="${3:?缺 prompt 文件路径}"
    mt="${4:-25}"
    [ -f "$pf" ] || { echo "prompt 文件不存在: $pf"; exit 1; }
    tname="kb-task-$name"
    codebuddy rm "$tname" >/dev/null 2>&1
    out=$(codebuddy --bg --name "$tname" -p --model "$model" -y --max-turns "$mt" "$(cat "$pf")" 2>&1)
    sid=$(print -r -- "$out" | awk '/backgrounded/{print $3}')
    [ -z "$sid" ] && { echo "[FAIL] $tname 派发失败：$out" | head -3; exit 1; }
    echo "task	$name	$tname	$sid	$(date +%s)" >> "$BGSTATE/manifest.tsv"
    echo "[dispatched] $tname ($sid, $model, max_turns=$mt)"
    echo "回收总结：uv run python build/orchestrate/collect_bg.py $tname build/logs/task_$name.raw"
    echo "判活：uv run python build/orchestrate/collect_bg.py --probe $tname（退出码 0=在跑 1=已终结 3=不存在）"
    ;;
  smoke)
    mkdir -p /tmp/kb_smoke
    printf '输出一个 JSON：{"ping":"pong"}。不要任何其他文字，不要调用任何工具。\n' > /tmp/kb_smoke/p.md
    run_llm smoke "$GEN_MODEL" /tmp/kb_smoke/p.md build/state/smoke.json
    cat build/state/smoke.json 2>/dev/null
    ;;
  batch*)
    batch="${cmd#batch}"
    tsv="$BATCHES/batch$batch.tsv"
    [ -f "$tsv" ] || { echo "批次文件不存在: $tsv"; exit 1; }
    codes=(); specs=()
    while read -r code model; do
      [ -z "$code" ] && continue
      [[ "$code" == \#* ]] && continue
      codes+=("$code")
      pf="$(gen_prompt_for "$code")"
      specs+=("gen_$code|$model|$pf|json/${code%%.*}/$code.json")
    done < "$tsv"
    echo "=== 批$batch 生成（${#codes[@]} 单元，并发上限 $MAXPAR，每单元至多 $((RETRIES+1)) 次尝试）==="
    run_batch "${specs[@]}"
    if ! check_batch "${codes[@]}"; then
      echo "=== 批$batch 生成未全绿，停下。失败单元直接重跑 batch$batch 即可（幂等，只补失败的）==="
      exit 1
    fi
    echo "=== 批$batch 评审（glm-5.3，100%）==="
    rspecs=()
    for code in "${codes[@]}"; do
      rpf="$(review_prompt_for "$code")"
      rspecs+=("review_$code|glm-5.3|$rpf|$REVIEWS/$code.json")
    done
    run_batch "${rspecs[@]}"
    echo "=== 批$batch 完成。评审结论在 $REVIEWS/，请回 WorkBuddy 会话读 verdict 并汇报（检查点）==="
    ;;
  make_fix)
    code=$1; round=${2:-1}
    pf="build/prompts/fix${round}_$code.md"
    { cat "$PREFIX"
      echo; echo "# 修复任务（第 $round 轮）"
      echo "把下面这份草稿按评审修复指令整体重写为修复后的完整 JSON。直接把 JSON 打印为回复正文，不要调用任何工具。"
      echo; echo "## 上一版草稿（整体重写为修复后的版本）"; echo '```json'; cat "json/${code%%.*}/$code.json"; echo '```'
      echo; echo "## 评审修复指令（逐条执行，数学关键行直接照抄正确版本）"; echo '```json'; cat "$REVIEWS/$code.json"; echo '```'
      echo; echo "输出修复后的**完整** JSON（全字段，不是补丁）。"
    } > "$pf"
    echo "已生成 $pf"
    ;;
  fix)
    code=$1; round=${2:-1}
    pf="build/prompts/fix${round}_$code.md"
    [ -f "$pf" ] || { echo "prompt 不存在，先跑 make_fix $code $round"; exit 1; }
    # 修复成功才覆盖正式产物；失败保持原状
    if run_llm "fix${round}_$code" "$GEN_MODEL" "$pf" "$LOGS/fix${round}_$code.json"; then
      pyrun -m json.tool "$LOGS/fix${round}_$code.json" > "json/${code%%.*}/$code.json" \
        && echo "已回写 json/${code%%.*}/$code.json"
    fi
    ;;
  arbitrate)
    code=$1; shift; reason="$*"
    [ -n "$reason" ] || { echo "必须提供升级理由（无理由不发起仲裁）"; exit 1; }
    pf="build/prompts/arbitrate_$code.md"
    { cat "$PREFIX"
      echo; echo "# 仲裁任务（2 轮修复仍未通过）"
      echo "升级理由：$reason"
      echo "直接把最终 JSON 打印为回复正文，不要调用任何工具。"
      echo; echo "## 当前草稿"; echo '```json'; cat "json/${code%%.*}/$code.json"; echo '```'
      echo; echo "## 评审意见"; echo '```json'; cat "$REVIEWS/$code.json"; echo '```'
      echo; echo "请独立判断：评审意见是否成立？草稿数学内容是否正确？输出修复后的完整 JSON；若认为草稿本就正确，输出原草稿并附加字段 \"arbitration_note\"。"
    } > "$pf"
    run_llm "arbitrate_$code" kimi-k3-2 "$pf" "$ARBIT/$code.json"
    echo "仲裁结论在 $ARBIT/$code.json —— 回 WorkBuddy 会话由人裁决是否采纳"
    ;;
  status)
    batch="${1:-}"
    if [ -n "$batch" ]; then
      tsv="$BATCHES/batch$batch.tsv"
      [ -f "$tsv" ] || { echo "批次文件不存在"; exit 1; }
      while read -r code model; do
        [ -z "$code" ] && continue; [[ "$code" == \#* ]] && continue
        g="?" r="?"
        [ -f "$DONE/gen_$code.done" ] && g=$(cat "$DONE/gen_$code.done")
        [ -f "$DONE/review_$code.done" ] && r=$(cat "$DONE/review_$code.done")
        echo "$code: gen=$g review=$r"
      done < "$tsv"
    else
      echo "done 标记总数: $(ls $DONE | wc -l)"; ls "$DONE"
    fi
    ;;
  *)
    sed -n '2,16p' "$0"
    ;;
esac
