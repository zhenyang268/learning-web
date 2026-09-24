#!/usr/bin/env python
"""把评审通过的卡片 JSON 注入 index.html 的 #cards-data 占位。

用法（父仓 uv 环境）：
  cd /Users/apple/develop/learning
  uv run python learning-web/example/lie/inject_cards.py

校验（不通过即退出 1，不写文件）：
  1. JSON 可解析、entries 非空；
  2. id 唯一；section ∈ {lie1,lie2,lie3}；type 在白名单内；
  3. question 非空（父仓规约：留空的卡片没有产品价值）；
  4. content_html 净化：不许 <script、on*=  属性、javascript: 协议、<iframe/<link/<img；
  5. tex_ref 必须形如 lieN.tex:数字-数字。
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
HTML = HERE / "index.html"

TYPES = {"statement", "intuition", "comparison", "application", "counterexample", "probe"}
SECTIONS = {"lie1", "lie2", "lie3"}
BAD_PATTERNS = [
    (re.compile(r"<\s*script", re.I), "<script>"),
    (re.compile(r"<\s*(iframe|link|img|meta|style)\b", re.I), "危险标签"),
    (re.compile(r"\son\w+\s*=", re.I), "内联事件属性 on*="),
    (re.compile(r"javascript\s*:", re.I), "javascript: 协议"),
    (re.compile(r"<\s*/\s*(iframe|link|img|meta|style|script)\b", re.I), "危险闭合标签"),
]


def fail(msg: str) -> None:
    print(f"[FAIL] {msg}")
    sys.exit(1)


def main() -> None:
    entries: list[dict] = []
    for name in ("cards-lie12.json", "cards-lie3.json"):
        p = DATA / name
        if not p.exists():
            fail(f"缺少 {p}")
        obj = json.loads(p.read_text(encoding="utf-8"))
        if not isinstance(obj.get("entries"), list) or not obj["entries"]:
            fail(f"{name}: entries 为空或缺失")
        entries.extend(obj["entries"])
        print(f"[ok ] {name}: {len(obj['entries'])} 张卡片")

    seen: set[str] = set()
    for c in entries:
        cid = c.get("id", "")
        if cid in seen:
            fail(f"id 重复：{cid}")
        seen.add(cid)
        if c.get("section") not in SECTIONS:
            fail(f"{cid}: section 非法：{c.get('section')}")
        if c.get("type") not in TYPES:
            fail(f"{cid}: type 非法：{c.get('type')}")
        if not (c.get("question") or "").strip():
            fail(f"{cid}: question 为空（父仓规约：必填）")
        html = c.get("content_html") or ""
        for pat, desc in BAD_PATTERNS:
            if pat.search(html):
                fail(f"{cid}: content_html 含 {desc}")
        m = re.fullmatch(r"lie[123]\.tex:(\d+)-(\d+)", c.get("tex_ref", ""))
        if not m or int(m.group(1)) > int(m.group(2)):
            fail(f"{cid}: tex_ref 格式非法：{c.get('tex_ref')!r}")

    html = HTML.read_text(encoding="utf-8")
    marker = '<script type="application/json" id="cards-data">'
    if marker not in html:
        fail("index.html 里找不到 #cards-data 占位")
    start = html.index(marker) + len(marker)
    end = html.index("</script>", start)
    injected = json.dumps({"entries": entries}, ensure_ascii=False, separators=(",", ":"))
    HTML.write_text(html[:start] + injected + html[end:], encoding="utf-8")
    counts: dict[str, int] = {}
    for c in entries:
        counts[c["section"]] = counts.get(c["section"], 0) + 1
    print(f"[done] 注入完成：共 {len(entries)} 张，分布 {counts}")
    print("      双击 index.html 或以 file:// 打开即可看到全部卡片。")


if __name__ == "__main__":
    main()
