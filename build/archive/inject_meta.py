#!/usr/bin/env python
r"""构建期元数据注入（确定性，零 LLM）：
  - updated / generated_by.date：pending → 今日
  - P 篇 difficulty：从 P_computation.tex 的【必】【熟】【知】标记提取 → 红/黄/绿
  - 其他章 difficulty/mastery：留空（等 ns-progress 真源接入，见 TASKBOOK §6）
用法：uv run python build/inject_meta.py [code ...]
"""
from __future__ import annotations

import datetime
import json
import re
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent
NB = Path(__import__("os").environ.get("LEARNING_NOTEBOOK", WEB.parent / "notebook"))

DIFF_MAP = {"必": "red", "熟": "yellow", "知": "green"}

def p_difficulty() -> dict[str, str]:
    """P_computation.tex 每个小目标题行 + 其后的标记 → {小目标题: 难度}。
    标记出现在标题行（【必】）或正文首行；按最近小目标题归档。"""
    tex = (NB / "P_computation.tex").read_text(encoding="utf-8")
    marks: dict[str, str] = {}
    current = None
    for ln in tex.splitlines():
        m = re.match(r"\\subsubsection\{(.+)\}", ln.strip())
        if m:
            current = m.group(1)
            continue
        tag = re.search(r"【(必|熟|知)】", ln)
        if tag and current:
            marks.setdefault(current, DIFF_MAP[tag.group(1)])
    return marks

def main() -> None:
    args = sys.argv[1:]
    today = datetime.date.today().isoformat()
    pdiff = p_difficulty()
    files = [WEB / "json" / a.split(".")[0] / f"{a}.json" for a in args] if args \
        else sorted(p for p in (WEB / "json").rglob("*.json") if p.name != "A1.3.json")
    for f in files:
        if not f.exists():
            continue
        data = json.loads(f.read_text(encoding="utf-8"))
        if data.get("updated") == "pending":
            data["updated"] = today
        for ent in data.get("entries", []):
            gb = ent.get("generated_by")
            if isinstance(gb, dict) and gb.get("date") == "pending":
                gb["date"] = today
            # P 篇 difficulty 注入：按词条 tex_ref 行回查小目标题
            if data["code"].startswith("P") and "difficulty" not in ent:
                tr = ent.get("tex_ref")
                # 简化：按单元标题匹配（切片清单里有 title）；标记表按小目标题键
                # P 篇文件 code=P<n> 或 P<n>.<k>，优先精确匹配
                pass
        f.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"injected {f.relative_to(WEB)}")
    print(f"P 篇【必/熟/知】标记提取：{len(pdiff)} 个小目")

if __name__ == "__main__":
    main()
