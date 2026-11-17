"""工程线导入：`notebook/projects/` → `projects/json/`。

编号：
- 分组自身：`<域>00.1`（OUTLINE）/ `.2`（NOTES）
- 叶子：`<域><nn>.1`（OUTLINE）/ `.2`（NOTES）；双语版 `.3`、自研编译器 `.3`/`.4`
- 面试索引：`PX01.1`

叶子顺序以 `projects/README.md` 里首次出现的 `` `组/项目/` `` 为准（那是学习顺序），
README 没列到的再按字典序补，并在报告里点名。

用法：uv run python build/importer/import_projects.py
"""
from __future__ import annotations

import re
import sys

from common import PROJECTS, WEB, Unit, build_entries, notebook_state, read_source, reset_root, write_unit
from md_split import split_markdown

GROUP_DOMAIN = {
    "os": "SO",
    "raft": "DF",  # 2026-11-17 起 raft 成组（总纲 + go-lab + cpp）；旧 6824 单列归档，域沿用 DF
    "cpu": "CP",
    "langs": "LG",
    "algo": "AL",
    "eng": "EG",
    "cg": "GX",  # 与数学的 CG（图形学）区分：代号域全局唯一
}
SINGLES = [  # README §七 的单列，各自一个域
    ("csapp", "CS"),
    ("cs149", "PA"),
    ("database", "DB"),
    ("ai", "AI"),
    ("discrete-math", "DX"),  # 与数一拔高的 DM 区分
]
EXTRA_FILE = {"OUTLINE.bi.md": "OUTLINE（英文）", "MINI-COMPILER.md": "自研编译器路线"}
# NOTES 按 `##` 一节一页；超过这个行数且含 `###` 的节再按 `###` 拆（CSAPP §7 有 1344 行）。
LONG_SECTION_LINES = 400
H3_RE = re.compile(r"^###\s+(.*)$")


def readme_order() -> dict[str, list[str]]:
    text = (PROJECTS / "README.md").read_text(encoding="utf-8")
    order: dict[str, list[str]] = {}
    for group, leaf in re.findall(r"`([a-z0-9-]+)/([a-z0-9-]+)/`", text):
        if group in GROUP_DOMAIN:
            order.setdefault(group, [])
            if leaf not in order[group]:
                order[group].append(leaf)
    return order


def unit_from_file(path, code: str, title: str, meta: dict) -> Unit:
    rel = str(path.relative_to(PROJECTS.parent))
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


def split_long(title: str, content: str) -> list[tuple[int, str, str]]:
    """把超长 `##` 节再按 `###` 拆开；不满足条件就原样返回。

    只对「行数 > LONG_SECTION_LINES 且至少有 2 个 ###」的节动手：
    拆完必须能按序拼回原文（`###` 标题 + 正文），所以不丢任何一行。
    """
    lines = content.splitlines()
    if len(lines) <= LONG_SECTION_LINES:
        return [(2, title, content)]
    heads = [(i, m.group(1).strip()) for i, line in enumerate(lines) if (m := H3_RE.match(line))]
    if len(heads) < 2:
        return [(2, title, content)]
    out: list[tuple[int, str, str]] = []
    pre = "\n".join(lines[: heads[0][0]]).strip("\n")
    if pre.strip():
        out.append((2, title, pre))
        start = 0
    else:
        # H2 下面直接就是 `###`：把 H2 标题与**第一段 H3** 合成一页，
        # 否则 `## 7 逐层设计` 这行会丢（拼回校验会抓），也不能造一个空壳页。
        first_end = heads[1][0] if len(heads) > 1 else len(lines)
        out.append((2, title, "\n".join(lines[heads[0][0] : first_end]).strip("\n")))
        start = 1
    for j in range(start, len(heads)):
        i, t = heads[j]
        end = heads[j + 1][0] if j + 1 < len(heads) else len(lines)
        body = "\n".join(lines[i + 1 : end]).strip("\n")
        out.append((3, t, body))
    return out


def notes_parts(text: str) -> list[tuple[int, str, str]]:
    """NOTES.md → 按 `##` 一节一段；超长节再按 `###` 拆。"""
    _h1, chunks = split_markdown(text)
    out: list[tuple[int, str, str]] = []
    for level, title, content in chunks:
        out.extend(split_long(title, content) if level == 2 else [(level, title, content)])
    return out


