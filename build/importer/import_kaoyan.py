"""11408 考研线导入：`notebook/kaoyan/` → `cs408/json/`（408）+ `kaoyan/json/`（数一）。

单元类型：
- 章首 `.0`：syllabus 的「真题落点 / 一课位置 / 细节与陷阱」（不重复搬考点表）
- 考点：一个 KP 一个单元，正文 = `note/<KP>-<考点>.md`
- 真题：一年一个单元（`EX<yy>.1`），缺图清单 `EX00.1`
- 拔高：一条题线一个单元（408 `DL<n>.1` / 数一 `DM<n>.1`）
- 速学：一科一个单元（`QK01`–`QK07`）
- 分层：`SY01.1`（`syllabus/tiers.md`，两科共用，放 408 根）

用法：uv run python build/importer/import_kaoyan.py
"""
from __future__ import annotations

import re
import sys

from common import (
    WEB,
    Unit,
    annotate_exam,
    build_entries,
    notebook_state,
    read_source,
    reset_root,
    split_exam_chunks,
    write_unit,
)
from md_split import split_markdown

ROW_RE = re.compile(r"^\|\s*`((?:408|M1)-[A-Z]+-\d{4}(?:-\d+)?)`\s*\|")
# 科目代码可能是 3 字母（`NET`），但代号域只能 2 字母 —— 用这张表收口。
CHAPTER_RE = re.compile(r"^###\s+([A-Z]{2,3})-(\d{2})\s+(.+?)\s*$")
SUBJECT_DOMAIN = {
    "DS": "DS",
    "CO": "CO",
    "OS": "OS",
    "NET": "NT",  # 代号域固定 2 字母，见 taxonomy 的 domainOf
    "HS": "HS",
    "LA": "LA",
    "PS": "PS",
}


def parse_syllabus(rel: str) -> tuple[list[dict], list[dict]]:
    """返回 (chapters, rows)。chapters 带 pre/traps，rows 带 kp/节/要求/标签/文件。"""
    lines = read_source(rel).splitlines()
    chapters: list[dict] = []
    rows: list[dict] = []
    cur: dict | None = None
    i = 0
    while i < len(lines):
        line = lines[i]
        m = CHAPTER_RE.match(line)
        if m:
            subj, num, title = m.groups()
            dom = SUBJECT_DOMAIN.get(subj)
            if dom is None:
                raise SystemExit(f"未知科目代码 {subj}（{rel}）")
            cur = {"code": f"{dom}{num}", "title": title.strip(), "pre": [], "traps": []}
            chapters.append(cur)
            i += 1
            # 章首到表头之间 = 导语（真题落点 / 一课位置）
            while i < len(lines) and not lines[i].startswith("|"):
                if lines[i].strip():
                    cur["pre"].append(lines[i].rstrip())
                i += 1
            # 表格行
            while i < len(lines) and lines[i].startswith("|"):
                mr = ROW_RE.match(lines[i])
                if mr:
                    cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                    if len(cells) != 7:
                        raise SystemExit(f"考纲行不是 7 列（{rel}）：{lines[i][:80]}")
                    rows.append(
                        {
                            "kp": mr.group(1),
                            "section": cells[1],
                            "requirement": cells[3],
                            "tag": cells[4],
                            "file": cells[5].strip("`"),
                            "chapter": cur["code"],
                        }
                    )
                i += 1
            continue
        if line.startswith("#### 细节与陷阱") and cur is not None:
            i += 1
            while i < len(lines) and not lines[i].startswith(("### ", "## ")):
                if lines[i].strip().startswith("- "):
                    cur["traps"].append(lines[i].rstrip())
                i += 1
            continue
        i += 1
    return chapters, rows


def chapter_unit(ch: dict, rel: str, title_prefix: str) -> Unit:
    chunks: list[tuple[int, str, str]] = []
    if ch["pre"]:
        chunks.append((2, f"{title_prefix}{ch['code']} {ch['title']}：导语与真题落点", "\n".join(ch["pre"])))
    if ch["traps"]:
        chunks.append((2, "细节与陷阱", "\n".join(ch["traps"])))
    if not chunks:
        chunks.append((2, "章首", f"（本章暂无落点与陷阱条目）"))
    return Unit(
        code=f"{ch['code']}.0",
        chapter=ch["code"],
        title=f"{ch['code']} {ch['title']}",
        src=rel,
        entries=build_entries(f"{ch['code']}.0", chunks),
        meta={"kind": "chapter", "chapter_title": ch["title"]},
    )


def kp_unit(row: dict, used: dict[str, int]) -> Unit:
    kp = row["kp"]
    parts = kp.split("-")
    subj, num = SUBJECT_DOMAIN[parts[1]], parts[2]
    chapter = f"{subj}{num[:2]}"
    sec = int(num[2:]) or 99
    key = f"{chapter}/{sec}"
    # 同章同节多 KP → 依次占用下一个序号（考纲顺序即学习顺序）
    while key in used:
        sec += 1
        key = f"{chapter}/{sec}"
    used[key] = 1
    code = f"{chapter}.{sec}"

    rel = "kaoyan/" + row["file"]
    text = read_source(rel)
    h1, chunks = split_markdown(text)
    entries = build_entries(code, split_exam_chunks(chunks))
    annotate_exam(entries)
    meta = {
        "kind": "kaoyan-kp",
        "kp": kp,
        "requirement": row["requirement"],
        "tag": row["tag"],
        **parse_note_header(text),
    }
    return Unit(
        code=code,
        chapter=chapter,
        title=row["section"],
        src=rel,
        entries=entries,
        source_h1=h1,
        meta=meta,
    )


