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
