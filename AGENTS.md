# learning-web — 协作规约

> **读者**：人 + 编码 agent ｜ **最后更新**：2026-09-24
> **本文是 `learning-web` 仓的入口文件**。展开内容按文档地图按需读取，不要一次性全读。
>
> **一句话**：把父仓 `notebook/*.tex` 转成可交互的知识图谱与阅读面。
> 前端负责绘制与交互，计算按分级判据决定放前端还是走 `learning-viz`。
>
> **本文只放「规约」** —— 每次会话都要遵守的硬规则、判据、命令、红线。
> **「设计」一律在 `DESIGN.md`**：决策记录、数据结构、契约样例、规模策略、风险明细、
> 判据示例。只在动手改契约 / 渲染器 / 构建脚本时才读它（§11）。

---

## 0. 文档地图与真源

| 文件 | 内容 | 什么时候读 |
|---|---|---|
| 本文 | 硬规则、分级判据、目录、命令 | 每次会话开始 |
| `DESIGN.md` | 决策记录、数据流、数据结构、契约样例、规模策略、风险明细、A1 切片验收 | 动 renderers / viz 注册表 / 契约 / `build/` 之前 |
| `TASKBOOK.md` | 知识库自动生成流水线 + 前端的**施工任务书**（批次、子 agent 分工、P 篇特化） | 参与知识库生成 / 前端开发任务时；完工后归档 |
| `build/orchestrate/HANDOFF-json.md` | 知识库生成线**进度真源**（当前 85/318）+ 已知坑清单 | 接手 JSON 生成线时先读 |
| `build/orchestrate/RUNBOOK-cli.md` | 生成线**执行手册**：会话内 `wb*` 命令（--bg 派发，D17）/ 外部终端 `batch_*`（D16） | 要跑生成/评审/修复时 |
| `build/orchestrate/HANDOFF-frontend.md` | 前端线接力任务书 | 接手前端时 |
| `build/orchestrate/MASTER_PROMPT.md` | **主控 prompt**（主 agent=glm-5.3 规划，flash 级模型经 `--bg` 执行 JSON/前端任务） | 开总编排会话时整篇贴入 |
| `build/prompts/frontend_task.md` | 前端子任务 prompt 模板（配 `wbtask` 用） | 派前端开发任务时 |
| `../AGENTS.md`（父仓） | 代号体系、符号规范、环境坑、红线 | 任何时候都要遵守 |
| `../dev-progress.md` | 进度唯一真源 | 判断某个模块是否已解锁 |
| `../learning-todo/ns-progress.md` | 数学线关卡与掌握度真源 | 读掌握度状态时 |

**真源约定（不可违反）**

| 事实 | 唯一真源 | 本仓怎么处理 |
|---|---|---|
| 笔记内容 | `../notebook/*.tex` | **只读**，构建时快照，产物入本仓 `dist/` |
| 知识图谱的边与探针 | `graph/<chapter>.yaml`（**本仓**，见 §3.1） | 本仓维护，随 `build/` 一起迭代 |
| 学习词条占位 | `json/<chapter>/<code>.json`（**本仓**） | 阶段一只追加关键词（`DESIGN.md` §16） |
| 掌握度状态 | `../learning-todo/ns-progress.md` | **只读** + 生成待粘贴的 diff，不直接写 |
| 进度与 Gate | `../dev-progress.md` | 只读 |
| 构建产物 | `dist/` | 本仓生成，**gitignore** |

> 若某项真源缺失（如某个 `graph/*.yaml` 尚未建立），**明确标注「待核」并停下报告**，
> 不要另立第二份等效数据 —— 那是漂移的起点。

> **历史校正**：本文 2026-09-22 落地时经评审校正 9 处，正文相应处标 `[校正 Cn]`，
> **明细表在 `DESIGN.md` §7**。

---

## 1. 上游依赖：如何引用父仓 notebook

### 1.1 路径解析顺序

父仓 `AGENTS.md` 第七节警告：三子仓在 `git worktree` 与新 clone 中**都不出现**，
跨仓引用必须显式。按此顺序解析，找到即停：

```
1. $LEARNING_NOTEBOOK      环境变量（优先，CI / worktree 场景）
2. ../notebook             相对本仓父目录（常规开发场景）
3. 解析失败 → 立即报错退出，不要静默 fallback 到任何默认路径
```

