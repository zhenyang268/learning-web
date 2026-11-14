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
| `DESIGN.md` | 决策记录、数据流、数据结构、契约样例、规模策略、风险明细、A1 切片验收 | 动 renderers / viz 注册表 / 契约之前 |
| `src/content/content-map.json` + `docs/content-map.md` | **整站内容总图**：站点 / 组 / 线 / 章 / 数值库映射（事实在 json，理由在 md） | 加站、加章、加线、改数值库映射之前 |
| `build/archive/README.md` | **内容生成线的归档说明**：这条线已跑完（318/318），代码留档不再维护；同时列出「仍然在用的」 | 想改内容、或好奇 json 怎么来的 |
| `build/archive/TASKBOOK.md` | 生成线施工任务书 v1.4（三 pass 流程、批次、P 篇特化）—— **历史档案** | 只在考据生成流程时读 |
| `build/archive/orchestrate/` | 生成线总控：`pipeline.zsh`（D16/D17）、批次定义、交接文档（`HANDOFF-json.md` 是当时的进度真源） | 同上，历史档案 |
| `../AGENTS.md`（父仓） | 代号体系、符号规范、环境坑、红线 | 任何时候都要遵守 |
| `../dev-progress.md` | 进度唯一真源 | 判断某个模块是否已解锁 |
| `../learning-todo/ns-progress.md` | 数学线关卡与掌握度真源 | 读掌握度状态时 |

**真源约定（不可违反）**

| 事实 | 唯一真源 | 本仓怎么处理 |
|---|---|---|
| 词条正文 | `../notebook/*.tex`（**源**） | 每轮生成到 `json/`；**改内容改 tex**，再重新生成（D26） |
| 原始笔记 | `../notebook/*.tex` | **源**：`json/` 由它生成；运行时不读，回原文核对走 `⌾ 溯源` 的文件:行区间 |
| 知识图谱的边与探针 | `graph/<chapter>.yaml`（**本仓**，见 §3.1） | 本仓维护 |
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

### 1.1 与笔记仓的关系：源 → 产物

**`json/` 是 `notebook/*.tex` 的构建产物**：每轮重新生成并覆盖，**改内容改 `.tex`，不改 `json/`**。
运行时不读任何 `.tex`：`src/` 里对笔记的引用只剩三处**悬停线索**（页头 `⌾ 溯源`、右栏 `⌾ 溯源`、
词条会标的 `⌾`），数据来自 `src.file` / `tex_ref` / `notebook_commit` 三个字段，删掉它们页面照样工作。

要回原文核对时，按下列顺序解析，找到即停：

```
1. $LEARNING_NOTEBOOK      环境变量（优先，CI / worktree 场景）
2. ../math-notebook        相对本仓父目录（常规开发场景）
3. 解析失败 → 立即报错退出，不要静默 fallback 到任何默认路径
```

> **路径漂移校正（2026-10-30）**：本文早期版本写的是 `../notebook`，
> 父仓实际目录名是 **`math-notebook/`**（父仓 `README.md` 专门点过这条）。
> 词条里的 `tex_ref.file` 前缀是 `notebook/`（历史产物口径）——
> 磁盘目录叫 `math-notebook`，引用前缀叫 `notebook/`，两者不是一回事。

> **不再同步（DESIGN D26）**：代号不回写 `.tex`。`docs/codes-map-*.md` 已降级为
> **一次性迁移档案**。`tex_ref` 的行区间校验依赖 `build/state/slices.json`，
> 而它是生成线派生物、**不入库**；且其代号仍是重排前的旧表 ——
> `verify_kb.py` 会显式打印「已跳过区间校验」，不要把它当成通过。

### 1.2 构建时快照 + 溯源

构建脚本**必须**把 notebook 的 git 状态写进 `dist/provenance.json`
（字段与样例见 `DESIGN.md` §3）—— 它把「notebook 后续会固定住」变成**可验证的事实**：
`notebook_dirty: true` 或 commit 变化 = 图谱可能与笔记不一致，需重建；
同一份 `notebook_commit` 还用于校验 `graph/*.yaml` 是否过期（§3.1）。

