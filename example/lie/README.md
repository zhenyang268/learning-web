# example/lie — 李群交互导读（多模型流水线演示）

> **定位**：`example/` 是「多 agent / 多模型工作流」的演示样例，与正式知识库
> （`json/` + `src/` + `build/`）完全隔离。不引用、不改写本目录以外的任何文件。
> 唯一的真源引用是**只读**的 `../../../notebook/li/lie1–3.tex`。

## 产物

| 文件 | 说明 |
|---|---|
| `index.html` | standalone 页面：数据内联 · IIFE · 零外部请求（`file://` 双击即开，AGENTS.md §3 三条硬约束） |
| `data/cards-lie12.json` | lie1+lie2 概念卡片（flash 起草 → GLM-5.3 评审核验后定稿） |
| `data/cards-lie3.json` | lie3 物理与 CG 应用卡片（同上） |
| `prompts/gen-lie12.md` / `gen-lie3.md` | 给 `deepseek-v4.1-flash` 的自包含 prompt（schema + 硬规则 + 卡片清单 + 带行号源文） |
| `review/verify_math.py` | 前端交互数学的数值核验（uv run python，全绿后才写进 JS） |
| `review/review-glm53.md` | GLM-5.3 对 flash 产物的逐条评审记录（错在哪、怎么修的） |
| `inject_cards.py` | 组装：校验 + 净化检查 + 注入 `#cards-data` 占位 |
| `logs/` | CLI 调用的原始输出与 done/exit 标记（过程留痕） |

## 这页里有什么

1. **指数映射的具象化**：θ 滑块 + 轴选择 → Rodrigues 公式逐帧算 R(θ) → 3D 立方体线框。
   每帧 invariant 自检（‖R^T R − I‖_F 与 |det R − 1|，阈值 1e-10，超差显红不静默）。
2. **SU(2) → SO(3) 二重覆盖**：同一个 θ 滑块驱动两个视图——SO(3) 立方体 2π 复位，
   SU(2) 的 q(θ) 沿一参数子群要走 4π 才回家（θ=2π 恰到对跖点 −1）；
   并同时显示 −q（同一旋转的另一份四元数）。「自旋 1/2 为什么需要 SU(2)」的可操作版本。
3. **知识卡片**（24 张）：lie1 概念 / lie2 分类与拓扑 / lie3 应用，按 type 着徽标，
   显示 tex_ref 真源行号与生成链溯源（generated_by 思路的落地）。

## 多模型流水线（本目录演示的正是 TASKBOOK §6 / D16 的模式）

```
WorkBuddy 会话内（GLM-5.3，编排 + 评审）              CLI 通道（codebuddy -p 直连）
├─ 写 prompt 规格（schema/硬规则/卡片清单）    ──→   deepseek-v4.1-flash × 2 并发
├─ 写前端交互骨架（数学先经 verify_math.py）         │   任务A: lie1+lie2 → 概念卡片
├─ 评审核验：json.tool → 数学逐条 → 净化检查    ←──   任务B: lie3   → 应用卡片
├─ inject_cards.py 组装注入 index.html               └   落盘 raw + exit 标记
└─ 验收（file:// 双击）+ git 提交（learning-web 仓内）
```

执行方式：WorkBuddy 内以「后台任务 + 轮询日志 exit 标记 + TaskStop」折衷运行
（D16 的官方推荐是在 WorkBuddy 外的终端/tmux 跑 `build/orchestrate/pipeline.zsh`；
本目录规模小，用折衷通道做单次演示，产物与流程一致）。

## 复现

```bash
# 1. 数值核验（改前端数学前必须先跑）
cd /Users/apple/develop/learning
uv run python learning-web/example/lie/review/verify_math.py   # 全 PASS

# 2. 生成卡片：在 WorkBuddy 之外的终端/tmux 跑（D16；会话内嵌套 CLI 拿不到输出）
zsh learning-web/example/lie/run_gen.sh
#    （等价于 pipeline.zsh 的 attempt_once 模式：--max-turns 1 --tools ""，落盘 + exit 标记）

# 3. 产物回到 data/ 后组装注入（会话内或终端均可）
cd /Users/apple/develop/learning
uv run python learning-web/example/lie/inject_cards.py
```
