# 接力任务书 · 前端线（2026-09-24 交接）

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
4. **viz 档1 模块补齐**（§12.5）：已有 convergence-thm；待做 taylor-approx / unit-circle / gram-schmidt / gauss-integral / sum-telescoping / inequality-decision-tree（交互决策树，P10 flagship）。每个模块硬规则：图上显示「失败的数值」或 invariant 自检（偏差>1e-12 抛错）+ 「前端计算·未对拍」徽标；拖滑块零请求（本地 scrub）。viz 档2（planned-backend）渲染「演示待接入·走 viz 层」占位徽标。
5. **图谱层**（§8.7）：四类边（prereq/related/application/contrast）线型+颜色区分、可开关；prereq 无环一眼可验；三层缩放（字母块→章节→节点）。
6. **主题与收口**：CSS 变量、跟随系统暗色；frontier 横幅（mastery<3 且 prereq 达标的拓扑序第一——数据缺 mastery 时隐藏，禁写死）；standalone 快照（dist/ 单文件 HTML：数据内联 + IIFE + 零外部请求，file:// 双击即开）。

## 3. 硬约束速记

禁 CDN（断网可用、网络面板零外部请求）；禁 React/Vue；坏 JSON 错误浮层（哪个文件哪个字段）绝不白屏；数据运行时 fetch json/（不打进 bundle，改 JSON 秒级刷新）；难度=光点颜色、掌握度=进度条（双编码不混用颜色）。

## 4. 工作方式

每完成一个功能：`npm run dev` 自测（curl 首页 200 + 浏览器行为）→ `npx tsc --noEmit` 类型检查 → git add src/ index.html package*.json + commit（中文短句；报 unable to unlink 就 rm -f .git/index.lock 重试）。JSON 生成线同时在写 json/ 目录，前端只读不写，无冲突。

## 5. 验收口径

对齐 mockup 视觉（并排截图对比）；A1.3 全部 45 词条可浏览、四问 tab 可用、bump/slide viz 可交互；改一个 json 文件 dev 页面秒级刷新；坏 JSON 出浮层；断网刷新正常；`npx tsc --noEmit` 零错误；standalone HTML 双击可开。
