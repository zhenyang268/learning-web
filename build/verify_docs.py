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

from common import norm, reconstruct, split_exam_chunks  # noqa: E402
from md_split import split_markdown  # noqa: E402

CODE_RE = re.compile(r"^[A-Z]{2}\d{2}(\.\d+)?$")
ID_RE = re.compile(r"^[A-Z]{2}\d{2}(\.\d+)?:[a-z0-9-]+\.[a-z0-9-]+$")
ROOTS = {
    "math": WEB / "json",
    "cs408": WEB / "cs408" / "json",
    "kaoyan": WEB / "kaoyan" / "json",
    "projects": WEB / "projects" / "json",
}
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
        return
    digest = "sha256:" + hashlib.sha256(src.read_text(encoding="utf-8").encode("utf-8")).hexdigest()
    if digest != d["src"].get("sha256"):
        crit(f"{rel}: 源已改动（sha256 不符），重跑导入")


def check_lossless(p: Path, d: dict) -> None:
    """只对 Markdown 源做逐行对账；LaTeX 由「哨兵切分」在构造上保证。"""
    rel = p.relative_to(WEB)
    # 章首单元是从 syllabus 的「导语 + 细节与陷阱」拼出来的，不对应整份源文件
    if (d.get("meta") or {}).get("kind") == "chapter":
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


def count_kind(docs: list[tuple[Path, dict]], kind: str) -> int:
    return sum(1 for _, d in docs if (d.get("meta") or {}).get("kind") == kind)


def check_coverage() -> None:
    sys.path.insert(0, str(IMPORTER))
    from import_kaoyan import parse_syllabus  # noqa: E402

    for name, rel, book in (
        ("cs408", "kaoyan/syllabus/408.md", "408"),
        ("kaoyan", "kaoyan/syllabus/math1.md", "M1"),
    ):
        docs = load_docs(ROOTS[name])
        chapters, rows = parse_syllabus(rel)
        got_kp = count_kind(docs, "kaoyan-kp")
        got_ch = count_kind(docs, "chapter")
        if got_kp != len(rows):
            crit(f"{name}: 考点单元 {got_kp} ≠ 考纲行 {len(rows)}")
        if got_ch != len(chapters):
            crit(f"{name}: 章首单元 {got_ch} ≠ 考纲章 {len(chapters)}")
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
    leaves = [p for p in NB.glob("projects/*/*/OUTLINE.md")] + [
        NB / "projects" / s / "OUTLINE.md" for s in ("csapp", "6824", "cs149", "database", "ai", "discrete-math")
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
        [g for g in ("os", "cpu", "langs", "algo", "eng", "cg") if (NB / "projects" / g / "NOTES.md").exists()]
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

    # 数值库
    docs = load_docs(ROOTS["math"])
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
