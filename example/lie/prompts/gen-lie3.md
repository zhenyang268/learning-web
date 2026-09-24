# 任务：李群笔记（应用篇）→ 知识卡片 JSON（起草角色，draft）

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
| section | string | 全部填 "lie3" |
| type | string | 枚举：statement / intuition / comparison / application / counterexample / probe |
| title | string | 人读标题，术语首次出现附英文，如「四元数（quaternion）」 |
| question | string | 一句话回答「这块知识在解决什么问题」，必填，不许留空 |
| content_html | string | 合法 HTML 片段（见书写规范），300–800 字符 |
| links | string[] | 指向清单里其他卡片的 id，1–4 个，语义相关的才挂 |
| tex_ref | string | "lie3.tex:起始行-结束行"，行号对齐源笔记的行号标注 |

## 书写规范（content_html）

允许的标签：`<p>`、`<strong>`、`<em>`、`<ul><li>`、`<table class="tbl">`（对照表）、
`<table class="mtx">`（矩阵，无边框语义）、`<div class="frm">`（行间公式块）、`<sup>`、`<sub>`。
禁止：内联样式、`<script>`、图片、外链。

公式写法：
- 符号用 Unicode：θ π ω φ ℝ ℂ × · ⊕ ⊗ → ↦ ∈ ≠ ≅ ⟨⟩
- **上下标一律用 `<sup>`/`<sub>` 标签**：q<sup>−1</sup>、n<sub>x</sub>、[ω]<sub>×</sub>、S<sup>3</sup>。
  不写 LaTeX（不出现 ^ 和 $），不写 Unicode 上标字母。
- 矩阵示例：`<table class="mtx"><tr><td>R</td><td>t</td></tr><tr><td>0<sup>T</sup></td><td>1</td></tr></table>`
- 下标写法：n̂ 的分量写 n̂<sub>x</sub>i + n̂<sub>y</sub>j + n̂<sub>z</sub>k；Slerp 的分式直接用除法：sin((1−t)Ω)/sin Ω
- 语言：中文，紧凑，不注水。笔记里的表述优先直接采用。

## 硬规则

1. 所有事实、数字（参数个数、维度、系数、O(1) vs O(27) 这类复杂度对比）必须与源笔记一致，不得编造。
2. 反例/counterexample 类卡片必须给**具体的数值场景**（万向锁：指出具体哪个欧拉角组合、自由度如何丢失），禁止「存在反例」了事。
3. question 必填且要有信息量。
4. tex_ref 的行号必须对齐源笔记的行号标注（每行前的数字）。
5. JSON 字符串内不得出现未转义的双引号、字符串值内不能裸换行。

## 必须覆盖的卡片清单（11 张，id 与 type 已定）

