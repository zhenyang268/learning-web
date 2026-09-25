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

### P1 图谱语义边：已铺开 25 章（graph/ 从 1 → 26 个 yaml）

- 新增 25 个：A2/A4/B1/B2/C6/C7/C8/C9/C10/G1/G2/G4/H6/H8/I9/J2/P1–P9（含 A1 共 26 个文件）。
  当前**所有已入库的多单元组都已覆盖**；D/E/F 全是单单元组（每组 1 文件、无组内边）不需要 yaml。
- 依据全部来自各单元 json 的 entries（statement/counterexample/comparison 标题与正文）+ links；
  每条边带注释说明依据，prereq 全库无环（`check:graph` **PASS 817 · FAIL 0**）。
- 单元内部的对偶（如 H8.3「质点–弹簧 vs PBD」、C10.2「Itô vs Stratonovich」）**不建自指边**，
  只在 yaml 里注记说明——自指是非法边，check-graph 会拦。
- 覆盖原则：~~yaml 只写组内语义边；跨章关系仍由 links 派生边承担~~
  **★ 2026-09-25 下午已推翻，见 §7**：被 yaml 覆盖的单元，prereq **严格只用 yaml**（跨组派生边也作废），
  所以新铺 yaml 时必须把证据明确的**跨章 prereq 一并显式声明**（K3/Q9/R2 就是这么写的）。
