# learning-web — 协作规约

> **读者**：人 + 编码 agent ｜ **最后更新**：2026-09-22
> **本文是 `learning-web` 仓的入口文件**。展开内容按文档地图按需读取，不要一次性全读。
>
> **一句话**：把父仓 `notebook/*.tex` 转成可交互的知识图谱与阅读面。
> 前端负责绘制与交互，计算按分级判据决定放前端还是走 `learning-viz`。

---

## 0. 文档地图与真源

| 文件 | 内容 | 什么时候读 |
|---|---|---|
| 本文 | 硬规则、分级判据、目录、命令 | 每次会话开始 |
| `DESIGN.md` | 架构设计理由、契约样例、数据结构、A1 切片验收 | 动 renderers / viz 注册表 / 契约之前 |
| `../AGENTS.md`（父仓） | 代号体系、符号规范、环境坑、红线 | 任何时候都要遵守 |
| `../dev-progress.md` | 进度唯一真源 | 判断某个模块是否已解锁 |
| `../learning-todo/ns-progress.md` | 数学线关卡与掌握度真源 | 读掌握度状态时 |

**真源约定（不可违反）**

| 事实 | 唯一真源 | 本仓怎么处理 |
|---|---|---|
| 笔记内容 | `../notebook/*.tex` | **只读**，构建时快照，产物入本仓 `dist/` |
| 知识图谱的边与探针 | `graph/<chapter>.yaml`（**本仓**，见 §3.4 / §10 Q1） | 本仓维护，随 `build/` 一起迭代 |
| 掌握度状态 | `../learning-todo/ns-progress.md` | **只读** + 生成待粘贴的 diff，不直接写 |
| 进度与 Gate | `../dev-progress.md` | 只读 |
| 构建产物 | `dist/` | 本仓生成，**gitignore** |

> 若某项真源缺失（如某个 `graph/*.yaml` 尚未建立），**明确标注「待核」并停下报告**，
> 不要另立第二份等效数据 —— 那是漂移的起点。

---

## 0.1 本次评审校正（2026-09-22，落地前实测）

> 本规约由另一个 session 起草，其中若干数字与前提是**按旧快照**写的。以下为实测校正，
> 正文相应处已就地修正并标 `[校正 Cn]`。

| # | 原文 | 实测 / 决定 | 影响 |
|---|---|---|---|
| C1 | §3.2「全笔记 36 节，概念节点预计 250+」 | **24 个内容 `.tex`**（A–R 16 篇 + `partN` + `de1–4` + `lie1–3`）、**202 个 `\subsection`**、**162 个 `\subsubsection`**、`main.pdf` **112 页** | 节点规模需按章节实测后再定，不要沿用「250+」这个数 |
| C2 | `A1.1.3` / `A1.1.4`（§2.1、§3.4、§4） | **不存在三级代号**，只到 `X#.k`。三大收敛定理 = **`A1.3`**；σ-代数 / 外测度 / Vitali 全在 **`A1.4`**（A1 的第 4 个小目「测度论基础」） | 节点主键与路由直接错位 |
| C3 | §9 R1「Python 3.14 缺 wheel」标 **高** | **实测解除**：`pypandoc-binary 1.17` 有 `py3-none-macosx_11_0_arm64.whl`（`py3-none` 纯标签，任意 3.x 可装）、`flask 3.1.3` = `py3-none-any`、`flask-caching 2.5.1` 需 `>=3.11` | 风险 **高 → 低**；**不要**为它改 `.python-version` |
| C4 | §7「在 `notebook/main.tex` 加**一行** `\providecommand`」 | 要加**两处**：`notebook/main.tex` 与 `notebook/diffrential/main.tex`（后者可独立编译） | 子文档编译会报 `Undefined control sequence` |
| C5 | §6「Python 一律走父仓的 uv 环境」 | 已实测成立：在 `learning-web/` 下 `uv run` 会**向上发现父仓项目**，用 `~/develop/learning/.venv`。因此 `uv add pypandoc-binary` 会把依赖写进**父仓** `pyproject.toml` + `uv.lock`，本仓**不建**自己的 `pyproject.toml` | 依赖提交要在**父仓**做；若将来想隔离，需在本仓加 `pyproject.toml`，届时本节要改 |
| C6 | §5「`vendored/` = KaTeX CSS + 字体」 | 若走客户端渲染，还必须有 **`katex.min.js`**；且**首屏会有一次 KaTeX 渲染**。要「无闪烁 + 可搜 TeX」，需在 `build_html.py` 里加一步**构建期预渲染** | 见 §7「公式渲染」新增条款；**注意 `pandoc --katex` 不是服务端渲染** |
| C7 | §9 R3 点名 `tabular` / `\boxed` / `\xrightarrow` | `A1` 段内实测 **3 张 `tabular`（均为 `L{}` 定宽列）+ 1 处 `\boxed`**；`\xrightarrow` **不在 A1**，集中在 `C_partial`(7)、`de4`(8) 与 `P`/`Q`/`lie1–3`(各 1) | 「逐一目视比对全章」要按章分摊到这些文件，别只在 A1 找 `\xrightarrow` |
| C8 | §10 Q1：语义边放父仓还是本仓 | **已决：本仓** `graph/<chapter>.yaml`（见 §3.4） | 原文「为什么放父仓」的论证整体反转，已重写 |
| C9 | §10 Q2：build 脚本放哪 | **已决：本仓 `build/`** | 与 D1「统一后端」有张力，已记入 §10 |

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

