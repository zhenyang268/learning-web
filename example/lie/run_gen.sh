#!/bin/zsh
# example/lie 卡片生成派发 —— 必须在 WorkBuddy 之外的终端/tmux 运行（DESIGN.md D16：
# 会话内嵌套 codebuddy -p 实测拿不到输出，前台/后台均然，2026-09-24 三变体复测）。
#
# 用法：  zsh /Users/apple/develop/learning/learning-web/example/lie/run_gen.sh
# 跑完：  两个 example/lie/logs/{lie12,lie3}.raw 落盘且末行带 exit=0
# 之后：  回 WorkBuddy 会话说一声，由会话侧做提取 → 评审 → 注入 → 验收。

set -u
cd "$(dirname $0)/../.."   # learning-web 根
mkdir -p example/lie/logs

MODEL=deepseek-v4.1-flash
echo "[gen] 派发两个 $MODEL 任务（并行）……"

run_one() {
  local id=$1 pf=$2
  codebuddy -p --model $MODEL --max-turns 1 --tools "" "$(cat $pf)" \
    > "example/lie/logs/$id.raw" 2> "example/lie/logs/$id.err"
  echo "$id exit=$?" >> "example/lie/logs/$id.raw"
}

run_one lie12 example/lie/prompts/gen-lie12.md &
run_one lie3  example/lie/prompts/gen-lie3.md  &
wait

echo "=== 完成（各文件末行为 exit 标记）==="
for f in example/lie/logs/lie12.raw example/lie/logs/lie3.raw; do
  echo "$f : $(wc -c < $f) 字节，末行: $(tail -1 $f)"
done
