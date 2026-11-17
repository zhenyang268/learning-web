# importer/ —— notebook → json 的搬运线

> **一句话**：`notebook/` 是源，本目录只**读**它，写 `learning-web/` 下的六个数据根。
> 跑法：`npm run import:docs`（三条线串跑，重跑幂等）；验收：`npm run verify:docs`。
> 规则只在这里写一次，`docs/content-map.md` 讲「为什么这么分」，别处只引用。

---

## 1. 数据根与代号

| 数据根 | 来源 | 代号 |
|---|---|---|
| `json/NL01…NL18` | `math/survey`（97 条 `know`）+ `math/bridges` | `NL01.0`…，见 §3 |
| `cs408/json` | `kaoyan/syllabus/408.md` + `lectures/408/*` + `note/408/*` + `exam/真题` + `drill/408` + `quick/408-*` + `tiers.md` | `DS01.1` / `EX21.1` / `DL41.1` / `QK01.1` / `SY01.1` |
| `kaoyan/json` | 同上，取 `math1.md` + `lectures/math1/*` + `note/math1/*` + `drill/math1` + `quick/math-*` | `HS02.3` / `DM01.1` / `QK05.1` |
| `projects/json` | `projects/` 目录树 | `SO01.1` / `SO00.1` / `PX01.1` |

- **代号格式**：`<域 2 字母><章 2 位>.<单元序>`，与 `loader.ts` 的 `CODE_RE` 同源。
- 科目代码 `NET`（3 字母）在代号里收成 `NT` —— 域固定 2 字母（`SUBJECT_DOMAIN`）。
- 考点：`408-DS-0402` → `DS04.2`；`M1-HS-0203` → `HS02.3`；同章同节多 KP 按考纲顺序顺延序号。
- 章首：`.0`（`DS01.0`），承载「真题落点 / 一课位置 / 细节与陷阱」+ **本章章讲义正文**；
  不重复搬考点表（考点导航由 `meta.kps` 给出）。
- 真题 `EX<年后两位>.1`；缺图 `EX00.1`（只在 408 根，数一无真题源）。
- 拔高 `DL41.1`…（408）/ `DM01.1`…（数一）；速学 `QK01.1`–`QK07.1`；分层 `SY01.1`。
- 工程线：分组域 `SO/CP/LG/AL/EG/CG`，单列 `CS/DF/PA/DB/AI/DM`；分组自身 `<域>00.1/.2`。
- **`DM` 在 kaoyan 根与 projects 根各有一个**（数一拔高 vs 离散数学），靠**数据根隔离**成立；
  跨根合库前必须先改号。

## 2. `doc-card/v1`

外层与 `entry-card/v2` 同形（`schema/code/chapter/title/src/notebook_commit/entries`），
差别只在词条：`id` 用 `code:<slug>.sNN`，slug 固定取自 `intro/kaofa/exam/keng/intuition/body/串讲` 等类别，
**不按中文标题转写**。`type` 由标题关键词确定性映射（考法→statement、真题→probe、坑→counterexample、
思路→intuition、判据/结论→proof、其余→extension）；正文为空的小节记 `heading`，无序言标题的引言记 `introduction`。

`src.file` 一律 `notebook/…` 形式，并带 `src.sha256` 与 `notebook_commit` / `notebook_dirty`：
源改了就由 `verify_docs.py` 的「源一致性」抓出来，提示重跑导入。

**章首 `.0` 的合并契约（2026-11-18）**：`meta.lecture` 记录讲义源
（`file` / `sha256` / 保留正文的 `body_sha256` / 条目数 / 丢弃的小节），
`meta.kps` 记录本章考点的 `code/title/kp`（按现行 syllabus 生成）。
Web 只搬讲义「二、正文」与「四、易错清单」；「一、本章考点与档位」与
「三、真题落点」不搬（前者重复 syllabus，后者是旧版枚举、会与 note 落点漂移）。
章页顶部仍有 syllabus 的当前真题落点，页尾的考点导航来自 `meta.kps`。

## 3. 数值库的章映射

| 章 | survey 编号 | 单元数 |
|---|---|---|
| NL01 契约与容差 | A1–A6 + 总图(p1) + 两条轴(p12) + 覆盖自查(p11) | 9 |
| NL02 值与代数 | L1–L10 | 10 |
| NL03 稠密分解 | N1–N13 | 13 |
| NL04 复数 | C1–C6 | 6 |
| NL05 变换与级数 | H1–H11 | 11 |
| NL06 概率与特殊函数 | P1–P10 | 10 |
| NL07 微分与自动微分 | D1–D5 | 5 |
| NL08 时间积分 | D6–D8 | 3 |
| NL09 几何与李群 | G1–G10 | 10 |
| NL10 离散化 | F1–F6 | 6 |
| NL11 稀疏与迭代 | F7–F9 | 3 |
| NL12 张量 | T1–T7 | 7 |
| NL13 微分形式 | M1–M7 | 7 |
| NL14–NL18 工程切入线 | bridges BR0（含附录）/ BR1 / BR2 / BR3 / BR4 | 2+1+1+1+1 |

`know` 的六个字段 = 六个词条（`是什么/为什么需要/关键结论/判据/前置/常见误解`），
缺字段由 `verify_docs.py` 的覆盖判据兜底（编号全集 + 章节分布）。

## 4. 切分与对账

- **Markdown**：只按 `##` 切；`###` 及更深留在正文，表格 / KaTeX / Mermaid 原样。
- **LaTeX**：先插哨兵 `@@K:…@@` / `@@F:…@@`，整段转换一次，再按哨兵切开 ——
  「切开后拼回去 = 转换后全文」由构造保证；宏展开用花括号配平，不用正则。
- **对账**：MD 逐行强比对（去空行与尾空格后完全相等）；LaTeX 靠哨兵切分 + `verify_docs` 的结构/残留检查。
- **禁止 LLM 改写**：搬运就是搬运，不润色、不摘要、不补字段。

## 5. 已知源侧问题（notebook 只读，不在这里改）

| 文件 | 现象 | 处理 |
|---|---|---|
| `survey/p11-audit.tex` | 文件表写 `autodiff/jacobian.hpp`，实际是 `dual_matrix.hpp` | 以实际文件为准，记在 `content-map.json` 的 `fixups` |
| `cs408/json/OS01.1` 旧数据 | 内容实为 `408-OS-0201` | 已重建为 `OS02.1`（导入期修正） |
| `kaoyan/note/408/net/408-NET-0201` | `## 考法` 下直接跟同级 `## 题`，形成空小节 | 记 `heading` 词条，不伪造正文 |
| `kaoyan/drill/408/41-树与图手算.md` | `\bmod` 的 `\b` 是**退格控制字符**（U+0008，2 处），KaTeX 直接失败 | 导入期还原成 `\bmod`（`common._FIXUPS` 的 `backspace-mod`，逐条计数） |
| `kaoyan/note/408/co/408-CO-0401` | `**思路**` 13 处 / `**坑**` 12 处，违反「一一配对」 | 只读源，不改；已登记 `content-map.json` 的 `fixups`，等源侧补 |
