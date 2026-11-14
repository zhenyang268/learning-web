"""Markdown → 词条切分（确定性，禁 LLM）。

规则：
- 只按 **H2**（`## `）切段；`###` 及更深留在 content 里，表格 / 代码块 / KaTeX 原样。
- H1 抽成单元标题（`source_h1`），不占词条。
- H1 与第一个 H2 之间的正文 = 引言词条（level 0，无标题）。
- 切完**当场对账**：拼回去必须与源文本归一后完全相等，不等直接抛错（带首个差异位置）。
"""
from __future__ import annotations

import re

from common import fix_math, norm, reconstruct

H1_RE = re.compile(r"^#\s+(.*)$")
H2_RE = re.compile(r"^##\s+(.*)$")


def split_markdown(text: str) -> tuple[str | None, list[tuple[int, str, str]]]:
    """返回 (h1, [(level, title, content)])；chunks 覆盖全文且不重叠。"""
    lines = text.splitlines()
    h1: str | None = None
    start = 0
    for i, line in enumerate(lines):
        m = H1_RE.match(line)
        if m and not line.startswith("##"):
            h1 = m.group(1).strip()
            start = i + 1
            break

    body = lines[start:]
    chunks: list[tuple[int, str, str]] = []

    # 第一个 H2 之前 = 引言
    first = next((i for i, l in enumerate(body) if H2_RE.match(l)), None)
    if first is None:
        pre = "\n".join(body)
        if pre.strip():
            chunks.append((0, "", _trim(pre)))
        return h1, chunks

    pre = "\n".join(body[:first])
    if pre.strip():
        chunks.append((0, "", _trim(pre)))

    cur_title: str | None = None
    buf: list[str] = []
    for line in body[first:]:
        m = H2_RE.match(line)
        if m:
            if cur_title is not None:
                chunks.append((2, cur_title, _trim("\n".join(buf))))
            cur_title = m.group(1).strip()
            buf = []
        else:
            buf.append(line)
    if cur_title is not None:
        chunks.append((2, cur_title, _trim("\n".join(buf))))

    # 公式勘误（源侧写法问题）：切分阶段就修正，保证「拼回去 == 修正后的源」仍然成立
    chunks = [(lv, t, fix_math(c)) for lv, t, c in chunks]
    _verify(text, h1, chunks)
    return h1, chunks


def _trim(s: str) -> str:
    return s.strip("\n")


def _verify(text: str, h1: str | None, chunks: list[tuple[int, str, str]]) -> None:
    entries = [
        {"level": lv, "title": t, "content": c} for lv, t, c in chunks
    ]
    got = reconstruct(h1, entries)
    want = norm(fix_math(text))
    if got == want:
        return
    # 找首个差异，便于定位（不打印全文）
    at = next((i for i, (a, b) in enumerate(zip(got, want)) if a != b), min(len(got), len(want)))
    lo = max(0, at - 60)
    raise AssertionError(
        "Markdown 切分后对账失败（首个差异 @{}）：\n  拼回：{!r}\n  原文：{!r}".format(
            at, got[lo:at + 60], want[lo:at + 60]
        )
    )
