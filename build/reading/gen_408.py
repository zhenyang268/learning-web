#!/usr/bin/env python3
"""408 考纲主键表 → 朗读稿（大纲提要）。

输入：`notebook/kaoyan/syllabus/408.md`（634 行，120 行数据表格）
输出：`learning-web/readable/cs408/*.json`，按四大科分 4 个单元

## 表格裁剪口径

原表 7 列：`KP | 节 | 核心知识点 | 要求 | 标签 | 文件 | 掌握`。
朗读只留 **节 / 核心知识点 / 要求 / 标签** 四列，另外接上每章末尾的
「细节与陷阱」。丢掉的三列都是朗读噪音：

- `KP`（`408-DS-0202`）—— 代号，念出来是一串字母数字
- `文件`（`note/408/ds/xxx.md`）—— 路径，念出来全是斜杠和下划线
- `掌握`（`M0`）—— 记账标记，不是知识

每行转成一句：「顺序表，要求 A 掌握，常考。核心：…」

`>` 引用块（真题落点、一课位置）整段丢弃：里面是年份题号与路径，
朗读价值低且极吵。
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from common import Ctx, NOTEBOOK, check, emit, inline, sha8  # noqa: E402

SRC = NOTEBOOK / "kaoyan/syllabus/408.md"
OUT = Path("/Users/apple/develop/learning/learning-web/readable/cs408")
LINE = "cs408"
TOP = re.compile(r"^##\s+(.*)$")
CHAP = re.compile(r"^###\s+(.*)$")
TRAP = re.compile(r"^####\s+(.*)$")
ROW = re.compile(r"^\|\s*(.+?)\s*$")
ITEM = re.compile(r"^-\s+(.*)$")


def split_cells(line: str) -> list[str]:
    """拆表格行。反引号里的 `|` 不会出现，故可直接按竖线切。"""
    body = line.strip().strip("|")
    return [c.strip() for c in body.split("|")]


def is_sep(cells: list[str]) -> bool:
    return all(set(c) <= set("-: ") for c in cells if c)


def kp_line(cells: list[str], ctx: Ctx) -> str | None:
    """一行 KP 数据 → 一句口语。列数不足视为表头，返回 None。"""
    if len(cells) < 5:
        return None
    section, core, level, tag = cells[1], cells[2], cells[3], cells[4]
    if section in ("节", "KP"):
        return None
    core_txt = inline(core, ctx)
    parts = [inline(section, ctx), f"要求 {inline(level, ctx)}", inline(tag, ctx)]
    head = "，".join(p for p in parts if p)
    return f"{head}。核心：{core_txt}"


def main() -> int:
    src = SRC.read_text(encoding="utf-8")
    ctx = Ctx(subdir="")
    units: list[dict] = []
    cur: dict | None = None
    in_table = False
    in_trap = False

    def flush() -> None:
        nonlocal cur
        if cur and cur["blocks"]:
            unit = {
                "version": "reading/v1",
                "id": cur["id"],
                "line": LINE,
                "group": "408 考纲",
                "title": cur["title"],
                "source": "notebook/kaoyan/syllabus/408.md",
                "sourceSha": sha8(SRC),
                "blocks": cur["blocks"],
            }
            emit(unit, OUT)
            probs = check(unit["blocks"])
            for p in probs[:3]:
                print(f"  ! {unit['id']}: {p}")
            units.append({
                "id": unit["id"],
                "title": unit["title"],
                "group": unit["group"],
                "source": unit["source"],
                "sha": unit["sourceSha"],
                "n": len(unit["blocks"]),
                "problems": probs[:2],
            })
        cur = None

    idx = 0
    for raw in src.splitlines():
        line = raw.rstrip()

        m = TOP.match(line)
        if m:
            flush()
            idx += 1
            title = inline(m.group(1), ctx)
            cur = {"id": f"cs408-{idx:02d}", "title": title, "blocks": []}
            in_table = in_trap = False
            continue

        if cur is None:
            continue

        m = CHAP.match(line)
        if m:
            cur["blocks"].append({"t": "h2", "x": inline(m.group(1), ctx)})
            in_table = in_trap = False
            continue

        m = TRAP.match(line)
        if m:
            cur["blocks"].append({"t": "h3", "x": inline(m.group(1), ctx)})
            in_trap = True
            in_table = False
            continue

        if line.startswith("|"):
            cells = split_cells(line)
            if is_sep(cells):
                in_table = True
                continue
            text = kp_line(cells, ctx)
            if text:
                cur["blocks"].append({"t": "p", "x": text})
            continue

        if line.startswith(">"):
            continue  # 真题落点 / 一课位置：元信息，丢弃

        m = ITEM.match(line)
        if m:
            text = inline(m.group(1), ctx)
            # 陷阱条目前面挂着 KP 代号（`408-DS-0102 易错…`），朗读时是一串字母数字噪音
            text = re.sub(r"^408-[A-Z]+-\d+\s*", "", text)
            if text:
                cur["blocks"].append({"t": "li", "x": text})
            continue

        if line.strip() and not in_table:
            text = inline(line, ctx)
            if text and len(text) > 4:
                cur["blocks"].append({"t": "p", "x": text})

    flush()

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "_units.json").write_text(
        json.dumps(units, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    bad = sum(len(u["problems"]) for u in units)
    print(f"408：{len(units)} 单元 / {sum(u['n'] for u in units)} 块 / 自检问题 {bad} 处")
    for u in units:
        print(f"  {u['id']}  {u['title']}  ({u['n']} 块)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
