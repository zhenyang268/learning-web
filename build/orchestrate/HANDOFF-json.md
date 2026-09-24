# 接力任务书 · JSON 知识库生成线（2026-09-24 交接）

你是数学知识库生成流水线的接力执行者。前序会话已完成基础设施与 64/318 单元，你负责把剩余 254 个单元全部生成到同等质量标准，然后用确定性校验收口。

## 0. 仓库与真源（先读，5 分钟）

- 仓库：`/Users/apple/develop/learning/learning-web`（独立 git 仓；**只在此仓改动，禁 git push**）
- 规格真源：`TASKBOOK.md`（v1.3）+ `DESIGN.md` 决策 D9–D16
- **生成规格（冻结前缀，勿改一字）**：`build/prompts/gen_prefix.md`——红线、v2 JSON 契约、九类词条清单、A1.3 样例全文、全库代号清单（links 只能用清单内的代号）
- 每个单元的 LaTeX 原文切片：`build/slices/<chapter>/<code>.md`（含 code/行号区间/notebook_commit 元数据，照抄进产物）
- 进度对账：`build/state/slices.json` 列出全库 318 单元；`json/` 下已有 64 个文件即已完成

## 1. 已完成（勿重做）

| 范围 | 文件 | 质量状态 |
|---|---|---|
| A 全篇（A1.1–A1.5, A2.1–A2.5, A3, A4.1–A4.6） | 17 文件 | verify 零错误 |
| B 全篇（B1.1–B1.3, B2.1–B2.4） | 7 文件 | 同上 |
| P1–P8.3（计算必修） | 36 文件 | 同上，数值 136 处核验回填 |
| C1–C6.4（概率论前半） | 10 文件 | 同上 |
| **P8.4、P9.1–P9.4、P10（P 篇收尾）** | **6 文件** | **同上；P8.4 为标定样板** |
| **C6.5、C7.1–C7.3、C8.1–C8.3、C9.1–C9.2、C10.1–C10.3（概率论后半）** | **12 文件** | **同上** |

**当前进度：82/318 单元（25.8%），累计 1135 词条。** 前序提交至 `a028eeb`；
接力会话提交 `233500f`（校验器加固）→ `8220e8b`（tex_ref 路径规范化）→ `f7c61a4`（P8.4 标定）
→ `395ea5b` → `5c7c29e`（波1 首批 6 单元 + `GEN_BRIEF.md`）→ `7cb2ab9`（波1 完成）。
校验命令 `uv run python build/verify_kb.py`（须在 learning-web 目录，禁系统 python3）。

### 接力会话对基础设施的改动（重要，勿回退）

1. `build/verify_kb.py` 加固，现检查 12 项。新增：**数值一致性比对**（标记前紧跟 `=`/`≈`/`~` 的声称值必须与重算值一致，容差 1%）、`keywords` 3–7 条、
   `tex_ref` 行区间须落在切片内、`tex_ref.file` 须为 `notebook/<...>` 形式、
   **未闭合数值标记**（`【待核验:…]` 用错收尾符会静默漏过回填）、环境外双反斜杠（过度转义）。
   并行校验时用 `VERIFY_NO_AUDIT=1` 避免审计文件写竞争。
2. 新增 `build/orchestrate/GEN_BRIEF.md`：**并行执行者的必读简报**（红线 11 条 + 字段契约 + 自检命令 + 禁碰 git 纪律）。派活时让执行者先读它。
3. 已修历史缺陷：A4.2 / C6.2 共 12 处错误行号引用；全库 60 处 `tex_ref.file` 裸名补 `notebook/` 前缀。


## 2. 待生成（236 单元，按此优先序）

**派活前先让执行者读 `build/orchestrate/GEN_BRIEF.md`**（红线 + 字段契约 + 自检命令 + 禁碰 git）。
建议每批 2–3 个单元：网络中断时子 agent 的成果会全部丢失，批次小 = 损失小。

1. **H/I/J（32 个，CG 主干）**：H1–H8.3（11）、I1–I9.4（12）、J1–J8（9）。
   links 指向已存在的 A/B/P/C 词条（蒙特卡洛→H4→P8.4，旋转→P5/P6，流体→I 篇）。
