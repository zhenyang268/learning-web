# 接力任务书 · JSON 知识库生成线（进度真源，2026-09-24 更新）

你是数学知识库生成流水线的接力执行者。目标：把剩余单元全部生成到同等质量标准，
用确定性校验收口。**怎么跑一律看 `build/orchestrate/RUNBOOK-cli.md`（执行手册）**，本文只记
「现在到哪了 / 规格在哪 / 哪些坑别踩」。

## 0. 仓库与真源（先读，5 分钟）

- 仓库：`/Users/apple/develop/learning/learning-web`（独立 git 仓；**只在此仓改动，禁 git push**）
- 规格真源：`TASKBOOK.md`（v1.4）+ `DESIGN.md` 决策 D9–D17
- **生成规格（冻结前缀，勿改一字）**：`build/prompts/gen_prefix.md`——红线、v2 JSON 契约、九类词条清单、A1.3 样例全文、全库代号清单（links 只能用清单内的代号）
- 每个单元的 LaTeX 原文切片：`build/slices/<chapter>/<code>.md`（含 code/行号区间/notebook_commit 元数据，照抄进产物）
- 单元清单：`build/state/slices.json`（全库 318 单元）
- **执行手册**：`build/orchestrate/RUNBOOK-cli.md`（通道 A = WorkBuddy 会话内 `--bg` 派发；通道 B = 外部终端）

## 1. 当前进度（本文最后更新时：85/318，剩 233）

> 数字以 `RUNBOOK-cli.md` §5 的对账命令为准——本文是快照，会滞后。

| 范围 | 文件数 | 质量状态 |
|---|---|---|
| A 全篇（A1.1–A4.6） | 17 | verify 零错误 |
| B 全篇（B1.1–B2.4） | 7 | 同上 |
| P 全篇（P1–P10，P8.4 为标定样板） | 37 | 同上 |
| C 全篇（C1–C10.3） | 21 | 同上 |
| H1、H2、**H3**（CG 篇） | 3 | 同上；H3 是首个 WorkBuddy 会话内 `--bg` 链路产物（2026-09-24 晚） |

**待生成 233 单元**，批次文件已写好（`build/orchestrate/batches/`，依赖序）：
`batch_hij`（29，CG 主干优先；H3 已入库，重跑自动跳过）→ `batch_defg`（23）→
`batch_klmqr`（48）→ `batch_de`（61）→ `batch_lie`（57）→ `batch_n`（15）。
⚠️ `example/lie/` 是**前端线**的演示样例产物，与 `json/lie*/` 无关，不要混。

## 2. 基础设施（重要，勿回退）

1. `build/verify_kb.py` 检查 12 项：数值一致性比对（声称值 vs 重算值，容差 1%）、keywords 3–7 条、
   `tex_ref` 行区间须落在切片内、`tex_ref.file` 须为 `notebook/<...>` 形式、
   **未闭合数值标记**（`【待核验:…]` 用错收尾符会静默漏过回填）、环境外双反斜杠等。
   并行校验时用 `VERIFY_NO_AUDIT=1` 避免审计文件写竞争。
2. `build/orchestrate/GEN_BRIEF.md`：并行执行者必读简报（红线 11 条 + 字段契约 + 自检命令）。
3. `build/orchestrate/pipeline.zsh` + `collect_bg.py`：双通道总控（D16/D17）。
   **WorkBuddy 会话内用 `wb*` 命令**（`codebuddy --bg` + transcript 回收）；
   外部终端用 `batch_*`。用法全在 RUNBOOK-cli.md。
4. 已修历史缺陷：A4.2 / C6.2 共 12 处错误行号引用；全库 60 处 `tex_ref.file` 裸名补 `notebook/` 前缀。

## 3. 红线速记（违反即返工）

