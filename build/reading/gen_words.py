#!/usr/bin/env python3
"""英语单词表 → 朗读稿。

输入：`notebook/kaoyan/english1/words/*.md`（30 个主题文件，实测 3981 个词条）
输出：`learning-web/readable/english1/words-*.json`

## 为什么每个词后面都是句号

原文是 `- \`know\` *v.* 知道；了解`，中文分号在 TTS 里的停顿比句号短得多，
连听 200 个词会糊成一片。所以统一改成「英文词。词性。中文义。」

## 词性必须转中文

`*v.*` 这种缩写 TTS 会念成「v 点」，所以映射成「动词」。
未登记的词性原样保留（宁可念得怪，也不猜错词性）。
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from common import Ctx, NOTEBOOK, check, emit, inline, sha8  # noqa: E402

SRC = NOTEBOOK / "kaoyan/english1/words"
OUT = Path("/Users/apple/develop/learning/learning-web/readable/english1")
LINE = "english1"

POS = {
    "v": "动词", "vi": "不及物动词", "vt": "及物动词",
    "n": "名词", "adj": "形容词", "adv": "副词",
    "prep": "介词", "conj": "连词", "pron": "代词",
    "num": "数词", "art": "冠词", "phr": "短语",
    "aux": "助动词", "int": "感叹词", "abbr": "缩写",
}

WORD = re.compile(r"^-\s+`([^`]+)`\s*\*([A-Za-z.]+)\*\s*(.+)$")
BARE = re.compile(r"^-\s+(.+)$")
HEAD = re.compile(r"^#{1,6}\s+(.*)$")


def pos_cn(raw: str) -> str:
    key = raw.strip().strip(".").lower()
    return POS.get(key, raw.strip())


def read_wordlist(path: Path) -> list[dict]:
    ctx = Ctx(subdir="")
    blocks: list[dict] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line:
            continue
        m = HEAD.match(line)
        if m:
            blocks.append({"t": "h2", "x": inline(m.group(1), ctx)})
            continue
        m = WORD.match(line)
        if m:
            word, sense = m.group(1).strip(), m.group(3).strip()
            # 只取**最直观的那个义项**（第一个），并去掉「（超纲）」这类标记。
            # 听的时候词性没有价值（"动词"念一遍只是噪音），义项多了反而记不住。
            first = sense.split("；")[0].split(";")[0]
            first = re.sub(r"[（(][^）)]*[）)]", "", first).strip()
            body = inline(first, ctx).strip("。，、；; ")
            # 英文念两遍：第一遍建立声音，第二遍跟读。这是背单词的实际节奏。
            blocks.append({"t": "li", "x": f"{word}。{word}。{body}。"})
            continue
        m = BARE.match(line)
        if m:
            text = inline(m.group(1), ctx)
            if text:
                blocks.append({"t": "li", "x": text})
    return blocks


def main() -> int:
    units: list[dict] = []
    total = 0
    bad: list[str] = []
    for path in sorted(SRC.glob("*.md")):
        if path.name.lower() == "readme.md":
            continue
        blocks = read_wordlist(path)
        if not blocks:
            continue
        stem = path.stem  # 01-核心动词（上）
        uid = "words-" + stem.split("-")[0]
        unit = {
            "version": "reading/v1",
            "id": uid,
            "line": LINE,
            "group": "英语单词",
            "title": stem,
            "source": str(path.relative_to(NOTEBOOK.parent)),
            "sourceSha": sha8(path),
            "blocks": blocks,
        }
        emit(unit, OUT)
        probs = check(blocks)
        bad.extend(probs[:1])
        total += sum(1 for b in blocks if b["t"] == "li")
        units.append({
            "id": uid, "title": stem, "group": "英语单词",
            "source": unit["source"], "sha": unit["sourceSha"],
            "n": len(blocks), "words": sum(1 for b in blocks if b["t"] == "li"),
        })
        if probs:
            print(f"  ! {uid}: {probs[0]}")

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "_words.json").write_text(
        json.dumps(units, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    print(f"单词：{len(units)} 单元 / {total} 词条 / 自检问题 {len(bad)} 处")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