构建脚本必须记录 notebook 的 git 状态到 `dist/provenance.json`：

```json
{
  "notebook_repo": "/Users/apple/develop/learning",
  "notebook_commit": "<git rev-parse HEAD>",
  "notebook_dirty": false,
  "built_at": "2026-09-22T17:20:00+08:00",
  "files": ["A_analysis.tex", "..."],
  "pandoc_version": "3.x",
  "converter_version": 1
}
```

**「notebook 后续会固定住」由此变成可验证的事实**：
`notebook_dirty: true` 或 commit 变化 = 图谱可能与笔记不一致，需重建。

同一份 `notebook_commit` 也用于校验 `graph/*.yaml` 是否过期（§3.4）。

### 1.3 代号即主键

章节代号（`A1`、`H4`、`G1.1`）是节点主键与前端路由 ID。
父仓 `AGENTS.md` 第四节已警告 `§NN.N` 全局编号会因插入 `.tex` 而整体位移 ——
**代号不会**，因此一律用代号，禁止用编译后的全局编号。

`\subsubsection` 源码里无显式代号，由 filter 按出现顺序合成 `X#.k`
（印证：父仓 `AGENTS.md` 与 `graphics/plan.md` 已在用 `G1.1`）。

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

> 本节的两个「Q1/Q2」是**判据编号**，与 §10 的**未决问题编号**同名但无关 ——
> 引用时写「§2 判据 Q1」或「§10 问题 Q1」。

### 2.1 判据应用示例

| 演示 | Q1 | Q2 | Q3 | 结论 |
|---|---|---|---|---|
| `A1.3` 三大收敛定理反例 `[校正 C2]` | 无 | 弱（∫f_n ≡ 1 显然） | 无 | **前端** |
| `A1.4` 外测度方盒覆盖 `[校正 C2]` | 无 | 无 | 无 | **前端** |
| `B1.2` Rodrigues 公式 | **有** `core/rotate.hpp` | — | — | **后端** |
| `G1.2` RK4 vs Verlet 能量漂移 | **有**（`plan.md` 阶段 1） | **是** | **是** | **后端** |
| `H4` 重要性采样方差 | 无（暂无） | 弱 | 无 | **前端起步**，C++ 加采样器后迁移 |
| `I` 流体力学全部 | 部分有 | 是 | 是 | **后端** |

### 2.2 迁移不产生技术债

前端起步的模块，将来 C++ 实现了怎么办？**契约不变，只换数据源**：

```ts
const src = REGISTRY[module].source;   // 'frontend' | 'backend'
const data = src === 'frontend'
  ? await localCompute(module, params)          // 返回同一 schema
  : await fetch(`/api/viz/${module}?${qs}`);    // 返回同一 schema
```

