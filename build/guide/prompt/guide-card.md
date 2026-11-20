# guide-card 生成规范

## 定位
主站单元页顶部的一段教师导语，只补三件事：为什么有它、整块的一条原则、往后接到哪。
不是 talk 的搬运，不是单元正文的摘要，不是考法/坑的重复。

## 两种模式
- T（有逐单元 reading）：408、英一+数一。talk 只作脚手架，事实以 unit json + notebook 源为准。
- S（无 reading）：工程线、数学系+工程数学。从 unit json + notebook 源合成。

## JSON
{
  "schema": "guide-card/v1",
  "code": "DS02.3",
  "site": "cs408",
  "scope": "unit",
  "lead": "一句判断句，≤60 字",
  "why": [{"h": "为什么…", "p": "80–180 字"}],
  "principle": "≤80 字，可省略",
  "connect": "60–160 字，指向真实代号",
  "fixes": ["talk 的 X 改成 Y，依据 …"],
  "source": {"talk": "…", "talkSha": "…", "unit": "…", "unitSha": "…"},
  "generated": {"model": "coding-agent", "date": "YYYY-MM-DD", "reviewed": true}
}

## 内容规则
1. lead 是判断句（说差异来源/统一原则），不是定义。
2. why 2–4 条；每条 h 是「为什么…」（≤20 字）；p 只答「没有它会怎样 / 去掉哪个前提 / 代价是什么」。
3. principle 只留矩阵层那一句结论；没有就不写。
4. connect 1–3 句，只点方向；代号必须真实存在。
5. 总长 350–700 字；数学/工程数学 500–900 字，可含 1–2 个关键公式。
6. 公式用 KaTeX `$...$`；行间最多一次 `$$...$$`；禁止 `\(` `\[`、Unicode 上标（² ᵀ ᴴ）、裸 `_`。
7. 用 unit 的既有术语；符号首现给角色名，不写单字母变量。
8. 禁：定义复述、考法步骤、真题题号、选项字母、代码片段；「非常重要/高频/众所周知/显然/本导读/我们/你可能会想」。
9. 事实必须能追到 notebook 源或 unit json；talk 冲突以源为准，写 fixes。
10. 不与 unit 的 intro/考法/易错重复；重复就删。

## Mode S 额外规则（工程线 / 数学系+工程数学）
- 输入只有：unit json 的 title/src/entries/links + src.file 指向的 notebook 源（OUTLINE/NOTES/tex）。
- 先找 2–3 个「没有它时哪一步做不下去」；找不到就 skip，不用定义凑。
- 不写条目摘要、不复述 comparison 的限定词表、不写考法步骤。
- 工程线只写项目/分组层：project-chapter（NOTES 分节）默认 skip，理由写「正文是逐节教材，导学卡在项目/分组层」。
- 数学系/工程数学写章级导语，公式只留 1–2 个「why 的关键公式」，不写推导。
- source 里不要填 talk；talkSha 省略。

## 审稿（第二遍逐条打勾）
- lead 是判断句
- 每条 why 有「没有它会怎样」的对照
- 没搬矩阵/哪几格不一样/坑
- 与 unit 正文无明显重复（抽查 3 句）
- 公式能渲染，符号与 unit 一致
- connect 代号都存在
- 无禁词/单字母变量/题号
- 长度在区间
- 事实可追源；fixes 已记
