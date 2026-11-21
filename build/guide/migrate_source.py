#!/usr/bin/env python3
"""把 guide-card/v1 的 source 统一成「单元 json + 内容源」两层。

旧口径：
- Mode T（cs408/kaoyan/english1）：source.unit 已经是单元 json；
- Mode S（math/emath/projects）：source.unit 其实是 notebook 内容源，
  unitSha 也是内容源的 sha，和 _progress 里的单元 shasha 不是一回事。

新口径（guide-card/v1 仍兼容旧卡，闸门按新口径判）：
- source.unit      = 单元 json（相对 learning-web），unitSha = 单元 json sha12
- source.note      = 内容源（相对父仓 notebook/...），noteSha = 内容源 sha12
- Mode T 继续保留 source.talk / talkSha；Mode S 不写 talk
- __site 没有单元 json，source.unit 继续指向 notebook/projects/README.md

用法：
  uv run python build/guide/migrate_source.py --dry-run
  uv run python build/guide/migrate_source.py --apply
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PARENT = ROOT.parent
GUIDE = ROOT / "guide"

SITE_JSON = {
    "math": "json",
    "emath": "emath/json",
    "cs408": "cs408/json",
    "kaoyan": "kaoyan/json",
    "projects": "projects/json",
    "english1": "english1/json",
}
MODE_T = {"cs408", "kaoyan", "english1"}
MODE_S = {"math", "emath", "projects"}


def sha12(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, doc: dict) -> None:
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def unit_json_for(site: str, code: str) -> Path | None:
    if code == "__site":
        return None
    chapter = code.split(".")[0]
    return ROOT / SITE_JSON[site] / chapter / f"{code}.json"


def card_files(site: str) -> list[Path]:
    base = GUIDE / site
    if not base.exists():
        return []
    out: list[Path] = []
    for path in base.rglob("*.json"):
        if path.name.startswith("_"):
            continue
        out.append(path)
    return sorted(out)


def note_for(site: str, code: str, card: dict, map_units: dict) -> str:
    old = (card.get("source") or {}).get("unit") or ""
    if code == "__site":
        return "notebook/projects/README.md"
    # 旧卡有时写的是未解析路径（notebook/B_algebra.tex），以 _map.src 为准
    mapped = (map_units.get(code) or {}).get("src") or ""
    for cand in (old, mapped):
        if cand and (PARENT / cand).exists():
            return cand
    # 最后尝试 notebook/math/<basename>
    if old:
        cand = f"notebook/math/{Path(old).name}"
        if (PARENT / cand).exists():
            return cand
    return old or mapped


def migrate(dry_run: bool) -> int:
    problems: list[str] = []
    changed_cards = 0
    changed_fields = 0

    for site in sorted(SITE_JSON):
        map_path = GUIDE / site / "_map.json"
        map_units = (load_json(map_path).get("units") or {}) if map_path.exists() else {}
        cards = card_files(site)
        if not cards:
            continue
        for card_path in cards:
            card = load_json(card_path)
            code = card.get("code") or card_path.stem
            src = card.get("source")
            if not isinstance(src, dict):
                problems.append(f"{card_path}: source 缺失")
                continue

            unit = unit_json_for(site, code)
            before = json.dumps(src, ensure_ascii=False, sort_keys=True)

            if code == "__site":
                note_rel = "notebook/projects/README.md"
                note_abs = PARENT / note_rel
                src["unit"] = note_rel
                src["unitSha"] = sha12(note_abs) if note_abs.exists() else src.get("unitSha")
                src.pop("note", None)
                src.pop("noteSha", None)
                src.pop("talk", None)
                src.pop("talkSha", None)
            else:
                if unit is None or not unit.exists():
                    problems.append(f"{card_path}: 单元 json 不存在 {unit}")
                    continue
                src["unit"] = str(unit.relative_to(ROOT))
                src["unitSha"] = sha12(unit)
                if site in MODE_S:
                    note_rel = note_for(site, code, card, map_units)
                    note_abs = PARENT / note_rel
                    if not note_rel or not note_abs.exists():
                        problems.append(f"{card_path}: 内容源不存在 {note_rel!r}")
                    else:
                        src["note"] = note_rel
                        src["noteSha"] = sha12(note_abs)
                    src.pop("talk", None)
                    src.pop("talkSha", None)
                else:
                    src.pop("note", None)
                    src.pop("noteSha", None)
                    talk_rel = src.get("talk") or (map_units.get(code) or {}).get("talk")
                    if talk_rel and (ROOT / talk_rel).exists():
                        src["talk"] = talk_rel
                        src["talkSha"] = sha12(ROOT / talk_rel)
                    else:
                        problems.append(f"{card_path}: talk 源不存在 {talk_rel!r}")

            after = json.dumps(src, ensure_ascii=False, sort_keys=True)
            if after != before:
                changed_cards += 1
                changed_fields += 1
                if not dry_run:
                    write_json(card_path, card)
                else:
                    print(f"[dry] {card_path.relative_to(ROOT)}")

        # 同步 _progress
        prog_path = GUIDE / site / "_progress.json"
        if not prog_path.exists():
            continue
        prog = load_json(prog_path)
        units = prog.get("units") or {}
        for code, item in units.items():
            if item.get("status") == "skip":
                continue
            unit = unit_json_for(site, code)
            if code == "__site":
                note_abs = PARENT / "notebook/projects/README.md"
                item["unitSha"] = sha12(note_abs) if note_abs.exists() else item.get("unitSha")
                item.pop("noteSha", None)
            elif unit is not None and unit.exists():
                item["unitSha"] = sha12(unit)
                if site in MODE_S:
                    note_rel = note_for(site, code, {}, map_units)
                    note_abs = PARENT / note_rel
                    if note_rel and note_abs.exists():
                        item["noteSha"] = sha12(note_abs)
            if site in MODE_T:
                talk_rel = (map_units.get(code) or {}).get("talk") or ""
                if talk_rel and (ROOT / talk_rel).exists():
                    item["talkSha"] = sha12(ROOT / talk_rel)
        if not dry_run:
            write_json(prog_path, prog)

    print(f"[migrate] 卡片 {changed_cards} 个需要改（dry_run={dry_run}）")
    if problems:
        print(f"[migrate] 问题 {len(problems)} 条：", file=sys.stderr)
        for p in problems[:40]:
            print("  - " + p, file=sys.stderr)
        return 1
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.dry_run and not args.apply:
        ap.error("需要 --dry-run 或 --apply")
    return migrate(dry_run=args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())