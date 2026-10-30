#!/usr/bin/env python
r"""组装冻结前缀：prefix_head.md + 全库代号清单 + A1.3.json 样例 + prefix_tail.md。

确定性拼接，输出 build/prompts/gen_prefix.md 并打印 sha256。
改任何组成部分 = 前缀变更，必须重跑本脚本并在批间（非批中）应用。
用法：cd learning-web && uv run python build/make_prefix.py
"""
import hashlib
import json
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent
PROMPTS = WEB / "build" / "prompts"

head = (PROMPTS / "prefix_head.md").read_text(encoding="utf-8")
tail = (PROMPTS / "prefix_tail.md").read_text(encoding="utf-8")
sample = (WEB / "json" / "A1" / "A1.3.json").read_text(encoding="utf-8")
slices = json.loads((WEB / "build" / "state" / "slices.json").read_text(encoding="utf-8"))

lines = [f"- `{u['code']}` — {u['title']}（{u['file']}）" for u in slices["units"]]
manifest_block = "\n".join(lines) + "\n"

parts = [
    head,
    manifest_block,
    "\n",
    tail,
    sample,
    "\n```\n\n---\n\n以上为全部规格与参考。接下来是你的生成单元。\n\n# 你的生成单元\n",
]
prefix = "".join(parts)
out = PROMPTS / "gen_prefix.md"
out.write_text(prefix, encoding="utf-8")
h = hashlib.sha256(prefix.encode("utf-8")).hexdigest()
(PROMPTS / "gen_prefix.sha256").write_text(h + "\n", encoding="utf-8")
print(f"gen_prefix.md: {len(prefix)} 字符 ≈ {len(prefix)//3} token 量级")
print(f"sha256: {h}")
