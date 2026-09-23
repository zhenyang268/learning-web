#!/bin/zsh
# learning-web 知识库流水线总控（必须在 WorkBuddy 之外的终端/tmux 运行，DESIGN.md D16）
#
# 用法：
#   zsh build/orchestrate/pipeline.zsh smoke                 # 冒烟：验证 CLI 链路
#   zsh build/orchestrate/pipeline.zsh batch0                # 批0：A1 四小目生成+评审，然后停下（检查点①）
#   zsh build/orchestrate/pipeline.zsh batch1 ... batch4     # 后续批次（每批生成+评审后停下）
#   zsh build/orchestrate/pipeline.zsh status [batchN]       # 查看某批状态
#   zsh build/orchestrate/pipeline.zsh fix <code> <round>    # 修复：round ∈ 1,2（修复 prompt 需先用 make_fix 生成）
#   zsh build/orchestrate/pipeline.zsh make_fix <code>       # 组装修复 prompt（prefix+草稿+评审指令）
#   zsh build/orchestrate/pipeline.zsh arbitrate <code> "升级理由"   # kimi-k3-2 仲裁
#
# 约定：批定义在 build/orchestrate/batches/batchN.tsv，每行 "<code> <model>"。
# 幂等：输出已存在且合法 → 跳过。失败 → done 标记写 fail ec=N，不污染 json/。

set -u
cd "$(dirname $0)/../.."   # learning-web 根目录

PREFIX=build/prompts/gen_prefix.md
REVIEW_TASK=build/prompts/review_task.md
BATCHES=build/orchestrate/batches
DONE=build/state/done
LOGS=build/logs
REVIEWS=build/state/review
ARBIT=build/state/arbitration
PY="uv run python"
TIMEOUT_SECS=900
MAXPAR=4
mkdir -p "$DONE" "$LOGS" "$REVIEWS" "$ARBIT"

# ---------- 基础函数 ----------

json_ok() { $PY -m json.tool "$1" >/dev/null 2>&1; }

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

# run_llm <id> <model> <prompt_file> <out_json> —— 前台执行单个调用（含看门狗与落盘即校验）
run_llm() {
  local id=$1 model=$2 pf=$3 out=$4
  rm -f "$DONE/$id.done"
  if [ -f "$out" ] && json_ok "$out"; then
    echo ok > "$DONE/$id.done"; echo "[skip] $id（已有合法产物）"; return 0
  fi
  local raw="$LOGS/$id.raw" err="$LOGS/$id.err"
  echo "[run ] $id ($model) ..."
  codebuddy -p --model "$model" --max-turns 1 --tools "" "$(cat $pf)" > "$raw" 2> "$err" &
  local pid=$!
  ( sleep $TIMEOUT_SECS; kill $pid 2>/dev/null ) & local wpid=$!
  wait $pid; local ec=$?
  kill $wpid 2>/dev/null; wait $wpid 2>/dev/null
  if [ $ec -eq 0 ] && json_ok "$raw"; then
    $PY -m json.tool "$raw" > "$out" && { echo ok > "$DONE/$id.done"; echo "[done] $id"; return 0; }
  elif [ $ec -eq 0 ]; then
    # 尝试剥离 markdown 围栏后再校验
    if $PY build/orchestrate/strip_fence.py < "$raw" > "$LOGS/$id.stripped" 2>/dev/null \
       && json_ok "$LOGS/$id.stripped"; then
      $PY -m json.tool "$LOGS/$id.stripped" > "$out" && { echo ok > "$DONE/$id.done"; echo "[done] $id（剥围栏）"; return 0; }
    fi
    ec=1
  fi
  echo "fail ec=$ec" > "$DONE/$id.done"
  echo "[FAIL] $id ec=$ec —— 看 $err 尾部："; tail -5 "$err" 2>/dev/null
  return 1
}

# 并行跑一批（MAXPAR 上限）：参数为 "id|model|prompt|out" 四元组列表
run_batch() {
  local running=0
  local -a pids=() ids=()
  for spec in "$@"; do
    local id model pf out
    IFS='|' read -r id model pf out <<< "$spec"
    if [ -f "$DONE/$id.done" ] && [ "$(cat $DONE/$id.done)" = "ok" ]; then
      echo "[skip] $id"; continue
    fi
    run_llm "$id" "$model" "$pf" "$out" &
    pids+=($!); ids+=("$id"); running=$((running+1))
    if [ $running -ge $MAXPAR ]; then
      wait "${pids[1]}"; pids=("${pids[@]:1}"); ids=("${ids[@]:1}"); running=$((running-1))
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

# ---------- 命令分发 ----------

cmd=${1:-help}; shift || true
case "$cmd" in
  smoke)
    mkdir -p /tmp/kb_smoke
    printf '输出一个 JSON：{"ping":"pong"}。不要任何其他文字。\n' > /tmp/kb_smoke/p.md
    run_llm smoke deepseek-v4.1-flash /tmp/kb_smoke/p.md build/state/smoke.json
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
    echo "=== 批$batch 生成（${#codes[@]} 单元，并发上限 $MAXPAR）==="
    run_batch "${specs[@]}"
    if ! check_batch "${codes[@]}"; then
      echo "=== 批$batch 生成未全绿，停在修复。失败单元可用 make_fix + fix 修复后重跑 batch$batch（幂等）==="
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
    run_llm "fix${round}_$code" deepseek-v4.1-flash "$pf" "$LOGS/fix${round}_$code.json" \
      && $PY -m json.tool "$LOGS/fix${round}_$code.json" > "json/${code%%.*}/$code.json" \
      && echo "已回写 json/${code%%.*}/$code.json"
    ;;
  arbitrate)
    code=$1; shift; reason="$*"
    [ -n "$reason" ] || { echo "必须提供升级理由（无理由不发起仲裁）"; exit 1; }
    pf="build/prompts/arbitrate_$code.md"
    { cat "$PREFIX"
      echo; echo "# 仲裁任务（2 轮修复仍未通过）"
      echo "升级理由：$reason"
      echo; echo "## 当前草稿"; echo '```json'; cat "json/${code%%.*}/$code.json"; echo '```'
      echo; echo "## 评审意见"; echo '```json'; cat "$REVIEWS/$code.json"; echo '```'
      echo; echo "请独立判断：评审意见是否成立？草稿数学内容是否正确？输出修复后的完整 JSON；若认为草稿本就正确，输出原草稿并在 verdict 字段外附加说明字段 \"arbitration_note\"。"
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
        g="?"; r="?"
        [ -f "$DONE/gen_$code.done" ] && g=$(cat "$DONE/gen_$code.done")
        [ -f "$DONE/review_$code.done" ] && r=$(cat "$DONE/review_$code.done")
        echo "$code: gen=$g review=$r"
      done < "$tsv"
    else
      echo "done 标记总数: $(ls $DONE | wc -l)"; ls "$DONE"
    fi
    ;;
  *)
    sed -n '2,14p' "$0"
    ;;
esac