### 1.3 代号即主键（2026-10-30 重排，三级可 Derive）

**代号格式：`<域 2 字母><章 2 位>.<单元序>`**，例 `AN03.2` = 分析域 · 第 3 章 · 第 2 单元。

| 层级 | 从代号怎么取 | 上限 |
|---|---|---|
| 域 | 前 2 字母（`AN`/`AG`/`PR`/`EQ`/`PH`/`NM`/`CG`/`TL`/`MP`） | 9 个 |
| 章 | 前 4 字符（`AN03`） | 132 个 |
| 单元 | 全串（`AN03.2`） | 318 个 |

- **导航层级是「组 → 线 → 章 → 单元」**（2026-11-14 加线）：线只做分组与排序、**不进代号**，
  所以加线不迁移任何代号；线表在 `src/content/content-map.json`，理由见 `docs/content-map.md`。
- **唯一真源**：章清单与线在 `src/content/content-map.json`（`taxonomy.ts` 的 `LINES` 由它导入）；
  `DOMAINS.legacyChapters` 是**旧章名遗留**，只给 `tools/remap-codes.mjs` 用，**不许写现代号**。
  加章只改这里，然后跑 `node tools/remap-codes.mjs`（默认干跑，`--apply` 才写）。
- **学习顺序也由它定义**：派生依赖（`links` → `prereq`）按 `cmpCode` 判先后，
  不用字符串序 —— 字符串序把 `CG` 排在 `EQ` 前、`MP` 排在 `NM` 前，会直接造出**环**
  （2026-10-30 实测：PH 系 37 个单元成环，拓扑序只覆盖 281/318）。
- **旧代号 → 新代号**：`docs/codes-map-2026-10-30.md`（人读，拿去反馈给 `.tex`）与
  `docs/codes-map-2026-10-30.json`（机器读）。掌握度的旧键由 `src/modules/legacy-codes.ts`
  在启动时一次性迁移，**不迁就等于清空用户的进度**。
