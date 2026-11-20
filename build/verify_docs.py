#!/usr/bin/env python
"""`doc-card/v1` 的确定性校验：结构 / 覆盖 / 源一致性 / 无损。

与 `verify_kb.py`（数学 318 单元的 `entry-card/v2`）分工：
本脚本管**从 notebook 搬运来的**四个数据根 —— `json/NL*`、`cs408/json`、`kaoyan/json`、`projects/json`。
`verify_kb.py` 遇到 `doc-card/v1` 显式跳过并打印计数。

四类判据：
1. 结构：schema / 必填字段 / 代号格式 / chapter=前缀 / id 唯一且前缀一致 / level / 哨兵残留
2. 覆盖：考纲行数 = 考点单元数、note 文件一一对应、真题/拔高/速学/工程线/数值库逐项对账
3. 源一致性：`src.file` 存在且 sha256 与当前源文件一致（源改了就报，提示重跑导入）
4. 无损：Markdown 源重跑切分器，与 JSON 里的词条逐行对账

用法：
  uv run python build/verify_docs.py            # 全量
  uv run python build/verify_docs.py --quiet    # 只打结论
退出码：CRIT=0 时 0，否则 1。
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parents[1]
NB = WEB.parent / "notebook"
IMPORTER = WEB / "build" / "importer"
sys.path.insert(0, str(IMPORTER))

from common import norm, reconstruct, sha256_text, split_exam_chunks  # noqa: E402
from md_split import split_markdown  # noqa: E402

CODE_RE = re.compile(r"^[A-Z]{2}\d{2}(\.\d+)?$")
ID_RE = re.compile(r"^[A-Z]{2}\d{2}(\.\d+)?:[a-z0-9-]+\.[a-z0-9-]+$")
ROOTS = {
    "math": WEB / "json",
    "emath": WEB / "emath" / "json",
    "cs408": WEB / "cs408" / "json",
    "kaoyan": WEB / "kaoyan" / "json",
    "projects": WEB / "projects" / "json",
    "english1": WEB / "english1" / "json",
}
# 词汇闸门：大纲总量（与 `english1/words/README.md`、`kaoyan/tools/stats.py` 同一口径）
WORDS_GATE = 5530
SURVEY_SPACE = {"A": 6, "L": 10, "N": 13, "C": 6, "H": 11, "P": 10, "D": 8, "G": 10, "F": 9, "T": 7, "M": 7}

errs: list[str] = []


def crit(msg: str) -> None:
    errs.append("CRIT " + msg)


def load_docs(root: Path) -> list[tuple[Path, dict]]:
    out: list[tuple[Path, dict]] = []
    for p in sorted(root.rglob("*.json")):
        if p.name == "index.json":
            continue
        data = json.loads(p.read_text(encoding="utf-8"))
        if data.get("schema") == "doc-card/v1":
            out.append((p, data))
    return out


def check_structure(p: Path, d: dict) -> None:
    rel = p.relative_to(WEB)
    for key in ("code", "chapter", "title", "src", "notebook_commit", "entries"):
        if key not in d:
            crit(f"{rel}: 缺字段 {key}")
    code = d.get("code", "")
    if not CODE_RE.match(code):
        crit(f"{rel}: 代号不合规 {code}")
    if d.get("chapter") != code.split(".")[0]:
        crit(f"{rel}: chapter={d.get('chapter')} 与代号前缀不符")
    src = d.get("src") or {}
    if not src.get("file") or not str(src.get("file")).startswith("notebook/"):
        crit(f"{rel}: src.file 必须是 notebook/… 形式")
    entries = d.get("entries")
    if not isinstance(entries, list) or not entries:
        crit(f"{rel}: entries 为空")
        return
    seen: set[str] = set()
    for e in entries:
        eid = e.get("id", "")
        if not ID_RE.match(eid) or not eid.startswith(code + ":"):
            crit(f"{rel}: 词条 id 不合规或前缀不符：{eid}")
        if eid in seen:
            crit(f"{rel}: 词条 id 重复：{eid}")
        seen.add(eid)
        if not isinstance(e.get("level"), int) or not 0 <= e["level"] <= 4:
            crit(f"{rel}: level 非法：{e.get('level')}")
        if not isinstance(e.get("content"), str):
            crit(f"{rel}: content 非字符串：{eid}")
        elif not e["content"].strip() and e.get("type") != "heading":
            # 允许「有标题无正文」的 heading 词条（源里存在同级标题紧邻的写法）
            crit(f"{rel}: 词条内容为空：{eid}")
        blob = e.get("content", "") + e.get("title", "")
        if re.search(r"@@(K:|/K@@|F:)", blob):
            crit(f"{rel}: 哨兵残留：{eid}")
        if "\\begin{know}" in blob or "\\field{" in blob:
            crit(f"{rel}: LaTeX 结构命令残留：{eid}")


def check_source(p: Path, d: dict) -> None:
    rel = p.relative_to(WEB)
    src = NB / d["src"]["file"][len("notebook/") :]
    if not src.exists():
        crit(f"{rel}: 源文件不存在 {src}")
    else:
        digest = "sha256:" + hashlib.sha256(src.read_text(encoding="utf-8").encode("utf-8")).hexdigest()
        if digest != d["src"].get("sha256"):
            crit(f"{rel}: 源已改动（sha256 不符），重跑导入")

    # 章首单元还带一篇章讲义（2026-11-18）：`src` 仍是 syllabus，
    # 讲义源单独记在 `meta.lecture`，必须一并校验，否则讲义改了也不会报。
    lec = (d.get("meta") or {}).get("lecture")
    if not isinstance(lec, dict):
        return
    lf = lec.get("file")
    if not isinstance(lf, str) or not lf.startswith("notebook/"):
        crit(f"{rel}: meta.lecture.file 必须是 notebook/… 形式")
        return
    lp = NB / lf[len("notebook/") :]
    if not lp.exists():
        crit(f"{rel}: 讲义源不存在 {lp}")
        return
    text = lp.read_text(encoding="utf-8")
    if sha256_text(text) != lec.get("sha256"):
        crit(f"{rel}: 讲义源已改动（sha256 不符），重跑导入")
    body_sha = lec.get("body_sha256")
    if isinstance(body_sha, str) and body_sha:
        from import_kaoyan import DROPPED_LECTURE_SECTIONS  # noqa: E402

        _h1, chunks = split_markdown(text)
        kept = [
            c
            for c in chunks
            if not (c[0] == 2 and any(c[1].strip().startswith(s) for s in DROPPED_LECTURE_SECTIONS))
        ]
        body = reconstruct(
            None, [{"level": lv, "title": t, "content": c} for lv, t, c in kept]
        )
        if sha256_text(body) != body_sha:
            crit(f"{rel}: 讲义正文指纹不符（保留小节被改动或裁剪规则漂移）")


def check_lossless(p: Path, d: dict) -> None:
    """只对 Markdown 源做逐行对账；LaTeX 由「哨兵切分」在构造上保证。"""
    rel = p.relative_to(WEB)
    # 章首单元是从 syllabus 的「导语 + 细节与陷阱」拼出来的，不对应整份源文件
    if (d.get("meta") or {}).get("kind") == "chapter":
        return
    # 英语一大纲补全被拆成多段（VO97.N），单段不对应整份源；无损由
    # `check_english1_coverage` 的「按序拼回 = 源」一次性判（拆错段必然被抓）。
    if (d.get("meta") or {}).get("kind") == "english1-supplement":
        return
    # 工程线 NOTES 被拆成多页，整源对账改由 `check_project_notes_lossless` 按序拼回。
    if (d.get("meta") or {}).get("kind") == "project-chapter":
        return
    src = NB / d["src"]["file"][len("notebook/") :]
    if src.suffix != ".md" or not src.exists():
        return
    text = src.read_text(encoding="utf-8")
    try:
        h1, chunks = split_markdown(text)
    except AssertionError as exc:
        crit(f"{rel}: 重跑切分失败 {exc}")
        return
    got = reconstruct(d.get("source_h1"), d["entries"])
    want = reconstruct(
        h1,
        [{"level": lv, "title": t, "content": c} for lv, t, c in split_exam_chunks(chunks)],
    )
    if got != want:
        crit(f"{rel}: 无损对账失败（JSON 与源切分结果不一致）")


def check_project_notes_lossless() -> None:
    """工程线：同一份 NOTES 的 `.2…N` 按 `part` 拼回，必须与源切分结果逐行相等。

    拆页的判据不是「每页像一段」而是「拼回去一字不差」——拆错边界、丢 `###`、
    重复段落都会在这里被抓；`verify_docs` 的其他结构检查仍逐页跑。
    """
    sys.path.insert(0, str(IMPORTER))
    from import_projects import notes_parts  # noqa: E402

    docs = load_docs(ROOTS["projects"])
    by_src: dict[str, list[dict]] = {}
    for _, d in docs:
        meta = d.get("meta") or {}
        if meta.get("kind") != "project-chapter" or meta.get("file") != "NOTES.md":
            continue
        by_src.setdefault(d["src"]["file"], []).append(d)

    for p in sorted((NB / "projects").rglob("NOTES.md")):
        if "_archive" in p.parts:
            continue  # 归档区统一待删，不参与入库对账
        rel = "notebook/" + str(p.relative_to(NB))
        units = sorted(by_src.get(rel, []), key=lambda d: (d.get("meta") or {}).get("part", 0))
        if not units:
            crit(f"projects: NOTES 未入库 {rel}")
            continue
        text = p.read_text(encoding="utf-8")
        try:
            h1, chunks = split_markdown(text)
        except AssertionError as exc:
            crit(f"projects: NOTES 重跑切分失败 {rel}: {exc}")
            continue
        want = reconstruct(h1, [{"level": lv, "title": t, "content": c} for lv, t, c in chunks])
        got = reconstruct(
            next((u.get("source_h1") for u in units if u.get("source_h1")), None),
            [e for u in units for e in u["entries"]],
        )
        if got != want:
            crit(f"projects: NOTES 拼回失败 {rel}")
        want_parts = len(notes_parts(text))
        if len(units) != want_parts:
            crit(f"projects: {rel} 分页数 {len(units)} != 源节数 {want_parts}")


def count_kind(docs: list[tuple[Path, dict]], kind: str) -> int:
    return sum(1 for _, d in docs if (d.get("meta") or {}).get("kind") == kind)


# ------------------------------------------------------------------ 英语一：词汇对账


WORD_LIST_RE = re.compile(r"^-\s+`([^`]+)`", re.M)
WORD_TABLE_RE = re.compile(r"^\|\s*\d+\s*\|\s*`([^`]+)`", re.M)


def words_of(text: str) -> set[str]:
    """源侧取词：主题组用 `- \\`word\\``，大纲补全用 `| n | \\`word\\` |`。"""
    return {w.lower() for w in WORD_LIST_RE.findall(text)} | {w.lower() for w in WORD_TABLE_RE.findall(text)}


def entries_words(entries: list[dict]) -> set[str]:
    """JSON 侧取词：只认词条正文里的同一两种行形态，不扫标题。"""
    return words_of("\n".join(e.get("content", "") for e in entries))


def check_english1_words() -> None:
    """词汇独立对账（2026-11-16）。

    判据（每条都点名，不静默）：
    1. **逐单元集合相等**：对 `english1/words/` 的每一份源，JSON 侧取出的词集合必须与源完全相等；
       源有、JSON 无 → 漏；JSON 有、源无 → 多（编造）。
    2. **唯一词总数**：全表去重后必须 ≥ `WORDS_GATE`（5530）。
    3. **跨表重复**：主题组与补全表的交集**允许存在**（同一词在不同场景复现），但必须打印实际数量，
       且「唯一词数 = 两组之和 − 交集」，三者自洽；交集不为 0 时不做静默忽略。
    """
    src_dir = NB / "kaoyan" / "english1" / "words"
    if not src_dir.exists():
        crit("english1: 词汇源目录不存在（english1/words/）")
        return
    docs = load_docs(ROOTS["english1"])
    by_src: dict[str, list[dict]] = {}
    for _, d in docs:
        by_src.setdefault(d["src"]["file"], []).append(d)

    src_group: set[str] = set()
    src_supp: set[str] = set()
    checked = 0
    for p in sorted(src_dir.glob("[0-9][0-9]-*.md")):
        rel = "notebook/kaoyan/english1/words/" + p.name
        want = words_of(p.read_text(encoding="utf-8"))
        units = by_src.get(rel)
        if not units:
            crit(f"english1: 词汇源未入库 {p.name}")
            continue
        got: set[str] = set()
        for d in units:
            got |= entries_words(d["entries"])
        checked += 1
        missing, extra = want - got, got - want
        if missing:
            crit(f"english1/words/{p.name}: JSON 漏词 {len(missing)} 个（例 {sorted(missing)[:5]}）")
        if extra:
            crit(f"english1/words/{p.name}: JSON 多词 {len(extra)} 个（例 {sorted(extra)[:5]}）")
        if p.name.startswith("97-"):
            src_supp |= want
        else:
            src_group |= want

    json_all: set[str] = set()
    for _, d in docs:
        if (d.get("meta") or {}).get("kind") in ("english1-words", "english1-supplement"):
            json_all |= entries_words(d["entries"])

    if not json_all:
        crit("english1: 词汇 JSON 侧取不到任何词")
        return

    inter = src_group & src_supp
    union = src_group | src_supp
    if len(union) != len(src_group) + len(src_supp) - len(inter):
        crit("english1: 唯一词自洽失败（并集 ≠ 两组和 − 交集）")
    if len(union) < WORDS_GATE:
        crit(f"english1: 唯一词 {len(union)} < 闸门 {WORDS_GATE}")
    if len(json_all) != len(union):
        crit(f"english1: JSON 唯一词 {len(json_all)} ≠ 源唯一词 {len(union)}")

    # 逐源对账通过后，两边集合必须完全相等（不静默漏）
    miss, extra = union - json_all, json_all - union
    if miss:
        crit(f"english1: 源有 JSON 无的跨表漏词 {len(miss)}（例 {sorted(miss)[:5]}）")
    if extra:
        crit(f"english1: JSON 有源无的跨表多词 {len(extra)}（例 {sorted(extra)[:5]}）")

    print(
        f"english1 词汇对账：源文件 {checked} · 主题组唯一 {len(src_group)} · "
        f"补全表唯一 {len(src_supp)} · 交集 {len(inter)} · 唯一合计 {len(union)} · "
        f"JSON 唯一 {len(json_all)} · 闸门 {WORDS_GATE} {'PASS' if len(union) >= WORDS_GATE else 'FAIL'}"
    )


def check_english1_coverage() -> None:
    """英语一覆盖：单元数、分段数、源一致性、无损、代号唯一。"""
    from import_english1 import FULL_REL, GUIDE_REL, LECTURES, SYLLABUS_REL, split_supplement

    docs = load_docs(ROOTS["english1"])
    if not docs:
        crit("english1: 数据根为空")
        return
    kinds: dict[str, int] = {}
    for _, d in docs:
        k = (d.get("meta") or {}).get("kind", "?")
        kinds[k] = kinds.get(k, 0) + 1

    if kinds.get("english1-syllabus", 0) != 1:
        crit("english1: 考纲单元应为 1（GE01.1）")
    lecture_files = sorted((NB / "kaoyan" / "english1").glob("[0-9][0-9]-*.md"))
    want_lectures = len([p for p in lecture_files if not p.name.startswith("00-")])
    if kinds.get("english1-lecture", 0) != want_lectures:
        crit(f"english1: 讲义单元 {kinds.get('english1-lecture', 0)} ≠ 源 {want_lectures}")
    if len(LECTURES) != want_lectures:
        crit(f"english1: 映射表讲义 {len(LECTURES)} ≠ 源 {want_lectures}")
    if kinds.get("english1-words-guide", 0) != 1:
        crit("english1: 词汇导览单元应为 1（VO00.1）")
    groups = sorted(
        p for p in (NB / "kaoyan" / "english1" / "words").glob("[0-9][0-9]-*.md") if not p.name.startswith("97-")
    )
    if kinds.get("english1-words", 0) != len(groups):
        crit(f"english1: 词汇主题组单元 {kinds.get('english1-words', 0)} ≠ 源 {len(groups)}")
    if len(groups) != 30:
        crit(f"english1: 词汇主题组应为 30，源有 {len(groups)}")

    # 大纲补全：分段数 = 重新切分的段数（按 `##` 标题或表格块边界，绝不硬切行）
    _, chunks, info = split_supplement(FULL_REL, "VO97")
    want_seg = len(chunks)
    got_seg = kinds.get("english1-supplement", 0)
    if got_seg != want_seg:
        crit(f"english1: 大纲补全分段 {got_seg} ≠ 源切分 {want_seg}（mode={info['mode']}）")
    supp_docs = [d for _, d in docs if (d.get("meta") or {}).get("kind") == "english1-supplement"]
    codes = sorted(d["code"] for d in supp_docs)
    want_codes = sorted(f"VO97.{i}" for i in range(1, len(supp_docs) + 1))
    if codes != want_codes:
        crit(f"english1: 大纲补全代号不连续 {codes[:3]}…{codes[-3:]}")
    # 无损：把各分段按序拼回，必须等于源（归一后逐行相等）
    if supp_docs:
        got_text = "\n\n".join(
            "\n\n".join(
                (("#" * int(e.get("level", 2)) + " " + e["title"] + "\n\n" + e["content"])
                 if int(e.get("level", 2)) else e["content"])
                for e in d["entries"]
            )
            for d in supp_docs
        )
        src_text = (NB / FULL_REL).read_text(encoding="utf-8")
        # H1 只在第一段带一次，其余段不带；拼回后补回 H1 再比
        h1 = [d.get("source_h1") for d in supp_docs if d.get("source_h1")]
        joined = (f"# {h1[0]}\n\n" if h1 else "") + got_text
        if norm(joined) != norm(src_text):
            crit("english1: 大纲补全拼回与源不一致（分段切坏了）")

    # 代号唯一
    seen: dict[str, str] = {}
    for p, d in docs:
        c = d["code"]
        if c in seen:
            crit(f"english1: 代号重复 {c}（{seen[c]} 与 {p.name}）")
        seen[c] = p.name

    # 导览与考纲源文件必须存在
    for rel in (SYLLABUS_REL, GUIDE_REL, FULL_REL):
        if not (NB / rel).exists():
            crit(f"english1: 缺源 {rel}")


def check_coverage() -> None:
    sys.path.insert(0, str(IMPORTER))
    from import_kaoyan import assign_kp_codes, find_lecture, parse_syllabus  # noqa: E402

    for name, rel, book in (
        ("cs408", "kaoyan/syllabus/408.md", "408"),
        ("kaoyan", "kaoyan/syllabus/math1.md", "M1"),
    ):
        docs = load_docs(ROOTS[name])
        chapters, rows = parse_syllabus(rel)
        rows = assign_kp_codes(rows)
        got_kp = count_kind(docs, "kaoyan-kp")
        got_ch = count_kind(docs, "chapter")
        if got_kp != len(rows):
            crit(f"{name}: 考点单元 {got_kp} ≠ 考纲行 {len(rows)}")
        if got_ch != len(chapters):
            crit(f"{name}: 章首单元 {got_ch} ≠ 考纲章 {len(chapters)}")

        # 章讲义：一章一篇，既不许缺也不许多（2026-11-18 从 _archive 迁回主线）
        want_lec = {find_lecture(book, ch["code"]) for ch in chapters}
        got_lec: set[str] = set()
        for _, d in docs:
            if (d.get("meta") or {}).get("kind") != "chapter":
                continue
            lec = (d.get("meta") or {}).get("lecture")
            if not isinstance(lec, dict):
                continue
            f = lec.get("file")
            if isinstance(f, str) and f.startswith("notebook/"):
                got_lec.add(f[len("notebook/") :])
        if want_lec - got_lec:
            crit(f"{name}: 缺章讲义 {sorted(want_lec - got_lec)[:5]}")
        if got_lec - want_lec:
            crit(f"{name}: 多出章讲义 {sorted(got_lec - want_lec)[:5]}")
        dir_name = "408" if book == "408" else "math1"
        lec_base = NB / "kaoyan/lectures" / dir_name
        disk = {
            f"kaoyan/lectures/{dir_name}/{p.relative_to(lec_base)}"
            for p in lec_base.rglob("[0-9][0-9]-*.md")
        }
        if disk - want_lec:
            crit(f"{name}: 磁盘上有未入库的章讲义 {sorted(disk - want_lec)[:5]}")

        # 章首的考点导航必须是当前考纲代号/标题，不许留旧序号
        want_kps: dict[str, list[dict]] = {}
        for row in rows:
            want_kps.setdefault(row["chapter"], []).append(
                {"code": row["code"], "title": row["section"], "kp": row["kp"]}
            )
        for _, d in docs:
            if (d.get("meta") or {}).get("kind") != "chapter":
                continue
            chap = d.get("chapter", "")
            got = (d.get("meta") or {}).get("kps")
            if got != want_kps.get(chap, []):
                crit(f"{name}/{chap}.0: meta.kps 与现行考纲不一致（重跑导入）")
        # note 文件一一对应
        want_files = {(NB / "kaoyan" / r["file"]).resolve() for r in rows}
        got_files = {
            (NB / d["src"]["file"][len("notebook/") :]).resolve()
            for _, d in docs
            if (d.get("meta") or {}).get("kind") == "kaoyan-kp"
        }
        missing = want_files - got_files
        extra = got_files - want_files
        if missing:
            crit(f"{name}: {len(missing)} 个 note 文件未入库")
        if extra:
            crit(f"{name}: {len(extra)} 个入库文件不在考纲")
        if book == "408":
            exams = len(list((NB / "kaoyan/exam/真题").glob("[0-9][0-9][0-9][0-9].md")))
            if count_kind(docs, "exam") != exams:
                crit(f"408: 真题单元 {count_kind(docs, 'exam')} ≠ 源 {exams}")
            if count_kind(docs, "drill") != len(list((NB / "kaoyan/drill/408").glob("*.md"))):
                crit("408: 拔高单元数与源不符")
            if count_kind(docs, "quick") != len(list((NB / "kaoyan/quick").glob("408-*.md"))):
                crit("408: 速学单元数与源不符")
            if count_kind(docs, "tiers") != 1:
                crit("408: 缺分层表单元")
        else:
            if count_kind(docs, "drill") != len(list((NB / "kaoyan/drill/math1").glob("*.md"))):
                crit("数一: 拔高单元数与源不符")
            if count_kind(docs, "quick") != len(list((NB / "kaoyan/quick").glob("math-*.md"))):
                crit("数一: 速学单元数与源不符")
            if count_kind(docs, "tiers") != 1:
                crit("数一: 缺分层表单元")

    # 工程线
    docs = load_docs(ROOTS["projects"])
    leaves = [p for p in NB.glob("projects/*/*/OUTLINE.md") if "_archive" not in p.parts] + [
        NB / "projects" / s / "OUTLINE.md" for s in ("csapp", "cs149", "database", "ai", "discrete-math")
    ]
    leaves = [p for p in leaves if p.exists()]
    got_outline = sum(
        1
        for _, d in docs
        if (d.get("meta") or {}).get("kind") == "project" and (d.get("meta") or {}).get("file") == "OUTLINE.md"
    )
    if got_outline != len(leaves):
        crit(f"工程线: 叶子 OUTLINE 单元 {got_outline} ≠ 源 {len(leaves)}")
    groups = len(
        [
            g
            for g in ("os", "raft", "cpu", "parallel", "codedesign", "eng", "cg")
            if (NB / "projects" / g / "NOTES.md").exists()
        ]
    )
    got_group = sum(
        1
        for _, d in docs
        if (d.get("meta") or {}).get("kind") == "project-group" and (d.get("meta") or {}).get("file") == "OUTLINE.md"
    )
    if got_group != groups:
        crit(f"工程线: 分组 OUTLINE 单元 {got_group} ≠ 源 {groups}")
    if count_kind(docs, "project-index") != 1:
        crit("工程线: 缺面试索引")
    check_project_notes_lossless()

    # 数值库（2026-11-17 起随工程数学站，根是 emath/json）
    docs = load_docs(ROOTS["emath"])
    know = {
        (d.get("meta") or {}).get("surveyId")
        for _, d in docs
        if (d.get("meta") or {}).get("kind") == "library-know"
    }
    want = {f"{k}{i}" for k, n in SURVEY_SPACE.items() for i in range(1, n + 1)}
    if know != want:
        crit(f"数值库: survey 条目对不上（缺 {sorted(want - know)[:8]}，多 {sorted(know - want)[:8]}）")
    if count_kind(docs, "library-section") != 3:
        crit("数值库: 散文单元应为 3（总图 / 两条轴 / 覆盖自查）")
    if count_kind(docs, "library-bridge") != 6:
        crit("数值库: bridges 单元应为 6")


def main() -> int:
    quiet = "--quiet" in sys.argv
    total = 0
    for name, root in ROOTS.items():
        if not root.exists():
            crit(f"{name}: 数据根不存在 {root}")
            continue
        docs = load_docs(root)
        total += len(docs)
        for p, d in docs:
            check_structure(p, d)
            check_source(p, d)
            check_lossless(p, d)
        if not quiet:
            kinds: dict[str, int] = {}
            for _, d in docs:
                k = (d.get("meta") or {}).get("kind", "?")
                kinds[k] = kinds.get(k, 0) + 1
            print(f"{name:9s} {len(docs):4d} 单元  {kinds}")

    check_coverage()
    check_english1_coverage()
    check_english1_words()
    if errs:
        print()
        for e in errs[:60]:
            print(e)
        if len(errs) > 60:
            print(f"… 还有 {len(errs) - 60} 条")
    print(f"\n== doc-card/v1：{total} 单元 · CRIT {len(errs)} ==")
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
