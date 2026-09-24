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

提交至 `a028eeb`；校验命令 `uv run python build/verify_kb.py`（须在 learning-web 目录，禁系统 python3）。

## 2. 待生成（254 单元，按此优先序）

1. **P 篇收尾（6 个）**：P8.4、P9.1–P9.4、P10——红难度（能量法/渐近/决策树），规格见 gen_prefix.md §4 P 篇换装；P9.2 viz 挂档2 planned-backend；P10 是节级单元（代号无 .k）挂 inequality-decision-tree viz 档1。
2. **C 篇收尾（12 个）**：C6.5、C7.1–C7.3、C8.1–C8.3、C9.1–C9.2、C10.1–C10.3（收敛层级反例博物馆/均匀可积/马尔可夫链/Itô）。
3. **H/I/J（32 个，CG 主干）**：links 指向已存在的 A/B/P 词条（蒙特卡洛→H4→P8，旋转→P5/P6）。
4. **D/E/F/G（23 个）**、**K/L/M/Q/R（44 个）**：无小目的节（D1–D4 等）以整节为单元，代号无 .k。
5. **de1–4（61 个）、lie1–3（57 个）、partN（15 个）**：切片代号已合成（de1.1、lie2.3、N1…N15），照 slices.json。

## 3. 执行方法（按单元粒度，逐个保证质量）

对每个 code：读 gen_prefix.md → 读 build/slices/<chapter>/<code>.md → 生成 `json/<chapter>/<code>.json`（v2 契约）→ `uv run python -m json.tool` 自验。每完成一章跑 `uv run python build/verify_kb.py`，CRIT 清零才继续；`uv run python build/inject_meta.py` 注入日期；git add+commit（中文短句说明做了什么；commit 若报 unable to unlink，rm -f 对应 .git/index.lock 后重试，循环几次必过）。

## 4. 红线速记（违反即返工）

1. notebook/*.tex 只读；2. 代号只到两级 X#.k；3. 反例/误用必须给具体函数+算出数值；4. 模型自己算的数值必须带【待核验:python 表达式】（verify_kb 会重算回填成【已核验:值|表达式】）；5. 禁写 difficulty/mastery 字段；6. links 只用全库代号清单（gen_prefix.md 末尾）内的代号——**没有 I7.2 这种三级代号，I 章只有 I1–I9.4**；7. 公式 KaTeX（$…$/$$…$$），keywords 用 Unicode；8. P 篇每个【必】小目 ≥1 道 probe；9. 生成顺序：先 quantifiers → 反例 → intuition/proof/statement。

## 5. 已知坑（前序实测）

- 子 agent 通道所有模型名都路由回 GLM-5.3，model 参数填什么无所谓；批量任务会撞 502/500 网关错误，重试即可，断点续跑安全（产物幂等）。
- 模型常见错误模式：编造三级 links（如 I8.1）、待核验表达式混中文（verify 会报 CRIT，把中文移到标记外即可）、id 忘写 slot（如 `P7.5:partial-vs-differentiable` 应为 `partial.misuse`）。
- 学习率建议：一次生成一个章节目录（6–12 文件）就 verify+commit，别攒大批。

## 6. 验收口径

全库 318/318 文件存在；verify_kb 全量 CRIT=0；数值标记 100% 回填为【已核验】；每批提交后报：文件数、词条数、CRIT 数、提交哈希。
