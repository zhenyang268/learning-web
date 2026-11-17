"""11408 考研线导入：`notebook/kaoyan/` → `cs408/json/`（408）+ `kaoyan/json/`（数一）。

单元类型：
- 章首 `.0`：syllabus 的「真题落点 / 一课位置 / 细节与陷阱」+ 本章章讲义正文
  （`lectures/<科>/<NN>-<章名>.md`，2026-11-18 从 `_archive` 迁回主线）。
  讲义的「一、本章考点与档位」表与「三、真题落点」**不搬**：
  前者与 syllabus 重复且易过时，后者是旧版枚举、会与现行 note 落点漂移；
  由 `meta.kps` 生成当前考点导航，正文/易错清单原样搬。
- 考点：一个 KP 一个单元，正文 = `note/<KP>-<考点>.md`
- 真题：一年一个单元（`EX<yy>.1`），缺图清单 `EX00.1`
- 拔高：一条题线一个单元（408 `DL<n>.1` / 数一 `DM<n>.1`）
- 速学：一科一个单元（`QK01`–`QK07`）
- 分层：`SY01.1`（`syllabus/tiers.md`，两科各放一份同源镜像）

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
    reconstruct,
    reset_root,
    sha256_text,
    split_exam_chunks,
    write_unit,
)
from md_split import split_markdown

ROW_RE = re.compile(r"^\|\s*`((?:408|M1)-[A-Z]+-\d{4}(?:-\d+)?)`\s*\|")
LECTURE_ROOT = "kaoyan/lectures"
# 讲义子目录：408 用 ds/co/os/net，数一用 hs/la/ps；章号由文件名 NN- 前缀给出。
LECTURE_SUBDIR = {
    "408": {"DS": "ds", "CO": "co", "OS": "os", "NT": "net"},
    "M1": {"HS": "hs", "LA": "la", "PS": "ps"},
}
# 讲义里有两节不进 Web（数据仍以 syllabus/note 为唯一真源）：
#   · 「一、本章考点与档位」——与 syllabus 重复，考纲一改就过时；考点导航由 `meta.kps` 给出。
#   · 「三、真题落点」——2026-11-04 的旧版枚举，与现行 note 落点/真题标注会漂移；
#     章首顶部已用 syllabus 的当前落点，不再复制第二份。
DROPPED_LECTURE_SECTIONS = ("一、本章考点与档位", "三、真题落点")
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


def assign_kp_codes(rows: list[dict]) -> list[dict]:
    """考纲行 → 单元代号。同章同节多 KP 按考纲顺序顺延序号。"""
    used: dict[str, int] = {}
    out: list[dict] = []
    for row in rows:
        kp = row["kp"]
        parts = kp.split("-")
        subj, num = SUBJECT_DOMAIN[parts[1]], parts[2]
        chapter = f"{subj}{num[:2]}"
        sec = int(num[2:]) or 99
        key = f"{chapter}/{sec}"
        while key in used:
            sec += 1
            key = f"{chapter}/{sec}"
        used[key] = 1
        out.append({**row, "code": f"{chapter}.{sec}"})
    return out


def find_lecture(book: str, chapter: str) -> str:
    """章号 → 章讲义相对路径（`kaoyan/lectures/<科>/<NN>-<章名>.md`）。

    缺一篇直接报错，不静默跳过：讲义完整性是内容判据，不能靠“导入成功”掩盖。
    """
    domain, num = chapter[:2], chapter[2:]
    sub = LECTURE_SUBDIR[book].get(domain)
    if not sub:
        raise SystemExit(f"未知讲义域 {domain}（{chapter}）")
    dir_name = "408" if book == "408" else "math1"
    d = WEB.parent / "notebook" / LECTURE_ROOT / dir_name / sub
    hits = sorted(d.glob(f"{num}-*.md"))
    if len(hits) != 1:
        raise SystemExit(f"{chapter} 应有 1 篇讲义，实际 {len(hits)} 篇（{d}）")
    return f"{LECTURE_ROOT}/{dir_name}/{sub}/{hits[0].name}"


def lecture_parts(rel: str) -> tuple[list[tuple[int, str, str]], str, list[str]]:
    """读讲义并丢掉「一、本章考点与档位」表，返回保留正文的指纹。

    为什么丢这一节：它与 `syllabus/` 是同一份考纲的两种写法，考点/档位/落点
    的真源在 syllabus；讲义里的表会随考纲修订而过时，搬进 Web 只会制造第二真源。
    当前考点由 `meta.kps` 导航给出。
    """
    text = read_source(rel)
    _h1, chunks = split_markdown(text)
    kept: list[tuple[int, str, str]] = []
    dropped: list[str] = []
    for level, title, content in chunks:
        if level == 2 and any(title.strip().startswith(s) for s in DROPPED_LECTURE_SECTIONS):
            dropped.append(title.strip())
            continue
        kept.append((level, title, content))
    body = reconstruct(None, [{"level": lv, "title": t, "content": c} for lv, t, c in kept])
    return kept, sha256_text(body), dropped


def chapter_unit(
    ch: dict,
    rel: str,
    title_prefix: str,
    kps: list[dict],
    lecture_rel: str,
) -> Unit:
    """章首 `.0`：导语 + 章讲义正文 + 细节陷阱；考点表不进正文，走 `meta.kps`。"""
    code = f"{ch['code']}.0"
    own: list[dict] = []
    if ch["pre"]:
        own = build_entries(code, [(2, f"{title_prefix}{ch['code']} {ch['title']}：导语与真题落点", "\n".join(ch["pre"]))])
    if not own:
        own = build_entries(code, [(2, "章首", "（本章暂无落点与陷阱条目）")])

    kept, body_sha, dropped = lecture_parts(lecture_rel)
    lec_entries = build_entries(code, kept)
    for e in lec_entries:
        # 讲义词条 id 加 `lec-` 前缀，避免与章首自己的 body.sNN 撞号；
        # 同时保持 `<code>:` 前缀，满足 verify_docs 的 id 前缀判据。
        e["id"] = e["id"].replace(f"{code}:", f"{code}:lec-", 1)
    lec_head = {
        "id": f"{code}:lec-head.s01",
        "type": "heading",
        "title": "章讲义",
        "level": 2,
        "content": "",
    }
    traps = (
        build_entries(code, [(2, "细节与陷阱", "\n".join(ch["traps"]))])
        if ch["traps"]
        else []
    )
    return Unit(
        code=code,
        chapter=ch["code"],
        title=f"{ch['code']} {ch['title']}",
        src=rel,
        entries=own + [lec_head] + lec_entries + traps,
        meta={
            "kind": "chapter",
            "chapter_title": ch["title"],
            "kps": kps,
            "lecture": {
                "file": "notebook/" + lecture_rel,
                "sha256": sha256_text(read_source(lecture_rel)),
                "body_sha256": body_sha,
                "entries": len(lec_entries),
                "dropped": dropped,
            },
        },
    )


def kp_unit(row: dict) -> Unit:
    kp = row["kp"]
    code = row["code"]
    chapter = code.split(".")[0]

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
    rows = assign_kp_codes(rows)
    by_chapter: dict[str, list[dict]] = {}
    for row in rows:
        by_chapter.setdefault(row["chapter"], []).append(
            {"code": row["code"], "title": row["section"], "kp": row["kp"]}
        )
    report = {"chapters": 0, "kp": 0, "lectures": 0, "units": 0}

    for ch in chapters:
        lecture_rel = find_lecture(book, ch["code"])
        unit = chapter_unit(
            ch,
            syllabus_rel,
            "第 ",
            by_chapter.get(ch["code"], []),
            lecture_rel,
        )
        write_unit(root, unit, commit, dirty)
        report["chapters"] += 1
        report["lectures"] += 1
        report["units"] += 1

    for row in rows:
        write_unit(root, kp_unit(row), commit, dirty)
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

    # 分层表两科共用同一源，各站各放一份镜像，避免数一用户必须跨站查口径
    tiers = "kaoyan/syllabus/tiers.md"
    for root, report in ((cs408, r408), (math1, r1)):
        write_unit(root, plain_unit(tiers, "SY01.1", "考点分层（T1/T2/T3）", {"kind": "tiers"}), commit, dirty)
        report["units"] += 1

    # 408 导读（四科：职责 / 块表 / 线 / KP 映射 / 两种问法）——
    # **只搬导读**，85 个 KP 的正文仍以各自的 kaoyan-kp 单元为准，不在这里复制成新词条。
    guide = "kaoyan/syllabus/408-guide.md"
    if (WEB.parent / "notebook" / guide).exists():
        write_unit(
            cs408,
            plain_unit(guide, "GD01.1", "408 导读 · 四科在考什么", {"kind": "guide"}),
            commit,
            dirty,
        )
        r408["units"] += 1

    print(
        f"408  ：章 {r408['chapters']} · 章讲义 {r408['lectures']} · 考点 {r408['kp']} · 单元 {r408['units']}"
    )
    print(
        f"数一 ：章 {r1['chapters']} · 章讲义 {r1['lectures']} · 考点 {r1['kp']} · 单元 {r1['units']}"
    )
    print(f"notebook commit {commit[:12]} · dirty={dirty}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
