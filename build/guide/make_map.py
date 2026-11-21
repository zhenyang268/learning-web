#!/usr/bin/env python3
"""guide-card 映射表生成（cs408 / kaoyan / english1）。

对齐顺序：
1. **源文件**：talk 头部「源：」那一行的路径与 unit 的 src.file 相等 → 直接对上
   （三个站点都成立，最稳）；
2. **代号**：源缺失时按文件名推 kp（cs408: `408-<学科>-<四位>`；数一: `M1-<学科>-<四位>`）；
3. 仍对不上 → 进 `unmapped`，exit 1。

任何 talk 没映射、任何目标单元没覆盖，都 exit 1 并打印清单 ——
不允许静默跳过，否则「全绿」可能是少了一半。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PARENT = ROOT.parent  # notebook/ 在父仓，工程线 src.file 相对父仓
TALK_DIR = ROOT / "build" / "reading" / "talk"

SRC_RE = re.compile(r"源：`([^`]+)`")

SITES = {
    "cs408": {
        "json": ROOT / "cs408" / "json",
        "out": ROOT / "guide" / "cs408",
        "kind": "kaoyan-kp",
        "talk_re": re.compile(r"^408-kp-(?:([A-Z]+)-)?(\d{4})\.md$"),
        "kp_fmt": "408-{subj}-{digits}",
        "default_subj": "DS",
    },
    "kaoyan": {
        "json": ROOT / "kaoyan" / "json",
        "out": ROOT / "guide" / "kaoyan",
        "kind": "kaoyan-kp",
        "talk_re": re.compile(r"^math1-([A-Z]{2})-(\d{4})\.md$"),
        "kp_fmt": "M1-{subj}-{digits}",
        "default_subj": "",
    },
    "math": {
        "json": ROOT / "json",
        "out": ROOT / "guide" / "math",
        "kind": "",
        "talk_re": re.compile(r"^$"),
        "kp_fmt": "",
        "default_subj": "",
    },
    "emath": {
        "json": ROOT / "emath" / "json",
        "out": ROOT / "guide" / "emath",
        "kind": "",
        "talk_re": re.compile(r"^$"),
        "kp_fmt": "",
        "default_subj": "",
    },
    "projects": {
        "json": ROOT / "projects" / "json",
        "out": ROOT / "guide" / "projects",
        "kind": "",
        "talk_re": re.compile(r"^$"),
        "kp_fmt": "",
        "default_subj": "",
    },
    "english1": {
        "json": ROOT / "english1" / "json",
        "out": ROOT / "guide" / "english1",
        "kind": "english1-lecture",
        "talk_re": re.compile(r"^english1-wr-(\d{2})\.md$"),
        "kp_fmt": "",
        "default_subj": "",
    },
}

# 英一词表类单元：不进 units，进 skipped
WORD_KINDS = ("english1-words", "english1-words-guide", "english1-supplement")
WORD_REASON = "词表/补全表，不是讲解稿；没有可写的「为什么有它」"


def sha12(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def resolve_src(src: str) -> str:
    """数学系旧 src 写的是 notebook/<file>.tex，实际在 notebook/math/ 下。

    只做**存在性**校正：原路径在父仓真实存在就不动；否则同 basename 在
    notebook/math/ 下存在才替换。两边都没有就保留原值，让闸门报 CRIT。
    """
    if not src:
        return src
    if (PARENT / src).exists():
        return src
    # 已改名的源：PR 的 C_partial→C_prob；ODE 的 diffrential/deN→math/odeN
    if Path(src).name == "C_partial.tex" and (PARENT / "notebook/math/C_prob.tex").exists():
        return "notebook/math/C_prob.tex"
    m = re.search(r"/diffrential/de(\d+)\.tex$", src)
    if m:
        cand = f"notebook/math/ode{m.group(1)}.tex"
        if (PARENT / cand).exists():
            return cand
    cand = "notebook/math/" + Path(src).name
    if (PARENT / cand).exists():
        return cand
    return src


def load_units(site: str) -> tuple[dict[str, dict], list[dict]]:
    """返回 (参与映射的单元, 明确 skip 的单元)。"""
    cfg = SITES[site]
    root: Path = cfg["json"]
    want_kind = cfg["kind"]
    units: dict[str, dict] = {}
    skipped: list[dict] = []
    for path in sorted(root.rglob("*.json")):
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"[make_map] 跳过坏 JSON {path}: {exc}", file=sys.stderr)
            continue
        meta = doc.get("meta") or {}
        kind = meta.get("kind")
        code = doc.get("code") or path.stem
        src = (doc.get("src") or {}).get("file") or ""

        if site in ("math", "emath"):
            if path.name == "index.json" or code == "index":
                skipped.append({"code": code, "kind": kind, "reason": "索引文件，不是单元"})
                continue
            if not doc.get("entries"):
                skipped.append({"code": code, "kind": kind, "reason": "空章节，没有可导的内容"})
                continue
            if site == "emath" and kind == "library-know":
                skipped.append({
                    "code": code, "kind": kind,
                    "reason": "逐词条单元；导学卡按章级写，落在 NL 章首而不是每条",
                })
                continue
            units[code] = {
                "kp": None,
                "kind": kind,
                "src": resolve_src(src),
                "path": str(path.relative_to(ROOT)),
            }
            continue

        if site == "projects":
            if kind in ("project-group", "project"):
                if code.endswith(".1"):
                    units[code] = {
                        "kp": None,
                        "kind": kind,
                        "src": src,
                        "path": str(path.relative_to(ROOT)),
                    }
                else:
                    skipped.append({"code": code, "kind": kind, "reason": "不是项目/分组总览"})
            elif kind == "project-chapter":
                skipped.append({
                    "code": code, "kind": kind,
                    "reason": "正文是逐节教材，已有自己的导语；导学卡在项目/分组层",
                })
            elif kind == "project-extra":
                skipped.append({
                    "code": code, "kind": kind,
                    "reason": "附加页（英文大纲/编译器路线），不是项目总览",
                })
            elif kind == "project-index":
                skipped.append({
                    "code": code, "kind": kind,
                    "reason": "检索表，不是教学单元",
                })
            continue

        if site == "english1" and kind in WORD_KINDS:
            skipped.append({"code": code, "kind": kind, "reason": WORD_REASON})
            continue
        if kind != want_kind:
            continue
        units[code] = {
            "kp": meta.get("kp"),
            "kind": kind,
            "src": src,
            "path": str(path.relative_to(ROOT)),
        }
    if site == "projects":
        readme = "notebook/projects/README.md"
        units["__site"] = {"kp": None, "kind": "site", "src": readme, "path": readme}
    return units, skipped


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", required=True, choices=sorted(SITES))
    args = ap.parse_args()
    site = args.site
    cfg = SITES[site]

    if not TALK_DIR.is_dir():
        print(f"[make_map] 缺 talk 目录：{TALK_DIR}", file=sys.stderr)
        return 2
    if not cfg["json"].is_dir():
        print(f"[make_map] 缺 json 目录：{cfg['json']}", file=sys.stderr)
        return 2

    units, skipped = load_units(site)
    mapped: dict[str, dict] = {}
    unmapped: list[str] = []
    mismatched: list[str] = []
    talks: list[Path] = []

    if site in ("projects", "math", "emath"):
        # Mode S：没有逐单元 talk；43 个目标直接由 kind 选出，13 篇 projects-*.md 不作 scaffold
        mapped = {
            code: {"kind": u["kind"], "src": u["src"], "path": u["path"], "mode": "S"}
            for code, u in units.items()
        }
        unused = sorted(set(units) - set(mapped))
    else:
        by_src = {u["src"]: code for code, u in units.items() if u["src"]}
        by_kp = {u["kp"]: code for code, u in units.items() if u["kp"]}
        talks = sorted(p for p in TALK_DIR.glob("*.md") if cfg["talk_re"].match(p.name))

        for talk in talks:
            head = talk.read_text(encoding="utf-8")[:800]
            m = SRC_RE.search(head)
            talk_src = m.group(1) if m else ""
            code = by_src.get(talk_src) if talk_src else None

            if not code:
                m_name = cfg["talk_re"].match(talk.name)
                assert m_name is not None
                if site == "cs408":
                    subj = m_name.group(1) or cfg["default_subj"]
                    digits = m_name.group(2)
                    kp = cfg["kp_fmt"].format(subj=subj, digits=digits)
                elif site == "kaoyan":
                    kp = cfg["kp_fmt"].format(subj=m_name.group(1), digits=m_name.group(2))
                else:
                    kp = ""
                code = by_kp.get(kp) if kp else None

            if not code:
                unmapped.append(f"{talk.name}（源：{talk_src or '未写'}）")
                continue

            unit_src = units[code]["src"]
            if talk_src and unit_src and talk_src != unit_src:
                mismatched.append(f"{talk.name} → {code}：talk 源 {talk_src} ≠ unit 源 {unit_src}")
            mapped[code] = {
                "talk": str(talk.relative_to(ROOT)),
                "kind": units[code]["kind"],
                "mode": "T",
                "kp": units[code]["kp"],
            }

        unused = sorted(set(units) - set(mapped))
    if unmapped or unused or mismatched:
        print(f"[make_map] FAIL：talk {len(talks)} 篇 / 单元 {len(units)} 个 / 已映射 {len(mapped)}")
        for name in unmapped:
            print(f"  unmapped talk: {name}")
        for code in unused:
            print(f"  unused unit: {code} ({units[code]['src']})")
        for line in mismatched:
            print(f"  source mismatch: {line}")
        return 1

    out_dir: Path = cfg["out"]
    out_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 1,
        "site": site,
        "mode": "S" if site in ("projects", "math", "emath") else "T",
        "units": {code: mapped[code] for code in sorted(mapped)},
        "skipped": sorted(skipped, key=lambda x: x["code"]),
        "unmapped": [],
        "unused": [],
    }
    (out_dir / "_map.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    progress_path = out_dir / "_progress.json"
    old: dict[str, dict] = {}
    if progress_path.exists():
        try:
            old_doc = json.loads(progress_path.read_text(encoding="utf-8"))
            old = old_doc.get("units") or {}
        except json.JSONDecodeError:
            old = {}
    progress: dict[str, dict] = {}
    for code in sorted(mapped):
        if code == "__site":
            unit = PARENT / units[code]["path"]
            note = None
        else:
            unit = ROOT / units[code]["path"]
            note = PARENT / units[code]["src"] if site in ("projects", "math", "emath") else None
        prev = old.get(code) or {}
        if site in ("projects", "math", "emath"):
            progress[code] = {
                "status": prev.get("status", "pending"),
                "unitSha": sha12(unit),
            }
            if note is not None:
                progress[code]["noteSha"] = sha12(note)
        else:
            talk = ROOT / mapped[code]["talk"]
            progress[code] = {
                "status": prev.get("status", "pending"),
                "talkSha": sha12(talk),
                "unitSha": sha12(unit),
            }
        for key in ("date", "reviewed", "reason", "fixes"):
            if key in prev:
                progress[code][key] = prev[key]
    for item in skipped:
        code = item["code"]
        prev = old.get(code) or {}
        progress[code] = {
            "status": "skip",
            "reason": prev.get("reason") or item["reason"],
            "kind": item["kind"],
        }
    progress_doc = {
        "version": 1,
        "site": site,
        "updated": date.today().isoformat(),
        "units": progress,
    }
    progress_path.write_text(
        json.dumps(progress_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(f"[make_map] OK：{len(talks)} 篇 talk / {len(units)} 个单元 / 已映射 {len(mapped)}")
    if skipped:
        print(f"  skip：{len(skipped)} 个（原因见 _map.json.skipped）")
    print(f"  {out_dir.relative_to(ROOT)}/_map.json")
    print(f"  {out_dir.relative_to(ROOT)}/_progress.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
