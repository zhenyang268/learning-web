"""英语一导入：`notebook/kaoyan/english1.md` + `english1/` → `english1/json/`。

映射（代号域固定 2 字母，见 importer/README.md §1）：

- `GE01.1`  考纲主键表（`kaoyan/english1.md`）—— 净化后的题型表 + 导览
- `CZ01.1`  完形填空（`english1/01-完形填空.md`）
- `RC01.1`  阅读理解（`english1/02-阅读理解.md`）
- `NT01.1`  新题型（`english1/03-新题型.md`）
- `TR01.1`  翻译（`english1/04-翻译.md`）
- `WR01.1`  小作文（`english1/05-小作文.md`）
- `WR02.1`  大作文（`english1/06-大作文.md`）
- `VO00.1`  词汇导览（`english1/00-词汇.md`）
- `VO01.1`…`VO30.1`  词汇主题组（`english1/words/01–30-*.md`）
- `VO97.N`  大纲补全（`english1/words/97-大纲补全（按词频）.md`）—— 按 `##` 标题边界无损拆分；
  源里若没有 `##`，则按**表格分块的连续行**拆（每条目一个词条），**绝不硬切行**。

用法：uv run python build/importer/import_english1.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from common import (
    WEB,
    Unit,
    build_entries,
    notebook_state,
    read_source,
    reset_root,
    write_unit,
)
from md_split import split_markdown

# ---------------------------------------------------------------- 源路径

SYLLABUS_REL = "kaoyan/english1.md"
LECTURE_DIR = "kaoyan/english1"
WORDS_DIR = "kaoyan/english1/words"
GUIDE_REL = f"{LECTURE_DIR}/00-词汇.md"
FULL_REL = f"{WORDS_DIR}/97-大纲补全（按词频）.md"

ROOT = WEB / "english1" / "json"

# 六篇题型讲义：文件名前缀 → (代号, 标题, kind)
LECTURES: list[tuple[str, str, str]] = [
    ("01", "CZ01.1", "完形填空"),
    ("02", "RC01.1", "阅读理解（六题型）"),
    ("03", "NT01.1", "新题型"),
    ("04", "TR01.1", "翻译"),
    ("05", "WR01.1", "小作文"),
    ("06", "WR02.1", "大作文"),
]

H2_RE = re.compile(r"^##\s+(.+)$", re.M)


# ---------------------------------------------------------------- 单元构造


def plain_unit(rel: str, code: str, title: str, meta: dict, *, source_h1: bool = True) -> Unit:
    """标准 md 单元：H1 → source_h1，H2 切词条，切完就地无损对账（md_split 内建）。"""
    text = read_source(rel)
    h1, chunks = split_markdown(text)
    return Unit(
        code=code,
        chapter=code.split(".")[0],
        title=title,
        src=rel,
        entries=build_entries(code, chunks),
        source_h1=h1 if source_h1 else None,
        meta=meta,
    )


def _blocks_by_table(lines: list[str]) -> list[tuple[str, str]]:
    """把「无 H2 的表格文件」按连续表格块拆开，块与块之间以非表格行为界。

    只用于 `97-大纲补全` 这类「引言 + 一张大表」的源：每条目 5–12 行必须完整落在一个词条里，
    所以边界只能是**空行或非表格行**，不能按行数硬切。
    """
    blocks: list[tuple[str, str]] = []
    cur: list[str] = []
    for line in lines:
        if line.startswith("|"):
            cur.append(line)
        elif line.strip():
            # 非表格正文行（引言 / 说明）单独成块
            if cur:
                blocks.append(("表格", "\n".join(cur)))
                cur = []
            blocks.append(("说明", line))
        else:
            if cur:
                blocks.append(("表格", "\n".join(cur)))
                cur = []
    if cur:
        blocks.append(("表格", "\n".join(cur)))
    return blocks


def _group_table_blocks(blocks: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """把相邻的「说明」行合并，把表格块保持独立，得到最终词条序列。"""
    out: list[tuple[str, str]] = []
    buf: list[str] = []

    def flush() -> None:
        if buf:
            out.append(("说明", "\n".join(buf)))
            buf.clear()

    for kind, body in blocks:
        if kind == "表格":
            flush()
            out.append(("表格", body))
        else:
            buf.append(body)
    flush()
    return out


def _table_stats(body: str) -> dict:
    rows = [ln for ln in body.splitlines() if re.match(r"^\|\s*\d+\s*\|", ln)]
    words = [m.group(1).lower() for m in re.finditer(r"^\|\s*\d+\s*\|\s*`([^`]+)`", body, re.M)]
    return {"rows": len(rows), "words": words}


_NOT_TABLE = re.compile(r"^(?!\|)")


def split_supplement(rel: str, prefix: str) -> tuple[str | None, list[tuple[int, str, str]], dict]:
    """`97-大纲补全` 的无损拆分。

    优先按 `##` 标题边界；源里没有 H2 时，按表格块（非空行边界）拆分。
    无论走哪条路，拼回去都必须与源文本归一后逐行相等 —— 在 `main` 里统一对账。
    """
    text = read_source(rel)
    lines = text.splitlines()

    h1: str | None = None
    for i, line in enumerate(lines):
        if line.startswith("# ") and not line.startswith("##"):
            h1 = line[2:].strip()
            lines = lines[i + 1 :]
            break

    chunks: list[tuple[int, str, str]] = []
    if H2_RE.search("\n".join(lines)):
        # 有 H2：交给统一切分器（它自带对账）
        h1b, ch = split_markdown(text)
        return h1b, ch, {"mode": "h2"}

    blocks = _group_table_blocks(_blocks_by_table(lines))
    for kind, body in blocks:
        if kind == "表格":
            # 用 level 0：不生成合成标题，拼回时与源逐行相等（标题只用来取词条名）
            chunks.append((0, f"词条表（{_table_stats(body)['rows']} 词）", body))
        else:
            chunks.append((0, "", body))
    return h1, chunks, {"mode": "table-blocks", "blocks": len(chunks)}


def words_unit(rel: str, code: str, title: str, meta: dict) -> Unit:
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


# ---------------------------------------------------------------- 主流程


def import_english1(commit: str, dirty: bool) -> dict:
    report = {"syllabus": 0, "lectures": 0, "guide": 0, "groups": 0, "supplement": 0, "units": 0}

    # 考纲主键表（题型型：GE01.1）
    write_unit(
        ROOT,
        plain_unit(SYLLABUS_REL, "GE01.1", "英语一 考纲主键表", {"kind": "english1-syllabus"}),
        commit,
        dirty,
    )
    report["syllabus"] = 1
    report["units"] += 1

    # 六篇题型讲义
    for num, code, title in LECTURES:
        matches = sorted(Path(WEB.parent / "notebook" / LECTURE_DIR).glob(f"{num}-*.md"))
        if len(matches) != 1:
            raise SystemExit(f"讲义 {num}-* 命中 {len(matches)} 个文件")
        rel = f"{LECTURE_DIR}/{matches[0].name}"
        write_unit(
            ROOT,
            plain_unit(rel, code, title, {"kind": "english1-lecture", "module": num}),
            commit,
            dirty,
        )
        report["lectures"] += 1
        report["units"] += 1

    # 词汇导览
    write_unit(
        ROOT,
        plain_unit(GUIDE_REL, "VO00.1", "词汇导览", {"kind": "english1-words-guide"}),
        commit,
        dirty,
    )
    report["guide"] = 1
    report["units"] += 1

    # 30 个主题组
    groups = sorted(
        p for p in (WEB.parent / "notebook" / WORDS_DIR).glob("[0-9][0-9]-*.md") if not p.name.startswith("97-")
    )
    if len(groups) != 30:
        raise SystemExit(f"词汇主题组应为 30 个，实际 {len(groups)}")
    for p in groups:
        n = int(p.name[:2])
        rel = f"{WORDS_DIR}/{p.name}"
        name = p.stem.split("-", 1)[1] if "-" in p.stem else p.stem
        write_unit(
            ROOT,
            words_unit(rel, f"VO{n:02d}.1", f"{n:02d} {name}", {"kind": "english1-words", "group": n}),
            commit,
            dirty,
        )
        report["groups"] += 1
        report["units"] += 1

    # 大纲补全：按标题 / 表格块边界拆成 VO97.N
    h1, chunks, info = split_supplement(FULL_REL, "VO97")
    entries = build_entries("VO97", chunks)
    # 每个词条单独成单元：VO97.<序号>
    for i, e in enumerate(entries, start=1):
        code = f"VO97.{i}"
        entry = dict(e)
        entry["id"] = f"{code}:{entry['id'].split(':', 1)[1]}"
        unit = Unit(
            code=code,
            chapter="VO97",
            title=entry["title"] or f"大纲补全 段{i:03d}",
            src=FULL_REL,
            entries=[entry],
            source_h1=h1 if i == 1 else None,
            meta={"kind": "english1-supplement", "segment": i, "mode": info["mode"]},
        )
        write_unit(ROOT, unit, commit, dirty)
        report["supplement"] += 1
        report["units"] += 1

    return report


def main() -> int:
    commit, dirty = notebook_state()
    reset_root(ROOT)
    report = import_english1(commit, dirty)
    print(
        "英语一 ：考纲 1 · 讲义 {lectures} · 词汇导览 1 · 主题组 {groups} · 大纲补全 {supplement} · 单元 {units}".format(
            **report
        )
    )
    print(f"notebook commit {commit[:12]} · dirty={dirty}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