因此**契约 schema 是分级机制的粘合剂**：前后端返回完全一致的 JSON，
切换只改注册表一个字段。这是允许「先前端后迁移」的前提。

### 2.3 前端计算的严谨性要求（Q4 的代价）

前端算的数值**没有 pytest 对拍**，必须显式补偿：

1. 每个前端计算模块内置 **invariant 自检**（如 `bump` 模式下 `∫f_n ≡ 1` 必须精确成立，
   偏差 > 1e-12 直接抛错，不要静默画错图）
2. 契约响应带 `"computedBy": "frontend"`，渲染时在角上标一枚
   `前端计算·未对拍` 徽标
3. 涉及数学结论的数值一律走后端 —— 见 §2 判据 Q2

> 依据父仓 `AGENTS.md` 硬规则：「不确定就明确标注『待核』，不要含糊过去。」
> 前端计算的不确定性必须**可见**，不能藏在图里。

---

## 3. 知识图谱：一份数据，两种呈现

`graph.json` 是唯一数据，同时喂两个消费方，**不得各写一份渲染逻辑**：

| 消费方 | 形态 | 用途 |
|---|---|---|
| `dist/graph/<chapter>.html` | **单文件 standalone**，数据内联 | 离线打开、发给别人、嵌进笔记、归档到 `learning-todo/` |
| web 外壳 `graph` 渲染器 | 运行时 fetch `dist/graph/<chapter>.json` | 与阅读面联动、掌握度实时重算 |

### 3.1 standalone HTML 的三条硬约束

`file://` 协议下浏览器限制严格，**三条全中会直接白屏**：

| 约束 | 原因 | 做法 |
|---|---|---|
| **不能 fetch 本地文件** | `file://` 跨源被拦 | 数据以 `<script type="application/json" id="graph-data">` **内联** |
| **不能用 ES module** | `type="module"` 在 `file://` 下受 CORS 限制 | 构建产物用 IIFE，不用 `import` |
| **不能用 CDN** | 断网即废；父仓要求产物本地化 | KaTeX / Mermaid / 图表库全部内联或 vendored |

> Vite 用 `build.lib` + inline 插件产出单文件；或构建时手写模板注入 JSON。
> **不要**指望「本地起个 server 就好了」—— standalone 的价值就在于双击即开。

### 3.2 规模与语义缩放

全笔记实测 **202 个 `\subsection`、162 个 `\subsubsection`** `[校正 C1]`，
概念节点数需按章节实测后再定（**不要沿用早先「36 节 / 250+ 节点」的估算**）。
无论如何，一次性全画必卡且不可读。三层策略：

| 层级 | 显示 | 触发 |
|---|---|---|
| 全局 | 只显示 A–R 字母块 + 进度色 | 默认 |
| 章节 | 展开该节的概念节点 + 四类边 | 点击字母块 / 指定 `--chapter` |
| 节点 | 探针、源文件行号、挂载的演示 | 点击节点 |

**生成命令按章节切分**：`build.py --chapter A1`，不默认全量。

### 3.3 四种边不可合并

| 边类型 | 语义 | 是否允许成环 | 用途 |
|---|---|---|---|
| `prereq` | 学习顺序 | **必须无环**（否则算不出 frontier） | 「今天该学什么」 |
| `tension` | 反例 / 约束冲突 | **允许且常见** | 闭环视图 |
| `dual` | 对偶路径（自顶向下 ↔ 自底向上） | 允许 | 闭环视图 |
| `applies` | 下游应用 | 允许 | 反向链接 |

`prereq` 与其余三类混在一张有向图里，拓扑排序与 frontier 计算即失效。
渲染时用颜色 + 线型区分，可分别开关。

### 3.4 图谱数据的真源在**本仓**（Q1 已决，2026-09-22）

`prereq` 可半自动抽取（从 `.tex` 的 `\ref` 与代号提及），
但 `tension` / `dual` / `applies` 是**语义边，只能人工标注**，`.tex` 里没有。

**决定**：落在**本仓** `graph/<chapter>.yaml`，与 `build/` 同仓迭代：