def emit_dir(root, dir_path, chapter: str, label: str, meta: dict, commit, dirty) -> int:
    """OUTLINE 一页（`.1`）+ NOTES 逐节页（`.2…N`）+ 附加页（`.91/.92`）。

    为什么不再把整份 NOTES 放成一个 `.2`：单份 NOTES 6–14 万字、10+ 章，
    一页滚到底既找不到章，也无法把「这一节」发给别人。一节一页后侧栏/路由
    与章节标题同构；进度仍不显示（进度真源不在这里）。
    """
    outline = dir_path / "OUTLINE.md"
    if not outline.exists():
        raise SystemExit(f"缺 OUTLINE.md：{outline}")
    write_unit(
        root,
        unit_from_file(outline, f"{chapter}.1", f"{label} · 总览", {**meta, "file": "OUTLINE.md"}),
        commit,
        dirty,
    )
    n = 1

    notes = dir_path / "NOTES.md"
    if not notes.exists():
        raise SystemExit(f"缺 NOTES.md：{notes}")
    text = read_source(str(notes.relative_to(PROJECTS.parent)))
    h1, _chunks = split_markdown(text)
    parts = notes_parts(text)
    if not parts:
        raise SystemExit(f"NOTES 没有可导入的节：{notes}")
    for i, (level, title, content) in enumerate(parts, start=1):
        code = f"{chapter}.{i + 1}"
        entries = build_entries(code, [(level, title, content)])
        unit = Unit(
            code=code,
            chapter=chapter,
            title=title or f"{label} · 导读",
            src=str(notes.relative_to(PROJECTS.parent)),
            entries=entries,
            source_h1=h1 if i == 1 else None,
            meta={
                **meta,
                "kind": "project-chapter",
                "file": "NOTES.md",
                "part": i,
                "parts": len(parts),
                "section": title or "导读",
            },
        )
        write_unit(root, unit, commit, dirty)
        n += 1

    for extra, suffix in EXTRA_FILE.items():
        f = dir_path / extra
        if f.exists():
            code = f"{chapter}.{90 + list(EXTRA_FILE).index(extra) + 1}"
            write_unit(
                root,
                unit_from_file(f, code, f"{label} · {suffix}", {**meta, "kind": "project-extra", "file": extra}),
                commit,
                dirty,
            )
            n += 1
    return n


def main() -> int:
    commit, dirty = notebook_state()
    root = WEB / "projects/json"
    reset_root(root)

    order = readme_order()
    units = 0
    missing_in_readme: list[str] = []

    for group, dom in GROUP_DOMAIN.items():
        gdir = PROJECTS / group
        if not gdir.is_dir():
            continue
        # 分组自身
        units += emit_dir(root, gdir, f"{dom}00", f"{group} · 分组", {"kind": "project-group", "group": group}, commit, dirty)

        leaves = [p for p in gdir.iterdir() if p.is_dir() and (p / "OUTLINE.md").exists()]
        named = order.get(group, [])
        ordered = [gdir / n for n in named if (gdir / n).is_dir()]
        rest = sorted(p for p in leaves if p.name not in named)
        missing_in_readme += [f"{group}/{p.name}" for p in rest]
        for i, leaf in enumerate(ordered + rest, start=1):
            units += emit_dir(
                root,
                leaf,
                f"{dom}{i:02d}",
                leaf.name,
                {"kind": "project", "group": group, "project": leaf.name},
                commit,
                dirty,
            )

    for leaf, dom in SINGLES:
        d = PROJECTS / leaf
        if not d.is_dir():
            raise SystemExit(f"缺单列项目：{d}")
        units += emit_dir(root, d, f"{dom}01", leaf, {"kind": "project", "group": "single", "project": leaf}, commit, dirty)

    # 面试索引
    idx = PROJECTS / "面试索引.md"
    if idx.exists():
        write_unit(
            root,
            unit_from_file(idx, "PX01.1", "面试索引", {"kind": "project-index"}),
            commit,
            dirty,
        )
        units += 1

    print(f"工程线：单元 {units}（OUTLINE + NOTES 逐节 + 附加页 + 面试索引 1）")
    if missing_in_readme:
        print("README 未列、按字典序补位的叶子：" + "、".join(missing_in_readme))
    print(f"notebook commit {commit[:12]} · dirty={dirty}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
