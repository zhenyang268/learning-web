#!/usr/bin/env python3
"""数一笔记 → 朗读稿。

输入：`notebook/kaoyan/note/math1/{hs,la,ps}/*.md`（72 个）
输出：`learning-web/readable/math1/*.json`

子目录决定竖线语义（见 `common.read_math`）：`la` 里的 `\\mid` 是增广矩阵分隔，
`ps` 里的是条件概率。这是本批数据里唯一必须按目录分派的地方。

一个 md 一个单元。`hs` 32 篇、`la` 18 篇、`ps` 22 篇，篇均 3–5 KB，
单篇朗读 3–6 分钟，正好是一次专注的长度。
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from common import Ctx, NOTEBOOK, check, emit, read_blocks, sha8  # noqa: E402

SRC = NOTEBOOK / "kaoyan/note/math1"
OUT = Path("/Users/apple/develop/learning/learning-web/readable/math1")
LINE = "math1"
SUBJECT = {"hs": "高等数学", "la": "线性代数", "ps": "概率统计"}
ORDER = {"hs": 0, "la": 1, "ps": 2}


def unit_id(stem: str) -> str:
    """`M1-LA-0503-实对称矩阵` → `m1-la-0503`。"""
    return "-".join(stem.split("-")[:3]).lower()


def display_title(stem: str) -> str:
    """`M1-LA-0503-实对称矩阵` → `M1-LA-0503 实对称矩阵`。"""
    parts = stem.split("-", 3)
    return f"{parts[0]}-{parts[1]}-{parts[2]} {parts[3]}" if len(parts) > 3 else stem


def main() -> int:
    units: list[dict] = []
    total_warn = 0
    total_bad = 0

    for path in sorted(SRC.glob("*/*.md")):
        sub = path.parent.name
        if sub not in SUBJECT or path.name.lower() == "readme.md":
            continue
        src = path.read_text(encoding="utf-8")
        ctx = Ctx(subdir=sub)
        blocks = read_blocks(src, ctx)
        if not blocks:
            continue
        problems = check(blocks)
        total_warn += len(ctx.warnings)
        total_bad += len(problems)

        unit = {
            "version": "reading/v1",
            "id": unit_id(path.stem),
            "line": LINE,
            "group": SUBJECT[sub],
            "title": display_title(path.stem),
            "source": str(path.relative_to(NOTEBOOK.parent)),
            "sourceSha": sha8(path),
            "blocks": blocks,
        }
        emit(unit, OUT)
        units.append(
            {
                "id": unit["id"],
                "title": unit["title"],
                "group": unit["group"],
                "source": unit["source"],
                "sha": unit["sourceSha"],
                "n": len(blocks),
                "problems": problems[:2],
            }
        )
        if problems:
            print(f"  ! {unit['id']}: {problems[0]}")

    units.sort(key=lambda u: (
        next((ORDER[k] for k, v in SUBJECT.items() if v == u["group"]), 9),
        u["id"],
    ))
    import json

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "_units.json").write_text(
        json.dumps(units, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    n_blocks = sum(u["n"] for u in units)
    print(f"数一：{len(units)} 单元 / {n_blocks} 块 / 未映射命令 {total_warn} 处 / 自检问题 {total_bad} 处")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