- 剩余：等 JSON agent 入库 K–R/de/lie 各章后跟进（defg 批已于 2026-09-25 上午入库完毕）。
- **接力规则（本轮验证过的工作流）**：`find json/<G> -name '*.json' -mmin +5` 全部命中
  且 ≥2 文件、`graph/<G>.yaml` 不存在 → 该铺了；铺完 `npm run check:graph` **和 `check:sem-sync`** 必须 0 FAIL。

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
   静默降级成纯派生边。~~build-standalone.mjs 已把 graph/ 打进 DATA 表~~
   **★ 本轮（下午）已改为更彻底的解法**：语义边烘进索引后，运行期根本不 fetch graph/*，
   standalone 里内联 yaml 反而成了死数据，已移除。详见 §7。
6. 顺手：图谱右栏「语义边真源现只有 A1」过期文案 → 动态 `N/M` 计数；
   aside.ts 掌握度圆环、styles.css 37 处硬编码 alpha 色值 → `color-mix(var(--x))` 主题化。

### P2 mastery 注入：**用户已否决，不做（2026-09-25 11:32）**

原方案想用 ns-progress.md 的 L0–L5 六层状态映射到 318 个小目的 mastery。**用户明确否掉**：
「不需要，除非很明确的关联性，这个不是完全对应的也没问题」——L 层级与小目之间没有明确
对应关系，宁可不注入。

**现状即终态**：`src/modules/state.ts` 的 mastery 初值恒 0、只靠交互累积（点卡片掌握度
+1，localStorage 持久化）。**下一个接手的 agent 不要再尝试 P2**，除非用户主动给出
小目级的确定性真源（逐条打勾表落到文件里）。

（下面保留当时的排查记录，供追溯。）

#### 当时的排查：真源缺失

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

---

## 7. 进度追加（2026-09-25 下午，前端 agent 第二轮）

用户本轮提了两件事：① 左侧目录与整页共享滚动条互相影响；② 继续查 bug。
结果查出**一个比上午所有 bug 都严重的架构不一致**，并把它彻底修掉了。

### 7.1 界面：目录/右栏改为独立滚动区（用户报的问题）

- `styles.css`：`nav .box` 与 `aside .box` 加 `max-height: calc(100vh - 96px)` + `overflow-y: auto`
  + **`overscroll-behavior: contain`**（关键：滚到底/顶时不把滚动链传给 body）+ `scrollbar-width: thin`。
  细滚动条 hover 才显形。窄屏 `@media(max-width:1150px)` 单列堆叠时取消限高、交回整页滚动。
- `sidebar.ts`：目录每次 `refreshChrome()` 都被 innerHTML 整树重建 → **滚动位置会归零**
  （实测点掌握度 +1 目录就跳回 A1）。已改为重建前存 `scrollTop`、重建后还原；换搜索词才归零。
  并把 `.node.on` 最小滚动带进可视区（**手写 offsetTop 计算，不用 scrollIntoView** ——
  后者会连带滚动祖先，等于把正文推走，正是用户报的毛病）。
  仅当 `scrollHeight > clientHeight`（真的是独立滚动区）时才动 scrollTop，窄屏 static 下不动。

### 7.2 真 bug：右栏/frontier 与图谱视图吃**两套规则**（严重）

**症状**：26 个 yaml 真源当时只喂给了图谱视图；右栏「依赖◂」和顶部「今天该学」
（`modules/graph.ts` 的 `buildGraphFromMeta`）仍只用编号序启发式。后果可量化：
- **A1.2 的真实上游 A1.4 在右栏里根本不显示**（A1.4 编号在后，被启发式判成下游）；
- **P3.1 是起点却凭空长出 16 个假上游**（A1.5/C1/H1/I5…）。根因：links 对工具篇是
  **applies 方向**（「这个放缩用在那些证明里」），启发式按「编号序在前」一律猜成 prereq；
- **26 个地基单元被假上游压住**，frontier 拓扑序因此算错；
- 图谱视图给 P3.1 画 16 条入箭头，右栏却说它是起点 —— **界面自相矛盾**。

**修法（单一真源，构建期烘入）**：
- `graph/*.yaml` 四类边在**构建期烘进 `json/index.json`**（`kb-index.ts` 新增 `attachSem`，
  **复用 `graph-model.ts` 的 `normalizeSemYaml`**，与图谱同一份规则）；`UnitMeta.sem` 承载。
  为什么不在运行期 fetch：`dom-harness` 把非 `json/` 的请求全判为「外部请求」，
  fetch yaml 直接撞「零外部请求」红线；而且每次开图谱要多 26 个往返。
- `loader.ts` 补 `parseSem`（它逐字段构造 UnitMeta，不加会静默丢掉新字段）。
- **被 yaml 覆盖的单元，prereq 严格只用 yaml**（组内 + 跨组派生一律作废）。
  `graph-model.ts` 的 `mergeGraph` 同步改成同一规则（原先只作废同组，混用会造出
  **A1.4 ⇄ A1.2 假环** —— 正是 A1.yaml 头部警告过的那个坑，实测注入后拓扑序只剩 31/165）。
- `graph-data.ts` **不再 fetch graph/*.yaml**，改从索引反构造（消除第二数据源 = 漂移根源）。
  附带收益：yaml 解析器移出浏览器 bundle（app **0.58MB → 0.49MB**）；
  `build-standalone.mjs` 不再内联 yaml（同文件里留两份会漂）。
- `usedBy` 补记 yaml prereq 的反向（原先 P2.5 说依赖 P2.2、P2.2 却不显示被 P2.5 用）。
- `buildIndex(jsonDir, graphDir)`：graphDir 改**显式必填**（原先 `resolve(jsonDir,'..','graph')`
  隐含「兄弟目录」，`HARNESS_JSON` 指到别处会**静默丢光语义边**）。三个调用方已同步。

### 7.3 新增常驻闸门 `tools/check-sem-sync.mjs`（已串进 `npm run check`）

三方对拍：右栏 `buildGraphFromMeta` / 图谱 `mergeGraph(索引反构造)` / 图谱 `mergeGraph(磁盘 yaml)`。
断言：prereq **逐单元**一致 · tension/dual/applies 一致 · 两边无环 · 拓扑序全覆盖 ·
烘入无损 · 覆盖单元 prereq 严格等于 yaml · frontier 能算出 · 语义边确实烘进索引（防静默全丢）。

**这个闸门不是摆设，已两次抓到真问题**：
1. 注入旧 bug（yaml 覆盖单元仍补派生边）→ FAIL 4、退出码 1，并报出 A1.4⇄A1.2 假环；
2. 正常跑时抓到 **R2.4 右栏有 R2.2、图谱没有** —— 根因是 `deriveEdges`（图谱侧）
   漏了「同章节递进」这条派生规则，而 `buildGraphFromMeta` 有。已补齐，两边逐字一致。

闸门另报一个**只警告不失败**的度量：「待判定跨章关联 N 条」（当前 707 条 / 102 单元，
其中 P 工具篇 256 条多为 applies 方向）。这是剩余数据工作量指标 ——
逐条判方向需要语义依据（宁少而真、不许编），所以不做成 FAIL。
右栏对此**如实说明**：prereq 为空且存在跨章 links 时，显示
「组内无前序（真源已标注）。跨章关联 N 条尚未判定依赖方向，故不计入：…」
而不是误导性的「无前序（拓扑序起点）」。

### 7.4 新铺 4 章 yaml（含跨章 prereq，共 30 章 / graph 30 个文件）

`K3`（传播子）、`Q9`（同调）、`R2`（Cauchy 理论）、`R4`（留数）。因为 §7.2 改了规则，
**新铺的 yaml 必须显式声明跨章 prereq**，否则真依赖会丢。逐条查了正文依据：
- K3.1 ← K1（「理由：K1:time-slicing.statement 的切片公式，V=0 时直接得到」）、P8.1（高斯积分）
- K3.2 ← K3.1（三处对照 + ωT→0 自检）、K1、D3（「分离技巧依赖 δS=0，这正是 D3 的哈密顿方程」）、P8.1
- Q9.2 ← Q9.1（「需要 ∂²=0，否则商无定义」）、**Q7**（H_k 是商群；statement 有「与 Q7 的接口」条目）
- Q9.3 ← Q9.1（「χ 的良定义依赖 ∂²=0」）；与 Q9.2 建 dual（V−E+F ↔ Σ(−1)^k b_k）
- R2.2 ← R2.1、**R1**（「f dz 是闭 1-形式，由 C-R 方程——R1 的两式正是 d(f dz)=0」）
- R2.3 ← R2.1 + R2.2（statement 自陈「依赖 R2.1 的 ∮dz/z、R2.2 的 Cauchy 定理」）
- R2.4 ← R2.3（「三个都用 f^(n) 的 Cauchy 求导形式」）
- R4.1 ← **R3**（留数定义 = Laurent 的 c_(−1) 系数；「孤立性是 Laurent 展开的前提」）、
  R2.2 + R2.3（留数定理 = Cauchy 定理「两回路之差」技巧的多回路版）
- R4.2 ← R4.1 + R3（comparison 自陈「依赖 R4.1 的留数定义、R3 的奇点分类（阶数判定）」）
- R4.3 ← R4.1（「补上半圆闭合，留数定理直接给答案」）+ R4.2（辐角原理 Z−P 要会算留数）+ R2.1

跨章端点**只写已入库者**（R6/R7/R8 当时未入库，写了 check-graph 会 FAIL）。
9 个单元的 prereq 逐个验收与 yaml 声明一致，全库无环、拓扑序 185/185。

### 7.5 顺带验证（不是猜的，都跑过）

- **frontier 合理性**：mastery 全 0 → A1.1；学完 A1 → A2.1；学完 A2 → A4.1；
  再学完 A4+P1/P2 → B1.1。P 篇起点（P3.1/P9.1/P9.3/P8.1/P7.1）全部「随时可学」
  （旧 bug 里它们被假上游压死）。
- **图谱视图 DOM 验收**：不再卡「加载中」、SVG 有 16 个 L1 字母块、下钻 L2 正常、
  **graph/* 请求 0 条**（语义边确实来自索引）、无未处理异常。
- **REF_TOKEN 放宽后无误匹配**：12 个用例全过（`de1.10`/`lie3.17` 现在可点；
  `3.14`、`v2.1`、`2x3y`、`a.e.`、`3.5` 都不误链）。
- **DOM 层确认右栏如实文案**已渲染（A2.1/P3.1/A1.1/C7.1 四个用例），请求各 4 条全在 `json/` 下。

### 7.6 验收快照（2026-09-25 下午）

tsc 0 错 · check:graph **803/0** · **check:sem-sync 11/0**（185 单元 / 105 个带语义边真源）·
check:viz 3182/0 · dom-harness **185 单元 7434/0** · standalone 重建 7.19MB（app 0.49MB）。
提交：`20a1162`（语义边烘入 + 侧栏独立滚动 + 闸门）→ `0abf98b`（deriveEdges 补齐 + 如实文案 + 闸门度量）
→ `dfde1b3`（K3/Q9/R2）→ `542d3f7`（本节）→ `d847dc2`（R4，graph 达 30 个 yaml）→ `d140673`（见下）。

### 7.7 standalone 快照验收补了 4 条断言（验收盲区）

上午修过「standalone 静默丢语义边」，但 `dom-harness.mjs` 的 `runStandalone()` 段
**根本没检查图谱** —— 同类 bug 再来一次不会被发现。已补：
1. 内联索引带 `sem`（语义边确实烘进快照）；
2. 快照**不再**内联 `graph/*.yaml`（确认死数据已移除）；
3. 图谱视图能渲染出 `.gnode`（不卡「加载中」—— 对应 §6 bug 3）；
4. 无「语义边真源尚未建立」降级提示。

⚠️ 写断言 1 时踩的坑：内联索引是 `window.__indexJson = "{...}"`，被 `JSON.stringify`
**二次转义**，所以 grep `"sem":` 永远匹配不到（实际文本是 `\"sem\":`）。
正确做法是正则抠出字符串字面量再 `JSON.parse(JSON.parse(m[1]))` 解析后统计。
**字符串匹配式断言很脆**，能解析就解析。

这 4 条断言做过**注入测试**：把快照里的 sem 抹掉 → FAIL 6（含「图谱无语义边降级提示」），
证明断言真的在拦东西，不是摆设。

**方法论（本仓已两次验证有效）**：修完一个「两处不一致」类 bug，别只手动验一次 ——
把它变成常驻闸门（串进 `npm run check`）+ 做注入测试确认闸门会红。
`check-sem-sync.mjs` 就是这么来的，而且它当场抓到了第二个 bug（R2.4）。

### 7.8 待判定跨章关联第一批落地（双向印证法，19 章 / 提交 `0599e8e`）

§7.3 遗留的 721+ 条待判定关联，第一批已落地。**方法比结论重要**：

数据里有**系统性的显式方向声明**——词条 statement 的「它依赖什么 / 谁依赖它 / 下游：」
声明块（覆盖 ~55% 单元，引用笔记行号）。这是只读真源，比编号序猜测可靠得多。
但直接采信会注入假边，实测踩过三类噪声：
1. **对照混入依赖段**：`G1.1` 写「依赖：G1.2 的辛格式（对比）」——括号标明是对照不是依赖；
2. **数据内部矛盾**：`I9.2` statement 说「下游：I9.1」，同单元 application 说「必须在 I9.1
   框架里讨论」——后者才是真依赖；
3. **分号后第三方陈述**：`N13` 写「下游：N14、N15；本章的 A3 是 M6 的前置」——
   A3/M6 与 N13 无关，句法提取会造出假 applies 绿箭头。

**落地标准 = 双向印证**：下游单元说「依赖 X」**且** X 单元独立说「下游：本单元」，
两侧互认才收。prereq 收互认边；**applies 只收互认边**（派生边本来不产生 applies，
少写零损失，而句法误解析的假箭头会误导）。丢弃的边必须逐条定性：
传递冗余（可从保留边拓扑可达，写脚本验证而非目测）可丢；
**横切章不自动放行**（标题含 类比/交叉/接口 的 F6/K5/L9/R7 有真依赖待人工判断，见下）。

- 落地：D2-D4 / E2,E4 / F2,F3 / J5-J7 / K2 / M1,M2 / N10,N13 / Q3 / R3 共 17 个新建 yaml
  + C9.1←C6.5、G1.2←D3 两处原地合并。graph 达 **47 个 yaml / 202 单元 / 122 个带语义边真源**。
- 闸门：check-graph **1072/0** · check-sem-sync **11/0**。standalone 重建 7.60MB。
- **check-graph 加固**：`scanUnits()` 坏 JSON 从静默 `continue` 改为显式 FAIL（exit 1 +
  指明文件）。此前 JSON agent 并发写入时读到截断 JSON → 误报「节点不在索引里」，
  闸门结果随机波动（实测复现过）。做过注入测试（注入坏 JSON → exit 1，恢复 → exit 0）。

**仍待人工判断的 4 个横切章**（不建议自动放行，各有 3-6 条真依赖待定性）：
- `L9`（与渲染的类比）：强证据 L9←K5，但会丢 H1/J6/L2/L3/L4/L7；
- `F6`（量子力学与 CG 的交叉）：强证据 F6←F5，会丢 F2/F3/F4；
- `K5`（与路径追踪的类比）：强证据 K5←K2，会丢 F6/J8/K4；
- `R7`（与 PDE 的接口）：强证据 R7←R1,R5，会丢 R4.2/R4.3/R6（复分析章不依赖留数论，可疑）。
判断点：这些 links 是「类比对象」（该丢）还是「先修依赖」（该补进 yaml）。

**N 篇语义注意**：N10/N13 是学习路线图章，其 links（A2.1/B1.2/…）是「本层涵盖的内容」
而非 prereq——基线把方向猜反了（同 P3.1 那个 bug）。yaml 里已按声明块纠正为 N13←N12 等。

### 7.9 前端接管轮：交互盲区排查 + de1 落地（2026-09-25 傍晚）

**交互层排查**（都是 harness 测不到的盲区，已写进程内测试逐个验证）：
- ✓ hash 路由切页（A1.1→A2.1 标题/右栏/预取正常）；✓ 四问 tab 点击切换；
- ✓ 限定词可点行（qrow 点击行内展开 tr.detail、再点收起）；✓ probe 勾选持久化；
- ✓ 图谱视图在 48 yaml 下正常（零 graph/* 请求、可下钻）；✓ frontier 合理性；
- ✓ 主题：`prefers-color-scheme: light` 存在（styles.css:34），极光背景 6 处硬编码 =
  暗色 3 默认 + 亮色 3 覆盖成对出现，非 bug。
- **修了 1 个真 bug**：掌握度点击 title 承诺「0–5 循环」但 `setMastery` 钳位在 5，
  用户到 L5 后永久卡死无法降级 → `wireMastery` 改为 `(mastery+1)%6`（提交 `4501432`）。
- **修了 1 个断言时序竞争**：harness「启动只拉 ≤2 请求」与文档化的空闲预取（200ms 拉
  idx+1/idx+2）存在竞争，之前靠机器忙碌偶然绿 → 改为真不变式：索引第一 + ≤4 条 + 全 json/。
- 掌握度**键架构确认无 bug**：卡片写 `group.key`（= 索引 `cards`，同一条 `cardKeyOf` 规则），
  单元掌握度 = 卡片均值（`groupMasteryMean`）。注意**卡片键 ≠ 单元代号**——写测试时
  预置 `mastery['A1.3']` 无效，要用索引里的 cards 键。

**de1（常微分方程，14 单元）铺 yaml**（提交 `48739dc`，graph 达 48 个 / 136 单元带 sem）：
- 首个**多单元组**走双向印证管线：组内直接依赖来自声明块两侧互认，
  替代「同组编号序全递进」噪声（de1.7 基线曾是 [de1.1..de1.6]，实际只需 de1.5）。
- 跨章 prereq：de1.9←A2.1/A4.1（压缩映射）、de1.10←G3/G4.1（矩阵函数）、
  de1.12←A2.4（谱定理）、de1.13←R3（幂级数）、de1.1←P1.1/P6.1。
- 不采信的声明：de1.11→A2.1「Lyapunov」方向可疑（A2.1 同时是 de1.9 上游，会造假环）。
- **待办**：de1.15–17（Bessel/Legendre）被多处声明为下游但未入库，入库后补 applies。
- 丢边定性结论：38 条「真丢」全部为同组递进噪声或并行方法误判（C5→de1.9 是对照语义），
  逐条论证写在 yaml 注释里。

**下一批（重要，别照搬第一批的做法）**：新入库的 Q2–Q8/F4,F5/L2,L3,L5–L7/M3,M5/G5/J8/
R5,R6/N8,N9,N14,N15 共 25 个单元的强证据边 **0 个可安全落地**——它们的 links 丰富，
声明只保留直接依赖会丢大量 links 边。在「丢边逐条定性」前不要建 yaml（宁少而真）。

### 7.10 关联标准放宽轮：只做最关键的边（2026-09-25 傍晚，用户明确指示）

用户原话「关联不用那么认真，只做最关键的就行」——§7.9 末尾「丢边逐条定性前不要建 yaml」
的严格标准**作废**。新口径：派生边方向正确的章节**不建 yaml**（交给派生），
只修「错得有害」的三类：假前置成串（覆盖剥离）、关键跨章边缺失（显式补）、欠账待补。

本轮改动（graph 达 52 个 yaml / 226 单元）：
- **de1.yaml 补欠账**：de1.15–18（Bessel/Legendre/统一视角/Green 函数）入库，
  补 4 个节点 + de1.14 的 applies（→de1.15/16）。跨章：de1.15←P8.4（Stirling 渐近）、
  applies→H5（球谐函数）。de1.16 的 links 里 F4（角动量）不采——Legendre 出现在
  角动量里，方向反了。
- **de2.yaml（新）**：de2 分两条独立轨道——对称性轨道 de2.1–2.4（派生方向正确，不覆盖）
  与 PDE 轨道 de2.5 起。PDE 分类与对称性降阶**无前置关系**，但同组递进给 de2.5/2.6
  挂了 de2.1–2.4 全部假前置 → 覆盖：de2.5←de1.5、de2.6←de2.5。
  de2.7+/de3/de4 仍在并行生成，入库后回来补。
- **R1.yaml（新）**：R 章起点被派生挂上 Q10/A2.5/A3/A4.1/H1/P5.1 六条假前置
  （对照引用误读）。声明块原文「依赖：复数与 P5 的 Euler 公式；下游：R2/R3/R5/R7/Q10」
  → prereq 收窄为 [P5.1]，applies 补 [Q10]（其余下游由各自 prereq 承载）。
- **R7.yaml（新）**：关键跨章边 **de2.5→R7**（PDE 分类是「二维为什么特殊」的框架语言）
  编号序派生不出来（R < de），只能显式声明；同时剥掉 I4/I5/I6/I9.1/Q10/H1/A2.5 假前置，
  保留主轨道 [R1, R2.3, R5, R6]。
- **不建 yaml 的**：Q（拓扑）/L（QFT）/M（统计）章——dump 派生基线核对过，
  链条方向全对（Q2←Q1←…、L1←F1/F2/F4 二次量子化←量子力学），假前置少量且无害；
  N 章是学习路线图（导航内容），铺边无意义。

**验证**：check-graph 1163/0 · check-sem-sync 11/0（226 单元 / 144 带 sem）· tsc 0 ·
harness 见当日日志。方法沉淀：dump 派生基线用 `mergeGraph(units, new Map()).prereqIn`
（**是 Map，要 .get()**；返回结构是 {codes, titleOf, directed, undirected, prereqIn, order,
cycleNodes, yamlStatus}，不是按节点索引的对象）。

### 7.11 继续轮：de2 跟随 + standalone 重建（2026-09-25 17:30–17:45）

- **de2 跟随入库**：de2.7（热方程）/ de2.8（Laplace）入库，扩 de2.yaml——
  PDE 三原型链 de2.5→de2.6/de2.7→de2.8；de2.8 额外 ← de1.18（Green 函数方法
  的 ODE 原型 → PDE 推广，声明 4/9 点名）。de2.6 与 de2.7 是并列原型
  （传播 vs 扩散），互引属对照不建边。提交 `9f400f4`。
- **P3 standalone 重建**：`dist/knowledge.html` 8.30MB（226 单元 / 146 带 sem /
  51 yaml / KaTeX 字体 20 woff2）。注意 **dist/ 在 .gitignore 里，不入库**——
  它是「双击即开」的本地快照，每次数据更新后需手动重建
  （`npm run build:standalone`）。harness 第 8 节快照断言随全库跑绿
  （9276/0；jsdom 无 canvas 的 getContext 警告属已知噪声）。
- **P3 视觉收口复查**：src 里写死色值仅剩三处且全部合理——极光背景
  （亮暗成对，§7.9 已定性）、滑块拇指 `#fff`+`var(--cyan)` 边、错误浮层阴影
  `#0009`。`src/viz/kit.ts` 的 FALLBACK 常量是 Node 侧校验回退（浏览器实时读
  CSS 变量），非违规。
- 闸门终态：check-graph 1151/0 · sem-sync 11/0 · tsc 0 · viz 3523/0 ·
  harness 226 单元 9276/0（含新快照）。

### 7.12 收官轮：lie 篇 + de4 后半语义边 + 表格断行修复（2026-09-25 晚）

- **318/318 全库追平**。新增 graph/lie1.yaml（16 节点）、lie2.yaml（13）、
  lie3.yaml（28，覆盖 3.1–3.24，3.25–3.28 总结/导航留派生）；de4.yaml 扩
  4.5–4.8/4.12（4.9/10/11/13 总结留派生）。
- **发现 lie 篇数据噪声**：57/57 单元 links 每条声明都带 G2.1（有限差分法），
  正文零命中——生成线系统性伪引用。G<lie 使派生规则给全部 lie 单元造出
  「有限差分法是前置」的假边；lie 章全量覆盖剥掉。若未来清洗 json 去伪 links，
  覆盖可放宽。
- 关键跨章边：lie1←B1.1/B1.2（群论底座）、lie2.12←Q10（de Rham 同主题）、
  lie3.9←de2.4（对称性解 ODE）、lie3.10←de2.7/de2.12、lie3.17←lie2.7、
  lie3.18←de4.6、lie3.20←de4.8、de4.12←lie3.17。
- **修 markdown 表格断行**（src/renderers/markdown.ts）：json 内容在单元格中途
  硬换行（实测 lie1.15 限定词表）会让整块过不了表格判定、退化成段落（表整个
  消失）。修法：首行为 `|` 的块里，把不以 `|` 开头的续行并回上一行。
- 终态闸门：graph 1659/0 · sem-sync 11/0（318 单元/229 带 sem/59 yaml）·
  tsc 0 · viz 3523/0 · harness 318/318 · 13188 断言 0 · standalone 10.61MB/318。
