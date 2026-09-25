# 接力任务书 · 前端线（2026-09-24 交接，17:50 校正）

> **状态校正（2026-09-24 17:50，按 git log 核验）**：下文 §2 待办写于骨架期（a028eeb），
> 其中多项当日已被后续提交完成——
> ✅ 四问骨架接真数据（b4cc461）｜✅ 27 个 viz 档1 模块 + Node 数值校验（d80eadb）｜
> ✅ standalone 单文件快照 + 占位 + 验收脚本（8e08b9e）｜✅ 按需加载 2.5MB→20KB（d64e4f5）｜
> ✅ 多字母代号 + 核验徽标（0c79d66）｜✅ 9 个新 viz 模块（56063ff、6e4710b）。
> **§2 第 4 条的 viz 归属口径有反复**：文中写「viz 由用户本人实现」，
> 但当日 10:46 起多个 viz 模块由 agent 提交入库。
> **✅ 口径已定（用户 2026-09-24 18:15 定夺）**：viz 层按 §2 判据分工——
> **简单函数直接 TS/JS 前端计算；复杂的交给 learning-viz 后端（Python/C++）算好返回数据**。
> agent 可以写 `src/viz/` 的前端计算模块，后端级计算一律注册走 `/api/viz/*`。
> `npx tsc --noEmit` 当日 18:00 实测零错误。
> 下文 §0–§5 为原始交接内容，事实性内容以上面校正为准。

你是 learning-web 前端工程师，接手一个已完成骨架的 Vite + Vanilla TS 项目，把它做到「对齐 mockup 视觉、四问交互齐全、断网可用」。

## 0. 仓库与真源（先读）