```yaml
# graph/A1.yaml
chapter: A1
notebook_commit: 66ce26a        # 建这份 yaml 时 ../notebook 的 HEAD；§1.2 用于校验是否过期
nodes:
  - id: sigma-alg
    code: A1.4                  # 只到两级（A1 的第 4 个小目「测度论基础」）
    title: σ-代数
    question: 为什么不能对 R 的所有子集都定义「长度」？
    difficulty: green           # 沿用 ns-progress 的 green/yellow/red
    probes:
      - level: 1
        text: 写出三条性质
      - level: 3
        text: 若对任意并封闭会退化为什么
        viz: sigma-alg-degenerate
edges:
  - { from: four-constraints, to: sigma-alg, kind: prereq }
  - { from: vitali, to: sigma-alg, kind: tension }
  - { from: caratheodory-sigma, to: sigma-alg, kind: dual }
```

**为什么放本仓（与上一版方案的取舍）**

| 方案 | 好处 | 代价 |
|---|---|---|
| 父仓 `../notebook/graph/` | 与笔记同步演化，天然不漂移 | 改图谱要跨仓提交；`notebook/` 会混入「构建元数据」 |
| **本仓 `graph/`（已选）** | 与 `build/` 同仓迭代，改起来顺手 | **`.tex` 改了、本仓可能忘了改** |

**接受的缓解措施（必须做，否则这个代价会变成事故）**

1. 每份 `graph/<chapter>.yaml` 头部记 `notebook_commit`；
2. `build_graph.py` 把该值与 `dist/provenance.json` 的 `notebook_commit` 比对，
   不一致即**告警并拒绝静默通过**（提示「语义边可能过期，请复核」）；
3. 该 yaml 覆盖的章节代号若在 `.tex` 里消失/改名，构建直接失败，不降级。

---

## 4. 节点数据结构

```ts
interface ConceptNode {
  id: string;                    // 'sigma-alg'
  code: string;                  // 'A1.4'  ← filter 从 .tex 抽取（两级，见 §1.3）
  src: { file: string; line: number };   // 反查真源
  title: string;
  question: string;              // 「在解决什么」—— 必填，不可留空
  difficulty: 'green'|'yellow'|'red';   // 内容难度，来自 ns-progress
  mastery: 0|1|2|3|4|5;          // 掌握度，与难度**正交**
  edges: {
    prereq: string[]; tension: string[];
    dual: string[]; applies: string[];
  };
  probes: Probe[];
  viz?: { module: string; source: 'frontend'|'backend'; version: number };
}

interface Probe {
  level: 1|2|3|4|5;
  text: string;                  // 可操作的检验问句
  viz?: string;                  // 关联的演示模块
  status: 'todo'|'done';
}
```

### 4.1 掌握度分级（可操作判据）

`difficulty` 是**内容有多难**，`mastery` 是**你学到哪一级**，两者正交，UI 必须同时编码。

| 级 | 判据 | 检验方式 |
|---|---|---|
| **L0** | 未接触，名词不认识 | — |
| **L1** | 能复述定义 | 填空 |
| **L2** | 能说动机（为什么是这三条） | 口述 |
| **L3** | **能给反例 / 指出约束为何不能更强或更弱** | 交互演示 |
| **L4** | 能证明 | 手写 |
| **L5** | 能连接下游（这块支撑了什么） | 说出依赖它的结论 |

**L3 是分水岭**：反例是主动构造的知识，不是被动接收的，也是前端唯一能大幅超越 PDF 的地方。

> **产品取向由此确定**：以「反例 / 失效演示」为一等公民，不以「定义 / 定理」为一等公民。
> 这是与 Obsidian / Notion / mdBook 的根本分野 —— 它们假设内容是静态文本，
> 而本仓内容里最值钱的部分是「这个约束为什么不能更强 / 更弱」。

### 4.2 frontier 计算

```
frontier = { n | n.mastery < 3 且 n 的所有 prereq 满足 mastery >= 3 }
下一步   = frontier 按拓扑序取第一个
```

「今天该学什么」是**算出来的**，不是写死的 —— 这样它永远不会与掌握度状态脱节。

