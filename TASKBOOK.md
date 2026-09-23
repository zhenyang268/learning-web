# learning-web 知识库 + 前端 · 实施任务书 v1.1（2026-09-24）

> **v1.1 变更**（相对 v1）：新增 §12「P 篇（计算必修）特化」；§7 批次把 P 提前到批1；
> §9 新增 D14；§10 验收与 §11 分工同步增补。其余为 v1 原文。
>
> **性质**：本文是**施工任务书**（给子 agent 的自包含规格，子 agent 只需要「本文 + 它负责的切片」）。
> 决策真源仍是 `DESIGN.md`；动工前先把 §9 的 D9–D14 落笔进 `DESIGN.md`（本仓规矩：先改文档再动代码）。
> 流水线全部完工后本文归档，决策沉淀进 `DESIGN.md`。

---

## 0. 一句话

把 `notebook/*.tex`（只读真源）**自动**转成完善的 JSON 知识库（`learning-web/json/<chapter>/<code>.json`），前端以「四问骨架」渲染该知识库，替代 112 页 PDF 阅读。**不改写 notebook 一个字。**

## 1. 动机与产品形态

用户自学数学，每学一个定理例行问四件事：**代表什么 / 有什么反例 / 依赖什么 / 用在哪里**。现在每个问题都要开新 session 重复问，太慢。

解法：四问 → 生成模板。pipeline 逐小目（`\subsubsection`）自动回答四问写进 JSON；前端按同一骨架渲染，点一下就地展开答案，不开新 session。

JSON 知识库是 notebook 的 **max 版本**：包含笔记全部内容 + 四问预答 + 可交互反例。

## 2. 红线（任何子 agent 违反即返工）

1. `notebook/*.tex` **只读**。生成的 JSON 定位 = **可重建的构建产物**（同 `dist/`），真源永远是 notebook。
2. 章节代号即主键，**只到两级** `X#.k`（`A1.3` 合法、`A1.3.2` 非法）；**禁用**编译后全局编号 `§NN.N`。
   代号前缀必须与 `\subsection` 所属文件一致：`G*.tex` 的 `G1–G5` = 数值方法；
   **计算必修九组一律记 `P1–P9`**（历史上记 `G1–G9`，已因撞名废弃，见 `P_computation.tex` 代号说明）。
3. 反例**必须给具体函数**（`f_n = −1_[n,∞)`），禁止写"存在反例"了事。
4. 词条里**任何数值必须 `uv run python` 核验过**再写，模型报的数不直接采信。写错保留【纠错记录】，不悄悄改。
5. `learning-web` / `learning-todo` / `learning-viz` 是独立 git 仓，改动在各仓内提交；**未经明确要求不 git push**。
6. Python 一律 `uv run` / `uv add`（依赖落**父仓** `pyproject.toml`）；禁系统 python3、禁裸 pip。
7. 前端：**禁 CDN**、断网可用、不引入 React/Vue（Vite + Vanilla TS，决策 D2）。
8. 计算分级**四问判据**（决定 viz 走前端还是后端，依次判断，首个"是"即停）：
   Q1 父仓已有可信实现？→ 后端 ｜ Q2 数值正确性需 pytest 对拍？→ 后端 ｜ Q3 长时程/迭代/稳定性？→ 后端 ｜ Q4 纯函数图像/几何演示？→ 前端。

## 3. 数据契约（entry-card/v2，在 v1 上的修订）

活样例：`learning-web/json/A1/A1.3.json`（39 词条），**新文件照它的结构写**。

文件级字段：`schema / code / chapter / title / src{file, line_start, line_end, anchor} / notebook_commit / updated / entries[]`

词条字段（在 v1 基础上的改动标 ★）：

