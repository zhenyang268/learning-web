# 执行手册：JSON 知识库剩余 233 单元生成（2026-09-24，v2）

> **读者**：接力执行者（WorkBuddy 会话内的 agent，或在外部终端手动操作的用户本人）。
> 进度真源：`build/orchestrate/HANDOFF-json.md`；本文只管「怎么跑」。
> 生成规格（红线/契约）：`build/orchestrate/GEN_BRIEF.md` + `build/prompts/gen_prefix.md`。

## 0. 两条执行通道（先选通道，再跑命令）

| 通道 | 命令族 | 什么时候用 |
|---|---|---|
| **A. WorkBuddy 会话内（推荐，D17）** | `wbsmoke / wbdispatch / wbreview / wbcollect / wbstatus` | 默认。agent 直接驱动、直接看结果，不需要人守着终端 |
| **B. WorkBuddy 之外的终端/tmux（备选，D16）** | `smoke / batch_* / status / make_fix / fix / arbitrate` | 通道 A 出系统性故障时；或用户想一次性无人值守跑完 |

**铁律**：
- WorkBuddy 沙盒里**禁止前台嵌套** `codebuddy -p`（假死 + 进程组回收，实测）。会话内只能走 `--bg`（通道 A 已封装）。
- **两条通道不要同时跑**——抢同一份模型额度，429 会双杀。
- `fix`（修复回写）目前只有通道 B 命令；会话内要修复：先 `make_fix <code>` 组 prompt，再按通道 A 的方式手动派一个 `--bg` 会话，或让用户在外部终端跑 `fix`。

## 1. 现状（开跑前核对）

- 已入库 **85/318** 单元（A/B/P/C 全篇 + H1/H2/H3），`verify_kb.py` 全绿。实时数字以
  HANDOFF-json.md 与 §5 对账命令为准（本文写死的是 2026-09-24 傍晚的值）。
  H3 是首个通道 A（WorkBuddy 会话内 `--bg`）全链路产物。
- 剩余 **233** 单元已按依赖序写好批次文件（`build/orchestrate/batches/`）：

| 批次文件 | 单元数 | 内容 |
|---|---|---|
| `batch_hij.tsv` | 30（H3 已入库，自动跳过） | H3–H8.3 / I1–I9.4 / J1–J8（CG 主干，优先） |
| `batch_defg.tsv` | 23 | D1–D4 / E1–E4 / F1–F6 / G1.1–G5 |
| `batch_klmqr.tsv` | 48 | K1–K5 / L1–L9 / M1–M7 / Q1–Q11 / R1–R8 |
| `batch_de.tsv` | 61 | de1–de4（拉格朗日/哈密顿） |
| `batch_lie.tsv` | 57 | lie1–lie3（李群） |
| `batch_n.tsv` | 15 | N1–N15（partN） |

- 生成模型默认 **glm-5.3-flashx**（`GEN_MODEL=<型号>` 覆盖；deepseek-v4.1-flash 2026-09-24 曾被限额）。
- 评审模型 glm-5.3（100% 覆盖）。`FALLBACK_MODEL=<型号>` 可给 `--bg` 会话加过载自动降级。

## 2. 通道 A：WorkBuddy 会话内跑法（推荐）

原理（排障时必读）：`wbdispatch` 为每个单元派一个 `codebuddy --bg --name kb-gen-<code> -p`
托管后台会话；会话输出**不在日志文件**（`~/.workbuddy/logs/<name>.log` 恒 0 字节），
而在 transcript `~/.workbuddy/projects/<cwd-slug>/<sessionId>.jsonl`。
`wbcollect` 调 `build/orchestrate/collect_bg.py` 按「PID 死活 + transcript 最后一条
assistant 消息」回收——**`jobs/<id>/state.json` 的 `state:"failed"` 是沙盒回收进程的误标，不代表生成失败**。

```bash
cd ~/develop/learning/learning-web

# 0) 冒烟（约 30 秒，验证 --bg 派发 + transcript 回收全链路）：
zsh build/orchestrate/pipeline.zsh wbsmoke        # 看到 {"ping":"pong"} 即通

# 0.5) 带工具权限的任务会话（前端开发等，产物=文件改动，2026-09-24 冒烟验证）：
zsh build/orchestrate/pipeline.zsh wbtask <任务名> glm-5.3-flashx build/prompts/fe_<任务名>.md 25
#   prompt 模板：build/prompts/frontend_task.md；总编排用 MASTER_PROMPT.md

# 1) 逐批循环（以 batch_hij 为例，每轮 3 步）：
MAXPAR=3 zsh build/orchestrate/pipeline.zsh wbdispatch batch_hij   # 派发缺口单元（至多 MAXPAR 个）
zsh build/orchestrate/pipeline.zsh wbcollect batch_hij --wait      # 阻塞等回收（落盘 json/）
zsh build/orchestrate/pipeline.zsh wbstatus  batch_hij             # 看每单元 gen/review 状态
# gen 有缺口就再 wbdispatch + wbcollect（幂等，只补缺口），直到 gen 全 ok。

# 2) gen 全 ok 后派评审（glm-5.3），同样 wbcollect 回收：
zsh build/orchestrate/pipeline.zsh wbreview batch_hij
zsh build/orchestrate/pipeline.zsh wbcollect batch_hij --wait

# 3) 验收（不通过不进下一批）：
for c in $(cut -f1 build/orchestrate/batches/batch_hij.tsv); do
  VERIFY_NO_AUDIT=1 uv run python build/verify_kb.py $c || echo "!! $c 需修"
done
uv run python build/inject_meta.py    # 注入日期等元数据（数值标记同时回填）
git add json/ build/ && git commit -m "feat: H/I/J 篇入库（N 单元）"   # 不要 git add -A
```

