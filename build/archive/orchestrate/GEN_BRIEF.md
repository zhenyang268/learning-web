# 知识库生成 · 并行执行简报（2026-09-24）

> 本文件是 `build/orchestrate/` 下流水线的**执行者必读简报**，是 `gen_prefix.md` 的可读压缩版 + 并行作业纪律。
> 真源仍是 `TASKBOOK.md` + `DESIGN.md` D9–D16；红线与字段契约以 `build/prompts/prefix_head.md` 为准。

## 0. 仓库与方法

- 仓库：`/Users/apple/develop/learning/learning-web`（独立 git 仓）。
- 规格：`build/prompts/prefix_head.md`（红线 1–7 + entry-card/v2 字段表 + 生成清单 + viz 三档 + 书写规范）。
- 参考样例：`json/A1/A1.3.json`（v1 手写样例，学 id 命名与 keywords 风格）、**`json/P8/P8.4.json`（v2 合格样板，照它的粒度与密度写）**。
- 每个单元的 LaTeX 原文切片：`build/slices/<章节目录>/<code>.md`（如 `build/slices/C7/C7.1.md`）。
  切片头部 `file / lines / title / chapter / notebook_commit` 原样抄进产物。
- 建议写法：写一个临时 Python 脚本（放 `/tmp/`），用 **raw 字符串** `r"""..."""` 装 `content`，
  `json.dumps(doc, ensure_ascii=False, indent=2)` 落盘。**这样完全不碰 JSON 反斜杠转义问题。**
  每写完一个单元立刻校验（见 §3）。

## 1. links 只能引用全库代号清单

```bash
cd /Users/apple/develop/learning/learning-web && uv run python -c "import json;print('\n'.join(u['code'] for u in json.load(open('build/state/slices.json'))['units']))"
```

**组代号未必是单元代号**：`C6` 不合法（合法的是 `C6.1`–`C6.5`），`I8.1` 不合法（I 章只有 `I1`–`I9.4`）。
只用清单里逐行出现的字符串。跨章引用时先确认目标单元确实存在。

## 2. 硬性红线（违反即返工）

1. 切片是唯一内容来源；不得虚构切片没有的定理。扩展背景允许，但 `title` 必须用「拓展：」前缀。
2. 章节代号只到两级（`A1.3` 合法，`A1.3.2` 非法）。
3. 反例/误用**必须给具体函数或具体数列**，并算出失效的**具体数值**。禁止只写「存在反例」。
4. **数值待核验机制**：`content` 里凡是你自己算出（不是切片逐字抄来）的数值断言，
   必须紧跟 `【待核验:<python 表达式>】`。例：
   `= 0.00829596【待核验:abs(factorial(10)-sqrt(2*pi*10)*(10/e)^10)/factorial(10)】`
   - 可用名字：`sum range abs min max int float round len sorted enumerate zip all any
     sqrt pi e exp log log2 log10 sin cos tan gamma lgamma erf erfc factorial inf`；`^` 会被换成 `**`。
   - **禁写 `math.` 前缀**：直接 `pi`、`sqrt(3)`，不要 `math.pi`、`math.sqrt(3)`（2026-09-24 H5 实测 13 处因此回填失败）。
   - **标记必须以 `】` 收尾**：写成 `]`、`))` 收尾会让标记匹配不上、静默漏回填（2026-09-24 H6.1/I3 实测）。
   - **禁止空壳标记 `【待核验】`**：没有表达式就无法重算回填；不确定怎么算就把数值断言从 keywords/content 里删掉，不要挂空标记（2026-09-24 H6.1 实测 5 处）。
   - **校验器会核对**：标记前若紧跟 `=`/`≈`/`~` 的数值，必须与重算值一致（相对容差 1%），否则报 CRIT。
     **先算准再写**，不要把「大约是」写成等号。
   - 避免溢出：`factorial(n)` 在 `n ≥ 171` 时 `OverflowError`（会被记为 CRIT）。
   - 表达式里**不许出现中文**（中文移到标记外）。
5. **禁止**写 `difficulty`、`mastery` 字段。
6. 公式用 KaTeX（行内 `$…$`、行间 `$$…$$`）；`keywords` 用短句 + Unicode 数学符号（∑ ∫ √ λ ≤ ∈ →），不用 LaTeX 包裹。
7. `keywords` 每条 3–7 条（校验器检查）。
8. `tex_ref`：`{"file": "notebook/<切片 file 字段>", "line_start": 起, "line_end": 止}`，
   **行区间必须落在该单元切片行区间内**（校验器检查）；也可写 `null`。
   **不要在 `content` 里写自己数的子区间行号**（如「切片 tex 124-125」）——极易数错且校验器抓不到。
   要写就写切片头部给出的整段区间，或干脆不写行号。