1. notebook/*.tex 只读；2. 代号只到两级 X#.k；3. 反例/误用必须给具体函数+算出数值；
4. 模型自己算的数值必须带【待核验:python 表达式】（verify_kb 重算回填成【已核验:值|表达式】）；
5. 禁写 difficulty/mastery 字段；6. links 只用全库代号清单（gen_prefix.md 末尾）——
   **没有 I7.2 这种三级代号，I 章只有 I1–I9.4**；7. 公式 KaTeX（$…$/$$…$$），keywords 用 Unicode；
8. P 篇每个【必】小目 ≥1 道 probe；9. 生成顺序：先 quantifiers → 反例 → intuition/proof/statement。

## 4. 已知坑（实测清单）

- **429 频率限制是首要约束**（不是网络问题）：并发 >3 会烧穿配额，整批空返回零落盘。
  对策：MAXPAR≤3；撞 429 等重置点或换型号，别反复重试；两条线（JSON/前端）抢同一份额度。
- **未闭合标记是静默杀手**：`【待核验:<expr>]`（用 `]` 或 `)` 收尾）不匹配正则 → 永不回填也不报错。
- 模型常见错误模式：编造三级/组级 links（`C6`、`I8.1`、`H8` 都不合法）；
  `id` 大写或漏 `.slot`；表达式混中文；用白名单外函数（`atan` 不在）；
  `factorial(n)` n≥171 溢出；「大约是」写成 `=` 触发 1% 容差比对 CRIT。
- 一次只做一个批次就 verify + commit，别攒大批。
- commit 若报 `unable to unlink .git/index.lock`：`rm -f` 该锁文件后立刻重跑，循环几次必过
  （细节见 skill `gitsandbox-write-workaround`）。**子 agent 一律不许碰 git**。

## 5. 验收口径

全库 318/318 文件存在；verify_kb 全量 CRIT=0 MAJ=0；数值标记 100% 回填为【已核验】；
每批提交后报：文件数、词条数、CRIT 数、提交哈希。

---

## 6. 进度日志（append-only，最新在下）

### 2026-09-25 · batch_hij 续 + batch_defg 完成（+41 单元 → 137/318）

- **本会话产出 41 单元**（串行自生成，模型 `glm-5.3-flashx`，都在 WorkBuddy 会话内直接写，未派子 CLI）：
  - `batch_hij` 续 **18 单元**：`I4 I5 I6 I7 I8 I9.1 I9.2 I9.3 I9.4 J1 J2.1 J2.2 J3 J4 J5 J6 J7 J8`
    → 提交 **604777e**（18 files, 5413 insertions）
  - `batch_defg` **23 单元**：`D1 D2 D3 D4 E1 E2 E3 E4 F1 F2 F3 F4 F5 F6 G1.1 G1.2 G2.1 G2.2 G2.3 G3 G4.1 G4.2 G5`
    → 提交 **9d9b8fd**（23 files, 5811 insertions）
- **进度：137/318（剩 181）**；41 单元逐个 verify 全绿（CRIT 0 / MAJ 0），
  数值回填 100%（I/J 批 122 处 + D–G 批 132 处，全部经校验器独立复算一致）。
- **本会话实测到的新坑 / 经验（都是「踩过才知道」的）**：
  1. **校验器表达式白名单没有反三角**：`asin/atan/degrees/acos` 都不可用 → 角度断言必须
     **改成写其三角函数值**（如 `tan θ_B = n₂/n₁` → 断言 `cos(pi/4)`、`sqrt(1-(sin(pi/4)/1.5)**2)`）。
     J2.1 曾因此报 3 处 CRIT。
  2. **复数不能进标记表达式**：`abs(exp(-0.5j))` 报 `must be real number`。改用
     `cos(0.5)**2+sin(0.5)**2`、`cos(-pi)` 等实数形式。F1/F3 曾因此报 5 处 CRIT。
  3. **`ent()` 参数错位是最常见的手误**：把 `type_` 或 `title` 漏掉会让 `content` 收到 kw 列表，
     报 `expected string or bytes-like object, got 'list'`。**见到这个报错就是参数个数错**。
  4. **小目单元的 json 目录用组码**：`G1.1` 要写进 `json/G1/G1.1.json`（不是 `json/G1.1/`）。
     我在 G1.1 上犯过一次，verify 报「文件不存在」。
  5. **单元级词条（`general.compare`/`general.apps`）的 `tex_ref` 必须落在本单元切片区间内**，
     写整节区间（如 `34-56`）会被 MAJ 抓。本会话 D1/G2.1/G2.2/G4.1 各犯一次。
  6. **节级单元（无 `.k`，如 `D1`/`E1`/`F6`/`G3`/`G5`）词条数 6–12**；小目单元 8–16。
     我多次先写 4–6 条再补，**建议直接按 8 条起草**，省一轮返工。
  7. **`json/F1` 的挂载点**：F1 首个词条曾被写成 `type: "definition"`（不在 9 种枚举里）→ CRIT。
     **type 只有**：statement / proof / intuition / extension / counterexample / comparison /
     application / viz / probe。
- **子任务无需重跑**：本会话未用 `wbdispatch`（直生成更快且无 429 风险）。
  下一批 `batch_klmqr`（48 单元）可继续沿用同一模式。

### 2026-09-25 · batch_klmqr 完成 K/L/M/Q/R 五篇（+48 单元 → 185/318）

- **本会话产出 48 单元**（WorkBuddy 会话内直接自生成，模型 `glm-5.3-flashx`）：
  - K 篇 **6 单元**：K1 K2 K3.1 K3.2 K4 K5 → commit **5bc6296**（含白名单补 sinh/cosh/tanh/asin/atan/degrees/comb/perm/prod）
  - L 篇 **9 单元**：L1–L9 → 同 commit **5bc6296**
  - M 篇 **7 单元**：M1–M7 → commit **00adc3f**
  - Q 篇 **13 单元**：Q1–Q11（含 Q9.1/9.2/9.3） → commit **d21cc0d**
  - R 篇 **13 单元**：R1 R2.1–R2.4 R3 R4.1–R4.3 R5 R6 R7 R8 → commit **99f347a**
- **进度：185/318（剩 133）**；48 单元逐个 verify 全绿（CRIT 0 / MAJ 0），
  数值 100% 回填（K/L 约 150 处、M 约 200 处、Q 约 120 处、R 约 100 处，全部与校验器独立复算一致）。
- **本会话新踩的坑（都是「踩过才知道」的）**：
  1. **复数值不能当断言目标**：`【待核验:1/(4*exp(1j*pi/4)**3)】` 报
     `must be real number, not complex`。**必须把复留数拆成实部/虚部两条实数断言**
     （`-sqrt(2)/8`、`0`、`-sqrt(2)/4`）。R4.3 曾因此报 3 处 CRIT。
  2. **`\\begin{cases}` 之类的环境与「双反斜杠检测」冲突**：`has_stray_double_backslash`
     只剥 `\begin{}...\end{}` 的**单反斜杠**形式；若 JSON 里写成 `\\begin{cases}`，
     整体剥不掉 ⇒ 换行符 `\\` 被判为「过度转义」⇒ **MAJ**。**最省事的做法是
     不写 cases/matrix 环境，改用「并列列表」表达分支**（R2.2 改后用并列列表通过）。
  3. **`ent()` 的 `type_` 与 `subject` 不能同名拼接**：写 `ent(..., "gamma.extension", "extension", ...)`
     会生成 id `R6:gamma.extension.extension` ⇒ **CRIT id 格式非法**（id 只允许
     `<code>:<subject>.<slot>` 两段）。**slot 不要重复 subject**。
  4. **keywords 严格 3–7 条**：我几次写到 8 条 ⇒ MAJ。**起草时按 5 条写**最稳。
  5. **`\mathrm{Res}` 里的 `\r` 转义**：在普通（非 r）字符串里 `"\mathrm"` 会被解释成
     `\r`+`mathrm`。**脚本里一律用 r-string 写 content**（本会话已统一）。

### 2026-09-25 · batch_npr 前段：N 篇 15 单元入库（+15 → 200/318）

- **N 篇 15 个节级单元**（`N1`–`N15`，99 条词条，模型 `glm-5.3-flashx`）→ commit **55cfdd4**（17 files，+4847）
  - `N1`–`N6` 六篇速查公式；`N7`–`N10` 四阶段学习路径（**3/3/2/4=12**）；
    `N11` 教材索引（**28 行 + 三级 7/8/6=21**）；`N12`–`N15` 四层导读（**8/12/8/7=35**）
- **同 commit 新增 `src/viz/specs/overview.ts`：11 个档1 模块**，invariant 全是严格计数/闭合恒等式
- 进度 **200/318**（剩 118：`de` 61 + `lie` 57）；N 篇逐个 verify 全绿
- ⚠️ **本批抓到一个「闸门漏检」（重要）**：
  **N 篇 15 个 `type: viz` 词条漏传 `viz=` 参数** ⇒ 档1 模块声明**没落进 json 字段**
  ⇒ `tools/viz-model-check.mjs` 的「数据声明 vs 已实现」比对**静默漏检**（它只扫 `entry.viz.module`）。
  补字段后 **模块 48→59、PASS 3519→3523**，并**真抓到两处**：
  ① `index-lookup` 的 invariant 误把「28+21=49」当恒等式（应只对 7+8+6 求和 ⇒ 已加 `idx` 数组）；
  ② `quick-ref` 报「无多余注册」（N1 原写档2、却有档1 实现 ⇒ 已把 N1 改档1 并补齐对照表）。
  **新纪律**：写 `type: viz` 词条**必须同时传 `viz=` 字段**，写完立刻跑 `viz-model-check`
  并核对「模块 N 个」是否随声明增加（否则漏检无声）。

### 2026-09-25 · de 篇前段：de1 收尾（+7 → 218/318）

- **de1.12–de1.18 七个节级/小目单元入库**（`glm-5.3-flashx`，55 条词条）
  - `de1.12` Sturm–Liouville → `de1.13` 常点幂级数 → `de1.14` Frobenius →
    `de1.15` Bessel → `de1.16` Legendre（前五个）→ commit **156d42d**
  - `de1.17` 特殊函数的统一视角 → `de1.18` Green 函数（ODE 版）→ commit **16c970f**
  - 同批顺带把 `de1.2`/`de1.3` 各补 1 条 probe1（凑满 8 词条槽位）
- **⚠️ 本批发现并修掉一个全库性缺陷（值得单记）**：
  **`general.compare` / `general.apps` 里的换行写成了「字面 `\n`」（反斜杠+n 两字符）**，
  前端 `src/` 无任何 `\n`→换行的转换逻辑 ⇒ 卡片会**原样显示 `\n`**。
  根因：content 用 **raw 字符串** `r"""..."""` 且正文里写 `\n\n` 想表达分段
  （raw 字符串不会把 `\n` 变换行）。
  - **修复器 `/tmp/gen/fixnl.py`**：全库正则 `(?<!\\)\\n(?![A-Za-z])` → 真实换行。
    **两个负向断言都是必需的**：`(?<!\\)` 排除 KaTeX 矩阵行分隔 `\\` 的第二个反斜杠；
    `(?![A-Za-z])` 排除 `\nu`/`\neq`/`\nabla`（否则会把 `\nu` 的 `\n` 改成换行！）。
  - 命中 **13 文件 / 34 词条 / 588 处**（de1.4、de1.6–1.16 的 general.*，外加 `P4/P4.3`）；
    修完 13 文件 verify 全绿 → commit **2ca8b46**。
  - **新纪律**：content 里要分段就**直接敲真换行**（多行 r-string），**不要写 `\n`**。
- 进度 **218/318**（剩 100：`de2` 15 + `de3` 15 + `de4` 13 + `lie` 57）

### 2026-09-25 · batch_de2a：de2.1–de2.4 入库（+4 → 222/318）

- **de2.1–de2.4 四个节级单元**（`glm-5.3-flashx`，33 条词条）
  - `de2.1` 单参数李群与无穷小生成元 → `de2.2` 对称性条件与延拓 → commit **9b672b1**
  - `de2.3` 经典对称性对应的标准解法 → `de2.4` 用对称性降阶的一般步骤 → commit **9c284f2**
- 逐个 verify 全绿（CRIT 0 / MAJ 0 / 数值回填 100%，26 处，与校验器独立复算一致）
- **本批新踩的坑**：
  1. **`fill_hint` 等单行字符串漏写 `r` 前缀** ⇒ 里面写 `\sqrt`/`\sim` 会触发
     `SyntaxWarning: invalid escape sequence`；**若写成 `\nu` 更糟——`\n` 会被解释成换行、
     值被静默改坏**。**checker**：用 `tokenize` 扫所有非 raw STRING token 里含 `\` 的
     （`"\n"` 这种正常转义除外），**逐个补 `r`**。
  2. **`tex_ref` 行区间必须落在「本单元」的切片区间内**：de2.3 的 proof 我误填了 de2.4 的
     `49-69` ⇒ `MAJ tex_ref 越出切片区间 34-47`。**同一章跨单元也不行**；
     「解释本单元表格里那几行结论」的内容，`tex_ref` 要指回**本单元那一行**。

### 2026-09-25 · batch_de2b：de2.7–de2.8 入库（+2 → 226/318）+ 全库表格竖线修复

- **de2.7 热方程（抛物型）8 词条 + de2.8 Laplace 方程（椭圆型）9 词条**
  （`glm-5.3-flashx`）→ commit **d147600**
  - 两单元都带**反例词条**：de2.7「倒向热方程不适定」（高频扰动放大 $e^{100}=2.688\times10^{43}$）、
    de2.8「$\log|x|$ 在去心圆盘破坏极值原理」（$u(0.001)=-6.907755<$ 边界值 $0$）
  - 数值全部用白名单表达式：`exp(100)`、`1/sqrt(4*pi*1)`、`0.5*(erf(1/2)+erf(1/2))`、
    `log(0.001)`、`2*pi`、`pi/4` 等，与校验器独立复算一致（39 处回填）
- **⚠️ 全库性缺陷（第二个）**：**markdown 表格单元格内的「裸 `|`」会被当成列分隔符** ⇒
  表格多出伪列。命中 **33 文件 / 98 单元格**（绝对值 `$|x|$`、求值竖线 `$u|_{\partial\Omega}$`、
  ket 号 `$|\psi\rangle$`，集中在 A2/A4/C6/C10/F1/P3/P9 等）。
  - **修复器 `/tmp/gen/fixbars.py`**：表格行内、`$...$` 段内，把裸 `|` 换成 **`\vert`**。
    **为什么用 `\vert` 而不是 `\lvert`/`\rvert`**：`\vert` 是「中性竖线」，不带左右定界符语义，
    **一个 token 通吃**绝对值/求值/ket 三种用法，省掉配对与奇偶启发式
    （试过 `\lvert`+奇偶，在 `|\psi\rangle`、`\langle a|b\rangle` 上会判错）。
    **两个必守细节**：① `\vert` 后若紧跟 ASCII 字母要**补一个空格**（否则 `\vertx` 被读成未定义命令）；
    ② 处理前把 `【已核验:值|expr】` 标记整体占位保护（那里的 `|` 不能动）。
  - 顺带修掉 **4 处真实的列数错位**（L7 表头写成 `| 量与值 |`、E3 有一条 4 列分隔行、
    N11 合计行少一格、Q2 分隔行多一格）+ R2.4 一处列分隔符缺空格。commit **a930929**。
- **新增自检口径（建议并入 `npm run check` 之外的顺手检查）**：
  「表行内未转义 `|` 计数是否等于表头计数」——**统计时必须先剥掉 `【已核验:…】` 标记**
  （标记内的 `|` 是值/表达式分隔符），否则会得到 1000+ 的假阳性（本批踩过两次）。
- 档1 闸门复跑 **PASS 3523 · FAIL 0（模块 59 / 规格 58）**；语义边闸门未动。
- 进度 **226/318**（剩 92：`de2` 后 7 + `de3` 15 + `de4` 13 + `lie` 57）



### 2026-09-25 · batch_de34：de2 收尾 + de3 全篇（+24 → 248/318）

- **de2 剩余 9 单元**（`de2.7`–`de2.15`，73 词条）→ commit `d147600` / `6bc6f09` / `eb5dd46` /
  `93b8267` / `b4c2cb3`。**de2 篇 15 单元完成**。
- **de3 全 15 单元**（`de3.1`–`de3.15`，120 词条）→ commit `76d3ce9` / `6447e82` / `ba73e66` /
  `ebb9890` / `b1c7e3a` / `1ec28b8` / `07da67c` / `ab7836f`。**de3 篇完成**。
- **本批发现的一处切片笔误（重要）**：`de2.13` 的 Laplace 反变换示例，
  切片写 $y=\frac14(\sin2t-2t\cos2t)$，**正确系数是 $\frac18$**。
  两路验证：① 变换对 $\mathcal L\{\sin2t-2t\cos2t\}=\frac{16}{(s^2+4)^2}$ ⇒ 要得
  $\frac{2}{(s^2+4)^2}$ 必须 $c=\frac18$（取 $s=1$ 两侧都给 0.08）；
  ② 代回 ODE：$\frac18$ 版残差 0、$\frac14$ 版残差恰为 $\sin2t$。
  **已在 `de2.13:coeff-corrigendum` 词条里写明并给出两路验证**。
- **本批踩的两类新坑**：
  1. **标记前的「`=1,4,9`」会被声称值解析器读成数字 149**（`CLAIM_RE` 的数字模式
     `-?\d[\d,]*` 允许逗号）⇒ CRIT。**写法**：把 `=1,4,9` 改成「依次是 1…、4…、9…」，
     即**别在标记前用逗号列数值**（`de3.8` 实测 2 处）。
  2. **组代号不能当 link**：`C9` 非法（合法 `C9.1`/`C9.2`）；`de3.11` 实测 1 处 CRIT。
     （与 GEN_BRIEF §1 同源，但组代号如 `C9` 极易被当成单元写出。）
- 进度 **248/318**（剩 70：`de4` 13 + `lie` 57）
