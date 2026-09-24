# 外部终端执行手册：JSON 知识库剩余 234 单元一口气生成（2026-09-24）

> **读者**：在 WorkBuddy **之外**的终端/tmux 里手动跑流水线的操作者（用户本人）。
> WorkBuddy 会话内嵌套跑 CLI 会假死（继承会话环境变量 + 进程组回收，实测），
> 所以本手册只在外部终端用。
> 进度真源：`build/orchestrate/HANDOFF-json.md`；本文只管「怎么跑」。

## 0. 现状（开跑前核对）

- 已入库 **84/318** 单元（A/B/P/C 全篇 + H1/H2），`verify_kb.py` 全绿。
- 剩余 **234** 单元已按依赖序写好批次文件（`build/orchestrate/batches/`）：

| 批次文件 | 单元数 | 内容 |
|---|---|---|
| `batch_hij.tsv` | 30 | H3–H8.3 / I1–I9.4 / J1–J8（CG 主干，优先） |
| `batch_defg.tsv` | 23 | D1–D4 / E1–E4 / F1–F6 / G1.1–G5 |
| `batch_klmqr.tsv` | 48 | K1–K5 / L1–L9 / M1–M7 / Q1–Q11 / R1–R8 |
| `batch_de.tsv` | 61 | de1–de4（拉格朗日/哈密顿） |
| `batch_lie.tsv` | 57 | lie1–lie3（李群） |
| `batch_n.tsv` | 15 | N1–N15（partN） |

- 生成模型默认 **glm-5.3-flashx**（deepseek-v4.1-flash 2026-09-24 被限额；
  额度恢复想换回去：命令前加 `GEN_MODEL=deepseek-v4.1-flash`）。
- 评审模型 glm-5.3（批命令自动跑，100% 覆盖）。

## 1. 跑法（在 learning-web 目录，普通终端即可，无需 env -i）

```bash
cd ~/develop/learning/learning-web

# 冒烟（30 秒，验证 CLI 链路 + 额度）：
zsh build/orchestrate/pipeline.zsh smoke

# 然后逐批跑（每批结束自动停下，先验收再跑下一批）：
zsh build/orchestrate/pipeline.zsh batch_hij
zsh build/orchestrate/pipeline.zsh batch_defg
zsh build/orchestrate/pipeline.zsh batch_klmqr
zsh build/orchestrate/pipeline.zsh batch_de
zsh build/orchestrate/pipeline.zsh batch_lie
zsh build/orchestrate/pipeline.zsh batch_n
```

要点：

- **每个单元 = 1 次 CLI 调用**（78KB prompt → 完整 JSON），flashx 生成一单元约
  3–10 分钟；并发默认 3（`MAXPAR=2 zsh ...` 可再降）。
- **幂等**：中断/失败后**重跑同一条批命令**即可，已成功的自动跳过，只补缺口。
- `-p` 模式**只在结束时打印**，`build/logs/gen_<code>.raw` 为 0 字节 ≠ 失败
  （还在生成）。看进度：`ls -la build/state/done/`（每个单元一个标记，
  `ok` = 成功、`fail ec=N` = 失败）。
- 单元超时 30 分钟（TIMEOUT_SECS=1800），超时算失败，重跑补。

## 2. 每批跑完的验收（不通过不进下一批）

```bash
# 1) 确认批内单元全部 ok：
zsh build/orchestrate/pipeline.zsh status batch_hij

# 2) 确定性校验（批内逐单元；全量跑会慢）：
for c in $(cut -f1 build/orchestrate/batches/batch_hij.tsv); do
  VERIFY_NO_AUDIT=1 uv run python build/verify_kb.py $c || echo "!! $c 需修"
done

# 3) 数值核验回填（verify 会把【待核验:…】重算回填为【已核验:…】，正常设计）：
uv run python build/inject_meta.py   # 注入日期等元数据

# 4) 提交（撞 index.lock 就 rm -f 后重跑，循环几次必过）：
git add json/ build/
git commit -m "feat: H/I/J 篇入库（30 单元）"
```

verify 报 CRIT/MAJ 的单元，修复流程（流水线自带）：

```bash
zsh build/orchestrate/pipeline.zsh make_fix <code>       # 组装修复 prompt（含评审意见）
zsh build/orchestrate/pipeline.zsh fix <code>            # flashx 执行修复并回写
# 两轮修复仍 fail 才仲裁（必须带升级理由）：
zsh build/orchestrate/pipeline.zsh arbitrate <code> "评审与草稿在 X 上僵持，需第三方判断"
```

## 3. 已知坑（都是实测，别重复踩）

1. **429 频率限制**：并发 3 是安全上限；撞 429 会整批空返回。现象是 raw 0 字节 +
   `fail ec=1`。对策：等额度重置再重跑（幂等只补失败单元），或降 MAXPAR=2。
2. **`json/<章节>/` 目录**：pipeline 已修（settle_raw 自动 mkdir）。若用旧版脚本
   报 `settle_raw: no such file or directory`，手动 `mkdir -p json/<章节>` 即可。
3. **评审产物在 `build/state/review/<code>.json`**：gen 成功 ≠ 评审通过。
   每批跑完顺手看一眼 verdict 字段，有 fail 的走 §2 的 make_fix → fix 流程。
4. **CLAUDE/CODEBUDDY 环境变量**：若从 WorkBuddy 的终端标签页继承了大量
   `CODEBUDDY_*` 变量，CLI 初始化可能卡住。普通 Terminal/iTerm/tmux 不受影响。
   保险起见可用 `env -i HOME=$HOME PATH=$PATH zsh build/orchestrate/pipeline.zsh ...`。

## 4. 全部跑完后（收尾）

```bash
uv run python build/verify_kb.py          # 全量 12 项校验，CRIT=0 MAJ=0
find json -name '*.json' | wc -l          # 应为 318
```

然后把结果丢回 WorkBuddy 会话：批次数、文件数、词条数、verify 结果、提交哈希。
后续前端渲染配套（档1 viz 模块、新章渲染支持）由 WorkBuddy 侧接手。