### 1.2 构建时快照 + 溯源

构建脚本**必须**把 notebook 的 git 状态写进 `dist/provenance.json`
（字段与样例见 `DESIGN.md` §3）—— 它把「notebook 后续会固定住」变成**可验证的事实**：
`notebook_dirty: true` 或 commit 变化 = 图谱可能与笔记不一致，需重建；
同一份 `notebook_commit` 还用于校验 `graph/*.yaml` 是否过期（§3.1）。

### 1.3 代号即主键

章节代号（`A1`、`H4`、`G1.1`）是节点主键与前端路由 ID。
父仓 `AGENTS.md` 第四节已警告 `§NN.N` 全局编号会因插入 `.tex` 而整体位移 ——
**代号不会**，因此一律用代号，禁止用编译后的全局编号。

`\subsubsection` 源码里无显式代号，由 filter 按出现顺序合成 `X#.k`。

> **层级只有两级** `[校正 C2]`：`A1`（subsection）→ `A1.4`（其第 4 个 subsubsection）。
> 形如 `A1.1.3` 的三级代号**不存在**，见到即改。
> 实测印证：`partN.tex` 的教材对照表已在用 `A1.5`（= A1 的第 5 个小目「$L^p$ 空间」）。

> **漂移风险**：合成编号在插入新 `\subsubsection` 时会移动。
> 对策：对**需要被长期引用的锚点**，在 `.tex` 标题里写死代号
> （`\subsubsection{G1.1 经典 RK4}`），filter 优先采信显式代号。

---

## 2. 核心判据：这个计算放前端还是走 viz

**按顺序问四个问题，第一个「是」即停。不要凭「简单/复杂」判断。**

| # | 问题 | 是 → | 依据 |
|---|---|---|---|
| **Q1** | 父仓（`graphics/src`、`learning-viz`）**已有**该计算的可信实现？ | **走后端** | 父仓 `README.md` 第一原则「单一实现 + 绑定」「不重复实现」 |
| **Q2** | 数值正确性**本身就是结论**，需要 pytest 对拍？ | **走后端** | 父仓 `AGENTS.md`：严谨优先于速度 |
| **Q3** | 长时程 / 迭代 / 有稳定性要求（能量漂移、NS、刚性方程）？ | **走后端** | 数值稳定性不是前端该承担的 |
| **Q4** | 纯函数图像 / 几何演示 / 离散对比，且父仓无既有实现？ | **前端 JS** | 零往返、可离线、HMR 可调 |

> 本节的两个「Q1/Q2」是**判据编号**，与 §10 的**问题编号**同名但无关 ——
> 引用时写「§2 判据 Q1」或「§10 问题 Q1」。
> **逐模块的判据结论与应用示例见 `DESIGN.md` §11。**

### 2.1 迁移不产生技术债

前端起步的模块将来 C++ 实现了，**契约不变、只换数据源** —— 注册表里的 `source`
由 `'frontend'` 改成 `'backend'`，其余一行不动（契约 schema 是分级机制的粘合剂）。

### 2.2 前端计算的严谨性要求（判据 Q4 的代价）

前端算的数值**没有 pytest 对拍**，所以**必须**给三点补偿：模块内 invariant 自检
（不达标即抛错，不静默画错图）、响应带 `computedBy`、UI 标「前端计算·未对拍」徽标。
三条的细则与理由见 `DESIGN.md` §11.2。

> 依据父仓 `AGENTS.md` 硬规则：「不确定就明确标注『待核』，不要含糊过去。」
> 前端计算的不确定性必须**可见**，不能藏在图里。

---

## 3. 知识图谱：一份数据，两种呈现

`dist/graph/<chapter>.json` 是唯一数据，同时喂两个消费方（standalone HTML 与 web 外壳的
`graph` 渲染器），**不得各写一份渲染逻辑**。

- **`dist/graph/<chapter>.html` 必须能在 `file://` 下双击即开**：数据内联、产物用 IIFE、
  无任何外部请求 —— 三条里中任一条都会**直接白屏**。规格与原因见 `DESIGN.md` §9.1。
