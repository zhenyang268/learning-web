#!/bin/zsh
# 全量无人值守驱动：6 批依次串行生成 + 每批 verify 回填 + inject_meta + git commit。
# 口径（2026-09-24 用户定「一口气搞完」）：串行 MAXPAR=1 防 429；模型 glm-5.3-flashx；
#   不派 glm 满血评审、不用 kimi 仲裁——评审校正由主控在会话内人工抽查（每批 commit 后）。
# 幂等：中断/卡住后重跑本脚本即续（已落盘单元跳过，已派发托管会话被 probe+回收）。
# 用法：zsh build/orchestrate/wb_all.zsh
set -u
setopt TYPESET_SILENT
cd "$(dirname $0)/../.."
MODEL="${GEN_MODEL:-glm-5.3-flashx}"
BATCHES=(batch_hij batch_defg batch_klmqr batch_de batch_lie batch_n)

batch_codes() {  # <batch> → 每行一个 code
  local b="$1" code model
  while read -r code model; do
    [ -z "$code" ] && continue; [[ "$code" == \#* ]] && continue
    echo "$code"
  done < "build/orchestrate/batches/$b.tsv"
}

git_commit() {  # <message> —— 带锁重试（git 写操作本机被拒 unlink，见 skill）
  local msg="$1" i
  git add json/ build/ 2>/dev/null
  for i in 1 2 3 4 5 6 7 8; do
    rm -f .git/index.lock 2>/dev/null
    if git commit -m "$msg" >/tmp/gc.out 2>&1; then
      echo "[commit ok] $msg ($(git rev-parse --short HEAD))"; return 0
    fi
    if grep -qi "nothing to commit\|无文件要提交\|nothing added" /tmp/gc.out; then
      echo "[commit skip] 无改动"; return 0
    fi
    sleep 2
  done
  echo "[commit FAIL] $msg —— 尾部:"; tail -3 /tmp/gc.out; return 1
}

total_ok=0
for b in "${BATCHES[@]}"; do
  echo "########## [$b] 开始 $(date '+%m-%d %H:%M:%S') ##########"
  zsh build/orchestrate/wb_serial.zsh "$b"
  rc=$?
  existing=()
  for c in $(batch_codes "$b"); do
    [ -f "json/${c%%.*}/$c.json" ] && existing+=("$c")
  done
  if [ ${#existing} -gt 0 ]; then
    echo "[$b] verify_kb 回填数值（${#existing} 单元）..."
    VERIFY_NO_AUDIT=1 uv run python build/verify_kb.py "${existing[@]}" 2>&1 | tail -2
    echo "[$b] inject_meta..."
    uv run python build/inject_meta.py "${existing[@]}" 2>&1 | tail -1
    git_commit "feat: $b 入库（${#existing} 单元，串行 glm-flash + 数值回填）"
  else
    echo "[$b] 无落盘单元，跳过 verify/commit"
  fi
  total_ok=$((total_ok + ${#existing}))
  echo "########## [$b] 结束 $(date '+%m-%d %H:%M:%S')，累计落盘 $total_ok ##########"
  if [ $rc -eq 2 ]; then
    echo "!!! [$b] 卡住（疑似 429），中止全量。已落盘 $total_ok 单元已提交。"
    echo "!!! 额度恢复后重跑 wb_all.zsh 即续（幂等，已完成批次自动跳过）。"
    exit 2
  fi
done
echo "=== 全部 6 批完成 $(date '+%m-%d %H:%M:%S')，累计落盘 $total_ok 单元 ==="
echo "=== 收尾（主控）：全量 verify_kb + find json|wc -l(应 318) + 抽查 + 界面线 ==="