WorkBuddy agent 的执行细节：
- `wbcollect --wait` 单批最长等 30 分钟（TIMEOUT_SECS=1800），用**后台 Bash** 跑，
  跑完看退出输出；然后 `wbdispatch` 派下一组，如此滚动直到批内 gen 全 ok。
- 单元生成约 3–10 分钟；**MAXPAR 默认 3，不要调高**（429 是首要约束，见 §4）。
- 会话清单审计：`build/state/bg/manifest.tsv`（kind/code/name/shortid/派发时间戳）。
- 清理已终结会话：`codebuddy rm kb-gen-<code>`（不清理也不影响幂等，重新派发前会自动 rm）。

## 3. 通道 B：外部终端/tmux 跑法（备选）

```bash
cd ~/develop/learning/learning-web
zsh build/orchestrate/pipeline.zsh smoke            # 冒烟
zsh build/orchestrate/pipeline.zsh batch_hij        # 生成+评审一条龙，每批结束停下
zsh build/orchestrate/pipeline.zsh status batch_hij # 查状态
```

要点：
- 每个单元 = 1 次前台 CLI 调用（78KB prompt → 完整 JSON），并发默认 3（`MAXPAR=2` 可降）。
- **幂等**：中断/失败后重跑同一条批命令即可，已成功的自动跳过。
- `-p` 模式只在结束时打印，`build/logs/gen_<code>.raw` 为 0 字节 ≠ 失败（还在生成）；
  看进度：`ls -la build/state/done/`（`ok` = 成功、`fail ec=N` = 失败）。
- 验收与通道 A 的 §2 第 3 步相同（verify + inject_meta + commit）。
- 若终端从 WorkBuddy 继承了大量 `CODEBUDDY_*` 环境变量导致 CLI 初始化卡住：
  `env -i HOME=$HOME PATH=$PATH zsh build/orchestrate/pipeline.zsh ...`。

## 4. 已知坑（都是实测，别重复踩）

1. **429 频率限制是首要约束**：并发 3 是安全上限；撞 429 会整批空返回（raw 0 字节 + `fail ec=1`）。
   对策：等额度重置再重跑（幂等只补失败单元）、降 MAXPAR=2、或 `GEN_MODEL=` 换型号。
   撞 429 后**不要反复重试**，越试越糟。同仓两条线（JSON 线/前端线）抢同一份额度。
2. **transcript 才是输出真源**（通道 A）：`logs/<name>.log` 0 字节、`state:"failed"` 都不可信；
   判据只有两个——PID 是否活着、transcript 最后一条 assistant 消息是否存在（collect_bg.py 已封装）。
3. **`json/<章节>/` 目录**：pipeline 的 settle_raw 自动 mkdir。若手写脚本报
   `no such file or directory`，手动 `mkdir -p json/<章节>`。
4. **评审产物在 `build/state/review/<code>.json`**：gen ok ≠ 评审通过。
   每批跑完看 verdict 字段，fail 的走修复：
   ```bash
   zsh build/orchestrate/pipeline.zsh make_fix <code>       # 组装修复 prompt（含评审意见）
   zsh build/orchestrate/pipeline.zsh fix <code>            # 外部终端执行修复并回写
   # 两轮修复仍 fail 才仲裁（必须带升级理由）：
   zsh build/orchestrate/pipeline.zsh arbitrate <code> "评审与草稿在 X 上僵持，需第三方判断"
   ```
5. **派发前残留会话**：同名 `--bg` 会话已终结时直接重派可能报 session 冲突，
   pipeline 派发前会自动 `codebuddy rm <name>`；手动派发时也请先 rm。
6. **headless 权限策略**（官方文档口径，当前未踩但改写法时必踩）：`-p` 无 TTY，
   凡需授权的工具调用会被直接阻断。本流水线用 `--max-turns 1 --tools ""`（禁工具、纯文本输出）
   绕开了整件事；**若未来让子任务自己写文件**，必须显式给 `-y` 或 `--permission-mode auto/dontAsk`，
   并注意 auto 分类器连续 3 次拿不到判定会直接中止 run。
7. **`codebuddy logs <name>` 只在会话存活期可用**：会话结束后 `logs`/`rm` 可能报
   `Session not found`，但 transcript 仍在磁盘上——所以回收一律走 collect_bg.py，
   不要依赖 `codebuddy logs`（官方文档说日志落 `~/.codebuddy/logs/`，本发行版实际在
   `~/.workbuddy/logs/` 且 `-p --bg` 组合下恒 0 字节，以实测为准）。

## 5. 进度对账（一条命令）

```bash
cd ~/develop/learning/learning-web && uv run python -c "
import json,glob
S={u['code'] for u in json.load(open('build/state/slices.json'))['units']}
D={p.split('/')[-1][:-5] for p in glob.glob('json/*/*.json')}
print(f'{len(S&D)}/{len(S)}  剩余 {len(S-D)}'); print(' '.join(sorted(S-D)))"
```

## 6. 全部跑完后（收尾）

```bash
uv run python build/verify_kb.py          # 全量 12 项校验，CRIT=0 MAJ=0
find json -name '*.json' | wc -l          # 应为 318
```

然后回 WorkBuddy 会话汇报：批次数、文件数、词条数、verify 结果、提交哈希。
后续前端渲染配套（新章渲染支持）由前端线接手（HANDOFF-frontend.md）。
