#!/usr/bin/env python3
"""英语作文与题型讲义 → 朗读稿。

输入：`notebook/kaoyan/english1/0*.md`（`00-词汇` 除外）
输出：`learning-web/readable/english1/wr-*.json`

## 中英混排怎么处理

正文是中文讲解夹英文例句。实测（2026-11-18）Edge 的中文自然音色念英文句子
没问题，所以英文例句**原样保留**，不加 `lang` 标注（实测加了也没区别）。

真正要治的是正文里的符号：公式（`$$S \\approx S_档 \\times \\lambda_语言$$`）
走 `common.read_math`，`*斜体*` 剥掉标记留文字。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from common import Ctx, NOTEBOOK, check, emit, read_blocks, sha8  # noqa: E402

SRC = NOTEBOOK / "kaoyan/english1"
OUT = Path("/Users/apple/develop/learning/learning-web/readable/english1")
LINE = "english1"

# 00-词汇 是单词总览，已由 gen_words 覆盖；README 是目录说明
SKIP = {"00-词汇", "README"}


def main() -> int:
    units: list[dict] = []
    for path in sorted(SRC.glob("0*.md")):
        if path.stem in SKIP:
            continue
        ctx = Ctx(subdir="")
        blocks = read_blocks(path.read_text(encoding="utf-8"), ctx)
        if not blocks:
            continue
        uid = "wr-" + path.stem.split("-")[0]
        unit = {
            "version": "reading/v1",
            "id": uid,
            "line": LINE,
            "group": "英语作文",
            "title": path.stem,
            "source": str(path.relative_to(NOTEBOOK.parent)),
            "sourceSha": sha8(path),
            "blocks": blocks,
        }
        emit(unit, OUT)
        probs = check(blocks)
        units.append({
            "id": uid, "title": path.stem, "group": "英语作文",
            "source": unit["source"], "sha": unit["sourceSha"],
            "n": len(blocks), "problems": probs[:2],
        })
        if probs:
            print(f"  ! {uid}: {probs[0]}")
        if ctx.warnings:
            print(f"  ~ {uid}: {ctx.warnings[0]}")

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "_writing.json").write_text(
        json.dumps(units, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    print(f"作文：{len(units)} 单元 / {sum(u['n'] for u in units)} 块")
    for u in units:
        print(f"  {u['id']}  {u['title']}  ({u['n']} 块)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
