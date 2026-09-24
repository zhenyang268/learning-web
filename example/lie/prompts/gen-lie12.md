# 任务：李群笔记 → 知识卡片 JSON（起草角色，draft）

你是数学知识库的内容起草者。下面给你三部分材料：输出契约、书写规范、源笔记。
任务：按「必须覆盖的卡片清单」生成 JSON 知识卡片，内容全部来自源笔记，不得引入笔记之外的事实。

## 输出契约

只输出**一个 JSON 对象**：`{"entries": [ ...卡片... ]}`。
- 不要 markdown 围栏（不要 ```json），不要任何解释文字，JSON 之外一个字符都不要有。
- JSON 必须能被 `python -m json.tool` 解析。

每张卡片字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | kebab-case，全局唯一（清单已给定，不许改） |
| section | string | "lie1" 或 "lie2"（按内容出处） |
| type | string | 枚举：statement / intuition / comparison / application / counterexample / probe |
| title | string | 人读标题，术语首次出现附英文，如「李群（Lie group）」 |
| question | string | 一句话回答「这块知识在解决什么问题」，必填，不许留空 |
| content_html | string | 合法 HTML 片段（见书写规范），300–800 字符 |
| links | string[] | 指向清单里其他卡片的 id，1–4 个，语义相关的才挂 |
| tex_ref | string | "lieN.tex:起始行-结束行"，行号对齐源笔记的行号标注 |

## 书写规范（content_html）

允许的标签：`<p>`、`<strong>`、`<em>`、`<ul><li>`、`<table class="tbl">`（对照表）、
`<table class="mtx">`（矩阵，无边框语义）、`<div class="frm">`（行间公式块）、`<sup>`、`<sub>`。
禁止：内联样式、`<script>`、图片、外链。

公式写法：
- 符号用 Unicode：θ π ℝ ℂ ℤ ε η × · ⊕ ⊗ → ↦ ∈ ≠ ≅ ⟨⟩ ‖
- **上下标一律用 `<sup>`/`<sub>` 标签**：A<sup>T</sup>、e<sup>iθ</sup>、T<sub>e</sub>G、RP<sup>3</sup>。
  不写 LaTeX（不出现 ^ 和 $），不写 Unicode 上标字母。
- 矩阵示例：`<table class="mtx"><tr><td>cos θ</td><td>−sin θ</td></tr><tr><td>sin θ</td><td>cos θ</td></tr></table>`
- 对照表示例：`<table class="tbl"><tr><th>群</th><th>定义</th></tr><tr><td>SO(3)</td><td>R<sup>T</sup>R = I</td></tr></table>`
- 对易关系写法：[J<sub>i</sub>, J<sub>j</sub>] = ε<sub>ijk</sub>J<sub>k</sub>

语言：中文，紧凑，不注水。笔记里的表述优先直接采用。

## 硬规则

1. 所有事实、数字（维度、参数个数、系数）必须与源笔记一致，不得编造、不得扩展笔记没有的内容。
2. 反例/对照类卡片必须具体（给出具体的群、矩阵、数值），禁止「存在反例」了事。
3. question 必填且要有信息量（如「万向锁」卡的 question 不能只写「解决万向锁问题」）。
4. tex_ref 的行号必须对齐源笔记的行号标注（每行前的数字）。
5. JSON 字符串内不得出现未转义的双引号、换行请用实际换行（JSON 数组内字符串不能裸换行，长内容写在一行）。

## 必须覆盖的卡片清单（13 张，id 与 type 已定）

| id | section | type | 要覆盖的内容 |
|---|---|---|---|
| def-lie-group | lie1 | statement | 李群定义：群结构 × 光滑流形，乘法 G×G→G 与取逆 G→G 都是光滑映射；维度=流形维度 |
| classic-groups | lie1 | comparison | 经典李群 8 行表：GL(n)/SL(n)/O(n)/SO(n)/U(n)/SU(n)/Sp(n)/SE(n)，定义+维度+应用 |
| so2 | lie1 | statement | SO(2)：参数化矩阵、维度 1、拓扑 S¹、阿贝尔、同构 U(1) |
| so3 | lie1 | statement | SO(3)：定义、维度 3、拓扑 RP³、非阿贝尔、π₁(SO(3))=Z₂（2π 旋转 ≠ 恒等） |
| su2-cover | lie1 | intuition | SU(2)：元素形式（α,β，|α|²+|β|²=1）、维度 3、拓扑 S³、单连通；SU(2)→SO(3) 是 2:1 二重覆盖，核 {±I}；自旋 1/2 的物理意义（2π 变号、4π 回家） |
| cover-table | lie1 | comparison | 覆盖映射表：SO(3)/SO(2)/SO(1,3)⁺ 各自的万有覆盖群、覆盖映射、核 |
| def-lie-algebra | lie1 | statement | 李代数定义：反对称 + Jacobi 恒等式；g = T_eG（单位元处切空间），括号来自向量场对易子 |
| exp-map | lie1 | statement | 指数映射：级数定义、exp(0)=e、一参数子群、局部微分同胚、一般不满射（SL(2,ℝ)）；BCH 公式及其意义（局部乘法由括号决定） |
| so3-su2 | lie1 | comparison | so(3) 与 su(2)：so(3) 定义与 J₁ J₂ J₃ 基、su(2) 定义与 Pauli 矩阵基、各自对易关系；李代数同构但群不同构（拓扑不同：S³ vs RP³） |
| classification | lie2 | comparison | 半单分类：A_n/B_n/C_n/D_n 系列表（李代数+维度+物理）+ 例外 G₂/F₄/E₆/E₇/E₈（维度+出现场景） |
| dynkin | lie2 | statement | Dynkin 图：单根节点、边数与夹角规则（0°/60°/45°/30°）、不等长根箭头；四经典系列的图形状 |
| su2-reps | lie2 | application | su(2) 不可约表示：j → 维度 2j+1；j=0 标量、1/2 旋量（电子自旋）、1 向量（光子）、3/2 Δ 重子、2 引力子 |
| topology-table | lie2 | comparison | 基本群与物理表：S¹→Z（绕数）、SO(3)→Z₂（自旋）、SU(2)→0、U(1)→Z（磁通量子化）；高阶同伦群两例（π₃(SU(2))=Z 瞬子、π₂(S²)=Z 磁单极） |

## 源笔记（=== 分隔，每行前的数字是行号，tex_ref 对齐它）

=== 源文件 1：notebook/li/lie1.tex（带行号）===

     1	%==============================================================
     2	\section{李群的基本概念}
     3	\label{sec:lie-group}
     4	%==============================================================
     5	
     6	\subsection{定义}
     7	
     8	\textbf{李群} $G$ 是一个同时具有群结构和光滑流形结构的对象，使得群乘法 $G \times G \to G$ 和取逆 $G \to G$ 都是光滑映射。
     9	
    10	\textbf{维度：} 李群作为流形的维度。
    11	
    12	\subsection{经典李群}
    13	
    14	\begin{center}
    15	\begin{tabular}{L{2cm}L{5cm}L{1.5cm}L{4cm}}
    16	\toprule
    17	\textbf{群} & \textbf{定义} & \textbf{维度} & \textbf{应用} \\
    18	\midrule
    19	$GL(n,\mathbb{R})$ & $n\times n$ 可逆实矩阵 & $n^2$ & 一般线性变换 \\
    20	$SL(n,\mathbb{R})$ & $\det A = 1$ & $n^2 - 1$ & 保体积变换 \\
    21	$O(n)$ & $A^TA = I$ & $\frac{n(n-1)}{2}$ & 保距（含反射） \\
    22	$SO(n)$ & $A^TA = I$，$\det A = 1$ & $\frac{n(n-1)}{2}$ & 旋转 \\
    23	$U(n)$ & $A^\dagger A = I$ & $n^2$ & 量子力学 \\
    24	$SU(n)$ & $A^\dagger A = I$，$\det A = 1$ & $n^2 - 1$ & 规范场论 \\
    25	$Sp(n)$ & $A^\dagger A = I$，保辛形式 & $n(2n+1)$ & 哈密顿力学 \\
    26	$SE(n)$ & $\begin{pmatrix} R & t \\ 0 & 1 \end{pmatrix}$，$R \in SO(n)$ & $\frac{n(n+1)}{2}$ & 刚体运动 \\
    27	\bottomrule
    28	\end{tabular}
    29	\end{center}
    30	
    31	\subsection{关键低维例子}
    32	
    33	\subsubsection{$SO(2)$：平面旋转}
    34	
    35	\[
    36	SO(2) = \left\{\begin{pmatrix} \cos\theta & -\sin\theta \\ \sin\theta & \cos\theta \end{pmatrix} : \theta \in \mathbb{R}\right\}
    37	\]
    38	
    39	\begin{itemize}
    40	  \item 维度：1（一个参数 $\theta$）
    41	  \item 拓扑：$S^1$（圆）
    42	  \item 阿贝尔群（交换）
    43	  \item 同构于 $U(1)$（复数单位圆）
    44	\end{itemize}
    45	
    46	\subsubsection{$SO(3)$：三维旋转}
    47	
    48	\[
    49	SO(3) = \{R \in \mathbb{R}^{3\times 3} : R^TR = I,\; \det R = 1\}
    50	\]
    51	
    52	\begin{itemize}
    53	  \item 维度：3（三个参数，如欧拉角或轴角）
    54	  \item 拓扑：$\mathbb{RP}^3$（三维实射影空间）
    55	  \item 非阿贝尔群
    56	  \item 基本群：$\pi_1(SO(3)) = \mathbb{Z}_2$（旋转 $2\pi$ 不等于恒等！）
    57	\end{itemize}
    58	
    59	\subsubsection{$SU(2)$：自旋群}
    60	
    61	\[
    62	SU(2) = \{A \in \mathbb{C}^{2\times 2} : A^\dagger A = I,\; \det A = 1\}
    63	\]
    64	
    65	元素可以写成：
    66	\[
    67	A = \begin{pmatrix} \alpha & -\bar{\beta} \\ \beta & \bar{\alpha} \end{pmatrix}, \quad |\alpha|^2 + |\beta|^2 = 1
    68	\]
    69	
    70	\begin{itemize}
    71	  \item 维度：3
    72	  \item 拓扑：$S^3$（三维球面）
    73	  \item 单连通：$\pi_1(SU(2)) = 0$
    74	  \item 同构于单位四元数群 $\text{Sp}(1)$
    75	\end{itemize}
    76	
    77	\textbf{关键关系：} $SU(2) \xrightarrow{2:1} SO(3)$（二重覆盖）
    78	
    79	\textbf{物理意义：}
    80	\begin{itemize}
    81	  \item 电子自旋 $1/2$：旋转 $2\pi$ 后波函数变号，旋转 $4\pi$ 才回到自身
    82	  \item 这就是为什么 $SU(2)$（而非 $SO(3)$）是自旋的正确对称群
    83	\end{itemize}
    84	
    85	\subsubsection{$SE(3)$：三维刚体运动}
    86	
    87	\[
    88	SE(3) = \left\{\begin{pmatrix} R & \mathbf{t} \\ \mathbf{0}^T & 1 \end{pmatrix} : R \in SO(3),\; \mathbf{t} \in \mathbb{R}^3\right\}
    89	\]
    90	
    91	\begin{itemize}
    92	  \item 维度：6（3 旋转 + 3 平移）
    93	  \item 拓扑：$SO(3) \times \mathbb{R}^3$（作为流形）
    94	  \item 半直积结构：$SE(3) = SO(3) \ltimes \mathbb{R}^3$
    95	\end{itemize}
    96	
    97	\textbf{在 CG 中：} 刚体变换、骨骼动画、相机运动。
    98	
    99	\subsection{李群的同态与覆盖}
   100	
   101	\textbf{覆盖映射：} $\phi: \tilde{G} \to G$ 是局部同胚的满同态。
   102	
   103	\textbf{万有覆盖群：} 单连通的覆盖群。
   104	
   105	\begin{center}
   106	\begin{tabular}{L{3cm}L{3cm}L{3cm}L{4cm}}
   107	\toprule
   108	\textbf{群} & \textbf{万有覆盖} & \textbf{覆盖映射} & \textbf{核} \\
   109	\midrule
   110	$SO(3)$ & $SU(2) \cong S^3$ & 2:1 & $\{\pm I\} \cong \mathbb{Z}_2$ \\
   111	$SO(2) \cong S^1$ & $\mathbb{R}$ & $\theta \mapsto e^{i\theta}$ & $\mathbb{Z}$ \\
   112	$SO(1,3)^+$（Lorentz） & $SL(2,\mathbb{C})$ & 2:1 & $\{\pm I\}$ \\
   113	\bottomrule
   114	\end{tabular}
   115	\end{center}
   116	
   117	%==============================================================
   118	\section{李代数}
   119	\label{sec:lie-algebra}
   120	%==============================================================
   121	
   122	\subsection{定义}
   123	
   124	\textbf{李代数} $\mathfrak{g}$ 是向量空间，配备双线性运算 $[\cdot,\cdot]: \mathfrak{g} \times \mathfrak{g} \to \mathfrak{g}$（李括号），满足：
   125	\begin{enumerate}
   126	  \item 反对称：$[X, Y] = -[Y, X]$
   127	  \item Jacobi 恒等式：$[X, [Y, Z]] + [Y, [Z, X]] + [Z, [X, Y]] = 0$
   128	\end{enumerate}
   129	
   130	\textbf{李群与李代数的关系：} 李代数 $\mathfrak{g} = T_e G$（李群在单位元处的切空间），李括号来自向量场的对易子。
   131	
   132	\subsection{结构常数}
   133	
   134	选基 $\{T_a\}$，$a = 1, \ldots, \dim\mathfrak{g}$：
   135	\[
   136	[T_a, T_b] = f_{ab}^{\;\;c}\, T_c
   137	\]
   138	
   139	$f_{ab}^{\;\;c}$ 是\textbf{结构常数}，完全决定了李代数的结构。
   140	
   141	\textbf{Jacobi 恒等式的约束：}
   142	\[
   143	f_{ab}^{\;\;d}f_{dc}^{\;\;e} + f_{bc}^{\;\;d}f_{da}^{\;\;e} + f_{ca}^{\;\;d}f_{db}^{\;\;e} = 0
   144	\]
   145	
   146	\subsection{指数映射}
   147	
   148	\[
   149	\exp: \mathfrak{g} \to G, \quad X \mapsto e^X = \sum_{k=0}^{\infty} \frac{X^k}{k!}
   150	\]
   151	
   152	\textbf{性质：}
   153	\begin{itemize}
   154	  \item $\exp(0) = e$（单位元）
   155	  \item $\exp(tX)$ 是过单位元的一参数子群
   156	  \item 在单位元附近是局部微分同胚
   157	  \item 一般不是满射（如 $SL(2,\mathbb{R})$）
   158	\end{itemize}
   159	
   160	\textbf{Baker--Campbell--Hausdorff 公式：}
   161	\[
   162	\log(e^X e^Y) = X + Y + \frac{1}{2}[X,Y] + \frac{1}{12}[X,[X,Y]] - \frac{1}{12}[Y,[X,Y]] + \cdots
   163	\]
   164	
   165	\textbf{意义：} 群乘法在李代数层面由李括号完全决定（局部）。
   166	
   167	\subsection{经典李代数}
   168	
   169	\subsubsection{$\mathfrak{so}(3)$}
   170	
   171	\[
   172	\mathfrak{so}(3) = \{A \in \mathbb{R}^{3\times 3} : A^T = -A\}
   173	\]
   174	
   175	基：
   176	\[
   177	J_1 = \begin{pmatrix} 0&0&0\\0&0&-1\\0&1&0 \end{pmatrix}, \quad
   178	J_2 = \begin{pmatrix} 0&0&1\\0&0&0\\-1&0&0 \end{pmatrix}, \quad
   179	J_3 = \begin{pmatrix} 0&-1&0\\1&0&0\\0&0&0 \end{pmatrix}
   180	\]
   181	
   182	对易关系：$[J_i, J_j] = \varepsilon_{ijk}J_k$
   183	
   184	\textbf{与角动量的关系：} 量子力学中 $[\hat{L}_i, \hat{L}_j] = i\hbar\varepsilon_{ijk}\hat{L}_k$，正是 $\mathfrak{so}(3)$ 的结构（乘以 $i\hbar$）。
   185	
   186	\subsubsection{$\mathfrak{su}(2)$}
   187	
   188	\[
   189	\mathfrak{su}(2) = \{A \in \mathbb{C}^{2\times 2} : A^\dagger = -A,\; \text{tr}\,A = 0\}
   190	\]
   191	
   192	基（Pauli 矩阵除以 $2i$）：
   193	\[
   194	\sigma_1 = \begin{pmatrix}0&1\\1&0\end{pmatrix}, \quad
   195	\sigma_2 = \begin{pmatrix}0&-i\\i&0\end{pmatrix}, \quad
   196	\sigma_3 = \begin{pmatrix}1&0\\0&-1\end{pmatrix}
   197	\]
   198	
   199	$T_a = \frac{1}{2}\sigma_a$，对易关系：$[T_a, T_b] = i\varepsilon_{abc}T_c$
   200	
   201	\textbf{$\mathfrak{su}(2) \cong \mathfrak{so}(3)$}（作为李代数同构），但 $SU(2) \not\cong SO(3)$（作为群不同构，拓扑不同）。
   202	
   203	\subsubsection{$\mathfrak{so}(1,3)$：Lorentz 代数}
   204	
   205	\[
   206	\mathfrak{so}(1,3) = \{A : A^T\eta + \eta A = 0\}, \quad \eta = \text{diag}(-1,1,1,1)
   207	\]
   208	
   209	6 个生成元：3 个旋转 $J_i$ + 3 个 boost $K_i$
   210	
   211	对易关系：
   212	\begin{align*}
   213	[J_i, J_j] &= i\varepsilon_{ijk}J_k \\
   214	[J_i, K_j] &= i\varepsilon_{ijk}K_k \\
   215	[K_i, K_j] &= -i\varepsilon_{ijk}J_k
   216	\end{align*}
   217	
   218	\textbf{复化后分解：} $\mathfrak{so}(1,3)_\mathbb{C} \cong \mathfrak{su}(2)_\mathbb{C} \oplus \mathfrak{su}(2)_\mathbb{C}$
   219	
   220	令 $A_i = \frac{1}{2}(J_i + iK_i)$，$B_i = \frac{1}{2}(J_i - iK_i)$，则 $[A_i, A_j] = i\varepsilon_{ijk}A_k$，$[B_i, B_j] = i\varepsilon_{ijk}B_k$，$[A_i, B_j] = 0$。
   221	
   222	\textbf{物理意义：} 这解释了为什么粒子按 $(j_1, j_2)$ 分类（两个“自旋”量子数）：
   223	\begin{itemize}
   224	  \item $(0, 0)$：标量（Higgs）
   225	  \item $(\frac{1}{2}, 0)$：左手 Weyl 旋量
   226	  \item $(0, \frac{1}{2})$：右手 Weyl 旋量
   227	  \item $(\frac{1}{2}, \frac{1}{2})$：向量（光子）
   228	  \item $(1, 0)$ 或 $(0, 1)$：反对称张量
   229	\end{itemize}
   230	
   231	\subsubsection{$\mathfrak{su}(n)$}
   232	
   233	\[
   234	\mathfrak{su}(n) = \{A \in \mathbb{C}^{n\times n} : A^\dagger = -A,\; \text{tr}\,A = 0\}
   235	\]
   236	
   237	维度：$n^2 - 1$
   238	
   239	\begin{itemize}
   240	  \item $\mathfrak{su}(2)$：3 维，弱相互作用
   241	  \item $\mathfrak{su}(3)$：8 维，强相互作用（量子色动力学）
   242	\end{itemize}
   243	
   244	\subsection{Killing 形式与半单性}
   245	
   246	\textbf{Killing 形式：}
   247	\[
   248	B(X, Y) = \text{tr}(\text{ad}_X \circ \text{ad}_Y)
   249	\]
   250	
   251	其中 $(\text{ad}_X)(Y) = [X, Y]$。
   252	
   253	\textbf{Cartan 判据：} $\mathfrak{g}$ 半单 $\iff$ $B$ 非退化。
   254	
   255	\textbf{紧致性：} $\mathfrak{g}$ 是紧致李代数 $\iff$ $B$ 负定。
   256	
   257	\subsection{伴随表示}
   258	
   259	\textbf{伴随表示：} $\text{Ad}: G \to GL(\mathfrak{g})$，$\text{Ad}_g(X) = gXg^{-1}$
   260	
   261	\textbf{无穷小版本：} $\text{ad}: \mathfrak{g} \to \mathfrak{gl}(\mathfrak{g})$，$\text{ad}_X(Y) = [X, Y]$
   262	
   263	\textbf{在物理中：} 规范场（胶子、$W$ 玻色子）在伴随表示下变换。
=== 源文件 2：notebook/li/lie2.tex（带行号）===

     1	%==============================================================
     2	\section{李代数的分类}
     3	%==============================================================
     4	
     5	\subsection{单李代数与半单李代数}
     6	
     7	\textbf{单李代数：} 没有非平凡理想（$[I, \mathfrak{g}] \subset I$ 的子空间 $I$）。
     8	
     9	\textbf{半单李代数：} 单李代数的直和。
    10	
    11	\textbf{分类定理（Cartan--Killing）：} 复半单李代数完全由 Dynkin 图分类。
    12	
    13	\subsection{经典李代数系列}
    14	
    15	\begin{center}
    16	\begin{tabular}{L{2cm}L{3cm}L{2cm}L{5cm}}
    17	\toprule
    18	\textbf{类型} & \textbf{李代数} & \textbf{维度} & \textbf{物理} \\
    19	\midrule
    20	$A_n$ & $\mathfrak{sl}(n+1, \mathbb{C})$ & $n(n+2)$ & $SU(n+1)$：色、味对称 \\
    21	$B_n$ & $\mathfrak{so}(2n+1, \mathbb{C})$ & $n(2n+1)$ & $SO(2n+1)$：旋转 \\
    22	$C_n$ & $\mathfrak{sp}(2n, \mathbb{C})$ & $n(2n+1)$ & $Sp(n)$：辛对称 \\
    23	$D_n$ & $\mathfrak{so}(2n, \mathbb{C})$ & $n(2n-1)$ & $SO(2n)$：旋转 \\
    24	\bottomrule
    25	\end{tabular}
    26	\end{center}
    27	
    28	\subsection{例外李代数}
    29	
    30	\begin{center}
    31	\begin{tabular}{L{2cm}L{2cm}L{6cm}}
    32	\toprule
    33	\textbf{类型} & \textbf{维度} & \textbf{出现} \\
    34	\midrule
    35	$G_2$ & 14 & 八元数的自同构群；弦论 \\
    36	$F_4$ & 52 & 例外 Jordan 代数；弦论 \\
    37	$E_6$ & 78 & 大统一理论候选 \\
    38	$E_7$ & 133 & 超引力；弦论 \\
    39	$E_8$ & 248 & 弦论（$E_8 \times E_8$ 杂化弦）；凝聚态（Ising 模型） \\
    40	\bottomrule
    41	\end{tabular}
    42	\end{center}
    43	
    44	\subsection{根系与 Dynkin 图}
    45	
    46	\subsubsection{Cartan 子代数与根}
    47	
    48	\textbf{Cartan 子代数 $\mathfrak{h}$：} 极大交换子代数（所有元素可同时对角化）。
    49	
    50	\textbf{根：} $\alpha \in \mathfrak{h}^*$ 使得存在 $E_\alpha \neq 0$ 满足 $[H, E_\alpha] = \alpha(H)E_\alpha$，$\forall H \in \mathfrak{h}$。
    51	
    52	\textbf{分解：}
    53	\[
    54	\mathfrak{g} = \mathfrak{h} \oplus \bigoplus_{\alpha \in \Phi} \mathfrak{g}_\alpha
    55	\]
    56	
    57	\subsubsection{Dynkin 图}
    58	
    59	\textbf{构造规则：}
    60	\begin{itemize}
    61	  \item 每个单根画一个节点
    62	  \item 两节点间的边数由夹角决定：$0° \to 0$ 边，$60° \to 1$ 边，$45° \to 2$ 边，$30° \to 3$ 边
    63	  \item 不等长根之间加箭头（指向短根）
    64	\end{itemize}
    65	
    66	\textbf{经典系列的 Dynkin 图：}
    67	
    68	\begin{itemize}
    69	  \item $A_n$：$\circ - \circ - \circ - \cdots - \circ$（$n$ 个节点，链状）
    70	  \item $B_n$：$\circ - \circ - \cdots - \circ \Rightarrow \circ$（末端双键）
    71	  \item $C_n$：$\circ - \circ - \cdots - \circ \Leftarrow \circ$（末端双键，方向反）
    72	  \item $D_n$：$\circ - \circ - \cdots - \circ$ 末端分叉为两个节点
    73	\end{itemize}
    74	
    75	\textbf{例外系列：} $G_2$、$F_4$、$E_6$、$E_7$、$E_8$ 有特殊的 Dynkin 图。
    76	
    77	\subsection{表示论}
    78	
    79	\subsubsection{权与最高权}
    80	
    81	\textbf{权：} 表示空间中 $H \in \mathfrak{h}$ 的特征值。
    82	
    83	\textbf{最高权：} 在某个偏序下最大的权。
    84	
    85	\textbf{定理：} 不可约表示由最高权唯一确定。
    86	
    87	\subsubsection{$\mathfrak{su}(2)$ 的表示}
    88	
    89	不可约表示由非负整数/半整数 $j$ 标记，维度 $2j + 1$：
    90	\begin{itemize}
    91	  \item $j = 0$：标量（1 维）
    92	  \item $j = 1/2$：旋量（2 维）——电子自旋
    93	  \item $j = 1$：向量（3 维）——光子
    94	  \item $j = 3/2$：（4 维）——$\Delta$ 重子
    95	  \item $j = 2$：（5 维）——引力子
    96	\end{itemize}
    97	
    98	\subsubsection{$\mathfrak{su}(3)$ 的表示与粒子物理}
    99	
   100	\textbf{基本表示 $\mathbf{3}$：} 夸克（$u, d, s$）
   101	
   102	\textbf{共轭表示 $\bar{\mathbf{3}}$：} 反夸克
   103	
   104	\textbf{分解：}
   105	\[
   106	\mathbf{3} \otimes \bar{\mathbf{3}} = \mathbf{8} \oplus \mathbf{1}
   107	\]
   108	
   109	$\mathbf{8}$：8 个胶子（伴随表示）；$\mathbf{1}$：单态。
   110	
   111	\[
   112	\mathbf{3} \otimes \mathbf{3} \otimes \mathbf{3} = \mathbf{10} \oplus \mathbf{8} \oplus \mathbf{8} \oplus \mathbf{1}
   113	\]
   114	
   115	$\mathbf{10}$：重子十重态（$\Delta$、$\Sigma^*$、$\Xi^*$、$\Omega^-$）——这是盖尔曼预言 $\Omega^-$ 的基础。
   116	
   117	%==============================================================
   118	\section{拓扑结构}
   119	%==============================================================
   120	
   121	\subsection{基本群}
   122	
   123	\textbf{基本群 $\pi_1(X)$：} 闭合路径的同伦类。
   124	
   125	\begin{center}
   126	\begin{tabular}{L{3cm}L{3cm}L{5cm}}
   127	\toprule
   128	\textbf{空间} & \textbf{$\pi_1$} & \textbf{物理意义} \\
   129	\midrule
   130	$S^1$ & $\mathbb{Z}$ & 绕数（Aharonov--Bohm 效应） \\
   131	$SO(3) \cong \mathbb{RP}^3$ & $\mathbb{Z}_2$ & 自旋 $1/2$（$2\pi$ 旋转 $\neq$ 恒等） \\
   132	$SU(2) \cong S^3$ & $0$（单连通） & 万有覆盖 \\
   133	$U(1) \cong S^1$ & $\mathbb{Z}$ & 磁通量子化、涡旋 \\
   134	$SO(3,1)^+$（Lorentz） & $\mathbb{Z}_2$ & 旋量 \\
   135	\bottomrule
   136	\end{tabular}
   137	\end{center}
   138	
   139	\subsection{高阶同伦群}
   140	
   141	\textbf{$\pi_n(X)$：} $S^n \to X$ 的连续映射的同伦类。
   142	
   143	\begin{center}
   144	\begin{tabular}{L{3cm}L{3cm}L{5cm}}
   145	\toprule
   146	\textbf{同伦群} & \textbf{值} & \textbf{物理意义} \\
   147	\midrule
   148	$\pi_2(S^2)$ & $\mathbb{Z}$ & 磁单极（'t Hooft--Polyakov） \\
   149	$\pi_3(S^2)$ & $\mathbb{Z}$ & Skyrmion（核子模型） \\
   150	$\pi_3(SU(2))$ & $\mathbb{Z}$ & 瞬子（Yang--Mills） \\
   151	$\pi_3(SU(3))$ & $\mathbb{Z}$ & QCD 真空结构（$\theta$ 真空） \\
   152	$\pi_1(U(1))$ & $\mathbb{Z}$ & 涡旋（超流、超导） \\
   153	\bottomrule
   154	\end{tabular}
   155	\end{center}
   156	
   157	\subsection{纤维丛与拓扑}
   158	
   159	\textbf{主 $G$-丛：} $P \xrightarrow{\pi} M$，纤维是群 $G$。
   160	
   161	\textbf{分类：} 主 $G$-丛的同构类由 $[M, BG]$ 给出（$BG$ 是分类空间）。
   162	
   163	\textbf{特征类：}
   164	\begin{itemize}
   165	  \item $U(1)$ 丛：第一 Chern 类 $c_1 \in H^2(M, \mathbb{Z})$ → 磁通量子化
   166	  \item $SU(n)$ 丛：Chern 类 $c_k$ → 瞬子数
   167	  \item $SO(n)$ 丛：Pontryagin 类 $p_k$、Euler 类 $e$
   168	\end{itemize}
   169	
   170	\textbf{在物理中：}
   171	\begin{itemize}
   172	  \item 电磁场是 $U(1)$ 主丛上的联络
   173	  \item Yang--Mills 场是 $SU(n)$ 主丛上的联络
   174	  \item 瞬子数 = 第二 Chern 数 = $\frac{1}{8\pi^2}\int \text{tr}(F \wedge F)$
   175	\end{itemize}
   176	
   177	\subsection{de Rham 上同调}
   178	
   179	\textbf{de Rham 上同调：}
   180	\[
   181	H^k_{dR}(M) = \frac{\ker(d: \Omega^k \to \Omega^{k+1})}{\text{im}(d: \Omega^{k-1} \to \Omega^k)} = \frac{\text{闭形式}}{\text{恰当形式}}
   182	\]
   183	
   184	\textbf{物理意义：}
   185	\begin{itemize}
   186	  \item $H^2_{dR}(M) \neq 0$：存在非平凡的电磁场构型（磁单极）
   187	  \item $H^1_{dR}(M) \neq 0$：存在非平凡的矢势（Aharonov--Bohm）
   188	\end{itemize}
   189	
   190	\subsection{同调与流形}
   191	
   192	\textbf{Euler 示性数：}
   193	\[
   194	\chi(M) = \sum_{k=0}^n (-1)^k b_k
   195	\]
   196	
   197	其中 $b_k = \dim H^k(M)$ 是 Betti 数。
   198	
   199	\textbf{Gauss--Bonnet 定理：}
   200	\[
   201	\int_M K\,dA = 2\pi\chi(M)
   202	\]
   203	
   204	（$K$ 是高斯曲率，$M$ 是闭曲面）
   205	
   206	\textbf{在 CG 中：} 网格的拓扑不变量（亏格）影响参数化和网格生成。