| 字段 | 说明 |
|---|---|
| `id` | `<code>:<subject>.<slot>`，如 `A1.3:mct.quantifiers` |
| `type` | `statement / proof / intuition / extension / counterexample / comparison / application / viz` ★ 新增 `probe`（检验题） |
| `title / subject / seed / keywords / fill_hint / links` | 同 v1。`links` 只用两级代号；`seed` 保真用户原话 |
| `tex_ref` | ★ 改区间：`{file, line_start, line_end}` |
| `content` | ★ 完整正文，公式用 **KaTeX**（行内 `$…$`、行间 `$$…$$`）——前端渲染所需，本条为新增决策 |
| `generated_by` | ★ 新增：`{model, date, reviewed: false}`，多模型溯源 + 定向重审用 |
| `viz` | ★ 三档状态机（见 §3.1） |
| `status` | `seed → drafted → reviewed → published` |

### 3.1 viz 槽三档（反例与直觉词条共用）

| 档 | 条件 | 写法 |
|---|---|---|
| 0 无 viz | 价值在计算本身，画图无增量 | 不写 `viz` 字段 |
| 1 前端直渲 | 判据 Q4：简单显式函数 | `viz: {module, version, source: "frontend", params_hint}` |
| 2 留空待接 | 判据 Q1–Q3 命中 | `viz: {status: "planned-backend", rationale: "四问判据的答案", params_hint}` —— **现在不写契约字段**，前端渲染"演示待接入·走 viz 层"占位徽标 |

★ **直觉词条也可挂 viz**（本次新增）：物理图像适合动态演示时挂 `params_hint`。例：`mct.intuition`（质量沿 n 堆积）→ `convergence-thm` 的 `exp` 模式；`dct.intuition`（盖子封两条逃逸路线）→ `bump`/`slide` 模式对照。**反例演示"失败"，直觉演示"为什么成立"**，同一个模块两种叙事。

### 3.2 probe（检验题）

每个核心定理从 `.quantifiers` 里挑 1–2 行变成可操作问句（"去掉非负会怎样？给出具体函数并算出两侧积分"），`type: "probe"`。知识库同时是题库，frontier 计算靠它运转。

**P 篇例外**：probe 密度更高，见 §12.3。

## 4. 每个核心定理的生成清单（四问落地）

| # | id 模式 | type | 回答 |
|---|---|---|---|
| 1 | `x.statement` | statement | 代表什么（精确陈述 + tex_ref） |
| 2 | `x.intuition` | intuition | 代表什么（物理图像；**假设与结论分开写**） |
| 3 | `x.proof` | proof | 证明骨架 + 依赖链 + 易错点 |
| 4 | `x.quantifiers` | comparison | **灵魂词条**：陈述拆 n 个限定词 → 四列表（限定词｜去掉后的具体反例｜结论如何失效｜能否放宽） |
| 5 | 定点反例若干 | counterexample | quantifiers 每行一个，具体函数 + 失效机制 + 修补条件 |
| 6 | `x.*` 若干 | extension | 每条"能放宽/不能加强"的展开 |
| 7 | `x.*` | application | 用在哪 + links |
| 8 | `x.vs-y` | comparison | 与相邻定理的蕴含/分工/选择判据 |
| 9 | `x.probe*` | probe | 1–2 道检验题 |

节级词条：`general.compare`（整节对照表）、`general.bump/slide`（经典反例）、`general.apps`、`general.viz`。

**生成顺序**（硬性）：先 `.quantifiers` → 再定点反例 → 最后 intuition/proof。反过来做必漏限定词。

**P 篇适配**：见 §12.2（四问语义换装，结构不变）。

## 5. 流水线（三 pass）

```
pass 0  切片器（确定性 Python，不烧 API）
  .tex → [{code, title, 原文块, line_start, line_end}]
  显式代号（\subsubsection{G1.1 ...}）优先采信，否则按序合成 X#.k
pass 1  LLM 生成（多 session 并发，1 session = 1 小目）
  prompt = [冻结前缀][当前切片]
  冻结前缀 = 本任务书 §2–§4 + schema + A1.3.json 全文 + 书写规范
  ★ 冻结前缀逐字节固定、放最前、禁时间戳/随机ID → 吃满前缀缓存
pass 2  校验（确定性为主）
  json.tool → 代号/links 存在性 → 数值 uv run python 复核
  → prereq 无环 → 交叉模型评审（GLM 起草、K3 审）→ 人抽查
```

