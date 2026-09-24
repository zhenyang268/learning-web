#!/bin/zsh
# 串行驱动 batch：MAXPAR=1 一次派一个单元 → 阻塞回收 → 循环，直到批内 gen 全部落盘。
# 口径（2026-09-24 用户定）：生成模型 glm-5.3-flashx；串行防 429；
#   不派 glm-5.3 满血评审、不用 kimi 仲裁——评审校正由主控在会话内自己做。
# 幂等：中断后重跑只补缺口（json 已合法落盘的单元跳过）。
# 用法：zsh build/orchestrate/wb_serial.zsh <batch>     # 如 batch_hij
set -u
setopt TYPESET_SILENT
cd "$(dirname $0)/../.."
batch="${1:?用法: wb_serial.zsh <batch>}"
tsv="build/orchestrate/batches/$batch.tsv"
[ -f "$tsv" ] || { echo "批次文件不存在: $tsv"; exit 1; }
MODEL="${GEN_MODEL:-glm-5.3-flashx}"

codes=()
while read -r code model; do
  [ -z "$code" ] && continue
  [[ "$code" == \#* ]] && continue
  codes+=("$code")
done < "$tsv"

json_ok() {
  local f="json/${1%%.*}/$1.json"
  [ -f "$f" ] && uv run python -m json.tool "$f" >/dev/null 2>&1
}

round=0
while true; do
  gap=()
  for c in "${codes[@]}"; do json_ok "$c" || gap+=("$c"); done
  done_n=$(( ${#codes[@]} - ${#gap[@]} ))
  echo "[$(date '+%H:%M:%S')] $batch 进度：已落盘 $done_n/${#codes[@]}"
  if [ ${#gap} -eq 0 ]; then
    echo "=== $batch 全部 gen 落盘 ==="; break
  fi
  round=$((round+1))
  echo "--- 第 $round 轮，缺口 ${#gap[@]}：${gap[*]} ---"
  MAXPAR=1 GEN_MODEL="$MODEL" zsh build/orchestrate/pipeline.zsh wbdispatch "$batch"
  zsh build/orchestrate/pipeline.zsh wbcollect "$batch" --wait
done
echo "=== 驱动结束。下一步（主控）：抽查数学 + inject_meta + verify_kb + commit ==="