- **按章生成，不默认全量**（`--chapter`）；三层缩放策略见 `DESIGN.md` §9.2。
- **四种边不可合并**：`prereq`（学习顺序）**必须无环**，否则拓扑排序与 frontier 计算失效；
  `tension` / `dual` / `applies` 允许成环。语义表见 `DESIGN.md` §8.2。

### 3.1 语义边的真源在**本仓**（§10 问题 Q1 已决，2026-09-22）

`prereq` 可半自动抽取（从 `.tex` 的 `\ref` 与代号提及），
但 `tension` / `dual` / `applies` 是**语义边，只能人工标注**，`.tex` 里没有。
**决定**：落在**本仓** `graph/<chapter>.yaml`，与 `build/` 同仓迭代。

**必须做的三条缓解**（`notebook_commit` 校验 + 版本比对 + 代号消失即失败）——
细则见 `DESIGN.md` §10.1。**缺了它，「放本仓」的脱节代价会变成事故。**

> 取舍论证表与 yaml 字段样例见 `DESIGN.md` §10。

---

## 4. 节点与掌握度

> **数据结构全文（`ConceptNode` / `Probe` 接口、字段语义）见 `DESIGN.md` §8。**
> 本节只留必须记住的约束。

- **代号只到两级**（§1.3）；节点 `code` 取自 `.tex`，不是手写的。
- `difficulty`（内容有多难，来自 `ns-progress`）与 `mastery`（学到哪一级）
  **两者正交**，UI 必须同时编码 —— 不要用颜色只表示其中一个。
- **frontier 是算出来的**：`{ n | n.mastery < 3 且其所有 prereq 满足 mastery >= 3 }`，
  取拓扑序第一个即「下一步」。不要写死顺序。
- **`../learning-todo/ns-progress.md` 只读**：用户改掌握度后只生成**待粘贴的 diff**，
  **不直接写文件**（红线见 §8）。掌握度分级 L0–L5 的判据见 `DESIGN.md` §8.3。
- probes 的三级来源（会话日志 / `.tex` 关键词 / 人工）见 `DESIGN.md` §12。

---

## 5. 目录

```
learning-web/
  AGENTS.md              # 本文（规约）
  DESIGN.md              # 设计（决策、数据结构、契约、验收）
  build/                 # 【Q2 已决】转换脚本全部在本仓，不经 Flask
    read_notebook.py     # 解析 §1.1 路径、读 .tex、写 provenance.json
    filter_codename.py   # 抽代号、合成子编号、建反向链接、转 vizslot
    build_graph.py       # graph/<chapter>.yaml + .tex → dist/graph/<chapter>.json
    build_html.py        # → dist/graph/<chapter>.html（standalone，见 §3）
    vendored/            # KaTeX JS + CSS + 字体（离线，禁 CDN；见 §7 公式渲染）
  graph/                 # 【Q1 已决】图谱语义边的真源（本仓）
    <chapter>.yaml
  json/                  # 学习词条占位库（阶段一：只记关键词，DESIGN.md §16）
    <chapter>/
      <code>.json        # 一个小目一个文件，如 A1/A1.3.json
  example/               # 多模型流水线演示样例（2026-09-24 起，lie 交互导读）
    lie/                 # 唯一实例：说明与生成链见 example/lie/README.md，不入正式流水线
  src/
    shell/               # 三栏布局 · 导航 · 路由 · 主题
    renderers/           # doc.ts（KaTeX 正文）· graph.ts · plot2d.ts
    viz/                 # 演示模块，按 §2 判据分 frontend/backend
    modules/             # registry: module → { source, endpoint, version, renderer }
    types.ts             # ConceptNode 等接口（§4，定义见 DESIGN.md §8）
  dist/                  # 构建产物，gitignore，可完全重建
  vite.config.ts         # dev proxy /api → learning-viz Flask:5000（仅计算模块）
```

> `build/` 与 `src/` 是**两套互不依赖的产物**：`build/` 出静态文件（Python），
> `src/` 出 web 外壳（Vite）。`build/` 的产物**不经 Flask**（§10 问题 Q2）。

---

## 6. 命令

```bash
# 构建单章（默认不全量，见 §3）
uv run python build/build_html.py --chapter A1

# 指定 notebook 路径（worktree / CI 场景）
LEARNING_NOTEBOOK=/path/to/notebook uv run python build/build_html.py --chapter A1

# 只出数据不出 HTML（供 web 外壳消费）
uv run python build/build_graph.py --chapter A1 --out dist/graph/A1.json

# dev（前端 + 代理到 learning-viz 的计算端点）
npm run dev                 # Vite，proxy /api → :5000
```