**增量重建**：`notebook_commit` 变化 → 按 `tex_ref` 区间定位受影响小目 → 只重生成这些文件。进度写 `kb-progress.json`（哪些 code 已生成/已 review），不靠对话历史记忆。

**P 篇切片注意**（§12.1）：P 篇小目标题**不带显式编号**（如「核心思想：差分法」），全靠按序合成 `P1.1、P1.2…`；切片器行号锚点必须逐小目核对。

## 6. 模型分工与难度注入

| 任务 | 模型 |
|---|---|
| 绿/黄难度小目的批量初稿 | DeepSeek 4.1 Flash（便宜、吃缓存） |
| 红难度 / 核心定理起草 | GLM-5.3 |
| 抽查复审、红难度复核、疑难 debug | Kimi K3 |
| 备用 | Qwen3.8 Max（型号待核，先当批量备胎） |

`difficulty` / `mastery` **不许模型编**：生成时留空，构建时确定性注入。默认从 `learning-todo/ns-progress.md`（只读真源）注入；**P 篇例外**——difficulty 从 `P_computation.tex` 内嵌的【必】【熟】【知】标记确定性提取（§12.4）。

## 7. 批次（按依赖拓扑序，每批停下报告）

```
批0  A1 补全（A1.1/A1.2/A1.4/A1.5）—— 用 A1.3 样例对拍，验证流水线
批1  A 剩余 + B 全篇 + P 全篇（P1–P10）—— 两棵根 + 工具箱 ★v1.1
批2  C / D / E / F / G
批3  H / I / J（CG 主干，links 指向已存在的 A/B 词条）
批4  K / L / M / Q / R + partN + de1–4 + lie1–3
```

★v1.1 **P 提前到批1 的理由**：P 是全库 links 的汇聚点（A/C/H/I 各章的 application 都会指向「这步放缩用 P3 的 Young」）。先生成 P，后续批次的 links 即写即有效，避免 pass 2 大面积回填。P 自身依赖只有 A（批0/批1 已覆盖），无循环风险。

## 8. 前端规格（约束最多，照此一次到位）

视觉基准：`learning-web/mockup/A1.3.html`（深色极光 + 玻璃拟态样张，交互全真）。

1. **技术栈**：Vite + Vanilla TS；禁 CDN；KaTeX **构建期预渲染**（`katex.renderToString`，决策 D8），禁 pandoc --katex 客户端渲染。
2. **数据加载**：运行时 fetch `json/`（不打进 bundle）→ 改 JSON watcher 秒级刷新；**坏 JSON 出错误浮层（哪个文件哪个字段），绝不白屏**。
3. **布局**：顶栏（字母块带进度色）+ frontier 横幅（"今天该学"= **算出来的**：mastery<3 且 prereq 全达标，拓扑序第一，禁写死）+ 三栏（章节树 / 阅读区 / 右栏）。
4. **定理卡**：陈述/直觉/证明/应用 分 tab；**限定词拆解表默认展开**；点表行就地展开对应反例（不跳页）；难度=光点颜色、掌握度=进度条，**双编码不混用颜色**；显示 `status` 徽标与 `generated_by`。
5. **反例 viz（档1）**：图上必须同时显示"失败的数值"（如 ∫fₙ=1.000 vs ∫f=0 + ✗ 判决），不只是曲线；invariant 自检（如 bump 面积≡1.0 偏差>1e-12 抛错）；标 `前端计算·未对拍` 徽标；批量取数本地 scrub，拖滑块零请求。档2 渲染"演示待接入"占位。
6. **右栏**：依赖◂/被用于▸（chip 点击跳转）+ probe 检验题（可勾选）。
7. **图谱层**：四类边线型+颜色区分、可分别开关；`prereq` 无环必须一眼可验；三层缩放（全局字母块 → 章节节点 → 节点详情）。
8. **主题**：CSS 变量、跟随系统暗色优先；数学用 STIX/Cambria Math 字体栈过渡，正式版接 KaTeX 预渲染。
9. **standalone 快照**（`dist/` 单文件 HTML）：数据内联 + IIFE + 零外部请求，`file://` 双击即开——与 dev 外壳是两套产物。