def parse_note_header(text: str) -> dict:
    """解析笔记首行 blockquote 的「章 ｜ 档位 ｜ 真题落点」（2026-11-14）。

    这三样原来只以自然语言躺在正文里，机器读不到：档位没法做筛选，
    真题落点也没法从「2021 #16」反查到单元。这里抽出结构化字段，**原文仍保留**。
    """
    for line in text.splitlines()[:8]:
        if not line.startswith(">") or "章：" not in line:
            continue
        cells = [c.strip() for c in re.split(r"[｜|]", line.lstrip("> ").strip())]
        out: dict = {"header": cells}
        for c in cells:
            if c.startswith("档位："):
                out["tier"] = c[3:].strip()
            elif c.startswith("真题落点："):
                hits = re.findall(r"(\d{4})\s*#\s*(\d+)", c)
                out["examCount"] = len(hits)
                out["examHits"] = [{"year": int(y), "no": int(n)} for y, n in hits]
        out.setdefault("examHits", [])
        return out
    return {}


def plain_unit(rel: str, code: str, title: str, meta: dict | None = None) -> Unit:
    text = read_source(rel)
    h1, chunks = split_markdown(text)
    return Unit(
        code=code,
        chapter=code.split(".")[0],
        title=title,
        src=rel,
        entries=build_entries(code, chunks),
        source_h1=h1,
        meta=meta,
    )


def import_book(book: str, syllabus_rel: str, root, commit: str, dirty: bool) -> dict:
    chapters, rows = parse_syllabus(syllabus_rel)
    used: dict[str, int] = {}
    report = {"chapters": 0, "kp": 0, "units": 0}

    for ch in chapters:
        write_unit(root, chapter_unit(ch, syllabus_rel, "第 "), commit, dirty)
        report["chapters"] += 1
        report["units"] += 1

    for row in rows:
        unit = kp_unit(row, used)
        write_unit(root, unit, commit, dirty)
        report["kp"] += 1
        report["units"] += 1

    # 真题（2016–2024，一年一个单元）—— **只有 408 有真题库**，数一不设
    exam_dir = "kaoyan/exam/真题"
    if book == "408":
        for name in sorted(p.name for p in (WEB.parent / "notebook" / exam_dir).glob("*.md")):
            if not re.fullmatch(r"\d{4}\.md", name):
                continue
            year = name[:4]
            rel = f"{exam_dir}/{name}"
            code = f"EX{year[2:]}.1"
            write_unit(
                root,
                plain_unit(rel, code, f"{year} 年真题", {"kind": "exam", "year": int(year)}),
                commit,
                dirty,
            )
            report["units"] += 1

        # 缺图清单（真题库的附属页，随 408 根走）
        missing = f"{exam_dir}/缺图清单.md"
        if (WEB.parent / "notebook" / missing).exists():
            write_unit(
                root,
                plain_unit(missing, "EX00.1", "缺图清单", {"kind": "exam-missing"}),
                commit,
                dirty,
            )
            report["units"] += 1

    # 拔高
    drill_prefix = "408" if book == "408" else "math1"
    dom = "DL" if book == "408" else "DM"
    drill_dir = WEB.parent / "notebook" / "kaoyan" / "drill" / drill_prefix
    for p in sorted(drill_dir.glob("*.md")):
        m = re.match(r"(\d+)-(.+)\.md$", p.name)
        if not m:
            continue
        n, name = m.groups()
        rel = f"kaoyan/drill/{drill_prefix}/{p.name}"
        code = f"{dom}{int(n):02d}.1"
        write_unit(root, plain_unit(rel, code, f"{n} {name}", {"kind": "drill"}), commit, dirty)
        report["units"] += 1

    # 速学
    quick = [
        ("408", "408-ds.md", "QK01.1", "408 数据结构 · 快速学完"),
        ("408", "408-co.md", "QK02.1", "408 组成原理 · 快速学完"),
        ("408", "408-os.md", "QK03.1", "408 操作系统 · 快速学完"),
        ("408", "408-net.md", "QK04.1", "408 计算机网络 · 快速学完"),
        ("M1", "math-hs.md", "QK05.1", "数一 高等数学 · 快速学完"),
        ("M1", "math-la.md", "QK06.1", "数一 线性代数 · 快速学完"),
        ("M1", "math-ps.md", "QK07.1", "数一 概率统计 · 快速学完"),
    ]
    for owner, name, code, title in quick:
        if owner != book:
            continue
        rel = f"kaoyan/quick/{name}"
        if not (WEB.parent / "notebook" / rel).exists():
            raise SystemExit(f"缺速学文件：{rel}")
        write_unit(root, plain_unit(rel, code, title, {"kind": "quick"}), commit, dirty)
        report["units"] += 1

    return report


def main() -> int:
    commit, dirty = notebook_state()
    cs408 = WEB / "cs408/json"
    math1 = WEB / "kaoyan/json"
    reset_root(cs408)
    reset_root(math1)

    r408 = import_book("408", "kaoyan/syllabus/408.md", cs408, commit, dirty)
    r1 = import_book("M1", "kaoyan/syllabus/math1.md", math1, commit, dirty)

    # 分层表两科共用，放 408 根
    tiers = "kaoyan/syllabus/tiers.md"
    write_unit(cs408, plain_unit(tiers, "SY01.1", "考点分层（T1/T2/T3）", {"kind": "tiers"}), commit, dirty)
    r408["units"] += 1

    print(f"408  ：章 {r408['chapters']} · 考点 {r408['kp']} · 单元 {r408['units']}")
    print(f"数一 ：章 {r1['chapters']} · 考点 {r1['kp']} · 单元 {r1['units']}")
    print(f"notebook commit {commit[:12]} · dirty={dirty}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
