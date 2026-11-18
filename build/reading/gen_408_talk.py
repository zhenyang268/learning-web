#!/usr/bin/env python3
"""讲解稿 → 朗读稿（主力形态）。

输入：`build/reading/talk/*.md`
输出：`readable/cs408/*.json` + `cs408/_talk.json`，数一的稿子进 `readable/math1/`

## 文件命名决定去向

| 前缀 | 站点 | 分组 |
|---|---|---|
| `408-guide-*` | cs408 | 408 导读（四科各一篇） |
| `408-tiers-*` | cs408 | 408 分层（应试分数账本） |
| `408-kp-*` | cs408 | 408 考点讲解 |
| `math1-HS-*` / `math1-LA-*` / `math1-PS-*` | **math1** | 数一 · 高数 / 线代 / 概率 |

## 为什么讲解稿要单独成文，而不是从 syllabus/408.md 转

`syllabus/408.md` 是考纲表格（7 列 × 120 行），把它念出来是「顺序表，要求 A 掌握，
常考。核心：随机访问的代价；插入删除平均移动 n 除以 2；扩容」—— 这是读表格，不是讲课。
真正的讲解要回答「为什么有它、加这个部件解决什么、哪几格不一样」，这层规则做不了。

## 讲解稿的硬约束（详见 `prompt/kp-guide.md`）

- 事实必须能在 `notebook/` 找到出处，文件头写 `源：`
- 允许扩写讲法（过渡、因果、举例），不允许新增事实
- 公式一律写成可朗读形式（`n/2` → `n 除以 2`，`O(1)` → `O 1`）
- 不写题号、选项字母、代码片段、单字母变量
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from common import Ctx, check, emit, read_blocks, sha8  # noqa: E402

TALK = Path(__file__).parent / "talk"
OUT_ROOT = Path("/Users/apple/develop/learning/learning-web/readable")

# 前缀 → (站点, 分组, 排序权重)
GROUPS: list[tuple[str, str, str, int]] = [
    ("408-guide", "cs408", "408 导读", 0),
    ("408-tiers", "cs408", "408 分层", 1),
    ("408-kp", "cs408", "408 考点讲解", 2),
    ("math1-HS", "math1", "数一 · 高等数学", 3),
    ("math1-LA", "math1", "数一 · 线性代数", 4),
    ("math1-PS", "math1", "数一 · 概率统计", 5),
    ("english1", "english1", "英语题型讲解", 6),
]


def route_of(stem: str) -> tuple[str, str, int]:
    """文件名前缀 → (站点, 分组, 权重)。未登记前缀默认归 408 考点讲解。"""
    for prefix, line, group, weight in GROUPS:
        if stem.startswith(prefix):
            return line, group, weight
    return "cs408", "408 考点讲解", 9


def main() -> int:
    per_line: dict[str, list[dict]] = {}
    total_bad = 0

    for path in sorted(TALK.glob("*.md")):
        stem = path.stem
        line, group, weight = route_of(stem)
        ctx = Ctx(subdir="")
        blocks = read_blocks(path.read_text(encoding="utf-8"), ctx)
        if not blocks:
            continue
        title = next((b["x"] for b in blocks if b["t"].startswith("h")), stem)
        out_dir = OUT_ROOT / line

        unit = {
            "version": "reading/v1",
            "id": stem,
            "line": line,
            "group": group,
            "title": title,
            "source": f"build/reading/talk/{path.name}",
            "sourceSha": sha8(path),
            "blocks": blocks,
        }
        emit(unit, out_dir)
        probs = check(blocks)
        total_bad += len(probs)
        per_line.setdefault(line, []).append({
            "id": stem, "title": title, "group": group,
            "source": unit["source"], "sha": unit["sourceSha"],
            "n": len(blocks), "_w": weight,
            "problems": probs[:2],
        })
        for p in probs[:2]:
            print(f"  ! {stem}: {p}")

    total_units = 0
    for line, units in per_line.items():
        units.sort(key=lambda u: (u["_w"], u["id"]))
        for u in units:
            u.pop("_w", None)
        out_dir = OUT_ROOT / line
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "_talk.json").write_text(
            json.dumps(units, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
        )
        total_units += len(units)
        print(f"{line}：{len(units)} 单元 / {sum(u['n'] for u in units)} 块")

    print(f"讲解稿合计 {total_units} 单元 / 自检问题 {total_bad} 处")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