## 9. 需同步修订 DESIGN.md 的决策（动工前先落笔）

- **D9**：§16 三阶段人工流水线 → 全自动生成（理由：人工阶段一正是"太慢"的根源）；
- **D10**：§16.4 规则 5「不重述笔记」→ 改为「生成物可重建：`tex_ref` + `notebook_commit` 锚定，真源仍是 notebook」；
- **D11**：§3.1「语义边只能人工标注」→「LLM 草拟 + 校验兜底（commit 比对 + 代号消失即失败 + 无环校验）」；
- **D12**：web 外壳运行时读 JSON（动态渲染），standalone 仍内联快照；
- **D13**：`content` 公式 KaTeX、`tex_ref` 区间化、`generated_by`、`probe` 进模板、viz 三档状态机、直觉词条可挂 viz；
- **D14** ★v1.1：P 篇特化（§12）——四问语义适配、【必/熟/知】标记确定性注入 difficulty、probe 密度上调至每个【必】小目 ≥1、P10 决策树交互词条。

## 10. 验收标准

- pass 0：A 篇切出的小目数与 `\subsubsection` 计数一致，行号与 grep 对得上；
- pass 1：A1.4 产物与 A1.3 样例同构，四问齐全，数值可被独立脚本复算；
- pass 2：全量过 `json.tool`；links 全部解析；prereq 拓扑排序成功；
- 前端：对齐 mockup 视觉；改 JSON 秒级可见；坏 JSON 错误浮层；断网可用；网络面板零外部请求；
- ★v1.1 P 篇：pass 0 切出 **10 个文件**（P1.1–P9.4 共 36 小目 + P10 节级文件），小目↔行号逐一对得上；**【必】小目 probe 覆盖率 100%**；P 篇全部公式/数值条目有 `uv run` 复核记录；`difficulty` 与 tex 内【必/熟/知】标记逐条一致（脚本抽查）。

## 11. workbuddy 子 agent 分工建议

`agent-slicer`（pass 0）｜`agent-prefix`（冻结前缀维护，改一字全缓存作废，专人管）｜`agent-gen-<章节>` × N（各挂不同模型，输入只有"前缀+切片"）｜`agent-review`（跨模型评审）｜`agent-verify`（pass 2 确定性校验）｜`agent-frontend`。

★v1.1：`agent-gen-P` 挂 DeepSeek 4.1 Flash 批量初稿，但 P3（不等式）/P8（特殊函数）/P9（能量法）三组的核心条目划给 GLM-5.3 起草（红难度集中地）。

---

## 12. P 篇（计算必修）特化 ★v1.1 新增

### 12.1 事实基础（先对齐，别另立数据源）

**「九组计算必修清单」不是待建内容，已 1:1 落成正式笔记**：`notebook/P_computation.tex`
（2026-09-22 落成，`\section{P. 计算必修：从平方和到欧拉积分}`，554 行）。用户输入与历史黑板里的
`G1–G9` 即 `P1–P9`（撞名 `G_numeric` 已废弃旧记法）。

结构实测（切片器按此对拍）：

| 组 | 主题 | 小目数（\subsubsection） | 核心服务（links 方向） |
|---|---|---|---|
| P1 | 求和与数列 | 4 | A 分析、级数 |
| P2 | 恒等式与代数变形 | 5 | 积分、Laplace |
| P3 | 证明核心不等式 | 3 | **一切证明**（A/C/H/I 全指向这里） |
| P4 | 数列与极限计算 | 3 | 分析入门 |
| P5 | 三角与复数 | 4 | Fourier、CG 旋转（H） |
| P6 | 线性代数手算 | 4 | 泛函（L^p）、CG（H） |
| P7 | 微积分计算技巧 | 5 | 全场 |
| P8 | 欧拉积分与特殊函数 | 4 | 概率（C）、PDE、量子（F） |
| P9 | 估计与渐近 | 4 | 能量法（I、NS 路线） |
| P10 | 必修优先级总表 | 0（节级词条，不切小目） | 总览 + 决策树 |