### 4.3 probes 的三级数据来源

节点数量大（见 §3.2），手写探针不现实。按此顺序取：

| 来源 | 覆盖 | 成本 |
|---|---|---|
| **会话日志抽取**：`ns-progress.md` 的检验题 + `chats/*.ipynb` | 已学章节的 L2–L3 探针，**自带 ⏳/✅ 状态** | 一次性脚本 |
| **`.tex` 的 `\textbf{}` 关键句** | 自动生成 L1「能复述吗」探针 | filter 顺手做 |
| **人工** | red 难度节点的 L4 证明探针 | 只写少数高价值节点 |

> `ns-progress.md` 里已有现成例子：
> `⏳ 检验题已出待答：DCT 的盖子分别用什么机制封死…` / `✅ DCT 盖子检验题结清：…`
> —— 这就是带状态的 L3 probe，直接可解析。

### 4.4 掌握度写回

本仓**只读** `ns-progress.md`。用户在前端改掌握度后：

1. 生成一段符合该文件日志格式的 markdown（日期 | 话题 | 覆盖 | 检验结果）
2. 展示给用户 review
3. 由用户粘贴提交

**不直接写文件** —— 该文件是 append-only 真源，且属独立子仓（父仓红线：三子仓改动只能在各自仓内提交）。

---

## 5. 目录

```
learning-web/
  AGENTS.md              # 本文
  DESIGN.md              # 架构设计理由、契约样例
  build/                 # 【Q2 已决】转换脚本全部在本仓，不经 Flask
    read_notebook.py     # 解析 §1.1 路径、读 .tex、写 provenance.json
    filter_codename.py   # 抽代号、合成子编号、建反向链接、转 vizslot
    build_graph.py       # graph/<chapter>.yaml + .tex → dist/graph/<chapter>.json
    build_html.py        # → dist/graph/<chapter>.html（standalone，见 §3.1）
    vendored/            # KaTeX JS + CSS + 字体（离线，禁 CDN；见 §7 公式渲染）
  graph/                 # 【Q1 已决】图谱语义边的真源（本仓）
    A1.yaml
  src/
    shell/               # 三栏布局 · 导航 · 路由 · 主题
    renderers/           # doc.ts（KaTeX 正文）· graph.ts · plot2d.ts
    viz/                 # 演示模块，按 §2 判据分 frontend/backend
    modules/             # registry: module → { source, endpoint, version, renderer }
    types.ts             # §4 的接口定义
  dist/                  # 构建产物，gitignore，可完全重建
  vite.config.ts         # dev proxy /api → learning-viz Flask:5000（仅计算模块）
```

> `build/` 与 `src/` 是**两套互不依赖的产物**：`build/` 出静态文件（Python），
> `src/` 出 web 外壳（Vite）。`build/` 的产物**不经 Flask**（§10 Q2）。

---

## 6. 命令