| id | section | type | 要覆盖的内容 |
|---|---|---|---|
| rotation-reps | lie3 | comparison | 旋转的四种表示对比表：旋转矩阵 R∈SO(3)（9 参数 6 约束、无奇异）/ 欧拉角（3 参数、万向锁）/ 轴角（3 参数、θ=0 奇异）/ 四元数 q∈SU(2)（4 参数 1 约束、无奇异、插值组合）；各自应用 |
| quaternion | lie3 | statement | 四元数与 SU(2)：单位四元数 q = cos(θ/2) + sin(θ/2)(n̂ₓi + n̂ᵧj + n̂₂k)（写成 <sub> 标签形式）；旋转作用 v′ = qvq<sup>−1</sup>（v 视为纯虚四元数）；优势四条：无万向锁、组合=四元数乘法 O(1) vs 矩阵乘 O(27)、Slerp 插值自然、归一化便宜 |
| slerp | lie3 | statement | Slerp（球面线性插值）：公式 Slerp(q₀,q₁,t) = sin((1−t)Ω)/sin Ω·q₀ + sin(tΩ)/sin Ω·q₁，cos Ω = q₀·q₁；几何意义：在 S³（单位四元数空间）上沿大圆弧插值 |
| gimbal-lock | lie3 | counterexample | 万向锁（gimbal lock）：欧拉角表示在特定姿态下丢失一个自由度的具体机制——结合对照表中欧拉角「有（万向锁）」的奇异性标注，给出具体角度场景（如俯仰角 = ±90° 时第一次与第三次旋转共轴），并说明四元数为何没有此问题（4 参数 1 约束无奇异） |
| se3-screw | lie3 | statement | SE(3) 刚体运动：T 矩阵形式（R∈SO(3), t∈ℝ³）；se(3) = {[ω]ₓ, v} 形式；指数映射给出螺旋运动，V 矩阵的 closed form（V = I + (1−cos θ)/θ²·[ω]ₓ + (θ−sin θ)/θ³·[ω]ₓ²）；CG 应用：骨骼动画、相机运动、机器人学 |
| spin-projection | lie3 | intuition | 为什么自旋用 SU(2) 而非 SO(3)：π₁(SO(3)) = Z₂；SO(3) 的投影表示（允许相位）等价于 SU(2) 的普通表示；角动量代数 [L̂ᵢ,L̂ⱼ] = iħεᵢⱼₖL̂ₖ 用 <sub>/<sup> 形式；氢原子隐藏对称 SO(4) ≅ su(2)⊕su(2)（Runge–Lenz 向量），能级简并 n² |
| yang-mills | lie3 | application | 规范场论：局部规范不变 → 引入规范场（联络）→ 规范场就是力；U(1)→电磁（光子）/SU(2)→弱力（W±, Z⁰）/SU(3)→强力（8 胶子）表；标准模型 G_SM = SU(3)C×SU(2)L×U(1)Y；规范场 = 主丛上的联络 A = A_μ<sup>a</sup>T<sub>a</sub>dx<sup>μ</sup>，场强 = 曲率 F = dA + A∧A |
| noether | lie3 | application | Noether 定理与矩映射（moment map）：一参数群不变 → Q = ∂L/∂q̇·δq 守恒；矩映射 μ: g → C∞(M)；三个例子：平移→动量、旋转→角动量 L = r×p、时间平移→能量 H |
| spherical-harmonics | lie3 | application | 球谐函数 = SO(3) 第 l 个不可约表示（维度 2l+1）的基函数；旋转变换 Y_l^m(R⁻¹n̂) 用 Wigner D 矩阵展开；渲染应用：环境光照 L=2 即 9 个系数、PRT 预计算辐射传输、球面卷积定理（球谐域逐元素乘法） |
| hairy-ball | lie3 | counterexample | Hairy ball 定理：S² 上不存在处处非零的连续切向量场；CG 后果三条：球面纹理坐标必有奇点（至少一个极点）、球面向量场必有零点、地球仪地图投影必有畸变 |
| unified-table | lie3 | comparison | 统一对应表（总结）：数学↔物理↔CG↔微分方程六行——李群/对称群/变换群/对称性；李代数/守恒量代数/无穷小变换/降阶生成元；表示/粒子分类/球谐傅里叶/特征函数；指数映射/时间演化/旋转插值/矩阵指数解；覆盖群/自旋/四元数/多值解；特征类/拓扑荷/网格拓扑/指标定理 |

## 源笔记（=== 分隔，每行前的数字是行号，tex_ref 对齐它）