- **禁止**：在新内容里写旧代号（`A1.3`/`P3.1`/`lie2.7`）；写三级以上（`AN03.2.1` 不存在）。
- 旧规则（`X#.k` 两级、由 `.tex` 的 `\subsubsection` 合成）只用于**迁移前**的历史产物，
  不再作为新增内容的规则。

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
  index.html             # 数学站入口（多页应用之一）
  cs408.html             # 408 子站入口（共用外壳，数据根独立）
  cs408/                 # 408 的数据根（与数学的 json/ + graph/ 完全分开）
    json/<章>/<code>.json
    graph/<章>.yaml
  kaoyan/json/           # 数一考研数据根（408 之外的另一门，主键前缀不同）
  projects/json/         # 工程线数据根（两件套：OUTLINE + NOTES）
  build/
    verify_kb.py         # **仍在用**：内容校验器（npm run audit:content 调它，只读模式）
    verify_docs.py       # doc-card/v1 四类校验（npm run verify:docs）
    importer/            # notebook → json 的搬运线（npm run import:docs；规则见其 README）
    vendored/            # KaTeX JS + CSS + 字体（离线，禁 CDN；见 §7 公式渲染）
    logs/ state/ slices/ # 报告与生成线派生物（.gitignore 忽略）
    archive/             # **内容生成线归档**（318/318 完工，不再维护）
      README.md          #   归档说明 + 「仍然在用的有哪些」
      slice_notebook.py  #   按 .tex 切片（源，D26）
      make_prefix.py inject_meta.py
      orchestrate/       #   pipeline.zsh（D16/D17）、批次定义、交接文档
      prompts/ TASKBOOK.md
  graph/                 # 【Q1 已决】图谱语义边的真源（本仓）
    <chapter>.yaml
  json/                  # 学习词条占位库（阶段一：只记关键词，DESIGN.md §16）
    <chapter>/
      <code>.json        # 一个小目一个文件，如 A1/A1.3.json
  example/               # 多模型流水线演示样例（2026-09-24 起，lie 交互导读）
    lie/                 # 唯一实例：说明与生成链见 example/lie/README.md，不入正式流水线
  src/
    app.ts               # 应用主体（storage 与渲染全在这里）
    main.ts              # 数学入口（3 行：boot(MATH)）
    main-cs408.ts        # 408 入口（3 行：boot(CS408)）
    subjects.ts          # 学科配置表：数据根 / 语义边根 / 总纲 / 切入点 / 互链（唯一真源）
    shell/               # 三栏布局 · 导航 · 路由 · 主题
      sidebar.ts         # 三层目录（域 → 章 → 单元），单元懒渲染
    renderers/           # card.ts · markdown.ts（KaTeX + LRU）· graph.ts
    viz/                 # 演示模块，按 §2 判据分 frontend/backend
      registry.ts        # 浏览器侧：模块名 → 动态 import（按需取 chunk）
      specs-all.ts       # 静态汇总，**只给 Node 工具**，浏览器入口禁止 import
    modules/
      taxonomy.ts        # **代号与分层唯一真源**（组 → 线 → 章 → 学习顺序 → cmpCode）
      legacy-codes.ts    # 旧代号 → 新代号（只服务掌握度迁移，不再增长）
      loader.ts · kb-index.ts（多学科参数化）· graph.ts · graph-model.ts · state.ts · attr.ts
    content/
      content-map.json   # **整站内容总图唯一真源**（站点 / 组 / 线 / 章 / 数值库映射 / 修正项）
      syllabus.ts        # 总纲（数学大观：四条主轴 / 两个出口 / 交叉点 / 切入点 / 路线）
      angles.ts          # 切入点（原「现代分析学总纲」，一条具体路线，`#angles` 路由）
      syllabus-cs408.ts # 408 总纲占位
    types.ts             # ConceptNode 等接口（§4，定义见 DESIGN.md §8）
docs/
    codes-map-2026-10-30.md   # 旧 → 新代号对照表（反馈给 .tex 用）
    codes-map-2026-10-30.json # 同上，机器读
  dist/                  # 构建产物，gitignore，可完全重建
  vite.config.ts         # dev proxy /api → learning-viz Flask:5000（仅计算模块）
```

> `build/` 与 `src/` 是**两套互不依赖的产物**：`build/` 出静态文件（Python），
> `src/` 出 web 外壳（Vite）。`build/` 的产物**不经 Flask**（§10 问题 Q2）。
>
> 2026-10-31 起 `build/` 只剩 `verify_kb.py` 一个活脚本，其余全部归档到
> `build/archive/`：内容线 318/318 已完工，且本站已与 `.tex` 解耦（D26），
> 那条链路的输入端不再需要。

---

## 6. 命令

```bash
# 日常开发（本站是纯前端：改 json/ 秒级可见）
npm run dev                 # Vite，proxy /api → :5000
npm run check               # 类型 + content-map + graph + sem-sync + viz + 全量 DOM 断言（318 单元）
npm run check:content-map   # 内容总图闸门：章覆盖 / 组归属 / survey 编号全集 / 落点 / 站点唯一
npm run import:docs         # notebook → json（408 / 数一 / 工程线 / 数值库），重跑幂等
npm run verify:docs         # doc-card/v1 四类校验：结构 / 覆盖 / 源一致性 / 无损
npm run check:cs408         # 408 子站复用同一套闸门（--subject cs408）
npm run audit               # 前端全量体检（只读，产出 build/logs/health-frontend-*.md）
npm run audit:content       # 内容体检（verify_kb --dry-run，不回填）
npm run build               # tsc → vite（多入口）→ 字体瘦身 → standalone 快照

