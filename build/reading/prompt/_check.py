"""讲解稿自检：字数、六段结构、禁用词、残留符号。

用法：uv run python build/reading/prompt/_check.py talk/408-kp-0203.md
"""
import re
import sys
from pathlib import Path

BAN = [
    "非常重要", "重点掌握", "众所周知", "显然", "我们可以看到", "本考点主要考查",
    "先说好消息", "你可能会想", "这不就是", "很多人以为", "值得注意",
]
SECTIONS = ["钩子", "是什么", "应用", "考什么", "考点", "边界"]  # 仅用于人工提示，不强制标题措辞


def main() -> int:
    path = Path(sys.argv[1])
    text = path.read_text(encoding="utf-8")
    body = "\n".join(
        ln for ln in text.splitlines() if not ln.startswith(("#", ">"))
    )
    chars = len(re.sub(r"\s", "", body))
    n_sect = len(re.findall(r"^## ", text, flags=re.M))
    # v3（2026-11-18）：分层铺垫 + 矩阵考点。区间按格数分档，短不罚、灌水才罚。
    # 整科导读（guide）与分层（tiers）天然比单个 KP 长，单独一档
    name = Path(sys.argv[1]).name
    lo, hi = (1200, 2800) if ("guide" in name or "tiers" in name) else (1000, 2000)
    print(f"字数 {chars}（目标 {lo}–{hi}，共 {n_sect} 节）{'OK' if lo <= chars <= hi else '超范围'}")

    # 源文件里允许 markdown 标记（反引号、加粗），先剥掉再查残留 —— 否则会把
    # 正常的 `list_head` 误报成「残留下划线」。产物侧的检查在 gen_* 的 check()。
    prose = re.sub(r"`[^`]*`", "", body)
    prose = re.sub(r"[*_]{1,3}([^*_]+)[*_]{1,3}", r"\1", prose)
    residue = sorted({c for c in "$\\|{}" if c in prose})
    print(f"残留符号（已剥 markdown）{residue or '无'}")

    hits = [w for w in BAN if w in body]
    print(f"禁用词 {hits or '无'}")

    heads = re.findall(r"^## (.+)$", text, flags=re.M)
    print(f"二级标题 {len(heads)} 个：")
    for h in heads:
        print(f"  - {h}")

    asks = body.count("？")
    print(f"问号 {asks} 个（v2 不强制设问，0–2 即可）")

    # 符号禁令：朗读时看不见题面与代码，单字母变量、题号、选项字母都是噪音。
    # `i` 不查 —— 「第 i 个元素」是数学惯用语，不是变量占位。
    sym = re.findall(r"(?<![A-Za-z])[pqshL](?![A-Za-z])", body)
    exam = re.findall(r"第\s*\d+\s*题|选项\s*[A-D]", body)
    print(f"单字母变量 {len(sym)} 处 {sorted(set(sym)) if sym else ''}")
    print(f"题号/选项 {len(exam)} 处 {exam[:3] if exam else ''}")

    ok = lo <= chars <= hi and not residue and not hits and not sym and not exam
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