2. **D/E/F/G（23 个）**、**K/L/M/Q/R（48 个）**：无小目的节（D1–D4、E1–E4、F1–F6、
   G1.1–G5、K1–K5、L1–L9、M1–M7、Q1–Q11、R1–R8）以整节为单元，代号无 `.k`，词条数按**节级规格 6–12 条**。
3. **de1–4（61 个）、lie1–3（57 个）、partN（15 个）= 133 个**：切片代号已合成
   （de1.1、lie2.3、N1…N15），照 `slices.json` 取，切片在 `build/slices/de1/`、`build/slices/lie2/`、`build/slices/N1/` 等。
   ⚠️ 注意 `example/lie/` 是**前端线**的演示样例产物，与 `json/lie*/` 无关，不要混。

## 3. 执行方法（按单元粒度，逐个保证质量）

**推荐做法**：让执行者先读 `build/orchestrate/GEN_BRIEF.md`（红线 11 条 + 字段契约 + 自检命令 + 纪律），
再读该单元的切片 `build/slices/<章节目录>/<code>.md` 与样板 `json/P8/P8.4.json`，然后**写一个临时 Python 脚本**
（放 `/tmp/`，用 raw 字符串 `r"""..."""` 装 content、`json.dumps(..., ensure_ascii=False, indent=2)` 落盘）
——这样完全不碰 JSON 反斜杠转义问题。每写完一个单元立刻：

```bash
cd /Users/apple/develop/learning/learning-web && VERIFY_NO_AUDIT=1 uv run python build/verify_kb.py <code>
```

修到 CRIT 0 且 MAJ 0。总控随后 `inject_meta.py` 注日期、`git add json/ + build/` + commit
（中文短句；commit 若报 unable to unlink，`rm -f` 对应 `.git/index.lock` 后立刻重跑，循环几次必过）。
**子 agent 一律不许碰 git**——并行提交会撞 `.git/index.lock`。

## 4. 红线速记（违反即返工）

1. notebook/*.tex 只读；2. 代号只到两级 X#.k；3. 反例/误用必须给具体函数+算出数值；4. 模型自己算的数值必须带【待核验:python 表达式】（verify_kb 会重算回填成【已核验:值|表达式】）；5. 禁写 difficulty/mastery 字段；6. links 只用全库代号清单（gen_prefix.md 末尾）内的代号——**没有 I7.2 这种三级代号，I 章只有 I1–I9.4**；7. 公式 KaTeX（$…$/$$…$$），keywords 用 Unicode；8. P 篇每个【必】小目 ≥1 道 probe；9. 生成顺序：先 quantifiers → 反例 → intuition/proof/statement。

## 5. 已知坑（前序 + 接力会话实测）

- **子 agent 会整批假死**：接力会话两次在派活后全部成果丢失（子 agent 调用返回空、零文件落盘）。
  实测判据：`Bash`/`Read`/`Write` 全程正常，**只有子 agent 那条长链请求被切断** → 是模型网关而非本机网络。
  对策：**批次压到 2–3 个单元**；每批落地后立刻由总控 verify + commit（子 agent 绝不碰 git，并行会撞 index.lock）。
  已入库单元是幂等安全垫，重跑只需补缺口。
- **未闭合标记是静默杀手**：`【待核验:<expr>]`（用 `]` 或 `)` 收尾）不会被正则匹配 → 永远不回填也不报错。
  校验器已加 `BAD_MARK_RE` 检查；派活时必须在简报里点名这条。
- 模型常见错误模式（累计实测）：编造三级/组级 links（`C6`、`I8.1`、`H8` 都不是合法单元）；
  `id` 出现大写字母或漏 `.slot`（`P7.5:partial-vs-differentiable` 应为 `P7.5:partial.misuse`）；
  表达式混中文；表达式用了白名单外的名字（`atan` 不在，会求值失败）；超范围数值（`factorial(n)` 在 n≥171 溢出）。
- **声称值必须与重算值一致**：校验器会比对标记前紧跟 `=`/`≈`/`~` 的数字（容差 1%），写错立刻 CRIT。
  所以「先算准再写」，别把「大约是」写成等号。
- 一次只做一个章节目录（2–3 文件）就 verify + commit，别攒大批。

## 6. 验收口径

全库 318/318 文件存在；verify_kb 全量 CRIT=0；数值标记 100% 回填为【已核验】；每批提交后报：文件数、词条数、CRIT 数、提交哈希。