- 共 36 个小目 + 1 个节级文件（`json/P/P10.json`），产出 **10 个 JSON 文件**。
- 小目标题**无显式编号**（如「核心思想：差分法（telescoping）」）→ 切片器按序合成 `P1.1`、`P1.2`…
  （§5 已覆盖该规则，P 篇是它第一个全量用例）。**id 例**：`P3.1:cauchy-schwarz.quantifiers`、`P8.1:gauss.statement`。
- 用户口径的「L1 分析 / L2 泛函 / L3-L4 能量法 / CG」是 NS 路线关卡，**links 一律换算成章节代号**（A/C/H/I），关卡号不进 `links`。

### 12.2 四问语义适配（结构不变，语义换装）

P 篇是「一副会算的手」，不是定理集。§4 的清单结构照用，各槽位语义按下表替换：

| §4 槽位 | 定理语境 | P 篇语境 |
|---|---|---|
| `x.statement` | 定理精确陈述 | **公式/技法 + 成立条件**（title 写公式名，content 里公式本体用 KaTeX） |
| `x.quantifiers`（灵魂词条） | 限定词拆解 | **适用条件表**：条件｜失效的具体例子｜误用后果｜能否放宽。四列表同构。例：洛必达的「0/0 或 ∞/∞、可导、极限存在」逐条给翻车函数 |
| 定点反例 | 定理反例 | **典型误用**：给具体函数/级数并算出错误结果。例：逐项求导 ∑x^n 在 |x|=1 翻车；错位相减忘了几何条件 r≠1 |
| `x.intuition` | 定理物理图像 | 技法的几何/结构图像。例：差分法=找 F 使楼梯相消；Γ 函数=阶乘的解析延拓 |
| `x.proof` | 证明骨架 | **推导骨架**（差分怎么找 F、部分分式怎么待定系数）+ 易错点 |
| `x.application` | 用在哪 | 在哪一层被用 + links 指向对应章节词条（A/C/H/I） |
| `x.probe*` | 检验题（核心定理 1–2 道） | **手算验证题**，密度见 §12.3 |

**生成顺序不变**：先 quantifiers（=适用条件表）→ 再误用反例 → 最后 intuition/proof。

### 12.3 probe 密度：P 篇即题库

P 篇本质是**手算训练清单**，probe 从"核心定理配 1–2 道"上调为：

- **每个标【必】的小目 ≥1 道 probe**（其他章节维持 §3.2 原规则）；
- probe 必须是**可算出具体数值**的问句（"取 n=10 验证 ∑k^2=385""算 Γ(3/2)""分解 1/(x^2−1) 并逐项积分"）；
- 答案数值进【核验记录】，与红线 4 同流程（`uv run` 复算后才许写进 content）；
- 前端 frontier 把 P 篇 probe 当日常刷题池（§8.3 不变，mastery 判据驱动）。

### 12.4 difficulty 注入的真源切换（仅 P 篇）

`P_computation.tex` 每个条目标了**【必】【熟】【知】**三级（tex 第 8–9 行的标记约定）。
这是比 ns-progress.md 更细、逐条目对齐的真源：

- P 篇条目 `difficulty`：构建时**正则提取 tex 标记**确定性注入——【必】→ 红、【熟】→ 黄、【知】→ 绿；
- `mastery`：仍从 `learning-todo/ns-progress.md` 注入（那里有 P 组打勾表），规则不变；
- 生成时两者都留空，模型不许编（§6 红线不变）。

### 12.5 viz 三档在 P 篇的分布

P 篇是档1（前端直渲）重灾区——纯函数/几何演示密度全库最高：