**Python 一律走父仓的 uv 环境**（父仓 `AGENTS.md` 第七节）：
`uv run xxx` 跑命令、`uv add xxx` 装包。
**禁止**系统 `python3`（`/usr/bin` 的 3.9.6）与裸 `pip install`。

> `[校正 C5]` 本仓在父仓目录树内，`uv` 会**向上发现父仓项目**并使用
> `~/develop/learning/.venv`。所以 **`uv add` 会把依赖写进父仓 `pyproject.toml` + `uv.lock`**，
> 本仓**不建**自己的 `pyproject.toml`；依赖改动要在**父仓**提交。

---

## 7. 硬规则

### 内容

- **`notebook/*.tex` 只读。** 本仓任何脚本不得写入父仓笔记。
  唯一例外：需要 `\vizslot` 时在 `notebook/main.tex` **和** `notebook/diffrential/main.tex`
  的导言区各加一行 `\providecommand` 兜底 `[校正 C4]`（否则 `latexmk` 报未定义命令），
  且改完必须重编译**两个**文档验证 PDF 不破。
- **禁止用编译后的全局编号 `§NN.N`** 做路由或引用，一律用代号。
- **代号只到两级 `X#.k`** `[校正 C2]`。见到 `A1.1.3` 这类三级写法即视为错误。
- `question` 字段（「在解决什么」）**必填**。留空的概念节点没有产品价值，宁可不建。

### 公式渲染 `[校正 C6]`

1. **`pandoc --katex` 不是服务端渲染**（`--math-method=katex` 同理）—— 它只把 TeX 留在 HTML 里、
   插入指向 KaTeX 库的标签，**不给 URL 时指向 CDN，直接违反禁 CDN**。
   生成 HTML 片段时**不要加 `-s`**。
2. **首选构建期预渲染**：Node 跑 `katex.renderToString()` 出静态 HTML —— 离线、无闪烁，
   且自带 `<annotation encoding="application/x-tex">`，搜索可直接命中 TeX 源码
   （如搜 `\sigma`-代数）。
3. 若退化为客户端渲染：KaTeX 的 JS / CSS / 字体一律 vendored 或打进产物，
   并**明确接受首屏闪烁**与「运行时依赖 `katex.min.js`」两个代价。

> 实现细节（替换时机、`throwOnError` 取值、错误处理）见 `DESIGN.md` §15。

### 计算

- **§2 四问判据不可跳过。** 决定前端还是后端前必须逐条回答，并把结论写进
  `DESIGN.md` 的决策记录。
- **不得在 JS 里重复实现父仓已有的算法**（§2 判据 Q1）。发现重复即改为走后端。
- 前端计算模块**必须有 invariant 自检**，且响应标 `computedBy`（§2.2）。
- 契约必须**批量返回**：拖滑块不得一帧一请求。
  `GET /api/viz/<module>?<params>&n_min=1&n_max=40` 一次取全，前端本地 scrub。

### 前端

- **禁 CDN。** KaTeX / Mermaid / 图表库全部内联或 vendored，产物必须断网可用。
- standalone HTML 遵守 §3 的三条约束（内联数据 / IIFE / 无 CDN；细则见 `DESIGN.md` §9.1）。
- **不引入 UI 框架**（React/Vue）。决策 D2：Vite + Vanilla TS，
  理由是单人维护 + 需要 HMR 调 Canvas/WebGL，框架是额外心智负担。
- 渲染器**只绘制不计算**（§2.1 的粘合前提）。

### 符号书写

**遵守父仓 `AGENTS.md` 第五节**（那是唯一真源，本文不重述）：
工程文档上标一律 `^` —— 写 `A^T`、`L^p`、`O(n^2)`，**不写** `Aᵀ`、`Lᵖ`、`n²`。

---

## 8. 红线（Do Not Modify）

- **父仓三子仓边界**：`learning-todo/`、`learning-viz/`、`learning-web/` 是独立 git 仓，
  改动只能在各自仓内提交。**未经明确要求不 `git push`**（父仓 `AGENTS.md` 第九、十节）。