9. `content` 里不得出现 **KaTeX 环境之外的双反斜杠**（那是 JSON 过度转义；用 §0 的 Python 写法则不会发生）。
10. `status` 恒为 `"drafted"`；`generated_by` = `{"model": "<你实际使用的模型 ID>", "date": "pending", "reviewed": false}`
    （deepseek-v4.1-flash 已限额弃用；当前池：glm-5.3 / glm-5.3-flash / glm-5.3-flashx / kimi-k3-2，按派活指令填）；
    文件级 `"updated": "pending"`（由 `build/inject_meta.py` 注入日期）。
11. `id` = `"<code>:<subject>.<slot>"`，`subject` 用小写英文短横线（`mct` / `donsker` / `ui`）；
    `type` 九选一：`statement` `proof` `intuition` `extension` `counterexample` `comparison` `application` `viz` `probe`。

## 3. 自检命令（每写完一个单元必做）

```bash
cd /Users/apple/develop/learning/learning-web && VERIFY_NO_AUDIT=1 uv run python build/verify_kb.py <code>
```

反复修到 **CRIT 0 且 MAJ 0**（`VERIFY_NO_AUDIT` 只为并行时避免审计文件写竞争，不影响检查结果）。
数值标记会被回填（`【待核验:expr】` → `【已核验:值|expr】`），这是正常的设计行为，**不要手动回填，也不要删标记**。

## 4. 生成清单（结构与顺序）

对切片里每个**核心定理/技法**（一个单元通常 1–3 个）生成：

| 槽位 | type | 内容 |
|---|---|---|
| `x.quantifiers` | comparison | **灵魂词条**：四列表（Markdown）＝限定词｜去掉后的具体反例｜结论如何失效｜能否放宽 |
| 定点反例 | counterexample | quantifiers 表里每个「会失效」的行各一条：具体函数 + 完整失效计算 + 修补条件 |
| `x.statement` | statement | 精确陈述 + 成立条件 |
| `x.intuition` | intuition | 物理/结构直觉；**假设给了什么 / 结论为什么因此成立**分两段 |
| `x.proof` | proof | 分步推导骨架（每步给理由）+ 依赖链 + 易错点 |
| `x.*` | extension | 「能放宽到哪 / 为什么不能加强」，title 加「拓展：」前缀 |
| `x.application` | application | 用在哪一层 + `links` 指向被服务的章节 |
| `x.vs-y` | comparison | 与相邻定理/技法的分工与选择判据 |
| `x.probe1/2` | probe | 可算出具体数值的问句，答案数值带标记 |

再加单元级词条：`general.compare`（整单元对照表）、`general.apps`（下游清单）。

- 词条数：**小目单元 8–16 条**；**组单元**（一个 subsection 多个小目）每小目 6–10 条 + 组级 2–4 条；
  **节级单元**（代号无 `.k`，如 `D1`/`H4`/`P10`）**6–12 条**。
- **生成顺序硬性**：先 `quantifiers` → 再反例 → 最后 `intuition`/`proof`/`statement`（反例必须挂在限定词上）。

## 5. viz 三档

- **档0**（多数词条）：不写 `viz` 字段。
- **档1 前端直渲**（判据：简单显式函数、几何图像）：
  `{"module": "<小写短横线模块名>", "version": 1, "source": "frontend", "params_hint": {...}}`
- **档2 留空待接**（判据：需长时程/迭代/对拍的计算）：
  `{"status": "planned-backend", "rationale": "<一两句>", "params_hint": {...}}` —— **不写 module 等其他字段**。

已有前端模块名（可复用）：`convergence-thm` `taylor-approx` `unit-circle` `gram-schmidt` `gauss-integral`
`sum-telescoping` `inequality-decision-tree`；也允许新的小写短横线模块名。
**反例词条的 viz 要能在图上看出「失败的数值」。**

## 6. P 篇（code 以 `P` 开头）语义换装

| 通用槽位 | P 篇语义 |
|---|---|
| `x.statement` | 公式/技法本体 + 成立条件（title 写公式名） |
| `x.quantifiers` | **适用条件表**：条件｜失效的具体例子｜误用后果｜能否放宽 |
| 反例 | **典型误用**：给具体函数/级数并算出错误结果 |
| `x.intuition` | 技法的几何/结构图像 |
| `x.proof` | 推导骨架 + 易错点 |
| `x.application` | 在哪一层被用 + `links` 指向 A/C/H/I 对应章节 |

**P 篇每个【必】小目至少 1 道 probe。** 任何章节涉及标准放缩/积分技法时，`application` 的 links 必须指向对应 P 组。

## 7. 并行作业纪律（重要）

- **不要执行任何 `git` 命令**（`add`/`commit`/`push` 都不行）。总控统一提交；并行跑 git 会撞 `.git/index.lock`。
- **只写 `json/<章节目录>/<code>.json`**。不要改 `notebook/*.tex`（只读）、不要改 `build/` 下的基础设施、
  不要动别人负责的 json 文件。
- 不要删除或重写已存在的 json 文件。

## 8. 回报格式

每个 code 一行：`<code> | 词条数 | CRIT/MAJ`，最后附一段「遇到并修掉的具体错误类型」。