=== 源文件：notebook/li/lie3.tex（带行号）===

     1	%==============================================================
     2	\section{在物理学中的应用}
     3	%==============================================================
     4	
     5	\subsection{量子力学中的对称性}
     6	
     7	\subsubsection{角动量与 $\mathfrak{so}(3)$}
     8	
     9	\textbf{角动量算子满足 $\mathfrak{so}(3)$ 代数：}
    10	\[
    11	[\hat{L}_i, \hat{L}_j] = i\hbar\varepsilon_{ijk}\hat{L}_k
    12	\]
    13	
    14	\textbf{不可约表示 → 角动量量子化：}
    15	\begin{itemize}
    16	  \item $\hat{L}^2|l,m\rangle = \hbar^2 l(l+1)|l,m\rangle$
    17	  \item $\hat{L}_z|l,m\rangle = \hbar m|l,m\rangle$
    18	  \item $l = 0, 1, 2, \ldots$；$m = -l, \ldots, l$
    19	\end{itemize}
    20	
    21	\textbf{球谐函数 $Y_l^m$ 是 $SO(3)$ 的第 $l$ 个不可约表示的基函数。}
    22	
    23	\subsubsection{自旋与 $\mathfrak{su}(2)$}
    24	
    25	\textbf{自旋算子满足 $\mathfrak{su}(2)$ 代数：}
    26	\[
    27	[\hat{S}_i, \hat{S}_j] = i\hbar\varepsilon_{ijk}\hat{S}_k
    28	\]
    29	
    30	电子自旋 $s = 1/2$：$SU(2)$ 的 2 维表示。
    31	
    32	\textbf{为什么是 $SU(2)$ 而非 $SO(3)$？} 因为 $\pi_1(SO(3)) = \mathbb{Z}_2$，$SO(3)$ 的投影表示（允许相位）等价于 $SU(2)$ 的普通表示。
    33	
    34	\subsubsection{氢原子与 $SO(4)$}
    35	
    36	氢原子有隐藏对称性：除了角动量 $\mathbf{L}$，还有 Runge--Lenz 向量 $\mathbf{A}$。
    37	
    38	$\mathbf{L}$ 和 $\mathbf{A}$ 共同生成 $\mathfrak{so}(4) \cong \mathfrak{su}(2) \oplus \mathfrak{su}(2)$。
    39	
    40	\textbf{结果：} 能级 $E_n$ 的简并度是 $n^2$（而非仅 $2l+1$），这由 $SO(4)$ 的不可约表示解释。
    41	
    42	\subsection{规范场论}
    43	
    44	\subsubsection{规范对称性 → 力}
    45	
    46	\textbf{核心思想：} 要求拉格朗日量在\textbf{局部}规范变换下不变 → 必须引入规范场（联络）→ 规范场就是力。
    47	
    48	\begin{center}
    49	\begin{tabular}{L{2cm}L{3cm}L{3cm}L{4cm}}
    50	\toprule
    51	\textbf{规范群} & \textbf{规范场} & \textbf{力} & \textbf{粒子} \\
    52	\midrule
    53	$U(1)$ & $A_\mu$（1 个） & 电磁力 & 光子 \\
    54	$SU(2)$ & $W_\mu^a$（3 个） & 弱力 & $W^\pm, Z^0$ \\
    55	$SU(3)$ & $G_\mu^a$（8 个） & 强力 & 8 个胶子 \\
    56	\bottomrule
    57	\end{tabular}
    58	\end{center}
    59	
    60	\subsubsection{标准模型的群结构}
    61	
    62	\[
    63	G_{SM} = SU(3)_C \times SU(2)_L \times U(1)_Y
    64	\]
    65	
    66	\begin{itemize}
    67	  \item $SU(3)_C$：色对称（强相互作用）
    68	  \item $SU(2)_L$：弱同位旋（弱相互作用）
    69	  \item $U(1)_Y$：弱超荷
    70	\end{itemize}
    71	
    72	\textbf{电弱对称性破缺：} $SU(2)_L \times U(1)_Y \xrightarrow{\text{Higgs}} U(1)_{EM}$
    73	
    74	\subsubsection{规范场的数学结构}
    75	
    76	\textbf{规范场 = 主丛上的联络：}
    77	\[
    78	A = A_\mu^a T_a\, dx^\mu
    79	\]
    80	
    81	\textbf{场强 = 曲率：}
    82	\[
    83	F = dA + A \wedge A = \frac{1}{2}F_{\mu\nu}^a T_a\, dx^\mu \wedge dx^\nu
    84	\]
    85	
    86	\textbf{Yang--Mills 作用量：}
    87	\[
    88	S_{YM} = -\frac{1}{2}\int \text{tr}(F \wedge *F) = -\frac{1}{4}\int F_{\mu\nu}^a F^{a\mu\nu}\,d^4x
    89	\]
    90	
    91	\subsection{广义相对论与时空对称性}
    92	
    93	\textbf{时空对称群：}
    94	\begin{itemize}
    95	  \item 牛顿力学：Galilei 群（10 维）
    96	  \item 狭义相对论：Poincaré 群 $ISO(1,3)$（10 维）
    97	  \item 广义相对论：微分同胚群 $\text{Diff}(M)$（无穷维）
    98	\end{itemize}
    99	
   100	\textbf{Poincaré 群 = Lorentz 群 + 平移：}
   101	\[
   102	ISO(1,3) = SO(1,3) \ltimes \mathbb{R}^4
   103	\]
   104	
   105	\textbf{Wigner 分类：} 粒子 = Poincaré 群的不可约酉表示，由 $(m, s)$ 标记（质量、自旋）。
   106	
   107	\subsection{凝聚态物理}
   108	
   109	\begin{center}
   110	\begin{tabular}{L{4cm}L{4cm}L{4cm}}
   111	\toprule
   112	\textbf{对称性} & \textbf{破缺} & \textbf{结果} \\
   113	\midrule
   114	$U(1)$（相位） & 超导 & 磁通量子化、Josephson 效应 \\
   115	$SO(3)$（自旋） & 铁磁 & 磁畴、自旋波 \\
   116	平移对称性 & 晶体 & 声子、能带结构 \\
   117	$SU(2) \times SU(2)$ & 手征对称性破缺 & 核子质量 \\
   118	\bottomrule
   119	\end{tabular}
   120	\end{center}
   121	
   122	\textbf{Goldstone 定理：} 连续对称性自发破缺 → 无质量 Goldstone 玻色子。
   123	
   124	\textbf{Higgs 机制：} 规范对称性自发破缺 → 规范玻色子获得质量（Goldstone 玻色子被“吃掉”）。
   125	
   126	%==============================================================
   127	\section{在微分方程中的应用}
   128	%==============================================================
   129	
   130	\subsection{对称性方法求解 ODE}
   131	
   132	（详见微分方程专题第四层，此处总结要点）
   133	
   134	\begin{center}
   135	\begin{tabular}{L{4cm}L{4cm}L{4cm}}
   136	\toprule
   137	\textbf{对称性} & \textbf{生成元} & \textbf{效果} \\
   138	\midrule
   139	$x$ 平移 & $\partial_x$ & 降阶（缺 $x$） \\
   140	$y$ 平移 & $\partial_y$ & 降阶（缺 $y$） \\
   141	尺度变换 & $x\partial_x + y\partial_y$ & 齐次方程降阶 \\
   142	旋转 & $-y\partial_x + x\partial_y$ & 极坐标简化 \\
   143	\bottomrule
   144	\end{tabular}
   145	\end{center}
   146	
   147	\subsection{对称性方法求解 PDE}
   148	
   149	\textbf{热方程 $u_t = ku_{xx}$ 的对称群（6 维）：}
   150	\begin{itemize}
   151	  \item $x$ 平移：$\partial_x$
   152	  \item $t$ 平移：$\partial_t$
   153	  \item $u$ 的线性叠加：$u\partial_u$
   154	  \item 尺度：$(2t\partial_t + x\partial_x)$
   155	  \item Galilei boost：$(2kt\partial_x + xu\partial_u)$
   156	  \item 特殊共形：$(4k^2t^2\partial_t + 4ktx\partial_x + (2kt - x^2)u\partial_u)$
   157	\end{itemize}
   158	
   159	\textbf{利用对称性构造特殊解：}
   160	\begin{itemize}
   161	  \item 平移不变 → 行波解 $u = f(x - ct)$
   162	  \item 尺度不变 → 自相似解 $u = t^{-\alpha}f(x/\sqrt{t})$（热核！）
   163	  \item 旋转不变 → 径向解 $u = u(r, t)$
   164	\end{itemize}
   165	
   166	\subsection{守恒律与矩映射}
   167	
   168	\textbf{Noether 定理的李群表述：}
   169	
   170	若作用量 $S = \int L\,dt$ 在一参数群 $g_\varepsilon$ 下不变，则：
   171	\[
   172	Q = \frac{\partial L}{\partial \dot{q}} \cdot \delta q
   173	\]
   174	是守恒量。
   175	
   176	\textbf{矩映射（Moment Map）：} 将对称群的李代数映射到相空间上的守恒量：
   177	\[
   178	\mu: \mathfrak{g} \to C^\infty(M), \quad X \mapsto \mu_X
   179	\]
   180	
   181	满足 $\{\mu_X, f\} = X_M(f)$（$X_M$ 是 $X$ 在相空间 $M$ 上诱导的向量场）。
   182	
   183	\textbf{例子：}
   184	\begin{itemize}
   185	  \item 平移对称 → 动量 $p$
   186	  \item 旋转对称 → 角动量 $\mathbf{L} = \mathbf{r} \times \mathbf{p}$
   187	  \item 时间平移 → 能量 $H$
   188	\end{itemize}
   189	
   190	%==============================================================
   191	\section{在计算机图形学中的应用}
   192	%==============================================================
   193	
   194	\subsection{三维旋转与四元数}
   195	
   196	\subsubsection{旋转的多种表示}
   197	
   198	\begin{center}
   199	\begin{tabular}{L{3cm}L{3cm}L{3cm}L{3cm}}
   200	\toprule
   201	\textbf{表示} & \textbf{参数数} & \textbf{奇异性} & \textbf{应用} \\
   202	\midrule
   203	旋转矩阵 $R \in SO(3)$ & 9（6 约束） & 无 & 通用变换 \\
   204	欧拉角 & 3 & 有（万向锁） & 动画关键帧 \\
   205	轴角 $(\hat{n}, \theta)$ & 3 & $\theta = 0$ 处 & 物理模拟 \\
   206	四元数 $q \in SU(2)$ & 4（1 约束） & 无 & 插值、组合 \\
   207	\bottomrule
   208	\end{tabular}
   209	\end{center}
   210	
   211	\subsubsection{四元数与 $SU(2)$}
   212	
   213	单位四元数 $q = \cos\frac{\theta}{2} + \sin\frac{\theta}{2}(\hat{n}_x i + \hat{n}_y j + \hat{n}_z k)$
   214	
   215	\textbf{旋转作用：} $\mathbf{v}' = q\mathbf{v}q^{-1}$（将 $\mathbf{v}$ 视为纯虚四元数）
   216	
   217	\textbf{优势：}
   218	\begin{itemize}
   219	  \item 无万向锁
   220	  \item 组合旋转 = 四元数乘法（$O(1)$ vs 矩阵乘法 $O(27)$）
   221	  \item 插值自然（Slerp）
   222	  \item 归一化便宜（4 个分量）
   223	\end{itemize}
   224	
   225	\subsubsection{Slerp（球面线性插值）}
   226	
   227	\[
   228	\text{Slerp}(q_0, q_1, t) = \frac{\sin((1-t)\Omega)}{\sin\Omega}q_0 + \frac{\sin(t\Omega)}{\sin\Omega}q_1
   229	\]
   230	
   231	其中 $\cos\Omega = q_0 \cdot q_1$（四元数点积）。
   232	
   233	\textbf{几何意义：} 在 $S^3$（单位四元数空间）上沿大圆弧插值。
   234	
   235	\subsection{刚体运动与 $SE(3)$}
   236	
   237	\subsubsection{刚体变换}
   238	
   239	\[
   240	T = \begin{pmatrix} R & \mathbf{t} \\ \mathbf{0}^T & 1 \end{pmatrix} \in SE(3)
   241	\]
   242	
   243	\subsubsection{$\mathfrak{se}(3)$ 与螺旋运动}
   244	
   245	\[
   246	\mathfrak{se}(3) = \left\{\begin{pmatrix} [\omega]_\times & \mathbf{v} \\ \mathbf{0}^T & 0 \end{pmatrix} : \omega, \mathbf{v} \in \mathbb{R}^3\right\}
   247	\]
   248	
   249	\textbf{指数映射（螺旋运动）：}
   250	\[
   251	\exp\begin{pmatrix} [\omega]_\times & \mathbf{v} \\ \mathbf{0}^T & 0 \end{pmatrix} = \begin{pmatrix} e^{[\omega]_\times} & V\mathbf{v} \\ \mathbf{0}^T & 1 \end{pmatrix}
   252	\]
   253	
   254	其中 $V = I + \frac{1-\cos\theta}{\theta^2}[\omega]_\times + \frac{\theta - \sin\theta}{\theta^3}[\omega]_\times^2$。
   255	
   256	\textbf{在 CG 中：} 骨骼动画的关节变换、相机运动、机器人学。
   257	
   258	\subsection{球谐函数与 $SO(3)$ 表示}
   259	
   260	\subsubsection{球谐函数 = $SO(3)$ 的不可约表示基}
   261	
   262	$Y_l^m(\theta, \phi)$ 是 $SO(3)$ 的第 $l$ 个不可约表示（维度 $2l+1$）的基函数。
   263	
   264	\textbf{旋转下的变换：}
   265	\[
   266	Y_l^m(R^{-1}\hat{n}) = \sum_{m'=-l}^{l} D^l_{m'm}(R)\, Y_l^{m'}(\hat{n})
   267	\]
   268	
   269	$D^l_{m'm}(R)$ 是 Wigner $D$-矩阵（$(2l+1) \times (2l+1)$ 酉矩阵）。
   270	
   271	\subsubsection{在渲染中的应用}
   272	
   273	\textbf{环境光照：} 用球谐系数表示：
   274	\[
   275	L(\hat{n}) \approx \sum_{l=0}^{L}\sum_{m=-l}^{l} c_l^m Y_l^m(\hat{n})
   276	\]
   277	
   278	通常 $L = 2$（9 个系数）即可表示低频环境光。
   279	
   280	\textbf{PRT（预计算辐射传输）：} 将传输算子在球谐基上对角化，实现实时全局光照。
   281	
   282	\textbf{球面卷积：} 在球谐域变成逐元素乘法：
   283	\[
   284	\widehat{f * g}_l^m = \hat{f}_l \cdot \hat{g}_l^m
   285	\]
   286	
   287	（卷积定理的球面版本）
   288	
   289	\subsection{等变神经网络}
   290	
   291	\textbf{核心思想：} 网络层在群作用下等变：
   292	\[
   293	f(g \cdot x) = g \cdot f(x)
   294	\]
   295	
   296	\textbf{实现：} 用不可约表示的张量积构造等变层。
   297	
   298	\textbf{应用：}
   299	\begin{itemize}
   300	  \item 分子性质预测（$SE(3)$ 等变）
   301	  \item 流体模拟（旋转等变）
   302	  \item 3D 点云处理
   303	\end{itemize}
   304	
   305	\subsection{微分几何与网格处理}
   306	
   307	\subsubsection{曲面上的对称性}
   308	
   309	\textbf{等距变换群：} 保持第一基本形式不变的变换。
   310	
   311	\textbf{共形变换群：} 保持角度不变的变换（无穷维！）。
   312	
   313	\textbf{在 CG 中：}
   314	\begin{itemize}
   315	  \item 纹理映射：共形映射（保持角度）
   316	  \item 网格参数化：等距映射（保持距离）
   317	  \item 形状匹配：在对称群下不变的特征
   318	\end{itemize}
   319	
   320	\subsubsection{离散微分几何中的群结构}
   321	
   322	\textbf{离散联络：} 网格边上的旋转（$SO(3)$ 元素），描述向量沿边的平行移动。
   323	
   324	\textbf{离散曲率：} 绕顶点一圈的旋转角度亏损 = 高斯曲率的离散版本。
   325	
   326	\subsection{拓扑在 CG 中的应用}
   327	
   328	\subsubsection{网格拓扑}
   329	
   330	\textbf{Euler 公式：} $V - E + F = 2 - 2g$（$g$ 是亏格）
   331	
   332	\begin{center}
   333	\begin{tabular}{L{3cm}L{2cm}L{5cm}}
   334	\toprule
   335	\textbf{拓扑} & \textbf{亏格} & \textbf{例子} \\
   336	\midrule
   337	球面 & 0 & 封闭物体 \\
   338	环面 & 1 & 甜甜圈、手柄 \\
   339	双环面 & 2 & 眼镜框 \\
   340	\bottomrule
   341	\end{tabular}
   342	\end{center}
   343	
   344	\textbf{影响：}
   345	\begin{itemize}
   346	  \item 参数化：球面拓扑可以展开到平面（需要切割），环面可以无切割展开
   347	  \item 向量场：球面上不存在处处非零的连续切向量场（Hairy Ball 定理）
   348	  \item 网格生成：拓扑决定了网格的连接方式
   349	\end{itemize}
   350	
   351	\subsubsection{Hairy Ball 定理}
   352	
   353	$S^2$ 上不存在处处非零的连续切向量场。
   354	
   355	\textbf{在 CG 中：}
   356	\begin{itemize}
   357	  \item 球面上的纹理坐标必有奇点（至少一个极点）
   358	  \item 风向/毛发方向场在球面上必有零点
   359	  \item 这解释了为什么地球仪的地图投影必有畸变
   360	\end{itemize}
   361	
   362	\subsubsection{同调与网格分析}
   363	
   364	\textbf{Betti 数：}
   365	\begin{itemize}
   366	  \item $b_0$：连通分量数
   367	  \item $b_1$：独立环路数（“洞”的个数）
   368	  \item $b_2$：封闭腔体数
   369	\end{itemize}
   370	
   371	\textbf{在 CG 中：} 网格质量检查、拓扑简化、特征提取。
   372	
   373	%==============================================================
   374	\section{总结：李群--李代数--拓扑的统一视角}
   375	%==============================================================
   376	
   377	\subsection{三条主线的交汇}
   378	
   379	\[
   380	\boxed{
   381	\begin{aligned}
   382	&\text{李群（全局对称性）} \xleftrightarrow{\text{指数映射}} \text{李代数（无穷小对称性）} \\
   383	&\text{李群} \xleftrightarrow{\text{基本群/覆盖}} \text{拓扑（全局结构）} \\
   384	&\text{李代数} \xleftrightarrow{\text{表示论}} \text{物理（粒子/量子数）}
   385	\end{aligned}
   386	}
   387	\]
   388	
   389	\subsection{核心对应表}
   390	
   391	\begin{center}
   392	\begin{tabular}{L{3cm}L{3cm}L{3cm}L{3cm}}
   393	\toprule
   394	\textbf{数学} & \textbf{物理} & \textbf{CG} & \textbf{微分方程} \\
   395	\midrule
   396	李群 & 对称群 & 变换群 & 对称性 \\
   397	李代数 & 守恒量代数 & 无穷小变换 & 降阶生成元 \\
   398	表示 & 粒子分类 & 球谐/傅里叶 & 特征函数 \\
   399	指数映射 & 时间演化 & 旋转插值 & 矩阵指数解 \\
   400	覆盖群 & 自旋 & 四元数 & 多值解 \\
   401	特征类 & 拓扑荷 & 网格拓扑 & 指标定理 \\
   402	\bottomrule
   403	\end{tabular}
   404	\end{center}
   405	
   406	\subsection{学习路径建议}
   407	
   408	\begin{enumerate}
   409	  \item \textbf{入门：} $SO(2)$、$SO(3)$、四元数、旋转矩阵（CG 直接可用）
   410	  \item \textbf{进阶：} 李代数、指数映射、BCH 公式（物理模拟、机器人学）
   411	  \item \textbf{深入：} 表示论、球谐函数（渲染、量子力学）
   412	  \item \textbf{抽象：} 纤维丛、特征类、同伦群（规范场论、拓扑物态）
   413	\end{enumerate}
   414	
   415	\subsection{推荐参考}
   416	
   417	\begin{itemize}
   418	  \item Hall, \textit{Lie Groups, Lie Algebras, and Representations}（数学系标准教材）
   419	  \item Stillwell, \textit{Naive Lie Theory}（直观入门）
   420	  \item Georgi, \textit{Lie Algebras in Particle Physics}（物理应用）
   421	  \item Nakahara, \textit{Geometry, Topology and Physics}（拓扑与物理）
   422	  \item Crane, \textit{Discrete Differential Geometry}（CG 中的离散几何）
   423	  \item Sola et al., \textit{A micro Lie theory for state estimation in robotics}（工程应用）
   424	\end{itemize}