- **`../notebook/`、`../learning-todo/`、`../dev-progress.md`**：本仓只读，不写。
- **父仓 `pyproject.toml` / `uv.lock`**：本仓的 `uv add` 会写到这里（§6 校正 C5）——
  改动属**父仓**改动，在父仓提交，不要在本仓提交父仓文件。
- **`dist/` 不入 git**：可完全重建，入 git 会与真源漂移且体积大（KaTeX 字体）。
- **`ns-progress.md` 的会话日志**：append-only，不修改历史条目。
- **已定稿的契约 version**：不向后不兼容地改。需要变更则升 `version` 并保留旧版一段时间。

---

## 9. 风险

- **R1（原标「高」，已解除）**：Python 3.14 下 `pypandoc-binary` / `flask` 的 wheel
  经 PyPI 实测齐备 `[校正 C3]`。**仍不改 `.python-version`、不用系统 python。**
- **R3（高）**：pandoc / KaTeX 对 `tabular`（`L{}` 列）、`\boxed{}`、`\xrightarrow`
  的保真度 —— 转换后**逐文件目视比对**，不可只抽查一个公式。
- **R5（中）**：语义边放本仓后的脱节风险，已给三条缓解（§3.1），构建不静默通过。

> R2 / R4 / R6 / R7 与上三行的明细、等级、处置表见 `DESIGN.md` §13。

---

## 10. 决策

**已决（2026-09-22，讨论过程见 `DESIGN.md` §1 的 D6 / D7）**

- **问题 Q1 → 本仓**：图谱语义边真源 = `graph/<chapter>.yaml`（与 `build/` 同仓迭代）。
- **问题 Q2 → `build/`**：转换脚本全部在本仓，**不经 Flask**。
  连带口径：`learning-viz` 收窄为**计算模块的后端**（`/api/viz/*` + 本地渲染），
  **笔记转换链路不再有 `/api/notes/*`**。参见 `learning-viz/README.md`。

**未决（不阻塞开工）**：搜索是否上索引库、掌握度是否上间隔重复、是否需要 dark mode
—— 倾向与代价对比见 `DESIGN.md` §14。

---

## 11. 与 DESIGN.md 的分工

**判据只有一条**：*每次会话都必须遵守的* → 本文；*只在动手改某个模块时才要看的* → `DESIGN.md`。
超阈值时按这条外移整节，**入口文件只留指针**。

- 本文目标体积 **≤ 17 KB**。
  原写「~15 KB」是 2026-09-22 估的值（当时以为 §4 数据结构是主要负担）。2026-09-23 实测：
  把「设计」全部外移后，**纯规约本身就有 ~16 KB** —— 判据、目录、命令、红线、硬规则
  都是每会话必需的。故把数字改为 17 KB；**判定主依据仍是上面那条性质判据**。
- 2026-09-23 已外移到 `DESIGN.md`：原 §0.1 校正表 → §7；§4 数据结构全文 → §8；
  §3.2 缩放与 §3.4 取舍 → §9 / §10；§9 风险明细 → §13；§2.1 判据应用示例 → §11；
  §4.3 probes 来源 → §12；§7 公式渲染实现细节 → §15（provenance 样例本就已在 `DESIGN.md` §3）。
- 本文 **27.3 KB → 16.9 KB**（−38%）。

---

## 12. 开工顺序

```
0. [已决] §10 Q1 → 本仓 graph/；Q2 → 本仓 build/。无阻塞，可直接开工
1. uv add --dev pypandoc-binary     # 落在父仓 pyproject.toml（§6 校正 C5）
2. build/read_notebook.py + provenance.json
3. build/filter_codename.py（正则用 [A-R]）→ 转 A1 → 目视比对 R3 三类结构
4. 手写 graph/A1.yaml（A1 共 5 个小目：A1.1 黎曼→A1.5 L^p；含 tension/dual 语义边）
5. build/build_graph.py → dist/graph/A1.json
6. build/build_html.py → dist/graph/A1.html，双击打开验证 §3 三条约束
7. 此后才动 src/（shell → renderers → viz 注册表）
```

**每步完成后停下报告，不要连续执行。**
步骤 6 的产物是一个可独立打开的单文件 HTML —— 那是第一个能拿给人看的东西，
在此之前不要碰 Vite 工程。**验收判据见 `DESIGN.md` §5。**
