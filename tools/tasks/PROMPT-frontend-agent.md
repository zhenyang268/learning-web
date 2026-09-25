# 任务：前端 agent（learning-web 界面线）

你是 learning-web 的前端开发者。仓库：`/Users/apple/develop/learning/learning-web`
（独立 git 仓，父仓 learning 不跟踪它）。Vite + **Vanilla TS**，无框架、无 CDN、断网可用。

同一仓库里有另一个 **JSON 生成 agent 在并行干活**（写 `json/`），你们的目录边界见下方「硬边界」。

## 开工前必读

1. `AGENTS.md`（仓根）—— 全仓规约
2. `DESIGN.md` —— 架构与契约（决策 D1–D17；**图谱边 schema 在 §「边」附近**）
3. `build/orchestrate/HANDOFF-frontend.md` —— 前端交接（视觉基准、硬约束）
4. `mockup/A1.3.html` —— **视觉基准**（深色极光玻璃拟态），新做的界面向它对齐

## 已完成的地基（不要重做，在其上继续）

| 部分 | 位置 | 状态 |
|---|---|---|
| 三栏 shell + 四问定理卡 + 右栏 probe | `src/shell/`、`src/renderers/card.ts`、`aside.ts` | ✅ |
| KaTeX（本地包 `renderToString`，零外部请求） | `src/renderers/markdown.ts` | ✅ |
| viz 档1 规格（38 模块，声明式纯函数） | `src/viz/specs/*.ts` + `kit.ts` 渲染 | ✅ |
| **图谱层**（本轮新增） | `src/modules/graph-model.ts`（合并派生边+yaml 语义边）、`src/modules/graph-data.ts`（fetch+缓存+降级）、`src/renderers/graph.ts`（SVG 三层缩放）、`#graph` 入口 + 顶栏「⬡ 图谱」按钮 | ✅ |
| 图谱语义边真源 | `graph/A1.yaml`（**只有 A1 一章**，是 schema 基准样例） | ⚠️ 待铺开 |
| standalone 单文件 | `tools/build-standalone.mjs` → `dist/knowledge.html` | ✅ 需重建 |

验收工具（改完必须全绿）：
```bash
cd /Users/apple/develop/learning/learning-web
NODE_PATH=~/.workbuddy/binaries/node/workspace/node_modules npm run check
# = tsc --noEmit + check:graph + check:viz + dom-harness --all
```
本机**开不了浏览器**（headless 会被环境强杀），所以只能靠 `tools/dom-harness.mjs`（jsdom 进程内断言）
+ `tools/viz-model-check.mjs`（Node 侧重算 invariant）验收。**不要走截图路线**。

## 待办（按优先级）

### P0：viz 档1 模块补齐（会持续产生，是并行协作的接缝）

JSON agent 每入库一个新章节，就会在数据里**声明**新的档1 viz 模块名；`npm run check:viz`
会立刻 FAIL 并报出「声明了但没实现」的名单（module + 出处词条 id）。**这是你的活，不是它的**。
- 照名单在 `src/viz/specs/*.ts` 里补声明式规格，并在 `src/viz/registry.ts` 注册
- 写法：`draw/readout/invariant/note` 全为纯函数，由 `kit.ts` 渲染（参考 `specs/mc.ts`、`specs/cg.ts`、`specs/path-fluid.ts`）
- `invariant` 必须是**恒等式或严格不等式**（失败即代码 bug）；「数学结论不成立」用 readout 的 `verdict: 'fail'` 表达
- 图上要显示**算出来的错值**，不是文案
- 遇到确实需要后端计算的（数据侧已标 `status: "planned-backend"`）→ **不碰**，前端渲染「演示待接入」占位
- 同时跑 `check:viz` 报「多余注册」= 数据里没人引用 → 该删模块或数据引用被改坏了，查清别直接删

### P1：`graph/<chapter>.yaml` 语义边铺开

以 `graph/A1.yaml` 为 schema 基准（先读它），为其余章节补语义边真源。
四类边：`prereq`（依赖，**必须无环**）、`tension`（张力/对立）、`dual`（对偶）、`applies`（应用）。
- 语义依据从 `json/<章>/<code>.json` 的 `links` + content 里读（`.tex` 抽不出语义边）
- 每条边**注明依据**（为什么是这条边），照 A1.yaml 的注释风格
- 坑：编号顺序 ≠ 依赖顺序（A1 里「A1.4 编号第 4 但实为 A1.2 上游」就会造假环）
- 写完跑 `npm run check:graph`（含 prereq 无环、端点存在性等 452+ 断言）
- 建议按 JSON agent 的批次进度跟着铺：hij 章入库了就先写 H/I/J

### P2：mastery 从 ns-progress 构建期注入

`src/modules/state.ts` 的掌握度初值现在**恒为 0**、只靠交互累积。
要做：构建期从 `~/develop/learning/learning-todo/ns-progress.md`（**只读！**）确定性提取
掌握度，注入前端初值。**不许写 ns-progress.md**。参考已有的 P 篇标记提取
（`build/inject_meta.py` 里有「P 篇【必/熟/知】标记提取：17 个小目」的现成逻辑）。

### P3：视觉收口 + standalone 重建

- 新界面对齐 `mockup/A1.3.html`（深色极光玻璃拟态）；**跟随系统亮暗**（`prefers-color-scheme`）
- CSS 一律用 `src/styles.css` 里的变量（`--bg/--tx/--line/--cyan/--glass`…），**不写死色值**
  （本轮已清掉几处写死深色，别再加回去）
- 全部做完重建 `dist/knowledge.html`（数据内联 + 字体 base64 + IIFE，`file://` 双击即开、零外部请求）

## 硬边界（违反即返工）

- 只写 `src/`、`graph/`、`tools/`（`tools/tasks/PROMPT-*.md` 除外，那是交接文档）、
  `index.html`、`package.json`、`vite.config.ts`、`DESIGN.md`/`HANDOFF-frontend.md`
- **绝不碰 `json/`**（JSON agent 正在写，你只读它来取 viz 契约与语义依据）、
  绝不碰 `build/verify_kb.py`、`build/orchestrate/*.zsh`、`build/prompts/`、`build/slices/`
- `notebook/`、`learning-todo/`（含 `ns-progress.md`）、`dev-progress.md` **只读**
- 禁 CDN、禁 React/Vue、禁任何运行时外部请求；坏 JSON 必须出错误浮层**绝不白屏**
- 提交纪律：只 `git add` 你自己的路径（**绝不 `-A`/`.`**）；`rm -f .git/index.lock` 后重试解决
  git 写锁被拒；**绝不 push / rebase / reset / clean**
- 新增依赖要写进 `package.json`（node_modules 里已装的 `yaml@2.9.1` 本轮已补声明）

## 验收与收尾

- 每步 `npm run check` 全绿（tsc 0 错 · check:graph · check:viz FAIL 0 · dom-harness 全库 0 问题）
- 每完成一个 P 级就 commit 一次，信息说清做了什么
- 收尾更新 `build/orchestrate/HANDOFF-frontend.md` 进度段（append）；设计决策沉淀进 `DESIGN.md`