# 改代号（先干跑核对，再 --apply；会重排 json/ 与 graph/）
node tools/remap-codes.mjs
node tools/remap-codes.mjs --apply
```

> **内容生成线已归档**（`build/archive/`，318/318 完工，不再维护）。
> 早前文档里的 `build/build_html.py` / `build/build_graph.py` 早就不存在了，
> 别照着敲 —— 现在改内容就是直接改 `json/`，然后跑 `npm run audit:content`。

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
- **`dist/` 有两种形态，不要混**（2026-10-30 定，方案 A）：
  **每个学科一份单文件**（普通 `<script>` + gzip 数据 + base64 字体），双击即开：
  `knowledge.html`（数学）/`knowledge-cs408.html` /`knowledge-math1.html` /`knowledge-projects.html`，
  外加 `knowledge-index.html` 索引页（纯链接，file:// 也能开）；
  `dist/index.html` / `cs408.html` 是**开发形态**（`type="module"` + 运行时 `fetch json/`）⇒ **必须 HTTP**。
  报告「双击白屏」时先确认打开的是哪个文件 —— 开发形态双击必然白屏，不是产物损坏。
  `json/` 是**只读数据集**（由 `.tex` 生成的产物，`index.json` 是物化索引），
  **不是可从 tex 重建的中间态**，不得以「产物有了」为由删除。
- **不引入 UI 框架**（React/Vue）。决策 D2：Vite + Vanilla TS，
  理由是单人维护 + 需要 HMR 调 Canvas/WebGL，框架是额外心智负担。
- 渲染器**只绘制不计算**（§2.1 的粘合前提）。

### 双学科（D18）

- **学科差异只允许出现在 `src/subjects.ts`**。渲染器 / viz / markdown / state
  **一律不许出现 `if (subject === ...)`** —— 一旦按学科分叉，两边的 bug 会各自演化。
- 数据根、语义边根、总纲、互链都从学科配置取；`dataRoot` 形参一律**带默认值**
  （`buildIndex(jsonDir, graphDir, relPrefix = 'json/')`），数学侧老调用方零改动。
- 两站**互不加载对方数据**：`cs408.html` 只 fetch `cs408/json/*`，
  数学站首屏的请求数不因 408 新增而增加（`--subject` 参数化闸门即为此而设）。

### 分层与代号（D22）

- **代号、域、学习顺序只有一个来源**：`src/modules/taxonomy.ts`。
  不许在别处硬编码「哪个章属于哪个域」或「谁先学」。
- 侧栏是**三层**（域 → 章 → 单元），单元节点**懒渲染**（章展开时才插）。
  不许退回「318 个单元一次性平铺」——那是内存与可读性同时崩的做法。
- 改章序 / 加章：改 `DOMAINS` → `node tools/remap-codes.mjs`（先干跑核对）→
  `--apply` → 重跑 `npm run check` + `npm run audit`。**迁移后必须重生成对照表**，
  否则 `.tex` 与本仓会各说各话。
- 总纲与切入点**不许合并**：`#graph` 讲全局（大观图），`#angles` 讲一条路（切入线）。

### 性能（D19–D21）

- **不许把静态 specs 拉回主包**：浏览器入口**禁止** import `viz/specs-all.ts`
  （那是 Node 工具专用）。改 viz 注册表后必须跑 `npm run check:viz`。
- 阅读区重渲染必须走 `beginRender()`（递增 `renderToken` + 回收 viz 句柄 + 置 `data-ready=0`）；
  自己写 `elReader.innerHTML = ...` 而不调它，等于放弃取消与句柄回收。
- 公式缓存**有界**（`MATH_CACHE_MAX = 4000`），不要再加无上限的 Map。
- 掌握度变动**只准走 `refreshMasteryLight()`**（一行 + 一个字母块 + 横幅），
  不许退回 `refreshChrome()` 那种整树重建 —— 判据见 `dom-harness` 的 MutationObserver 断言。

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
