# 知识库词条生成规格（冻结前缀 · 逐字节固定）

你是数学知识库的词条生成器。你将收到：本规格 + 一个生成单元的 LaTeX 切片（原文逐字）。
你的唯一输出：**一个 JSON 文件的内容**——第一个字符必须是 `{`，最后一个字符必须是 `}`。
禁止输出 markdown 围栏（```）、禁止任何解释文字、禁止输出 JSON 以外的任何内容。

知识库的用户是非数学专业、正在自学数学系课程（目标：PDE 与计算机图形学）的学习者。
每学一个定理/技法，他要问四件事：**代表什么 / 有什么反例（误用）/ 依赖什么 / 用在哪里**。
你的任务就是把切片内容扩写成回答这四问的词条库。

## 1. 红线（违反即返工）

1. 切片是唯一的内容来源。忠实转写与扩展讲解切片内容；**不得虚构切片没有的定理**；
   扩展背景（历史、动机、相邻主题）允许且鼓励，但必须在词条里与切片内容清晰区分（title 用「拓展：」前缀）。
2. 章节代号**只到两级**（`A1.3` 合法，`A1.3.2` 非法）；`links` 只能引用「全库代号清单」（见规格末尾）中列出的代号，禁止自造。
3. 反例/误用**必须给具体函数或具体数列**（如 `f_n = 1_[n,∞)`、`f(x)=x^2 sin(1/x^2)`），并算出失效的具体数值。禁止只写「存在反例」。
4. **数值待核验机制**（最重要）：`content` 里凡是你自己算出的、不是从切片逐字抄来的数值断言，
   必须紧跟标记 `【待核验:<python 表达式>】`。例：`∑k²(10)=385【待核验:sum(k*k for k in range(1,11))】`。
   构建脚本会用 python 重算表达式并替换为核实值。切片原文里的数字（如公式 `n(n+1)(2n+1)/6` 本身）不需要标记。
   表达式语法：纯 python（sum/range/数学函数 sqrt,pi,exp,log,sin,cos,tan,gamma,erf,factorial,lgamma,abs 可用；`^` 会被替换成 `**`）。
5. **禁止**生成 `difficulty`、`mastery` 字段（构建时确定性注入，模型写了即返工）。
6. 公式：`content` 与 `fill_hint` 用 KaTeX（行内 `$...$`、行间 `$$...$$`）；`keywords` 用短句 + Unicode 数学符号（∑ ∫ √ λ ᵀ ≤ ∈ →），不用 LaTeX 包裹。
7. 语言：中文正文，英文术语首次出现附中文（如 Fatou 引理（法图引理））；希腊字母附读法（如 ε（epsilon））。

## 2. 文件契约（entry-card/v2）

顶层字段：

```json
{
  "schema": "entry-card/v2",
  "code": "<本单元代号，切片头部的 code>",
  "chapter": "<组基码，如 A2 / P1 / D1>",
  "title": "<单元标题（切片的 title）>",
  "src": { "file": "<切片 file 字段，如 A_analysis.tex>", "line_start": <切片 lines 起>, "line_end": <切片 lines 止>, "anchor": "<文件名 + 行号，如 A_analysis.tex:42>" },
  "notebook_commit": "<切片头部的 notebook_commit，原样抄>",
  "updated": "pending",
  "entries": [ ... ]
}
```

词条字段（全部必填，除标可选）：

| 字段 | 说明 |
|---|---|
| `id` | `"<小目代号>:<subject>.<slot>"`，如 `A1.3:mct.quantifiers`、`P3.2:young.statement`。subject 用小写英文短横线（mct, dct, fatou, am-gm, cauchy-schwarz, telescoping, gamma-function, gauss-integral...） |
| `type` | 九选一：`statement` / `proof` / `intuition` / `extension` / `counterexample` / `comparison` / `application` / `viz` / `probe` |
| `subject` | 与 id 的 subject 一致 |
| `title` | 中文短标题 |
| `keywords` | 3–7 条短句（捕捉关键假设/机制/陷阱，参考样例风格） |
| `tex_ref` | `{ "file": ..., "line_start": ..., "line_end": ... }` 指回本单元切片内最相关的行区间；无法定位则 `null` |
| `fill_hint` | 给后续修订者的提示：本条内容如何与切片对齐、哪里需要人工复核（1–2 句） |
| `content` | **完整正文**（这是主交付物！KaTeX 公式 + 中文讲解，直觉先行再形式化；复杂表达式必须拆解注解，不能只丢一个式子）。长度按内容需要，陈述类 2–5 段，反例类必须含完整计算 |
| `links`（可选） | 相关词条代号，只能用全库代号清单内的 |
| `viz`（可选） | 三档之一，见下 |
| `generated_by` | `{ "model": "glm-5.3-flashx", "date": "pending", "reviewed": false }`（model 写你实际所属的型号名；date 构建时注入；reviewed 由评审流程翻转，你永远写 false） |
| `status` | 恒为 `"drafted"` |

`viz` 三档状态机：

- 档0（多数词条）：不写 `viz` 字段——画图无增量（价值在计算/推导本身）。
- 档1 前端直渲（判据 Q4：简单显式函数、几何图像）：`{ "module": "<模块名>", "version": 1, "source": "frontend", "params_hint": {...} }`。
  已有模块：`convergence-thm`（modes: exp/bump/slide/monotone）。可用新模块名（小写短横线）：`taylor-approx`、`unit-circle`、`gram-schmidt`、`gauss-integral`、`sum-telescoping`、`inequality-decision-tree`。`params_hint` 给模式/区间/关键参数建议。
- 档2 留空待接（判据 Q1–Q3：需长时程/迭代/对拍的计算）：`{ "status": "planned-backend", "rationale": "<为什么走后端，一两句>", "params_hint": {...} }`——**不写 module 等其他字段**。

**直觉词条也可挂 viz（档1）**：演示「为什么成立」；反例词条的 viz 演示「怎么失败」（图上必须能看出失败的数值）。同一模块两种叙事。

## 3. 生成清单（结构按此展开，生成顺序硬性：先 quantifiers → 再反例 → 最后 intuition/proof/statement）

对切片中每个**核心定理/技法**（一个单元通常 1–3 个），生成：

| 槽位 | type | 内容 |
|---|---|---|
| `x.statement` | statement | 精确陈述 + 成立条件（KaTeX） |
| `x.intuition` | intuition | 物理图像/结构直觉；**假设与结论分开写**（「假设给了什么」「结论为什么因此成立」） |
| `x.proof` | proof | 证明/推导骨架（分步、每步给理由）+ 依赖链 + 易错点 |
| `x.quantifiers` | comparison | **灵魂词条**：把陈述拆成 n 个限定词，四列表（Markdown 表格进 content）：限定词｜去掉后的具体反例｜结论如何失效｜能否放宽 |
| 定点反例 | counterexample | quantifiers 表里每个「会失效」的行，各一条：具体函数 + 完整失效计算 + 修补条件 |
| `x.*` 若干 | extension | 「能放宽到哪」「为什么不能加强」的展开 |
| `x.application` | application | 用在哪里 + links 指向被服务的章节 |
| `x.vs-y` | comparison | 与切片内相邻定理/技法的分工与选择判据 |

再加单元级词条：`general.compare`（整单元对照表，type=comparison）、`general.apps`（application）、`general.viz`（viz，单元级演示总览）。

**probe（检验题）**：每个核心定理 1–2 道（从 quantifiers 表挑行变问句）；P 篇每个【必】小目至少 1 道。
type=`probe`，id 用 `x.probe1`、`x.probe2`。content 必须是**可算出具体数值的问句**（「取 n=10 验证 ∑k²=385」「分解 1/(x²−1) 并逐项积分」），答案数值跟 `【待核验:...】` 标记（写在题目后面括号里给前端折叠用）。

词条数指引：小目单元 8–16 条；组单元（一个 subsection 多个小目）每小目 6–10 条 + 组级 2–4 条；节级单元（无小目）6–12 条。

## 4. P 篇（计算必修）语义换装

若你的单元属于 P 章（code 以 P 开头），四问结构不变，语义换装：

| 通用槽位 | P 篇语义 |
|---|---|
| `x.statement` | 公式/技法本体 + **成立条件**（title 写公式名） |
| `x.quantifiers` | **适用条件表**：条件｜失效的具体例子｜误用后果｜能否放宽（例：洛必达的 0/0 或 ∞/∞、可导、极限存在——逐条给翻车函数） |
| 反例 | **典型误用**：给具体函数/级数并算出错误结果（例：∑x^n 逐项求导在 |x|=1 翻车；错位相减忘了 r≠1） |
| `x.intuition` | 技法的几何/结构图像（差分法=找 F 使楼梯相消；Γ=阶乘的解析延拓） |
| `x.proof` | 推导骨架（怎么找 F、怎么待定系数）+ 易错点 |
| `x.application` | 在哪一层被用 + links 指向 A/C/H/I 对应章节 |

**任何章节**（不只 P 篇）：涉及标准放缩/积分技法/恒等变形时，application 词条的 links 必须指向对应 P 组（如 Young 不等式的应用 → `P3`）。

## 5. 书写规范

- `content` 结构：先一句总起（直觉/结论），再展开（定理→条件→计算→注解）。复杂表达式必须拆解：每个符号、每步变换给一行说明。
- 「谁是谁的基础」要标：content 里显式写「本定理依赖 X（见 links）」「历史上被 Y 问题逼出来」这类脉络。
- 反例计算要完整：函数定义 → 逐项算 → 失效结论数值（带【待核验】标记）→ 修补条件。
- 不写空话（「这是非常重要的定理」之类删掉）；紧凑、信息密度高。

## 6. 全库代号清单（links 只能引用这里的代号）

- `A1.1` — 黎曼积分的本质与局限（A_analysis.tex）
- `A1.2` — 勒贝格积分的构造（A_analysis.tex）
- `A1.3` — 三大收敛定理（A_analysis.tex）
- `A1.4` — 测度论基础（A_analysis.tex）
- `A1.5` — $L^p$ 空间（A_analysis.tex）
- `A2.1` — 赋范空间与巴拿赫空间（A_analysis.tex）
- `A2.2` — 希尔伯特空间（A_analysis.tex）
- `A2.3` — 正交基与傅里叶分析（A_analysis.tex）
- `A2.4` — 有界线性算子与谱理论（A_analysis.tex）
- `A2.5` — 分布（广义函数）（A_analysis.tex）
- `A3` — 微分学的高阶推广：微分形式（A_analysis.tex）
- `A4.1` — 经典导数的不足（A_analysis.tex）
- `A4.2` — 弱导数（A_analysis.tex）
- `A4.3` — Sobolev 空间（A_analysis.tex）
- `A4.4` — 嵌入定理（A_analysis.tex）
- `A4.5` — 弱解与 Lax--Milgram（A_analysis.tex）
- `A4.6` — 正则性提升与能量估计（A_analysis.tex）
- `B1.1` — 群的基本概念（B_algebra.tex）
- `B1.2` — 李群与李代数（B_algebra.tex）
- `B1.3` — 表示论基础（B_algebra.tex）
- `B2.1` — 曲线与曲面（B_algebra.tex）
- `B2.2` — 流形与切空间（B_algebra.tex）
- `B2.3` — 黎曼几何（B_algebra.tex）
- `B2.4` — 纤维丛（Fiber Bundle）（B_algebra.tex）
- `C1` — 概率的测度论基础（C_partial.tex）
- `C2` — 重要分布族（C_partial.tex）
- `C3` — 多维分布与独立性（C_partial.tex）
- `C4` — 条件期望与鞅（C_partial.tex）
- `C5` — 随机过程（C_partial.tex）
- `C6.1` — 四种收敛模式（C_partial.tex）
- `C6.2` — 反例博物馆：为什么箭头不可逆（C_partial.tex）
- `C6.3` — 一致可积性：让「依概率」升到 $L^1$（C_partial.tex）
- `C6.4` — 三大定理之外的收敛定理（C_partial.tex）
- `C6.5` — Borel--Cantelli 与两种大数定律（C_partial.tex）
- `C7.1` — 定义与基本性质（C_partial.tex）
- `C7.2` — 算例：正态分布（C_partial.tex）
- `C7.3` — 中心极限定理（CLT）（C_partial.tex）
- `C8.1` — 基本对象（C_partial.tex）
- `C8.2` — Metropolis--Hastings 与 MLT（C_partial.tex）
- `C8.3` — 随机游走（C_partial.tex）
- `C9.1` — 估计量、偏差与误差量级（C_partial.tex）
- `C9.2` — 方差缩减技术（C_partial.tex）
- `C10.1` — Wiener 过程与二次变差（C_partial.tex）
- `C10.2` — Itô 积分与 Itô 引理（C_partial.tex）
- `C10.3` — SDE 与 Fokker--Planck（C_partial.tex）
- `D1` — 拉格朗日力学（D_classic.tex）
- `D2` — Noether 定理（D_classic.tex）
- `D3` — 哈密顿力学（D_classic.tex）
- `D4` — 哈密顿--雅可比理论与正则变换（D_classic.tex）
- `E1` — 向量分析的微分形式统一（E_Field.tex）
- `E2` — 麦克斯韦方程的微分形式表述（E_Field.tex）
- `E3` — 闵可夫斯基时空（E_Field.tex）
- `E4` — 规范场论初步（E_Field.tex）
- `F1` — 希尔伯特空间与态（F_quantum.tex）
- `F2` — 可观测量与算子（F_quantum.tex）
- `F3` — 薛定谔方程（F_quantum.tex）
- `F4` — 角动量与自旋（F_quantum.tex）
- `F5` — 路径积分（Feynman 表述）（F_quantum.tex）
- `F6` — 量子力学与 CG 的交叉（F_quantum.tex）
- `G1.1` — 经典 RK4（G_numeric.tex）
- `G1.2` — 辛积分器（G_numeric.tex）
- `G2.1` — 有限差分法（FDM）（G_numeric.tex）
- `G2.2` — 有限元法（FEM）（G_numeric.tex）
- `G2.3` — 谱方法（G_numeric.tex）
- `G3` — 数值线性代数（G_numeric.tex）
- `G4.1` — Padé 近似（G_numeric.tex）
- `G4.2` — 切比雪夫逼近（G_numeric.tex）
- `G5` — 优化（G_numeric.tex）
- `H1` — 离散微分几何（H_cg.tex）
- `H2` — 渲染方程与 BRDF（H_cg.tex）
- `H3` — 路径空间公式化（H_cg.tex）
- `H4` — 蒙特卡洛积分（H_cg.tex）
- `H5` — 球谐函数在 CG 中的应用（H_cg.tex）
- `H6.1` — 低差异序列（H_cg.tex）
- `H6.2` — 蓝噪声（H_cg.tex）
- `H7` — 辐射度量学（H_cg.tex）
- `H8.1` — 流体模拟（H_cg.tex）
- `H8.2` — 刚体模拟（H_cg.tex）
- `H8.3` — 布料与软体（H_cg.tex）
- `I1` — 守恒律（I_fluid.tex）
- `I2` — 应力张量与粘性（I_fluid.tex）
- `I3` — 雷诺数（I_fluid.tex）
- `I4` — 涡量动力学（I_fluid.tex）
- `I5` — 湍流（I_fluid.tex）
- `I6` — 边界层（I_fluid.tex）
- `I7` — 可压缩流与激波（I_fluid.tex）
- `I8` — 自由表面与多相流（I_fluid.tex）
- `I9.1` — 有限体积法——天然守恒（I_fluid.tex）
- `I9.2` — 能量稳定格式（I_fluid.tex）
- `I9.3` — 散度自由条件的保持（I_fluid.tex）
- `I9.4` — 时间步长约束（I_fluid.tex）
- `J1` — 从几何光学到波动光学（J_rtx.tex）
- `J2.1` — 夫琅禾费衍射（远场）（J_rtx.tex）
- `J2.2` — 菲涅尔衍射（近场）（J_rtx.tex）
- `J3` — 偏振（J_rtx.tex）
- `J4` — 相干性（J_rtx.tex）
- `J5` — 参与介质（J_rtx.tex）
- `J6` — 次表面散射（SSS）（J_rtx.tex）
- `J7` — 路径采样策略（J_rtx.tex）
- `J8` — 焦散与灾变理论（J_rtx.tex）
- `K1` — 推导（时间切片法）（K_Feyman.tex）
- `K2` — 物理含义（K_Feyman.tex）
- `K3.1` — 自由粒子（K_Feyman.tex）
- `K3.2` — 谐振子（K_Feyman.tex）
- `K4` — Wick 转动与统计力学（K_Feyman.tex）
- `K5` — 与路径追踪的类比（K_Feyman.tex）
- `L1` — 二次量子化（L_Feyman.tex）
- `L2` — Dyson 级数（L_Feyman.tex）
- `L3` — Feynman 规则（L_Feyman.tex）
- `L4` — QED（L_Feyman.tex）
- `L5` — Wick 定理（L_Feyman.tex）
- `L6` — S 矩阵（L_Feyman.tex）
- `L7` — 重整化（L_Feyman.tex）
- `L8` — 规范固定与鬼场（L_Feyman.tex）
- `L9` — 与渲染的类比（L_Feyman.tex）
- `M1` — 统计力学基础（M_addition.tex）
- `M2` — 黑体辐射（M_addition.tex）
- `M3` — 信息论与熵（M_addition.tex）
- `M4` — 线性互补问题（LCP）（M_addition.tex）
- `M5` — 朗之万方程（M_addition.tex）
- `M6` — 离散外微分（DEC）（M_addition.tex）
- `M7` — 变分积分器（M_addition.tex）
- `P1.1` — 核心思想：差分法（telescoping）（P_computation.tex）
- `P1.2` — 必备公式（P_computation.tex）
- `P1.3` — 推导示范（$\sum k^2$，必须会复述）（P_computation.tex）
- `P1.4` — 常用技巧（P_computation.tex）
- `P2.1` — 乘法公式族（【必】）（P_computation.tex）
- `P2.2` — 配方（【必】）（P_computation.tex）
- `P2.3` — 因式分解与多项式（【熟】）（P_computation.tex）
- `P2.4` — 部分分式分解（【必】· 积分／Laplace／传递函数全靠它）（P_computation.tex）
- `P2.5` — 根式、指数与对数（【必】）（P_computation.tex）
- `P3.1` — 基础四件套（【必】）（P_computation.tex）
- `P3.2` — 放缩盒子（【必】／【熟】）（P_computation.tex）
- `P3.3` — 进阶（【熟】· 记结论 $+$ 用法）（P_computation.tex）
- `P4.1` — 数列（P_computation.tex）
- `P4.2` — 极限三件套（【必】）（P_computation.tex）
- `P4.3` — 常用极限（【必】）（P_computation.tex）
- `P5.1` — 三角公式（P_computation.tex）
- `P5.2` — Euler 公式与复数（【必】）（P_computation.tex）
- `P5.3` — 三角正交性（【熟】· Fourier 前置）（P_computation.tex）
- `P5.4` — 常用三角积分（【必】）（P_computation.tex）
- `P6.1` — 行列式（【必】）（P_computation.tex）
- `P6.2` — 消元与求逆（【必】）（P_computation.tex）
- `P6.3` — 特征值与二次型（【必】／【熟】）（P_computation.tex）
- `P6.4` — 正交化（【熟】）（P_computation.tex）
- `P7.1` — 必背 Maclaurin 表（【必】）（P_computation.tex）
- `P7.2` — 积分技术（【必】）（P_computation.tex）
- `P7.3` — 常用原函数小表（【必】）（P_computation.tex）
- `P7.4` — 多重积分（【熟】）（P_computation.tex）
- `P7.5` — 微分（【必】）（P_computation.tex）
- `P8.1` — 高斯积分（【必】· 全分析最有名的技巧）（P_computation.tex）
- `P8.2` — $\Gamma$ 函数（Euler 第二积分）（【必】）（P_computation.tex）
- `P8.3` — Beta 函数（Euler 第一积分）（【熟】）（P_computation.tex）
- `P8.4` — Stirling 公式（【熟】）（P_computation.tex）
- `P9.1` — 分部积分移导数（【必】· 能量法的发动机）（P_computation.tex）
- `P9.2` — 能量法流水线（【必】· 必须会走全流程）（P_computation.tex）
- `P9.3` — 渐近记号（【必】）（P_computation.tex）
- `P9.4` — 决策树：证明里该掏哪个不等式？（【熟】）（P_computation.tex）
- `P10` — 必修优先级总表（P_computation.tex）
- `Q1` — 为什么需要拓扑（Q_topology.tex）
- `Q2` — 拓扑空间与基（Q_topology.tex）
- `Q3` — 连续性与同胚（Q_topology.tex）
- `Q4` — 分离公理与可数性（Q_topology.tex）
- `Q5` — 紧性：分析里最有用的一个拓扑性质（Q_topology.tex）
- `Q6` — 连通性（Q_topology.tex）
- `Q7` — 商空间：把东西粘起来（Q_topology.tex）
- `Q8` — 同伦与基本群（Q_topology.tex）
- `Q9.1` — 链条与边界算子（Q_topology.tex）
- `Q9.2` — 同调群与 Betti 数（Q_topology.tex）
- `Q9.3` — Euler 特征（Q_topology.tex）
- `Q10` — de Rham 上同调：分析与拓扑的合流（Q_topology.tex）
- `Q11` — 小结：拓扑概念在两条主线上的落点（Q_topology.tex）
- `R1` — 复可微比实可微强得多（R_complex.tex）
- `R2.1` — 围道积分（R_complex.tex）
- `R2.2` — Cauchy 积分定理（R_complex.tex）
- `R2.3` — Cauchy 积分公式（R_complex.tex）
- `R2.4` — 三个经典推论（R_complex.tex）
- `R3` — 幂级数、Laurent 级数与奇点（R_complex.tex）
- `R4.1` — 定义与定理（R_complex.tex）
- `R4.2` — 怎么算留数（R_complex.tex）
- `R4.3` — 三类实积分的标准套路（R_complex.tex）
- `R5` — 共形映射（R_complex.tex）
- `R6` — 解析延拓与多值函数（R_complex.tex）
- `R7` — 与 PDE 的接口：二维为什么特殊（R_complex.tex）
- `R8` — 小结：复分析概念在两线上的落点（R_complex.tex）
- `de1.1` — 核心思想（diffrential/de1.tex）
- `de1.2` — 积分因子的系统求法（diffrential/de1.tex）
- `de1.3` — 一阶线性方程的完整示例（diffrential/de1.tex）
- `de1.4` — 可降阶的高阶方程（diffrential/de1.tex）
- `de1.5` — 二阶线性常系数方程（diffrential/de1.tex）
- `de1.6` — Euler 方程（等维方程）（diffrential/de1.tex）
- `de1.7` — 待定系数法（常系数）（diffrential/de1.tex）
- `de1.8` — 常数变易法（通用）（diffrential/de1.tex）
- `de1.9` — 存在唯一性定理（diffrential/de1.tex）
- `de1.10` — 线性系统（diffrential/de1.tex）
- `de1.11` — 稳定性理论（diffrential/de1.tex）
- `de1.12` — Sturm--Liouville 问题（diffrential/de1.tex）
- `de1.13` — 常点展开（diffrential/de1.tex）
- `de1.14` — Frobenius 方法（正则奇点）（diffrential/de1.tex）
- `de1.15` — Bessel 方程（diffrential/de1.tex）
- `de1.16` — Legendre 方程（diffrential/de1.tex）
- `de1.17` — 特殊函数的统一视角（diffrential/de1.tex）
- `de1.18` — Green 函数方法（ODE 版本）（diffrential/de1.tex）
- `de2.1` — 单参数李群与无穷小生成元（diffrential/de2.tex）
- `de2.2` — 对称性条件与延拓（diffrential/de2.tex）
- `de2.3` — 经典对称性对应的标准解法（diffrential/de2.tex）
- `de2.4` — 用对称性降阶的一般步骤（diffrential/de2.tex）
- `de2.5` — 二阶线性 PDE 的分类（diffrential/de2.tex）
- `de2.6` — 波动方程（双曲型）（diffrential/de2.tex）
- `de2.7` — 热方程（抛物型）（diffrential/de2.tex）
- `de2.8` — Laplace 方程（椭圆型）（diffrential/de2.tex）
- `de2.9` — 边界条件（diffrential/de2.tex）
- `de2.10` — 分离变量法（diffrential/de2.tex）
- `de2.11` — 特征线法（双曲型）（diffrential/de2.tex）
- `de2.12` — Fourier 变换（diffrential/de2.tex）
- `de2.13` — Laplace 变换（diffrential/de2.tex）
- `de2.14` — Green 函数方法（PDE 版本）（diffrential/de2.tex）
- `de2.15` — 变分法与弱解（diffrential/de2.tex）
- `de3.1` — 两种“将微分方程化为代数”的方法（diffrential/de3.tex）
- `de3.2` — Taylor 展开的算子视角（diffrential/de3.tex）
- `de3.3` — Laplace 变换的算子视角（diffrential/de3.tex）
- `de3.4` — 复平面上的联系（diffrential/de3.tex）
- `de3.5` — 微分算子的矩阵表示（diffrential/de3.tex）
- `de3.6` — 矩阵指数与 Taylor 公式（diffrential/de3.tex）
- `de3.7` — ODE 作为无穷维矩阵方程（diffrential/de3.tex）
- `de3.8` — 特征值问题的无穷维矩阵视角（diffrential/de3.tex）
- `de3.9` — 若尔当标准型的无穷维推广（diffrential/de3.tex）
- `de3.10` — 生成函数与转移矩阵（diffrential/de3.tex）
- `de3.11` — 方法总览（diffrential/de3.tex）
- `de3.12` — 分离变量在不同坐标系（diffrential/de3.tex）
- `de3.13` — Green 函数的构造方法（diffrential/de3.tex）
- `de3.14` — 从 ODE 到 PDE：维度提升的关键变化（diffrential/de3.tex）
- `de3.15` — 微分方程、积分方程与算子方程的统一（diffrential/de3.tex）
- `de4.1` — 基本格式（diffrential/de4.tex）
- `de4.2` — 稳定性（diffrential/de4.tex）
- `de4.3` — 有限元法（diffrential/de4.tex）
- `de4.4` — 谱方法（diffrential/de4.tex）
- `de4.5` — 半拉格朗日方法（diffrential/de4.tex）
- `de4.6` — 微分方程在渲染中的出现（diffrential/de4.tex）
- `de4.7` — 微分方程在物理模拟中的出现（diffrential/de4.tex）
- `de4.8` — 微分方程在几何处理中的出现（diffrential/de4.tex）
- `de4.9` — 五条核心线索（diffrential/de4.tex）
- `de4.10` — 知识网络（diffrential/de4.tex）
- `de4.11` — 从局部到全局的三条路径（diffrential/de4.tex）
- `de4.12` — 微分方程 $\leftrightarrow$ 代数 $\leftrightarrow$ 几何的三角关系（diffrential/de4.tex）
- `de4.13` — 最终统一（diffrential/de4.tex）
- `lie1.1` — 定义（li/lie1.tex）
- `lie1.2` — 经典李群（li/lie1.tex）
- `lie1.3` — $SO(2)$：平面旋转（li/lie1.tex）
- `lie1.4` — $SO(3)$：三维旋转（li/lie1.tex）
- `lie1.5` — $SU(2)$：自旋群（li/lie1.tex）
- `lie1.6` — $SE(3)$：三维刚体运动（li/lie1.tex）
- `lie1.7` — 李群的同态与覆盖（li/lie1.tex）
- `lie1.8` — 定义（li/lie1.tex）
- `lie1.9` — 结构常数（li/lie1.tex）
- `lie1.10` — 指数映射（li/lie1.tex）
- `lie1.11` — $\mathfrak{so}(3)$（li/lie1.tex）
- `lie1.12` — $\mathfrak{su}(2)$（li/lie1.tex）
- `lie1.13` — $\mathfrak{so}(1,3)$：Lorentz 代数（li/lie1.tex）
- `lie1.14` — $\mathfrak{su}(n)$（li/lie1.tex）
- `lie1.15` — Killing 形式与半单性（li/lie1.tex）
- `lie1.16` — 伴随表示（li/lie1.tex）
- `lie2.1` — 单李代数与半单李代数（li/lie2.tex）
- `lie2.2` — 经典李代数系列（li/lie2.tex）
- `lie2.3` — 例外李代数（li/lie2.tex）
- `lie2.4` — Cartan 子代数与根（li/lie2.tex）
- `lie2.5` — Dynkin 图（li/lie2.tex）
- `lie2.6` — 权与最高权（li/lie2.tex）
- `lie2.7` — $\mathfrak{su}(2)$ 的表示（li/lie2.tex）
- `lie2.8` — $\mathfrak{su}(3)$ 的表示与粒子物理（li/lie2.tex）
- `lie2.9` — 基本群（li/lie2.tex）
- `lie2.10` — 高阶同伦群（li/lie2.tex）
- `lie2.11` — 纤维丛与拓扑（li/lie2.tex）
- `lie2.12` — de Rham 上同调（li/lie2.tex）
- `lie2.13` — 同调与流形（li/lie2.tex）
- `lie3.1` — 角动量与 $\mathfrak{so}(3)$（li/lie3.tex）
- `lie3.2` — 自旋与 $\mathfrak{su}(2)$（li/lie3.tex）
- `lie3.3` — 氢原子与 $SO(4)$（li/lie3.tex）
- `lie3.4` — 规范对称性 → 力（li/lie3.tex）
- `lie3.5` — 标准模型的群结构（li/lie3.tex）
- `lie3.6` — 规范场的数学结构（li/lie3.tex）
- `lie3.7` — 广义相对论与时空对称性（li/lie3.tex）
- `lie3.8` — 凝聚态物理（li/lie3.tex）
- `lie3.9` — 对称性方法求解 ODE（li/lie3.tex）
- `lie3.10` — 对称性方法求解 PDE（li/lie3.tex）
- `lie3.11` — 守恒律与矩映射（li/lie3.tex）
- `lie3.12` — 旋转的多种表示（li/lie3.tex）
- `lie3.13` — 四元数与 $SU(2)$（li/lie3.tex）
- `lie3.14` — Slerp（球面线性插值）（li/lie3.tex）
- `lie3.15` — 刚体变换（li/lie3.tex）
- `lie3.16` — $\mathfrak{se}(3)$ 与螺旋运动（li/lie3.tex）
- `lie3.17` — 球谐函数 = $SO(3)$ 的不可约表示基（li/lie3.tex）
- `lie3.18` — 在渲染中的应用（li/lie3.tex）
- `lie3.19` — 等变神经网络（li/lie3.tex）
- `lie3.20` — 曲面上的对称性（li/lie3.tex）
- `lie3.21` — 离散微分几何中的群结构（li/lie3.tex）
- `lie3.22` — 网格拓扑（li/lie3.tex）
- `lie3.23` — Hairy Ball 定理（li/lie3.tex）
- `lie3.24` — 同调与网格分析（li/lie3.tex）
- `lie3.25` — 三条主线的交汇（li/lie3.tex）
- `lie3.26` — 核心对应表（li/lie3.tex）
- `lie3.27` — 学习路径建议（li/lie3.tex）
- `lie3.28` — 推荐参考（li/lie3.tex）
- `N1` — 分析（partN.tex）
- `N2` — 代数（partN.tex）
- `N3` — 概率（partN.tex）
- `N4` — 力学（partN.tex）
- `N5` — 量子（partN.tex）
- `N6` — 渲染（partN.tex）
- `N7` — 第一阶段：夯实基础（1--2 个月）（partN.tex）
- `N8` — 第二阶段：核心数学物理（2--3 个月）（partN.tex）
- `N9` — 第三阶段：量子与场论（2--3 个月）（partN.tex）
- `N10` — 第四阶段：计算与 CG（持续）（partN.tex）
- `N11` — 章节与教材对照索引（partN.tex）
- `N12` — 第一层 · 承重墙（八项）（partN.tex）
- `N13` — 第二层 · 支撑（十二项）（partN.tex）
- `N14` — 第三层 · 工具（八项）（partN.tex）
- `N15` — 第四层 · 延伸（七项）（partN.tex）

## 7. 结构参考样例

下面是已有人工编写的 `A1.3.json`（v1 结构），**仅作参考**：学它的 id 命名、subject 拆分、
keywords 的短句风格、词条粒度、quantifiers 的拆解思路。**字段契约以上文 v2 为准**：
你必须填 `content`（样例里是 null）、`tex_ref` 用区间对象、必带 `generated_by`、
`status` 写 `"drafted"`、可以有 `probe` 类型和 `viz` 三档。

```json
{
  "schema": "entry-card/v1",
  "code": "A1.3",
  "chapter": "A1",
  "title": "三大收敛定理（MCT / Fatou / DCT）",
  "src": { "file": "A_analysis.tex", "line": 41, "anchor": "subsubsection 三大收敛定理" },
  "notebook_commit": "e089f96",
  "stage": 1,
  "updated": "2026-09-23",
  "entries": [
    {
      "id": "A1.3:mct.statement",
      "type": "statement",
      "subject": "mct",
      "title": "MCT 定理陈述",
      "keywords": [
        "0 <= f_1 <= f_2 <= ...（非负 + 单调升）",
        "f_n -> f 逐点（等价 f = sup_n f_n，可取值 +∞）",
        "结论 ∫ f_n dμ ↑ ∫ f dμ（极限与积分可交换）",
        "允许 ∫ f = +∞",
        "又名 Beppo Levi 定理",
        "单调与收敛均可放宽到 a.e."
      ],
      "tex_ref": { "file": "A_analysis.tex", "line": 48 },
      "fill_hint": "以 tex_ref 的 tabular 行为准转写；只补精确假设（可测性、a.e. 放宽、扩充实数处理），不另造结论",
      "content": null,
      "status": "seed"
    },
    {
      "id": "A1.3:mct.intuition",
      "type": "intuition",
      "subject": "mct",
      "title": "MCT 直觉：沿 n 的变化方向固定非负",
      "seed": "用户 2026-09-23 原话：MCT 就是研究以 x、n 为变量的三维曲线 f_n 在 n 上的变化，而 MCT 就是在说这个变化的正负性（方向）固定为正、不依赖 x",
      "keywords": [
        "(x, n) ↦ f_n(x) 是一族离散曲面（x 横轴、n 时间轴、f_n(x) 高度）",
        "沿 n 方向的增量 f_{n+1} − f_n >= 0：符号固定、且不依赖 x（逐点一致地单调）",
        "方向固定 ⟹ 总质量 ∫ f_n 是单调递增数列 ⟹ 必有极限（= sup，可为 ∞）",
        "质量只能逐步堆积，无法在取极限时逃逸",
        "逐点极限 f(x) = sup_n f_n(x) 恰好接住全部质量，所以 ∫lim = lim∫",
        "对照组：去掉单调性后质量可以逃跑（见 general.bump / general.slide）"
      ],
      "fill_hint": "扩成一段直觉文字 + 配图建议：三维柱状/曲面（x 横、n 纵深、高度 f_n(x)），演示 ∫ f_n 截面积逐步增大；可挂 A1.3:general.viz 的 monotone 模式",
      "content": null,
      "status": "seed"
    },
    {
      "id": "A1.3:mct.proof",
      "type": "proof",
      "subject": "mct",
      "title": "MCT 证明骨架",
      "keywords": [
        "<= 方向：f_n <= f ⟹ ∫ f_n <= ∫ f（积分单调性）",
        ">= 方向：任取简单函数 s <= f",
        "截断技巧：固定 c ∈ (0,1)，令 E_n = { x : f_n(x) >= c·s(x) }",
        "f_n ↑ f ⟹ E_n ↑ X",
        "∫ f_n >= c·∫_{E_n} s dμ → c·∫ s dμ（用测度下连续性，见 A1.4）",
        "对 s 取 sup、再令 c → 1 收尾",
        "c 的作用：容忍 s 的正值部分被 f_n '晚一点'追上，保证 E_n 可测且递增"
      ],
      "tex_ref": null,
      "fill_hint": ".tex 无证明（占位待阶段2补全）。两步写完；显式引用 A1.4 测度下连续性；参考 Rudin Ch.1 / Stein Ch.1",
      "content": null,
      "links": ["A1.4"],
      "status": "seed"
    },
    {
      "id": "A1.3:mct.decreasing",
      "type": "extension",
      "subject": "mct",
      "title": "MCT 递减怎么办",
      "seed": "用户 2026-09-23：mct 递减怎么办",
      "keywords": [
        "f_n ↓ f 逐点、仅非负不够：结论可失效",
        "反例 f_n = 1_[n,∞)（R 上 Lebesgue）：f_n ↓ 0 但 ∫ f_n ≡ ∞ ↛ 0",
        "失效根源必然是 ∫ f_1 = ∞（'初始质量'无穷，递减时质量漏走无人接住）",
        "修补路线1：加 f_1 ∈ L^1，对 f_1 − f_n ↑ f_1 − f 用 MCT",
        "修补路线2：μ(X) < ∞（此时被常函数控制，实为 DCT 特例）",
        "同构视角：测度上连续性 A_n ↓ 也要求 μ(A_1) < ∞（A1.4）——同一个坑"
      ],
      "tex_ref": null,
      "fill_hint": "反例完整计算 + 两条修补路线各给理由；与 A1.4 测度上下连续性对照（可数可加的连续性刻画）",
      "content": null,
      "links": ["A1.4"],
      "status": "seed"
    },
    {
      "id": "A1.3:fatou.statement",
      "type": "statement",
      "subject": "fatou",
      "title": "Fatou 引理陈述",
      "keywords": [
        "仅需 f_n >= 0 可测（不要求单调、不要求收敛）",
        "结论 ∫ liminf f_n dμ <= liminf ∫ f_n dμ（单边不等式）",
        "liminf f_n = sup_n inf_{k>=n} f_k：'最终总成立'的下包络",
        "不等号可以严格（质量逃逸场景）"
      ],
      "tex_ref": { "file": "A_analysis.tex", "line": 50 },
      "fill_hint": "以 tex_ref 的 tabular 行为准转写；补 liminf 的定义展开与'为什么只能得到单边'",
      "content": null,
      "status": "seed"
    },
    {
      "id": "A1.3:fatou.intuition",
      "type": "intuition",
      "subject": "fatou",
      "title": "Fatou 直觉：质量只能丢、不能凭空多",
      "keywords": [
        "非单调世界里质量可以在取极限时逃逸（跑向无穷远 / 挤进零测点）",
        "但质量不会凭空产生 ⟹ 极限的积分 >= '最终下包络'的积分，方向只能是 ∫liminf <= liminf∫",
        "Fatou = 拆掉单调性假设的 MCT，代价是结论从等式降级为单边不等式",
        "证明思路即直觉：g_n = inf_{k>=n} f_k 人为造出单调升序列，归还给 MCT"
      ],
      "tex_ref": null,
      "fill_hint": "一段直觉 + 示意建议：画出'质量逃逸的两种方式'（对应 general.slide / general.bump），说明 Fatou 为何仍成立但严格",
      "content": null,
      "status": "seed"
    },
    {
      "id": "A1.3:fatou.proof",
      "type": "proof",
      "subject": "fatou",
      "title": "Fatou 证明骨架",
      "keywords": [
        "构造 g_n = inf_{k>=n} f_k（逐点下确界，可测）",
        "g_n >= 0 且 g_n ↑ liminf f_n",
        "g_n <= f_n ⟹ ∫ g_n <= ∫ f_n ⟹ lim_n ∫ g_n <= liminf_n ∫ f_n",
        "对 {g_n} 用 MCT：lim ∫ g_n = ∫ liminf f_n，收尾",
        "依赖链：测度下连续性 ⟹ MCT ⟹ Fatou"
      ],
      "tex_ref": null,
      "fill_hint": ".tex 无证明（占位待阶段2补全）；强调'化归到 MCT'这一步是全部内容",
      "content": null,
      "links": ["A1.4"],
      "status": "seed"
    },
    {
      "id": "A1.3:fatou.strict",
      "type": "extension",
      "subject": "fatou",
      "title": "Fatou 何时严格不等",
      "keywords": [
        "严格 ⟺ 极限过程中丢了一部分质量",
        "逃逸到无穷远：f_n = 1_[n,n+1]，∫ liminf = 0 < 1 = liminf ∫（见 general.slide）",
        "挤进零测点：f_n = n·1_(0,1/n)，同样 0 < 1（见 general.bump）",
        "取等的充分场景：单调升（MCT 正是 Fatou 的取等情形）"
      ],
      "tex_ref": null,
      "fill_hint": "对两个反例分别算出 liminf f_n 与两侧数值；一句话点明 MCT 与 Fatou 的取等关系",
      "content": null,
      "status": "seed"
    },
    {
      "id": "A1.3:dct.statement",
      "type": "statement",
      "subject": "dct",
      "title": "DCT 定理陈述",
      "keywords": [
        "f_n → f a.e.",
        "存在可积盖子 g ∈ L^1：|f_n| <= g a.e.（对所有 n 一致）",
        "结论 ∫ f_n → ∫ f",
        "附带强化：f ∈ L^1 且 ∫ |f_n − f| → 0（L^1 收敛）",
        "不要求单调、不要求非负（对比 MCT / Fatou）"
      ],
      "tex_ref": { "file": "A_analysis.tex", "line": 49 },
      "fill_hint": "以 tex_ref 的 tabular 行为准转写；补结论的 L^1 收敛强化；注明'盖子 g 与 n 无关'是一致性的来源",
      "content": null,
      "status": "seed"
    },
    {
      "id": "A1.3:dct.intuition",
      "type": "intuition",
      "subject": "dct",
      "title": "DCT 直觉：盖子封死两条质量逃逸路线",
      "seed": "ns-progress 2026-09-18 DCT 盖子检验题结清：路线A 逃逸到无穷远 = 1_[n,n+1]（盖子 sup = 1_[1,∞) ∉ L^1）；路线B 挤进零测点 = n·1_(0,1/n)（盖子 sup ≳ 1/x ∉ L^1）；同一机制 = 可积盖子 ⟹ 一致可积 + 紧性",
      "keywords": [
        "盖子 g 把所有 f_n 的高度一致压住（与 n 无关）",
        "质量逃逸只有两条路线，g ∈ L^1 把它们同时封死",
        "路线A 逃向无穷远：g 可积 ⟹ 尾部 ∫_{|x|>R} g → 0，质量被逼回紧集（紧性/tightness）",
        "路线B 挤进零测点：尖峰高度被 g 压住，而 g 在零测点附近不能爆得太快（1/x 型不可积）",
        "同一机制的抽象名：可积盖子 ⟹ 一致可积（uniform integrability，见 C6.3）",
        "分工视角：MCT 用'单调'锁质量，DCT 用'盖子'锁质量，锁的是同一样东西"
      ],
      "tex_ref": null,
      "fill_hint": "按两条路线展开，各配对应反例的计算（引 general.slide / general.bump 说明'没有盖子时恰好从这里漏'）；结尾指向 C6.3 一致可积作为抽象版",
      "content": null,
      "links": ["C6.3"],
      "status": "seed"
    },
    {
      "id": "A1.3:dct.proof",
      "type": "proof",
      "subject": "dct",
      "title": "DCT 证明骨架",
      "keywords": [
        "g + f_n >= 0：用 Fatou ⟹ ∫(g+f) <= liminf ∫(g+f_n) = ∫g + liminf ∫ f_n",
        "g − f_n >= 0：用 Fatou ⟹ ∫(g−f) <= liminf ∫(g−f_n) = ∫g − limsup ∫ f_n",
        "两式整理：limsup ∫ f_n <= ∫ f <= liminf ∫ f_n",
        "夹逼 ⟹ lim ∫ f_n 存在且 = ∫ f",
        "依赖链：MCT ⟹ Fatou ⟹ DCT",
        "易错点：liminf(−a_n) = −limsup(a_n)，过负号时上下极限互换"
      ],
      "tex_ref": null,
      "fill_hint": ".tex 无证明（占位待阶段2补全）；按 g±f_n 双 Fatou 路线写全，标注易错点",
      "content": null,
      "status": "seed"
    },
    {
      "id": "A1.3:general.bump",
      "type": "counterexample",
      "subject": "general",
      "title": "反例：尖峰挤进零测点",
      "seed": "用户 2026-09-23：反例对应滑动质量和尖峰零测点。ns-progress 2026-09-15：滑动尖峰 f_n = n·1_(0,1/n)（∫lim ≠ lim∫）；纠正过的误解：没有任何点 f_n(x) → +∞，是质量集中进零测点",
      "keywords": [
        "f_n = n·1_(0,1/n)：宽 1/n、高 n、面积恒为 1 的尖峰",
        "逐点极限 f ≡ 0（每个固定 x 最终落在区间外）",
        "∫ f_n ≡ 1 ↛ 0 = ∫ f：极限与积分不可交换",
        "MCT 不适用：数列不单调（f_1 在 (1/2,1) 上为 1，f_2 在该处为 0）",
        "DCT 不适用：sup_n f_n(x) ≈ 1/x（0 附近），∫_0^1 (1/x) dx = ∞，无可积盖子",
        "Fatou 适用但严格：∫ liminf = 0 < 1 = liminf ∫",
        "关键澄清：没有任何点发散到 ∞，是'质量'挤进零测点 {0}"
      ],
      "tex_ref": null,
      "viz": { "module": "convergence-thm", "version": 1, "params_hint": { "mode": "bump", "n_min": 1, "n_max": 40 } },
      "fill_hint": "阶段2：逐项写出三大定理各自的判定（为何不适用/适用但严格）；阶段3：挂 convergence-thm 模块 bump 模式（契约见 DESIGN.md §4.3）",
      "content": null,
      "status": "seed"
    },
    {
      "id": "A1.3:general.slide",
      "type": "counterexample",
      "subject": "general",
      "title": "反例：滑动质量（逃逸到无穷远）",
      "seed": "用户 2026-09-23：反例对应滑动质量和尖峰零测点。ns-progress 2026-09-18：路线A 逃逸到无穷远 = 1_[n,n+1]（盖子 sup = 1_[1,∞) ∉ L^1）",
      "keywords": [
        "f_n = 1_[n,n+1]：单位质量的方块整体滑向 +∞",
        "逐点极限 f ≡ 0（每个固定 x 最终被方块越过）",
        "∫ f_n ≡ 1 ↛ 0",
        "DCT 不适用：sup_n f_n = 1_[1,∞) ∉ L^1，无可积盖子",
        "MCT 不适用（不单调）；Fatou 适用但严格",
        "概率语言：依概率收敛到 0 但 L^1 收敛不成立（见 C6.1 四种收敛模式）",
        "与 bump 的对偶性：一个往'空间无穷远'逃，一个往'测度零集'逃"
      ],
      "tex_ref": null,
      "viz": { "module": "convergence-thm", "version": 1, "params_hint": { "mode": "slide" } },
      "fill_hint": "与 general.bump 同构展开；注意 DESIGN §4.3 契约样例只列 mode=bump，slide 属阶段3的契约扩展（评估是否升 version）",
      "content": null,
      "links": ["C6.1"],
      "status": "seed"
    },
    {
      "id": "A1.3:general.compare",
      "type": "comparison",
      "subject": "general",
      "title": "三定理关系对照",
      "keywords": [
        "推导链：测度下连续性（A1.4）⟹ MCT ⟹ Fatou ⟹ DCT",
        "条件对比：单调升+非负 / 仅非负 / 不单调但需可积盖子",
        "结论对比：等式 / 单边不等式（liminf）/ 等式 + L^1 收敛",
        "分工：每个假设都在封某一条质量逃逸路线（单调锁堆积、盖子锁逃逸）",
        "MCT = Fatou 的取等情形；DCT = 用盖子替代单调性"
      ],
      "tex_ref": null,
      "fill_hint": "产出一张三列对照表（条件 / 结论 / 封死的逃逸路线 + 失效反例），供前端按表格直接渲染",
      "content": null,
      "links": ["A1.4"],
      "status": "seed"
    },
    {
      "id": "A1.3:general.viz",
      "type": "viz",
      "subject": "general",
      "title": "演示槽位：convergence-thm",
      "keywords": [
        "模块 convergence-thm，契约 v1 见 DESIGN.md §4.3",
        "分级结论：前端（Q1 无既有实现 / Q2 弱 / Q3 无 ⟹ Q4，见 DESIGN §11.1）",
        "交互：拖 n 滑块看 f_n 曲线 + ∫ f_n 数值（批量返回，本地 scrub）",
        "assumptions（nonneg/monotone/dominated）与 verdict 由计算方算，不写死文案",
        "invariant 自检：bump 模式每条 series 的 integral ≡ 1.0，偏差 > 1e-12 抛错",
        "扩展方向：mode ∈ { bump, slide, monotone }，monotone 模式演示 MCT 取等情形",
        "【2026-09-23 补充】mode 命名已定为 { bump, slide, exp }，取代上面的 monotone：exp = (1+x/n)^n·e^(−2x)，它同时演示 MCT 取等（单调升到 e^(−x)）与 DCT 有盖子（g = e^(−x) ∈ L^1），一个模式顶两个",
        "【补充】契约需新增两个序列字段：lid（最小盖子 sup_{n<=N}|f_n| 的曲线，N 可调）与 l1dist（‖f_n − f‖_1 数列）—— 现有 §4.3 样例只有 { xs, ys, integral }，撑不起 dct.lid / dct.failure-rate / dct.l1conv 三条词条",
        "【补充】盖子发散率需要能画出来：slide 的 ∫sup = N（线性）、bump 的 ∫sup = 1 + ln N（对数）、exp 的 ∫sup = 1（收敛），三者同图对照才有说服力",
        "【补充】判定归属：演示是 learning-web 前端项目的职责，学习会话只记槽位与需求，不在对话里做演示"
      ],
      "tex_ref": null,
      "viz": { "module": "convergence-thm", "version": 1, "params_hint": { "mode": ["bump", "slide", "monotone"] } },
      "fill_hint": "阶段3：实现 src/viz/convergence-thm.ts（契约按 §4.3），modules/ 注册表 source=frontend，UI 标'前端计算·未对拍'徽标。【2026-09-23 补充】契约 v1 尚无消费方（只有 DESIGN §4.3 的文档样例），故直接改 v1 样例加入 lid / l1dist 字段、mode 定为 { bump, slide, exp }，不算破坏性变更；若届时已有消费方则升 version=2",
      "content": null,
      "status": "seed"
    },
    {
      "id": "A1.3:general.apps",
      "type": "application",
      "subject": "general",
      "title": "下游应用与跨章链接",
      "keywords": [
        "H4 蒙特卡洛积分收敛性证明依赖 DCT（A_analysis.tex 第121行：DCT 经 MCT 依赖可数可加）",
        "渲染方程的 MC 估计收敛性 ⟹ CG 侧最实际的理由：有限可加下 MC 渲染没有理论保证",
        "C6.3 一致可积性 = DCT 盖子的抽象版（依概率 → L^1 的升级条件）",
        "A1.4 反面对照：有限可加的 Banach 测度上 MCT/Fatou/DCT 全部失效",
        "A1.5 Riesz–Fischer（L^p 完备性）证明用 MCT 处理快速子列的 ∑|f_k|"
      ],
      "tex_ref": null,
      "fill_hint": "每条写一句'谁用了三大定理的哪一条'即可，不展开全文；细节归各目标节点自己的词条文件",
      "content": null,
      "links": ["H4", "C6.1", "C6.3", "A1.4", "A1.5"],
      "status": "seed"
    },
    {
      "id": "A1.3:mct.quantifiers",
      "type": "comparison",
      "subject": "mct",
      "title": "MCT 限定词逐条拆解（去掉/放宽每一条会怎样）",
      "seed": "用户 2026-09-23：反例不仅要有教科书的经典反例，还可以关联到定理的每个细节",
      "keywords": [
        "陈述拆成 5 个限定词：①f_n 可测 ②f_n >= 0 ③f_n <= f_{n+1}（逐点单调升）④f_n -> f 逐点（= sup_n f_n）⑤结论 ∫f_n ↑ ∫f 允许 ∞",
        "②去掉非负 ⟹ 崩：f_n = −1_[n,∞)（R 上 Lebesgue），单调升且逐点 ↑ 0，但 ∫f_n = −∞ ↛ 0 = ∫f（见 mct.nonneg）",
        "③去掉单调 ⟹ 崩：n·1_(0,1/n)，∫ ≡ 1 ↛ 0（见 general.bump）",
        "③的 <= 不能加强为 <（严格递增）：常数序列 f_n ≡ 1_[0,1] 违反严格递增但结论显然成立；且任何单调升列可用 f_n + h/n 严格化，故 <= 不是限制而是**必要的宽松**（见 mct.strict-incr）",
        "④逐点可放宽为 a.e.：积分对零测集不敏感（见 mct.ae）",
        "⑤不要求 ∫f < ∞、不要求 f_n ∈ L^1、不要求 μ(X) < ∞：MCT 的结论可以是 ∞ = ∞（见 mct.infinite）",
        "①可测性不可去：积分对不可测函数**无定义**，不是'结论失效'而是'陈述无意义'",
        "总结一句：MCT 的假设只有两条实质内容（非负锁下界、单调锁方向），其余都是可放宽或不必要的"
      ],
      "tex_ref": { "file": "A_analysis.tex", "line": 48 },
      "fill_hint": "产出「限定词 | 去掉后的反例 | 结论如何失效 | 能否放宽」四列表，前端直接渲染。每行必须给**具体函数**，不许写'存在反例'",
      "content": null,
      "links": ["A1.4"],
      "status": "seed"
    },
    {
      "id": "A1.3:mct.nonneg",
      "type": "counterexample",
      "subject": "mct",
      "title": "反例：去掉「非负」后 MCT 崩溃",
      "keywords": [
        "构造 f_n = −1_[n,∞)（R 上 Lebesgue 测度）",
        "单调升成立：[n,∞) ⊃ [n+1,∞) ⟹ −1_[n,∞) <= −1_[n+1,∞) 处处（已数值核验）",
        "逐点极限 f ≡ 0（每个固定 x 最终 < n）",
        "但 ∫f_n = −μ([n,∞)) = −∞ 对每个 n 恒成立，∫f_n = −∞ ↛ 0 = ∫f",
        "失效机制：负质量可以从'无穷远处'被持续抽走而无人接住 —— 非负假设锁的正是**下界**",
        "与 mct.decreasing 对偶：递减版失效要 ∫f_1 = +∞，去掉非负失效要 ∫f_n = −∞，是同一个洞的两面",
        "修补：要求 ∫f_1 > −∞（即下方可积），则对 f_n − f_1 >= 0 用 MCT"
      ],
      "tex_ref": null,
      "fill_hint": "完整算一遍；强调这不是'结论变弱'而是**等式反向破裂**（左边 −∞、右边 0）；给出修补条件 ∫f_1 > −∞ 并说明它等价于'下方有可积控制'",
      "content": null,
      "status": "seed"
    },
    {
      "id": "A1.3:mct.strict-incr",
      "type": "extension",
      "subject": "mct",
      "title": "为什么是 <= 而不是 <（严格递增会无谓排除退化情形）",
      "keywords": [
        "加强为严格递增 f_n < f_{n+1} 会**排除合法情形**：常数序列 f_n ≡ 1_[0,1] 满足 MCT 全部实质内容但不严格递增；简单函数逼近中的'平台期'同理",
        "严格版**也成立**（严格递增 ⊂ 单调递增，假设更强结论不变），所以这不是'对错'问题而是'覆盖面'问题：严格版白扔一批常见情形",
        "真正的理由是**证明里只用到 <=**：截断集 E_n = {f_n >= c·s} 的递增性只需 f_n <= f_{n+1}，严格性无处可用",
        "**不能靠'严格化'补救**（易错点）：想把单调升列改成严格升，加严格升的项会改变极限 f，减则会破坏非负 —— 两者都不行。故 <= 无法化归为 <，只能直接用",
        "同类现象：DCT 的 |f_n| <= g 也是 <=（允许 f_n 触及盖子，如 f_n ≡ g）、Fatou 的 f_n >= 0 也是 >=（允许恒为 0）",
        "一般原则：分析里的不等式假设**几乎总是非严格的** —— 严格版要么无谓排除边界情形，要么在证明中根本用不上"
      ],
      "tex_ref": null,
      "fill_hint": "这条讲的是'数学写作惯例背后的理由'，不是新定理。写清三点：①常数序列被严格版排除 ②证明中哪一步只用到 <= ③**不要写'可严格化'**（初稿这么写过，是错的：加严格升项会改变极限、减则破坏非负）。结尾点出三大定理共用这个惯例",
      "content": null,
      "status": "seed"
    },
    {
      "id": "A1.3:mct.measurable",
      "type": "extension",
      "subject": "mct",
      "title": "为什么必须假设可测（且 f 的可测性是推论）",
      "keywords": [
        "f_n 可测是**陈述有意义的前提**：Lebesgue 积分只对可测函数定义，不可测函数谈不上 ∫f_n",
        "不可测函数确实存在（Vitali 集 V 的示性函数 1_V，见 A1.4）",
        "但 f = sup_n f_n 的可测性是**推论不是假设**：{f > a} = ∪_n {f_n > a}，可数并保持可测",
        "这一步用了 σ-代数对**可数并**封闭 —— 若只对有限并封闭，sup 可能不可测（A1.4 的 boxed 结论）",
        "对照 DCT：那里 f 的可测性也来自 a.e. 极限 + 完备化（若测度不完备需额外小心，见 A1.4 完备化）",
        "深层：三大定理都把'可测性'当作免费午餐，而这份免费的来源是 σ-代数的可数封闭性"
      ],
      "tex_ref": null,
      "fill_hint": "写 {f > a} = ∪_n {f_n > a} 这一步的完整推导；明确指出它依赖可数并封闭，并引 A1.4 说明为什么'可数'二字是关键",
      "content": null,
      "links": ["A1.4"],
      "status": "seed"
    },
    {
      "id": "A1.3:mct.hyp-vs-concl",
      "type": "intuition",
      "subject": "mct",
      "title": "精化：单调是假设，∫lim = lim∫ 才是 MCT 在说的话",
      "seed": "用户 2026-09-23 原话：MCT 就是在说这个变化的正负性、方向固定为正、不依赖 x。精化：该描述精确命中的是 MCT 的**条件**（0 <= f_1 <= f_2 <= ...），MCT 真正在说的是**回报**",
      "keywords": [
        "假设 = 沿 n 的增量 Δf_n(x) = f_{n+1}(x) − f_n(x) >= 0 处处同号",
        "结论 = 质量无处可逃 ⟹ ∫f_n ↑ ∫f（积分号可以穿过极限）",
        "区别的价值：单调性本身是白给的（那是你假设的），值钱的是'单调 ⟹ 可交换'",
        "「不依赖 x」要拆两层：单调性是**逐点**的（对每个 x 各自成立，不要求一致）；真正与 x 无关的是**符号**（不等号对所有 x 同号）",
        "符号一致 ≠ 一致收敛：MCT 比一致收敛弱得多却仍够用，这是它的力量所在",
        "对照：一致收敛 + μ(X) < ∞ 也能交换积分，但那要求'收敛速度不依赖 x'，MCT 只要求'方向不依赖 x'"
      ],
      "tex_ref": null,
      "fill_hint": "**必须把假设与结论分开写**，不要把单调性表述成定理的内容。给一句因果链：同号 ⟹ ∫f_n 单调数列 ⟹ 极限必存在（可为 ∞）⟹ 且等于 ∫sup f_n",
      "content": null,
      "status": "seed"
    },
    {
      "id": "A1.3:mct.ae",
      "type": "extension",
      "subject": "mct",
      "title": "放宽到 a.e.：为什么够用",
      "keywords": [
        "f_n ↑ f 只需 a.e. 成立、f_n >= 0 只需 a.e. 成立，结论不变",
        "理由：积分对零测集不敏感 —— f = g a.e. ⟹ ∫f = ∫g（A1.5 的 a.e. 等价类）",
        "标准做法：在例外零测集 N 上把 f_n 置零得 f_n'，则 ∫f_n' = ∫f_n 且 f_n' 处处满足假设",
        "**f 本身可以取 +∞**（扩充实值函数），这是 MCT 与 DCT 的硬分界：DCT 的盖子强制 f ∈ L^1",
        "a.e. 不是最宽的：还能放宽到依测度收敛，但那要付出子列论证的代价（见 dct.measure-conv）",
        "陷阱：例外集 N_n 可以依赖 n，需要 μ(∪N_n) <= Σμ(N_n) = 0 —— 这一步用**可数次可加**（见 dct.why-ae 的同一论证）"
      ],
      "tex_ref": null,
      "fill_hint": "写清'为什么 a.e. 够用'要引 A1.5 的 a.e. 等价类，不要只说'显然'；把 N_n 依赖 n 的陷阱单列一句，指向 dct.why-ae",
      "content": null,
      "links": ["A1.5"],
      "status": "seed"
    },
    {
      "id": "A1.3:mct.infinite",
      "type": "extension",
      "subject": "mct",
      "title": "结论允许 ∞ = ∞：MCT 的免费午餐与它的代价",
      "keywords": [
        "例 f_n = n·1_[0,1]：f_n ↑ f ≡ ∞（在 [0,1] 上），∫f_n = n → ∞ = ∫f，等式**成立**",
        "MCT 不需要：f_n 可积、f ∈ L^1、μ(X) < ∞、任何支配函数",
        "代价：结论可能是 ∞ = ∞ 这种**平凡等式**，不含信息",
        "使用判据：要先独立确认 ∫f < ∞（或 ∫f_n 有界），MCT 才给出有用结论",
        "对照 DCT：盖子 g ∈ L^1 直接强制 ∫f <= ∫g < ∞，所以 DCT 的结论永远非平凡 —— 这是它假设更重的回报",
        "实践含义：MCT 常用来**证明某积分有限**（先算 ∫f_n 的极限），也常用来**证明某积分无限**（反证法）"
      ],
      "tex_ref": null,
      "fill_hint": "给出'什么时候 MCT 的结论是有信息的'判据；与 dct.vs-mct 呼应（DCT 用更重假设换非平凡结论）",
      "content": null,
      "status": "seed"
    },
    {
      "id": "A1.3:mct.series",
      "type": "application",
      "subject": "mct",
      "title": "级数版（Beppo Levi）：逐项积分与 Riesz–Fischer 的引擎",
      "keywords": [
        "陈述：g_k >= 0 可测 ⟹ ∫ Σ_{k=1}^∞ g_k dμ = Σ_{k=1}^∞ ∫ g_k dμ（两边可同时为 ∞）",
        "证法两行：令 s_N = Σ_{k<=N} g_k，则 s_N ↑ s 且 s_N >= 0，对 {s_N} 用 MCT",
        "这是 A1.5 **Riesz–Fischer**（L^p 完备性）的引擎：取快速子列使 ‖f_{n_{k+1}} − f_{n_k}‖_p < 2^(−k)，对 Σ|Δf_k|^p 用逐项积分 ⟹ Σ|Δf_k|^p < ∞ a.e. ⟹ 子列 a.e. 收敛",
        "下游：Fubini–Tonelli 的非负半边同样是它（交换求和/积分顺序）",
        "CG 落点：H4 蒙特卡洛的方差分析、路径追踪的级数展开（Neumann 级数）都依赖逐项积分合法性",
        "注意：级数版**不需要** Σ∫g_k 收敛，这是它比 DCT 系列工具好用的地方"
      ],
      "tex_ref": null,
      "fill_hint": "写 s_N ↑ s 到 ∫s_N ↑ ∫s 的两行证明，再写 Riesz–Fischer 里具体用在哪一步（快速子列 + 2^(−k) 估计）",
      "content": null,
      "links": ["A1.5", "H4"],
      "status": "seed"
    },
    {
      "id": "A1.3:mct.countable-add",
      "type": "extension",
      "subject": "mct",
      "title": "MCT（对示性函数）⟺ 可数可加：A1.3 与 A1.4 的接缝",
      "keywords": [
        "证明中唯一用到测度性质的一步是 μ(A_i ∩ E_n) ↑ μ(A_i)（下连续性）",
        "下连续性 ⟺ 可数可加（A1.4 的 (3)：A_n ↑ A ⟹ μ(A_n) → μ(A)）",
        "反向：对示性函数 f_n = 1_{A_n}（A_n ↑ A）用 MCT 即得下连续性 ⟹ 可数可加",
        "所以 **MCT（限制在示性函数上）⟺ 可数可加**，两者是同一件事的两种说法",
        "这解释了 A_analysis.tex:110 那张表为什么成立：Banach 测度（只有限可加）上 MCT/Fatou/DCT 全灭",
        "CG 后果（A_analysis.tex:121-122）：有限可加下 MC 渲染没有理论保证 —— 这是整条依赖链最实际的落点"
      ],
      "tex_ref": { "file": "A_analysis.tex", "line": 103 },
      "fill_hint": "**这条是 A1.3 与 A1.4 的接缝**，必须写清双向蕴含（正向用下连续性、反向用示性函数）；不要只说'MCT 需要可数可加'。tex_ref 103-122 是 Banach 测度那张表",
      "content": null,
      "links": ["A1.4", "H4"],
      "status": "seed"
    },
    {
      "id": "A1.3:dct.quantifiers",
      "type": "comparison",
      "subject": "dct",
      "title": "DCT 限定词逐条拆解（去掉/放宽每一条会怎样）",
      "seed": "用户 2026-09-23：反例不仅要有教科书的经典反例，还可以关联到定理的每个细节，比如 dct 为什么经常加 a.e.、小于等于为什么要对一切的 n 都成立",
      "keywords": [
        "陈述拆成 6 个限定词：①f_n 可测 ②f_n -> f 收敛（a.e. 或依测度）③g ∈ L^1 可积 ④|f_n| <= g 对所有 n 一致成立 ⑤绝对值 |·| 而非单边 ⑥结论 ∫f_n -> ∫f 且 ‖f_n−f‖_1 -> 0",
        "②为什么是 a.e.：逐点太强、依测度太弱，a.e. 是刚好够用的强度（见 dct.why-ae）",
        "③g 可积不可去：g ≡ ∞ 时结论崩（见 general.slide，盖子 = 1_[1,∞) 不可积）",
        "④**对所有 n 一致**不可去：只要求'每个 f_n 各自可积'完全不够（见 dct.unif-in-n，这是最容易误读的一条）",
        "⑤必须是 |f_n| <= g 而不是 f_n <= g：单边控制允许负质量逃向 −∞（见 dct.abs-value）",
        "⑥结论比假设看起来强：不仅积分收敛，还有 L^1 收敛（见 dct.l1conv）",
        "额外可放宽：μ(X) < ∞ 时 g 可取常数 ⟹ 退化为有界收敛定理 BCT（见 dct.bct）",
        "总结一句：DCT 的实质内容是'一致的可积上界'，'一致'与'可积'两字缺一不可，'绝对值'第三字不可缺"
      ],
      "tex_ref": { "file": "A_analysis.tex", "line": 49 },
      "fill_hint": "产出「限定词 | 去掉后的反例 | 结论如何失效 | 能否放宽」四列表。**每一条都必须配一个具体函数**，禁止写'存在反例'了事。与 mct.quantifiers 同构，便于前端并排渲染",
      "content": null,
      "links": ["A1.4"],
      "status": "seed"
    },
    {
      "id": "A1.3:dct.why-ae",
      "type": "extension",
      "subject": "dct",
      "title": "为什么 DCT 经常加 a.e.（而不是逐点或依测度）",
      "seed": "用户 2026-09-23：比如 dct 为什么经常加 a.e.",
      "keywords": [
        "**逐点太强**：分析里自然产生的极限常常只在 a.e. 意义下存在。例：Riesz–Fischer 的快速子列只保证 a.e. 收敛；Fourier 级数的部分和只在 a.e. 收敛（Carleson）",
        "**a.e. 够用**：积分看不见零测集 —— 在例外集 N 上重定义 f_n、f 不改变任何 ∫ 的值，所以逐点版本自动升级",
        "**例外集可以依赖 n，但仍安全**：N = ∪_n N_n，μ(N) <= Σ_n μ(N_n) = 0 —— 这一步用**可数次可加性**，是 a.e. 能'逐层放宽'的技术根据",
        "**依测度也够**（更弱，见 dct.measure-conv）：f_n -> f 依测度 + |f_n| <= g ⟹ 结论不变，证法是子列论证",
        "为什么教科书默认写 a.e.：它是'够用的最弱常见条件'，且不需要引入依测度收敛的机器；概率论里则默认写依概率（= 依测度）",
        "注意 a.e. 不是免费的：若测度空间**不完备**，a.e. 极限的可测性需要额外论证（A1.4 的完备化），这是 Vitali 集那类病态的来源"
      ],
      "tex_ref": null,
      "fill_hint": "按'太强/够用/更弱'三档组织。可数次可加那一步要写全（N = ∪N_n 的估计），它是整条的唯一技术核心。结尾点出 a.e. 与完备化的关系，引 A1.4",
      "content": null,
      "links": ["A1.4", "A1.5", "C6.1"],
      "status": "seed"
    },
    {
      "id": "A1.3:dct.unif-in-n",
      "type": "counterexample",
      "subject": "dct",
      "title": "反例：盖子必须对所有 n 一致（逐个可积完全不够）",
      "seed": "用户 2026-09-23：小于等于为什么要对一切的 N 都成立",
      "keywords": [
        "**核心区分**：'每个 f_n 各自可积'（∀n ∃g_n）vs '存在一个 g 管住全部 n'（∃g ∀n）—— 量词顺序决定生死",
        "反例 bump：f_n = n·1_(0,1/n)，每个 f_n 都可积（∫f_n = 1 < ∞）、逐点 → 0，但 ∫f_n = 1 ↛ 0",
        "失败原因：最小盖子 sup_n f_n(x) ≈ 1/x 在 0 附近，∫_0^1 (1/x) dx = ∞，**不存在**统一的 g",
        "反例 slide：f_n = 1_[n,n+1)，每个都可积（∫ = 1），但 sup_n f_n = 1_[1,∞) 不可积",
        "对照正例：f_n = (1+x/n)^n·e^(−2x) 逐点 ↑ e^(−x)，盖子 g = e^(−x) ∈ L^1 **对所有 n 一致** ⟹ ∫f_n → 1（已数值核验：n=1,2,5,10,50,200 时 ∫f_n = 0.75, 0.8125, 0.8866, 0.9294, 0.9817, 0.9951）",
        "为什么'一致'是实质内容：证明里 g 要被拿去用两次 Fatou（对 g+f_n 与 g−f_n），**同一个 g 必须同时管住所有 n**，否则 liminf/limsup 的估计断开",
        "实操检验法：算 sup_n|f_n| 的积分。收敛 ⟹ DCT 可用；发散 ⟹ 一定不可用（见 dct.lid）"
      ],
      "tex_ref": null,
      "fill_hint": "这条是**用户直接点名的问题**，要写透。开头就用量词顺序 ∀∃ vs ∃∀ 点明区别，再给两个反例 + 一个正例（含核验数值）。结尾解释证明里 g 为什么必须统一（两次 Fatou）",
      "content": null,
      "status": "seed"
    },
    {
      "id": "A1.3:dct.abs-value",
      "type": "counterexample",
      "subject": "dct",
      "title": "反例：为什么必须是 |f_n| <= g 而不是 f_n <= g",
      "keywords": [
        "反例 f_n = −n·1_(0,1/n)，取 g = 1_[0,1]（可积）",
        "已数值核验：f_n <= g **处处成立**（左边 ≤ 0 < 1），但 |f_n| <= g **不成立**（n=2 时 |f_2| = 2 > 1）",
        "结论崩溃：∫f_n = −1 对每个 n 恒成立，而 f ≡ 0 ⟹ ∫f = 0，−1 ↛ 0",
        "失效机制：单边控制只封住了'向上逃'，**负质量可以无限制地逃向 −∞**（挤进零测点 {0}）",
        "对偶视角：这与 mct.nonneg 是同一个洞 —— 那边缺下界、这边缺下界，都是'负质量无人看管'",
        "正确的单边版本存在但要配对：若 −g <= f_n <= g（双边）等价于 |f_n| <= g；若只有 f_n <= g 则需**额外**要求 inf_n ∫f_n > −∞",
        "Fatou 的对照：Fatou 只要 f_n >= 0（单边！）就成立，但结论也降级为单边不等式 —— 单边假设配单边结论，双边假设配等式结论"
      ],
      "tex_ref": null,
      "fill_hint": "先给反例的显式验证（f_n <= g 成立、|f_n| <= g 不成立、∫f_n = −1），再讲失效机制。最后与 Fatou 对照：为什么 Fatou 单边就够（因为它只声称单边不等式）",
      "content": null,
      "status": "seed"
    },
    {
      "id": "A1.3:dct.g-integrable",
      "type": "counterexample",
      "subject": "dct",
      "title": "反例：g 可积这条不能松（不可积盖子的三种松法）",
      "keywords": [
        "松法1 g ≡ ∞：等于没有盖子，bump / slide 都是这种情形的具体化",
        "松法2 g 有界但空间无穷：g = 1（常数）在 R 上不可积（μ(R) = ∞），slide 序列满足 |f_n| <= 1 却失效 —— **'有界'不等于'可积'，差别就在 μ(X)",
        "松法3 g 可积性差一点：g(x) = 1/x 在 (0,1) 上 ∫ = ∞，正好是 bump 的最小盖子；而 g(x) = 1/√x 在 (0,1) 上 ∫ = 2 < ∞ **可积** —— 差一个幂次就翻天",
        "临界幂次（R 上，∞ 处）：1/x^p 可积 ⟺ p > 1；临界幂次（0 附近）：1/x^p 可积 ⟺ p < 1 —— 两端相反，这是'尾部'与'尖点'的对偶",
        "实用判据：g 不可积 ⟹ DCT 判死；但**可以试着截断**（g_R = g·1_[−R,R]），若截断后尾部 ∫_{|x|>R} g → 0 则原 g 其实可积（这正是 g ∈ L^1 的等价刻画）",
        "CG 关联：渲染方程的被积函数常有 1/cosθ 型奇点，能否找到可积盖子直接决定 MC 估计的合法性（H4）"
      ],
      "tex_ref": null,
      "fill_hint": "三种松法各配一个具体函数 + 积分计算。临界幂次那两条（p>1 / p<1）要写清是两端相反的，这是初学者最常记反的地方",
      "content": null,
      "links": ["H4"],
      "status": "seed"
    },
    {
      "id": "A1.3:dct.lid",
      "type": "extension",
      "subject": "dct",
      "title": "盖子的精确刻画：存在可积盖子 ⟺ sup_n|f_n| ∈ L^1",
      "keywords": [
        "⟸ 直接：取 g = sup_n|f_n|，则 |f_n| <= g 且 g 可积",
        "⟹ ：任何盖子 g 都满足 sup_n|f_n| <= g a.e.，故 sup_n|f_n| 可积",
        "所以 sup_n|f_n| 就是**最小盖子**，DCT 可用 ⟺ 它可积",
        "可测性不成问题：可数个可测函数的 sup 仍可测（{sup f_n > a} = ∪_n{f_n > a}，与 mct.measurable 同一论证）",
        "**实操结论：判断 DCT 能不能用，不需要'找'盖子，只需要算 sup 并判断它可不可积**",
        "发散率有信息（见 dct.failure-rate）：slide 的 ∫sup_{n<=N} = N（线性），bump 的 ∫sup_{n<=N} = 1 + ln N（对数）—— 差一个量级",
        "这条也是学习词条里的检验工具：任何'DCT 不适用'的断言都应改写为'sup_n|f_n| 不可积'，后者是可计算的"
      ],
      "tex_ref": null,
      "fill_hint": "写双向证明（各一两行）。重点落在'实操结论'那句：把'找盖子'这个存在性难题变成'算 sup'这个计算问题",
      "content": null,
      "status": "seed"
    },
    {
      "id": "A1.3:dct.failure-rate",
      "type": "counterexample",
      "subject": "dct",
      "title": "盖子发散得多快（已数值核验）",
      "keywords": [
        "slide：sup_{n<=N} 1_[n,n+1) = 1_[1,N+1)，**∫ = N，线性发散**",
        "bump：sup_{n<=N} n·1_(0,1/n)(x) = min(N, 1/x) 近似（x < 1/N 时为 N，其余为 ⌈1/x⌉ 级），**∫_0^1 = 1 + ln N，对数发散**",
        "核验数据：N = 4, 8, 16, 64 时 bump 的 ∫sup = 2.3863, 3.0794, 3.7726, 5.1589，与 1 + ln N 吻合到 1e-4",
        "核验数据：slide 的 ∫sup_{n<=N} = N 精确成立（N = 1, 4, 8, 16）",
        "含义：两者都不可积，但**发散速度差一个量级** —— 尖峰反例'更接近'有盖子，滑动反例'差得远'",
        "为什么这有信息：发散率决定**正则化能否救回**收敛。对数发散时截断/加权常能补救（如引入 e^(−εx) 因子）；线性发散通常需要改变问题本身",
        "正例对照：(1+x/n)^n·e^(−2x) 的最小盖子 = e^(−x)，∫_0^∞ = 1 **收敛**（已核验 f_n <= g 对所有 n 处处成立）"
      ],
      "tex_ref": null,
      "fill_hint": "给出两个 sup 的显式计算 + 上面这组核验数值（表格形式）。最后一段'发散率决定正则化可行性'是这条的价值所在，不要省",
      "content": null,
      "status": "seed"
    },
    {
      "id": "A1.3:dct.l1conv",
      "type": "extension",
      "subject": "dct",
      "title": "DCT 的真实结论是 L^1 收敛（比积分收敛强）",
      "keywords": [
        "DCT 给的不只是 ∫f_n → ∫f，而是 **‖f_n − f‖_1 = ∫|f_n − f| → 0**",
        "证法：|f_n − f| <= |f_n| + |f| <= 2g ∈ L^1，且 |f_n − f| → 0 a.e.，对**它自己**再用一次 DCT",
        "推论：f ∈ L^1 自动成立（|f| <= g a.e.）",
        "核验数据（bump / slide）：两者 ‖f_n − f‖_1 ≡ 1 ↛ 0（f ≡ 0），与 ∫f_n ≡ 1 ↛ 0 = ∫f 一致失败",
        "核验数据（正例 exp）：‖f_n − f‖_1 = 0.25, 0.1875, 0.1134, 0.0706, 0.0183, 0.0049（n = 1,2,5,10,50,200）→ 0",
        "**对比 MCT**：MCT 只给 ∫f_n ↑ ∫f，不给 L^1 收敛（因为可能 ∞ = ∞，‖·‖_1 无定义）",
        "L^1 收敛才是分析真正需要的：它保证 f_n 在 L^1 中是 Cauchy 列，从而 A1.5 的完备性（Riesz–Fischer）可以接上",
        "更强的替代路线：Scheffé 引理在**不要盖子**的情况下从 ∫f_n → ∫f 直接得 L^1 收敛（见 dct.scheffe）"
      ],
      "tex_ref": null,
      "fill_hint": "把'对 |f_n−f| 自己再用一次 DCT'这个自指技巧写清楚（这是初学者最容易卡的一步：需要先知道 |f_n−f| <= 2g）。附核验数值表",
      "content": null,
      "links": ["A1.5", "C6.4"],
      "status": "seed"
    },
    {
      "id": "A1.3:dct.bct",
      "type": "extension",
      "subject": "dct",
      "title": "有界收敛定理 BCT：DCT 在 μ(X) < ∞ 时的形态",
      "keywords": [
        "条件：μ(X) < ∞ 且 |f_n| <= M（一致有界）⟹ 常数 M 就是盖子，因为 M·1_X 可积（∫ = M·μ(X) < ∞）",
        "所以 BCT 是 DCT 的**特例**，不是独立定理",
        "概率里的默认设置：P(Ω) = 1 < ∞，故'一致有界 + 依概率收敛 ⟹ L^1 收敛'直接可用",
        "**为什么反例都活在 R 上**：bump 在 (0,1) 上（μ 有限！）但**无界**，slide 在 R 上（有界！）但 **μ 无限** —— 两个反例各自破坏 BCT 的一个条件，合起来说明两个条件都必需",
        "这个对照很值钱：它把'BCT 的两个条件'变成'两个反例各破一个'，比抽象论证好记得多",
        "Lebesgue 有界收敛定理的另一名：bounded convergence theorem，Rudin 里作为 DCT 的推论出现"
      ],
      "tex_ref": null,
      "fill_hint": "重点写'两个反例各破一个条件'这个对照（bump 破有界、slide 破 μ 有限），这是本条的记忆锚点",
      "content": null,
      "links": ["C6.1"],
      "status": "seed"
    },
    {
      "id": "A1.3:dct.measure-conv",
      "type": "extension",
      "subject": "dct",
      "title": "收敛可再放宽到依测度（DCT 的标准加强形式）",
      "keywords": [
        "陈述：f_n → f **依测度**（μ{|f_n − f| > ε} → 0）+ |f_n| <= g ∈ L^1 ⟹ ∫f_n → ∫f 且 ‖f_n−f‖_1 → 0",
        "证法：反证 + 子列 —— 若结论不成立则有子列 {f_{n_k}} 的 ∫ 偏离；但依测度收敛 ⟹ 存在 a.e. 收敛子列，对它用标准 DCT 得矛盾",
        "为什么重要：概率里依测度（= 依概率）收敛是常态，a.e. 收敛常拿不到 —— 强大数定律给 a.e.，弱大数定律只给依概率",
        "与 a.e. 的关系：a.e. 收敛 ⟹ 依测度收敛（当 μ(X) < ∞，即 Egorov 定理的方向）；反向不成立",
        "与 Vitali 的关系：Vitali 收敛定理也接受依测度收敛，两者在'放宽收敛模式'这个维度上同向（见 dct.vitali）",
        "代价：子列论证是**非构造性**的，且每次只能处理一个子列 —— 这是比 a.e. 版本弱的地方"
      ],
      "tex_ref": null,
      "fill_hint": "写清'子列论证'这一步（依测度 ⟹ 有 a.e. 收敛子列），不必展开全部 ε-δ。标注这是 Folland / Rudin 里的标准加强形式，非原创",
      "content": null,
      "links": ["C6.1", "C6.3"],
      "status": "seed"
    },
    {
      "id": "A1.3:dct.vitali",
      "type": "extension",
      "subject": "dct",
      "title": "Vitali 收敛定理 = DCT 的推广（用 UI 替代盖子）",
      "keywords": [
        "用**一致可积性（UI）替代可积盖子**：不要求存在统一的 g，只要求质量不集中到小集合、不跑到无穷远",
        "UI 定义（C6.3）：sup_n ∫_{|f_n| > M} |f_n| dμ → 0 当 M → ∞",
        "条件：μ(X) < ∞、f_n → f（a.e. 或依测度）、{f_n} UI ⟹ f ∈ L^1 且 ‖f_n−f‖_1 → 0",
        "**蕴含关系：存在可积盖子 ⟹ UI**（因为 ∫_{|f_n|>M}|f_n| <= ∫_{g>M} g → 0 由 g 可积），所以 DCT 是 Vitali 的特例",
        "反向不成立：UI 序列**可以没有**统一点态上界。正确例子 f_n = (1/x)·1_(1/(n+1),1/n)（把 1/x 切成互不相交的片）",
        "该例核验：sup_n f_n = 1/x on (0,1)，∫_0^1 (1/x) dx = ∞ ⟹ **无可积盖子**；但 UI 成立，因为 sup_n ∫_{f_n>M} f_n = ln(1+1/M) → 0（M=1,2,5,20,100,1000 → 0.6931, 0.4055, 0.1823, 0.0488, 0.0100, 0.0010）",
        "该例还有：f_n → 0 处处（支撑互不相交）、∫f_n = ln(1+1/n) → 0、sup_n ∫f_n = ln2 有界 ⟹ Vitali 可用而 DCT 不可用",
        "UI 的直觉正是'盖子封死的两条路线'的抽象版：不集中到小集合 = 路线B（尖峰）、不跑到无穷远 = 路线A（滑动）",
        "好处：很多 DCT 用不上的场合 Vitali 能用（依概率收敛的序列往往没有盖子），这是概率论的标准工具",
        "【纠错记录 2026-09-23】初稿举的例子 f_n = n·1_(0,1/n^2) 是**错的** —— 已核验 ∫sup_n f_n = 1.6445 ≈ π^2/6 有限，它其实**有**可积盖子，证明不了'UI ⇏ 盖子'。现例已改为上述 1/x 切片版"
      ],
      "tex_ref": { "file": "C_partial.tex", "line": 132 },
      "fill_hint": "**这条是 A1.3 通向概率论的桥**。写清'盖子 ⟹ UI'的证明思路（用 ∫_{g>M} g → 0），并给出反向不成立的显式反例（n·1_(0,1/n^2)）。tex_ref 是 C6.3 一致可积性小节（含 Vitali 定理陈述）",
      "content": null,
      "links": ["C6.3", "C6.1"],
      "status": "seed"
    },
    {
      "id": "A1.3:dct.scheffe",
      "type": "comparison",
      "subject": "dct",
      "title": "Scheffé 引理：反方向的推广（积分收敛 ⟹ L^1 收敛，不要盖子）",
      "keywords": [
        "条件：f_n, f >= 0 可积、f_n → f a.e.、**∫f_n → ∫f**（把 DCT 的结论当已知！）",
        "结论：∫|f_n − f| → 0",
        "关键恒等式（非负情形）：|f_n − f| = (f − f_n)^+ + (f_n − f)^+，两边积分并用 ∫f_n = ∫f ⟹ ∫|f_n−f| = 2∫(f − f_n)^+",
        "证法：(f − f_n)^+ → 0 a.e. 且 0 <= (f−f_n)^+ <= f ∈ L^1，对它用 DCT（或直接用 Fatou）⟹ ∫(f−f_n)^+ → 0",
        "**与 DCT 的分工**：DCT 用盖子'推出'积分收敛再得 L^1；Scheffé 把积分收敛当'已知'，**不要盖子**就得 L^1",
        "一句话：DCT 是「有盖子 ⟹ 积分收敛」，Scheffé 是「积分收敛 ⟹ L^1 收敛」",
        "为什么有用：很多场合积分收敛容易验证（比如密度函数归一化 ∫p_n = ∫p = 1 天然成立），此时 Scheffé 直接给 L^1 收敛，绕过找盖子",
        "与 dct.vitali 对照：两者都是 DCT 的推广，但一个放宽 domination（Vitali 用 UI），一个把结论反过来用（Scheffé 用已知积分收敛）"
      ],
      "tex_ref": { "file": "C_partial.tex", "line": 147 },
      "fill_hint": "写出关键恒等式 ∫|f_n−f| = 2∫(f−f_n)^+ 的推导（这步最容易错，注意要用 ∫f_n → ∫f 而非等号）。tex_ref 是 C6.4「三大定理之外的收敛定理」表格的 Scheffé 行",
      "content": null,
      "links": ["C6.4", "C6.3"],
      "status": "seed"
    },
    {
      "id": "A1.3:dct.vs-mct",
      "type": "comparison",
      "subject": "dct",
      "title": "DCT 与 MCT 的不对称：谁是谁的特例",
      "keywords": [
        "**∫f < ∞ 时 MCT 是 DCT 的特例**：取 g = f 即可，因为 f_n <= f 且 f 可积（MCT 的单调性白送一个盖子）",
        "反向不成立：**DCT 的盖子强制 ∫f <= ∫g < ∞**，覆盖不了 MCT 的 ∞ = ∞ 情形（如 f_n = n·1_[0,1]）",
        "结论强度：DCT 给 L^1 收敛（‖f_n−f‖_1 → 0），MCT 只给积分收敛",
        "假设强度：MCT 要单调 + 非负，DCT 要盖子但不要单调、不要非负 —— 两者**互不包含**",
        "共同祖先是 Fatou：推导链 A1.4 下连续性 ⟹ MCT ⟹ Fatou ⟹ DCT",
        "分工一句话：**单调锁方向、盖子锁高度，锁的都是'质量不许逃'**",
        "选择判据：序列单调且非负 ⟹ 用 MCT（假设最弱，允许 ∞）；不单调但能找到盖子 ⟹ 用 DCT（结论最强，给 L^1）；两者都不满足 ⟹ 只能要 Fatou 的单边不等式"
      ],
      "tex_ref": null,
      "fill_hint": "与 general.compare **互补不重复**：那条是三定理总表，这条专写 MCT/DCT 的蕴含方向。必须写明'g = f'这个构造，以及 DCT 为什么覆盖不了 ∞ = ∞",
      "content": null,
      "links": ["A1.4"],
      "status": "seed"
    },
    {
      "id": "A1.3:dct.leibniz",
      "type": "application",
      "subject": "dct",
      "title": "参数微分交换（Leibniz 法则）：DCT 在 CG 的最短路径",
      "keywords": [
        "条件三条：①对每个 t，x ↦ f(t,x) 可积 ②t ↦ f(t,x) 对每个 x 可微 ③**存在 g(x) ∈ L^1 使 |∂_t f(t,x)| <= g(x) 在 t 的邻域内一致成立**",
        "结论：d/dt ∫f(t,x) dx = ∫∂_t f(t,x) dx",
        "证法：差商 [f(t+h,x) − f(t,x)]/h → ∂_t f(t,x)，由 MVT 得 |差商| <= sup_{|s−t|<δ}|∂_s f(s,x)| <= g(x)，套 DCT",
        "**条件③的'一致'二字不可省**：g 不能依赖 t，否则差商的支配随 h 变化，DCT 不适用（与 dct.unif-in-n 是同一个量词陷阱）",
        "CG 落点：**可微渲染**（Mitsuba 3、nvdiffrast 一类）对渲染方程的参数求导，本质就是这个交换 —— 几何/材质参数 t 穿过积分号",
        "失效场景：被积函数含 1/cosθ 型奇点或 δ 分布（点光源）时，∂_t f 常常找不到可积盖子 ⟹ 需要正则化或改用重参数化技巧（reparameterization / path-space 求导）",
        "同族结果：Fubini–Tonelli 交换积分顺序、级数逐项积分（mct.series）、Fourier 变换的微分 —— 都是'极限穿过积分号'的变体"
      ],
      "tex_ref": null,
      "fill_hint": "**这条要写全，它是 A1.3 到 CG 的最短路径**。三个条件逐条列出，证法用 MVT + DCT 两步。失效场景那段（1/cosθ、δ 分布）与 H4 蒙特卡洛积分呼应，但不要展开成渲染教程",
      "content": null,
      "links": ["H4"],
      "status": "seed"
    }
  ]
}

```

---

以上为全部规格与参考。接下来是你的生成单元。

# 你的生成单元