| 小目 | 档 | 模块草案 | 叙事 |
|---|---|---|---|
| P1.1 差分法 | 1 | `sum-telescoping`（逐项相消动画，"失败数值"=不消时的余项） | 直觉 |
| P4.x Maclaurin 表 | 1 | `taylor-approx`（逐阶逼近 sin/e^x，误差数值实时显示） | 直觉 |
| P5.2 Euler 公式 | 1 | `unit-circle`（e^{iθ} 沿单位圆走，实部虚部双投影）——同时服务 H 章 CG 旋转 | 直觉 |
| P6.4 Gram–Schmidt | 1 | `gram-schmidt`（2D 逐步投影 + 正交性数值自检） | 直觉 |
| P8.1 高斯积分 | 1 | `gauss-integral`（方形→极坐标换元动画，面积数值不变自检） | 直觉 |
| P3.x 不等式 | 1 | AM–GM/Cauchy–Schwarz 的几何面积对照 | 反例/直觉 |
| P9.2 能量法流水线 | **2** | Q3 长时程迭代 → `planned-backend`，rationale 写明走 viz 层 | — |
| P10 决策树 | 1 | `inequality-decision-tree`（**交互决策树**：证明里该掏哪个不等式，逐层点击）——P10 节级词条的 flagship | 应用 |

新模块（`taylor-approx` / `unit-circle` / `gram-schmidt` / `gauss-integral` /
`inequality-decision-tree` / `sum-telescoping`）进前端 viz 注册表，模块名可在 `agent-frontend`
排期时统一定稿，但**契约字段写法必须服从 §3.1**（档1 带 module+version+source，档2 只留
status+rationale）。所有档1 模块沿用 §8.5 硬规则：invariant 自检 + `前端计算·未对拍` 徽标。

### 12.6 反向引用：其他章节生成时的前缀补丁

P 是全库「被用」大户。生成 A/C/H/I 各章时，凡遇到「这一步用了标准放缩/积分技法/恒等变形」，
`application` 词条的 links 必须指向 P 对应组（例：A 篇的 Young 不等式应用 → `P3.2`）。

**落地方式**：在冻结前缀的书写规范里加一句「涉及计算必修技法时 links 指向 P 组」。
⚠️ 这是对冻结前缀的修改——**改一字全缓存作废**，所以必须在批0 开跑**之前**改（现在改是零成本的，
跑起来再改等于全量重算）。归 `agent-prefix` 管，其他 agent 不许碰前缀。

### 12.7 数值核验重点（P 篇密度最高，红线 4 的主战场）

P 篇几乎条条带数。pass 2 对 P 篇按「**每个公式至少一组代入值**」复核，最低清单：

- 三大求和公式：n=10 代入（∑k=55、∑k^2=385、∑k^3=3025）；
- 部分分式：系数还原后通分比对原式（sympy）；
- 常用极限：等价无穷小逐个取 h=1e-3、1e-6 数值对照；
- Maclaurin：各函数取 x=0.5 的 3 阶/5 阶截断 vs 真值，误差量级记录；
- 高斯积分族：∫e^{-x^2} = √π/2、Γ(1/2)=√π、Γ(n+1)=n!、B(1/2,1/2)=π（scipy/sympy 对拍）；
- Stirling：n=20 时相对误差记录；
- 特征值/行列式：手算例题 vs numpy 对拍；
- Gronwall：取一组 (β, f, u_0) 数值积分验证界。

核验脚本进 `learning-web/build/`（确定性、可重跑），结果写进 §16.7 的核验表（DESIGN.md 已有该表结构）。

---

## 13. 施工提醒

1. §9 的 DESIGN 修订（D9–D14）**先落笔再动工**——本仓规矩：先改文档写清理由，再动代码。
2. **批0 不要跳过**：用 A1.3 样例对拍一遍 pipeline，比直接全量跑省返工。
3. **P 篇前缀补丁（§12.6）在批0 开跑前完成**，否则缓存全废。
