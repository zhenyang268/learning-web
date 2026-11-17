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
PAIR = [("OUTLINE.md", "大纲", 1), ("NOTES.md", "分章详解", 2)]


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


def emit_dir(root, dir_path, chapter: str, label: str, meta: dict, commit, dirty) -> int:
    n = 0
    for name, suffix, idx in PAIR:
        f = dir_path / name
        if not f.exists():
            raise SystemExit(f"缺两件套：{f}")
        code = f"{chapter}.{idx}"
        write_unit(root, unit_from_file(f, code, f"{label} · {suffix}", {**meta, "file": name}), commit, dirty)
        n += 1
    for extra, suffix in EXTRA_FILE.items():
        f = dir_path / extra
        if f.exists():
            code = f"{chapter}.{n + 1}"
            write_unit(root, unit_from_file(f, code, f"{label} · {suffix}", {**meta, "file": extra}), commit, dirty)
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

    print(f"工程线：单元 {units}（含分组 6×2、叶子两件套、面试索引 1）")
    if missing_in_readme:
        print("README 未列、按字典序补位的叶子：" + "、".join(missing_in_readme))
    print(f"notebook commit {commit[:12]} · dirty={dirty}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