- 仓库：`/Users/apple/develop/learning/learning-web`（独立 git 仓；只在此仓改动 src/ 与根配置，**禁 git push、禁动 json/、build/、mockup/**）
- 需求真源：`TASKBOOK.md` §8（9 条硬约束）与 §3（数据契约 entry-card/v2）
- 视觉基准：`mockup/A1.3.html`（深色极光 + 玻璃拟态样张，交互全真）
- 数据样例：`json/A1/A1.3.json`（v2 已升级：content 有正文、probe 类型、viz 三档）；数据规模见 `build/state/slices.json`（318 单元，生成线正在补齐，前端按「目录发现」动态适配，不要写死章节列表）

## 1. 已有骨架（git a028eeb，先跑起来看）

```
src/main.ts  types.ts  styles.css
src/modules/  loader.ts（fetch json/ + 错误浮层）、state.ts、graph.ts
src/shell/    header.ts（顶栏字母块）、sidebar.ts（章节树）、aside.ts（右栏）
src/renderers/card.ts（词条卡）、markdown.ts、overlay.ts
src/viz/      index.ts（注册表）、convergence-thm.ts（A1.3 的 bump/slide/exp/monotone 模块）
vite.config.ts  tsconfig.json  package.json  index.html
```

启动：`cd /Users/apple/develop/learning/learning-web && npm run dev`（node_modules 已装）。

## 2. 待办（按优先级）

1. **定理卡四问骨架**（TASKBOOK §8.4）：陈述/直觉/证明/应用分 tab；quantifiers 拆解表默认展开、Markdown 表格渲染；点表行**就地展开**对应反例词条（同文件内按 id 跳转，不换页）；status/generated_by 徽标；content 里的 Markdown（表格/列表/加粗）渲染。
2. **右栏**（§8.6）：依赖◂/被用于▸——从全库 links 聚合（反向索引在 modules/graph.ts 补全）；chip 点击跳转（目标未生成时显示占位）；probe 检验题可勾选（localStorage 持久化）。
3. **KaTeX 构建期预渲染**（决策 D8，禁 CDN 禁客户端渲染）：build 期用 Node `katex.renderToString` 把 content 的 $…$/$$…$$ 预渲染进产物；注意 npm 依赖装在本仓（与父仓 uv 的 Python 隔离，node 侧不冲突）。
4. **viz 档1 模块补齐**（**分档口径，2026-09-24 用户明确**）：**档1（简单显式函数）= agent 写
   `src/viz/specs/` 的声明式规格；档2/3（复杂计算 / 需对拍）= 走 viz 层，agent 不碰。**
   已补齐 H1/H2 声明的 9 个档1 模块 —— `angle-deficit`、`mean-curvature-area`、
   `curvature-noise-scaling`、`brdf-sanity-check`、`rendering-equation`、
   `projected-solid-angle`、`lambert-normalization`、`microfacet-ndf`、`microfacet-reciprocity`
   （见 `src/viz/specs/cg.ts`），全库 viz 断言转绿。每个模块硬规则不变：图上显示「失败的数值」
   或 invariant 自检 + 「前端计算·未对拍」徽标；拖滑块零请求；viz 档2（planned-backend）渲染
   「演示待接入·走 viz 层」占位。
   **后续 json 生成线每入库一个新章节，都要跑一次
   `node tools/viz-model-check.mjs`**：它会列出「数据声明了但没实现」的档1 模块名，
   据此继续在 `src/viz/specs/` 补。反之也不要注册数据里没人引用的模块（该检查同时报「多余注册」）。
5. **图谱层**（§8.7）：四类边（prereq/related/application/contrast）线型+颜色区分、可开关；prereq 无环一眼可验；三层缩放（字母块→章节→节点）。
6. **主题与收口**：CSS 变量、跟随系统暗色；frontier 横幅（mastery<3 且 prereq 达标的拓扑序第一——数据缺 mastery 时隐藏，禁写死）；standalone 快照（dist/ 单文件 HTML：数据内联 + IIFE + 零外部请求，file:// 双击即开）。

## 3. 硬约束速记

禁 CDN（断网可用、网络面板零外部请求）；禁 React/Vue；坏 JSON 错误浮层（哪个文件哪个字段）绝不白屏；数据运行时 fetch json/（不打进 bundle，改 JSON 秒级刷新）；难度=光点颜色、掌握度=进度条（双编码不混用颜色）。

## 4. 工作方式

每完成一个功能：`npm run dev` 自测（curl 首页 200 + 浏览器行为）→ `npx tsc --noEmit` 类型检查 → git add src/ index.html package*.json + commit（中文短句；报 unable to unlink 就 rm -f .git/index.lock 重试）。JSON 生成线同时在写 json/ 目录，前端只读不写，无冲突。

## 5. 验收口径

对齐 mockup 视觉（并排截图对比）；A1.3 全部 45 词条可浏览、四问 tab 可用、bump/slide viz 可交互；改一个 json 文件 dev 页面秒级刷新；坏 JSON 出浮层；断网刷新正常；`npx tsc --noEmit` 零错误；standalone HTML 双击可开。

---

## 6. 进度追加（2026-09-25 上午，前端 agent 本轮）

### P1 图谱语义边：已铺开 22 章（graph/ 从 1 → 23 个 yaml）

- 新增 22 个：A2/A4/B1/B2/C6/C7/C8/C9/C10/H6/H8/I9/J2/P1–P9（含 A1 共 23 个文件）。
- 依据全部来自各单元 json 的 entries（statement/counterexample/comparison 标题与正文）+ links；
  每条边带注释说明依据，prereq 全库无环（`check:graph` **PASS 713 · FAIL 0**）。
- 单元内部的对偶（如 H8.3「质点–弹簧 vs PBD」、C10.2「Itô vs Stratonovich」）**不建自指边**，
  只在 yaml 里注记说明——自指是非法边，check-graph 会拦。
- 覆盖原则：yaml 只写**组内**语义边（组内派生 prereq 被 yaml 覆盖）；跨章关系仍由 links 派生边承担。
- 剩余：等 JSON agent 入库 D/E/F/G/K–R/de/lie 各章后跟进（当前这些章节目录为空或刚起步）。

### P0 viz：无积压

`check:viz` PASS 3182 · FAIL 0（48 模块/47 规格），H/I/J 新入库章节声明的档1 模块
（`path-contribution`、`viscosity-curves` 等）上一轮已实现；本轮无「声明未实现/多余注册」。

### 修掉的前端真 bug（5 个）

1. **viz 画布调色板写死暗色**（`kit.ts` 的 `C` 常量 + specs 里 `#fff`/`#070b16`）——亮色主题下
   画布网格/轴线/曲线几乎不可见，违反 P3「不写死色值」红线。改为 `--viz-*` CSS 变量
   （暗/亮两套）+ getter 实时 `getComputedStyle`；Node 侧（viz-model-check/dom-harness）
   无 document 时落回暗色常量，规格纯函数求值不受影响。
2. **`REF_TOKEN` 不认多字母前缀**（card.ts）——`de1.10`/`lie3.17` 被单字母正则截成 `e1.10`，
   跨章词条引用永远不可点（B1/H5/H8/P3/I1 等单元正文里大量存在）。放宽为 `[A-Za-z]+\d+`。
3. **graph 渲染器 `ResizeObserver` 未特征检测**——jsdom/老环境里 mountGraph 直接抛
   ReferenceError 且 .then() 无 catch，图谱永远停在「加载中…」。已加 `typeof` 守卫（kit.ts 原本就有同样守卫，graph.ts 漏了）。
4. **boot() 同值 hash 不触发 apply**——错误浮层「重新加载」后若目标 hash 与当前相同，
   hashchange 不派发，页面白屏。同值时手动补调 apply()。
5. **standalone 不内联 graph/\*.yaml**——单文件快照里 fetch graph/* 全 404，23 章语义边
   静默降级成纯派生边。build-standalone.mjs 已把 graph/ 打进 DATA 表并重建
   dist/knowledge.html（128 单元 · 5.88MB · gitignore 不入库）。
6. 顺手：图谱右栏「语义边真源现只有 A1」过期文案 → 动态 `N/M` 计数；
   aside.ts 掌握度圆环、styles.css 37 处硬编码 alpha 色值 → `color-mix(var(--x))` 主题化。

### P2 mastery 注入：**阻塞（真源缺失）**

TASKBOOK §12.4 说「mastery 从 ns-progress.md 注入（那里有 P 组打勾表）」，但实测
`learning-todo/ns-progress.md`（86 行全文读过）**没有逐小目 mastery/打勾表**——只有
L0–L5 层级状态（L0 ✅、L1 🔄、L2–L5 ⬜）与会话日志；「24 条打勾总表」按日志第 48 行
的记载在**黑板 ipynb**（`chats/ses_f5e6a74…ipynb`），不在任何只读真源文件里。
`learning.md` 里也没有。红线是「mastery 不许模型编」，无确定性真源可提取 → 不做。
**解阻塞需要用户拍板**：要么把黑板打勾表落回 ns-progress.md（或 learning-web 内一个
真源文件），要么明确「L0=5/L1=3/L2+=0」这类层级映射规则。两者任选其一后 P2 半天可完成。

### 验收快照（2026-09-25）

tsc 0 错 · check:graph 713/0 · check:viz 3182/0 · dom-harness **123 单元 5198/0**
（JSON agent 并行入库中，单元数从 96 涨到 123+，harness 全绿）。
提交：`0d6e65f`（20 章 yaml）→ `072a395`（前端 bug 修复 + I9/J2）→ `e8ff4b1`（standalone graph 内联）。