```bash
# 构建单章（默认不全量，见 §3.2）
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

> `[校正 C5]` 实测：本仓在父仓目录树内，`uv run` 会**向上发现父仓项目**并使用
> `~/develop/learning/.venv`。所以 **`uv add` 会把依赖写进父仓 `pyproject.toml` + `uv.lock`**，
> 本仓**不建**自己的 `pyproject.toml`；提交依赖时要在**父仓**提交。

---

## 7. 硬规则

### 内容

- **`notebook/*.tex` 只读。** 本仓任何脚本不得写入父仓笔记。
  唯一例外：需要 `\vizslot` 时在 `notebook/main.tex` **和** `notebook/diffrential/main.tex`
  的导言区各加一行 `\providecommand` 兜底 `[校正 C4]`
  （否则 `latexmk` 报未定义命令），且改完必须重编译**两个**文档验证 PDF 不破。
- **禁止用编译后的全局编号 `§NN.N`** 做路由或引用，一律用代号（父仓 `AGENTS.md` 第四节）。
- **代号只到两级 `X#.k`** `[校正 C2]`。见到 `A1.1.3` 这类三级写法即视为错误。
- `question` 字段（「在解决什么」）**必填**。留空的概念节点没有产品价值，宁可不建。

### 公式渲染 `[校正 C6]`

- **`pandoc --katex` / `--math-method=katex` 不是服务端渲染。**
  它只把 TeX 留在 HTML 里（`\(...\)` / `\[...\]`），并插入指向 KaTeX 库的
  `<script>`/`<link>` —— **不给 URL 时指向 CDN，直接违反本节的禁 CDN 条款**。
  → 生成 HTML 片段时**不要加 `-s`**，KaTeX 的 `katex.min.js` / `katex.min.css` / 字体
  一律由 `build/vendored/` 提供，或由前端打包进产物。
- **首屏会闪一次**：客户端渲染意味着公式在一次 JS 执行后才排版。
  若要「无闪烁 + 可搜 TeX」，在 `build_html.py` 里加一步**构建期预渲染**：
  用 Node 跑 `katex.renderToString(tex, {output:'htmlAndMathml', throwOnError:false})`
  把 `\(...\)`/`\[...\]` 替换成静态 HTML ——**产物自带 `<annotation encoding="application/x-tex">`**，
  搜索索引可直接提取原始 TeX（如搜 `\sigma`-代数），且不需要 `katex.min.js` 运行时。
- 走预渲染即同时满足 §3.1 的三条约束（内联 / 无 module / 无 CDN）。

### 计算

- **§2 四问判据不可跳过。** 决定前端还是后端前必须逐条回答，并把结论写进 `DESIGN.md` 的决策记录。
- **不得在 JS 里重复实现父仓已有的算法**（§2 判据 Q1）。发现重复即改为走后端。
- 前端计算模块**必须有 invariant 自检**，且响应标 `computedBy`（§2.3）。
- 契约必须**批量返回**：拖滑块不得一帧一请求。
  `GET /api/viz/<module>?<params>&n_min=1&n_max=40` 一次取全，前端本地 scrub。
  依据父仓 `README.md`「产完整结果（轨道、DAG）」。

### 前端

- **禁 CDN。** KaTeX / Mermaid / 图表库全部内联或 vendored，产物必须断网可用。
- standalone HTML 遵守 §3.1 三条约束（内联数据 / IIFE / 无 CDN）。
- **不引入 UI 框架**（React/Vue）。决策 D2：Vite + Vanilla TS，
  理由是单人维护 + 需要 HMR 调 Canvas/WebGL，框架是额外心智负担。
- 渲染器**只绘制不计算**（§2.2 的粘合前提）。

### 符号书写

遵守父仓 `AGENTS.md` 第五节。本文属工程文档：

- 上标一律 `^`：写 `A^T`、`L^p`、`|ψ|^2`、`n^2`、`O(n^2)`、`h^4`
  **不写** `Aᵀ`、`Lᵖ`、`|ψ|²`、`n²`；`1/2` 不写 `½`
- 其他数学字符（`∫ Σ ∇ Λ Φ θ ω μ π δ ε ∞ ≈ ≤ ≥ ⟨⟩ ‖·‖ · −`）保持现状
- **给 agent / 终端读的用 ASCII，给浏览器渲染的用 KaTeX**，同一文件不混用

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

## 9. 风险与待核

| # | 项 | 等级 | 处置 |
|---|---|---|---|
| R1 | Python 3.14 下 flask / pypandoc-binary 是否有 wheel | **低**（原标「高」，`[校正 C3]` 实测解除） | 无需处置。仍**不改 `.python-version`、不用系统 python** |
| R2 | `pypandoc-binary` 自带 pandoc 版本与 filter 接口是否匹配 | 中 | 退路 `brew install pandoc` + `pypandoc`；**只装一个**。本机 `pandoc` 未装，`pypandoc-binary` 自带可执行文件 |
| R3 | KaTeX / pandoc 对 `tabular`（`L{}` 列）、`\boxed{}`、`\xrightarrow` 的保真度 | **高** | 三类结构分布见 `[校正 C7]`：A1 段内 3 张 `tabular` + 1 处 `\boxed`；`\xrightarrow` 在 `C`(7)、`de4`(8)、`P`/`Q`/`lie1–3`。转换后**逐文件目视比对**，不可只抽查一个公式 |
| R4 | 合成的 `X#.k` 子编号漂移 | 低 | §1.3 对策：稳定锚点显式写代号，filter 优先采信 |
| R5 | 语义边真源放本仓 → `.tex` 与本仓 `graph/*.yaml` 脱节 | 中（原为「高/需先决」） | **已决且已给缓解** `[校正 C8]`：yaml 记 `notebook_commit`，构建时比对 `provenance.json`，不一致告警不静默；章节代号消失即构建失败（§3.4） |
| R6 | 大节点量全图渲染性能 | 中 | §3.2 语义缩放 + 按章节切分，不默认全量 |
| R7 | `dist/` 与 `.tex` 漂移 | 中 | `provenance.json` 记 commit hash；`notebook_dirty: true` 即需重建 |

---

## 10. 决策与未决问题

**已决（2026-09-22）**

| # | 问题 | 决定 | 理由 / 代价 |
|---|---|---|---|
| **Q1** | 图谱语义边放 `../notebook/graph/*.yaml` 还是本仓？ | **本仓 `graph/<chapter>.yaml`** | 与 `build/` 同仓迭代、改动无需跨仓；代价是可能与 `.tex` 脱节 —— 缓解见 §3.4（`notebook_commit` 校验） |
| **Q2** | build 脚本放本仓 `build/` 还是 `learning-viz/python/notes_pipeline/`？ | **本仓 `build/`** | standalone HTML 是纯静态产物，本就不经 Flask，放本仓不必为它拉起后端；代价是 D1「统一后端」的口径要收窄为「**计算模块**走 `learning-viz`」 |

> **Q2 的连带口径**（重要，避免以后互相引用时打结）：
> `learning-viz` 的职责收窄为**计算模块的后端**（Flask `/api/viz/*` + 本地渲染）；
> **笔记的转换链路整体归 `learning-web/build/`**，不再有 `/api/notes/*`。
> 参见 `learning-viz/README.md`。

**未决（开工前可不再阻塞）**

| # | 问题 | 倾向 | 代价对比 |
|---|---|---|---|
| Q3 | 搜索是否上索引库（lunr / minisearch）？ | 起步用朴素子串匹配 | 202 节规模下够用；上索引库是过早优化 |
| Q4 | 掌握度是否引入间隔重复（Anki 式调度）？ | **暂不** | probes 已有 `status`，调度算法是另一套复杂度；先验证探针本身有效 |
| Q5 | 是否需要 dark mode？ | 用 CSS 变量，跟随系统 | 成本低，且 graph 配色需两套 |

---

## 11. 与 DESIGN.md 的分工

本文放**规约**（agent 每次都要遵守的硬规则、判据、红线）。
`DESIGN.md` 放**设计**（为什么这么分、契约样例全文、数据流图、A1 垂直切片的五步验收）。

若本文膨胀超过 ~15 KB，把 §4 数据结构与契约样例挪去 `DESIGN.md`，本文只留指针。

> 现状：本文已接近该阈值（含 §0.1 校正表）。若下次还要往里加规则，先按上面这句做拆分。

---

## 12. 开工顺序

```
0. [已决] §10 Q1 → 本仓 graph/；Q2 → 本仓 build/。无阻塞，可直接开工
1. uv add --dev pypandoc-binary     # 落在父仓 pyproject.toml（§6 校正 C5）
2. build/read_notebook.py + provenance.json
3. build/filter_codename.py（正则用 [A-R]）→ 转 A1 → 目视比对 R3 三类结构
4. 手写 graph/A1.yaml（A1 共 5 个小目：A1.1 黎曼→A1.5 L^p；含 tension/dual 语义边）
5. build/build_graph.py → dist/graph/A1.json
6. build/build_html.py → dist/graph/A1.html，双击打开验证 §3.1 三条约束
7. 此后才动 src/（shell → renderers → viz 注册表）
```

**每步完成后停下报告，不要连续执行。**
步骤 6 的产物是一个可独立打开的单文件 HTML —— 那是第一个能拿给人看的东西，
在此之前不要碰 Vite 工程。
