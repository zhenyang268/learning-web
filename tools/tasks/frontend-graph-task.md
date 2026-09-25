# 任务：learning-web 前端图谱层（TASKBOOK §8 第7条）+ 跟随系统亮暗（§8 第8条）

你是在 headless 后台会话里独立工作的前端工程师。仓库：`/Users/apple/develop/learning/learning-web`（独立 git 仓，所有命令在此目录下跑）。

## 并行纪律（先读，违反会破坏另一条生产线）

- 另一个后台进程（JSON 生成线，glm 模型）正在持续写 `json/` 与 `build/`。
  **你可以读 `json/`，但绝不修改它；`build/`、`mockup/`、`notebook` 一律不碰；git add 时绝不加 `json/` `build/`。**
- 你只允许改动：`src/`、`graph/`、`tools/`、`index.html`、`package.json`/`package-lock.json`（如需装依赖）。
- git commit 可能撞锁（两个进程同仓提交）：失败就 `rm -f .git/index.lock` 后立刻重试，最多 8 次。
- **禁止 git push。** 提交信息用中文短句，说清做了什么。
- 每完成一个功能就提交一次，别攒到最后。

## 环境事实（本机实测，别浪费时间重蹈）

- **浏览器不可用**：headless Chrome/Edge 会被环境 SIGTERM 强杀——不要尝试截图/无头浏览器验证。
- 验证手段只有两套进程内校验（改完必须全跑）：
  1. `npx tsc --noEmit` → 必须零错误
  2. `npm run check`（= tsc + `tools/viz-model-check.mjs` + `tools/dom-harness.mjs --all`，jsdom 进程内 DOM 断言）→ 必须全绿
- node 用仓库本地的：`npx` 或 `/Users/apple/.workbuddy/binaries/node/versions/22.22.2-3/bin/node`；
  jsdom 等 dev 依赖装在 `~/.workbuddy/binaries/node/workspace/node_modules`（npm scripts 里已带 NODE_PATH，直接 `npm run check` 即可）。
- 禁 CDN：新增依赖必须 `npm install` 进本仓 bundle，运行时零外部请求。

## 现状（先跑 `git log --oneline -8` 和读文件核实）

- Vite + Vanilla TS 三栏 SPA：`src/main.ts`、`modules/{loader,state,graph,kb-index}.ts`、
  `shell/{header,sidebar,aside}.ts`、`renderers/{card,markdown,overlay}.ts`、`viz/`（46 个档1 模块，别动）。
- `modules/graph.ts` 目前只从 json 的 links 派生 **prereq/usedBy 两类边**，仅供右栏 chips；没有任何图谱可视化。
- `graph/` 目录为空（只有 .gitkeep）——**语义边真源缺失，这是本任务核心**。
- `json/` 已有 85+ 单元（A 全 / B 全 / C 全 / P 全 / H 大部），且生成线还在追加新单元。
  **前端必须按「索引目录发现」动态适配，不要写死章节列表**（`modules/kb-index.ts` 已有索引机制）。
- 规格真源（动手前必读）：`TASKBOOK.md` §8 第 7、8 条；`DESIGN.md` §8.1（节点 schema）、§8.2（四类边定义）、§8.4（frontier）。

## 任务 1（主菜）：图谱层

### 1a. `graph/<chapter>.yaml` 语义边真源 —— 先手写 `graph/A1.yaml` 定 schema

四类边（DESIGN §8.2）：

| 边类型 | 语义 | 成环 |
|---|---|---|
| `prereq` | 学习顺序 | **必须无环**（否则 frontier 算不出） |
| `tension` | 反例/约束冲突 | 允许且常见 |
| `dual` | 对偶路径（自顶向下 ↔ 自底向上） | 允许 |
| `applies` | 下游应用 | 允许 |

要求：
- 文件头记 `notebook_commit`（跑 `git -C /Users/apple/develop/learning rev-parse --short HEAD` 取当前值）。
- 节点 = A1 的每个已存在单元（看 `json/A1/` 目录实际有什么）；边内容**从 `json/A1/*.json` 的 title/links/content 归纳草拟**，语义要对，不要为凑数编边（宁可少而真）。
- schema 建议（可微调，但要和渲染器、校验脚本三方一致）：

```yaml
notebook_commit: <hash>
nodes:
  A1.1:
    prereq: []
    tension: []
    dual: []
    applies: [A1.3]
  A1.2:
    ...
```

### 1b. 图谱渲染器（建议 `src/renderers/graph.ts` + 挂进 `main.ts`）

- **数据源两路合并**：`modules/graph.ts` 的派生边（links → prereq/usedBy）+ `graph/*.yaml` 语义边（运行时 fetch，需要 yaml 解析就 `npm install yaml`）。
  **yaml 缺失/坏掉必须优雅降级**：只用派生边渲染 + 顶部显示非阻断提示，绝不白屏。
- **SVG 渲染**（手写，不引 d3 等重型库）：四类边颜色 + 线型（实线/虚线/点划线…）双区分，图例 + 每类一个开关 checkbox。
- **prereq 无环一眼可验**：prereq 子图按拓扑分层布局（层内纵排、层间横排）；若检出环，环上边标红 + 文字告警（不崩）。
- **三层缩放**：全局（字母块 A/B/C/… 聚合节点，块间边 = 块内边的聚合计数）→ 章节（块内单元节点）→ 点节点跳阅读区（hash 路由到该单元，复用现有阅读视图）。滚轮/按钮缩放，拖拽平移。
- **入口**：hash 路由 `#graph`（`main.ts` 里分发），顶栏加一个「图谱」按钮切换。
- 难度/掌握度双编码沿用现有约定（难度=光点颜色、掌握度=进度环/条，不混用）。

### 1c. 确定性校验脚本 `tools/check-graph.mjs`（Node 直跑，无浏览器）

- 检查：yaml 可解析；节点代号都在 json/ 索引里存在；边类型 ∈ 四类枚举；每条边两端代号合法；**prereq 全库无环**（拓扑排序成功）；`notebook_commit` 字段存在。
- 任一失败 → 非零退出码 + 打印具体哪条边/哪个节点。
- **串进 `package.json` 的 `check` script**（加在现有命令链里）。

## 任务 2：跟随系统亮暗（TASKBOOK §8 第 8 条）

- `src/styles.css` 已把颜色集中在 `:root` CSS 变量（暗色极光玻璃拟态，视觉基准 `mockup/A1.3.html`——只读参考，别改）。
- 加 `@media (prefers-color-scheme: light)` 一套亮色变量（同结构：浅底、深字、玻璃拟态半透明改浅色适配）；图谱的边颜色也要在两套主题下都可辨（用 CSS 变量取色）。

## 验收（结束前必须全过并如实报告）

1. `npx tsc --noEmit` 零错误
2. `npm run check` 全绿（含你新加的 check-graph）
3. `git log --oneline` 显示按功能分好的提交
4. 最后输出总结：改动文件清单、图谱怎么打开（#graph）、yaml schema 说明、check-graph 查了什么、遗留问题（如实说，别谎报完成）

## 红线（重复一遍，违反即返工）

- 禁 React/Vue/CDN/任何运行时外部请求；坏数据出错误浮层绝不白屏。
- 不碰 `json/` `build/` `mockup/` `src/viz/specs/`（除非 check 报 viz 缺模块——那也只在报告里说明，不要自己补）。
- 禁 push。禁改已有提交的历史。
