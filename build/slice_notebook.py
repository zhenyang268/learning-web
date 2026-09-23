#!/usr/bin/env python
r"""pass 0 切片器：notebook/*.tex → build/slices/<chapter>/<code>.md + build/state/slices.json

确定性、零 LLM。规则（DESIGN.md D15）：
1. \subsection{X#. ...} 显式代号 → 基码 X#（如 A1、P1、G1）；其下 \subsubsection 逐个合成 X#.k；
   若该 subsection 无 subsubsection → subsection 本身为单元，代号 = X#（如 A3、P10）。
2. \subsubsection 标题若自带显式代号（^X#.k）优先采信（当前库中不存在，规则保留）。
3. subsection 无显式代号（partN、de1-4、lie1-3）→ 文件基名 + 全文件流水号合成两级代号
   （de1.1、lie2.3、partN → N1..Nk），单元粒度 = subsubsection 优先，无则 subsection。
用法：cd learning-web && uv run python build/slice_notebook.py
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

WEB_ROOT = Path(__file__).resolve().parent.parent   # learning-web/
BUILD = WEB_ROOT / "build"
STATE = BUILD / "state"
SLICES = BUILD / "slices"

# 笔记路径解析（AGENTS.md §1.1）：环境变量优先，其次相对父目录
NB = Path(__import__("os").environ.get("LEARNING_NOTEBOOK", WEB_ROOT.parent / "notebook"))
if not NB.is_dir():
    sys.exit(f"FATAL: notebook 目录不存在: {NB}")

CONTENT_FILES = sorted(
    [p for p in NB.glob("*.tex")]
    + [p for p in (NB / "diffrential").glob("de*.tex")]
    + [p for p in (NB / "li").glob("lie*.tex")]
)

RE_SUB = re.compile(r"^(\\subsection)\{(.*)\}\s*$")
RE_SUBSUB = re.compile(r"^(\\subsubsection)\{(.*)\}\s*$")
RE_SECTION = re.compile(r"^\\section\{(.*)\}\s*$")
# 显式代号：字母+数字（可带 .k），后跟「. 」或「.」结尾，如 "A1. 从..." / "P10. 总表"
RE_EXPLICIT = re.compile(r"^([A-Za-z]+\d+(?:\.\d+)?)\.?\s+")

def chapter_of(code: str) -> str:
    """A1.3 → A1（文件目录 = 节基码）；de1.2 → de1；N1 → N。"""
    m = re.match(r"^([A-Za-z]+\d+)", code)
    return m.group(1) if m else code

def stem_base(stem: str, section_title: str) -> str:
    """无显式代号的文件：取基名（partN 特例 → 章字母 N）。"""
    if stem == "partN":
        m = re.match(r"^([A-Za-z]+)\.", section_title.strip())
        return m.group(1) if m else "N"
    return stem

def short_commit() -> str:
    try:
        out = subprocess.run(
            ["git", "-C", str(NB.parent), "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, check=True,
        )
        return out.stdout.strip()
    except Exception:
        return "unknown"

def main() -> None:
    STATE.mkdir(parents=True, exist_ok=True)
    SLICES.mkdir(parents=True, exist_ok=True)
    commit = short_commit()
    manifest: list[dict] = []

    for tex in CONTENT_FILES:
        rel = str(tex.relative_to(NB))
        lines = tex.read_text(encoding="utf-8").splitlines()
        # 找 \section 标题（供无代号文件取基名）
        section_title = ""
        for ln in lines:
            m = RE_SECTION.match(ln)
            if m:
                section_title = m.group(1)
                break

        # 第一遍：收集标题行
        heads: list[tuple[int, str, str]] = []   # (lineno 1-based, level, title)
        for i, ln in enumerate(lines, start=1):
            if (m := RE_SUBSUB.match(ln)):
                heads.append((i, "subsub", m.group(2)))
            elif (m := RE_SUB.match(ln)):
                heads.append((i, "sub", m.group(2)))

        units: list[dict] = []
        stem = tex.stem

        # 路径 A：subsection 带显式代号（绝大多数文件）
        if all(RE_EXPLICIT.match(h[2]) for h in heads if h[1] == "sub") and any(h[1] == "sub" for h in heads):
            k = 0
            # 每个 subsection 的区间边界 = 下一个 subsection（跨过其间的 subsubsection）
            def section_end(idx: int) -> int:
                for j in range(idx + 1, len(heads)):
                    if heads[j][1] == "sub":
                        return heads[j][0] - 1
                return len(lines)

            for idx, (lineno, level, title) in enumerate(heads):
                if level == "sub":
                    base = RE_EXPLICIT.match(title).group(1)
                    end = section_end(idx)
                    children = [h for h in heads if h[1] == "subsub" and lineno < h[0] <= end]
                    if not children:
                        units.append(dict(code=base, title=RE_EXPLICIT.sub("", title).strip(),
                                          file=rel, line_start=lineno + 1, line_end=end,
                                          parent=None, grain="section"))
                    else:
                        for j, (cl, _, ct) in enumerate(children):
                            cstart = cl + 1
                            cend = children[j + 1][0] - 1 if j + 1 < len(children) else end
                            units.append(dict(code=f"{base}.{j + 1}", title=ct.strip(),
                                              file=rel, line_start=cstart, line_end=cend,
                                              parent=base, grain="subsubsection"))
        # 路径 B：subsection 无代号 → 文件基名 + 流水号（partN/de/lie）
        else:
            base = stem_base(stem, section_title)
            def mkcode(base: str, run: int) -> str:
                return f"{base}.{run}" if base[-1].isdigit() else f"{base}{run}"
            def section_end(idx: int) -> int:
                for j in range(idx + 1, len(heads)):
                    if heads[j][1] == "sub":
                        return heads[j][0] - 1
                return len(lines)
            run = 0
            for idx, (lineno, level, title) in enumerate(heads):
                if level != "sub":
                    continue
                end = section_end(idx)
                children = [h for h in heads if h[1] == "subsub" and lineno < h[0] <= end]
                if children:
                    # 有孩子：孩子为单元（父节标题记入 parent）
                    for j, (cl, _, ct) in enumerate(children):
                        run += 1
                        cstart = cl + 1
                        cend = children[j + 1][0] - 1 if j + 1 < len(children) else end
                        units.append(dict(code=mkcode(base, run), title=ct.strip(),
                                          file=rel, line_start=cstart, line_end=cend,
                                          parent=title, grain="subsubsection"))
                else:
                    run += 1
                    units.append(dict(code=mkcode(base, run), title=title.strip(),
                                      file=rel, line_start=lineno + 1, line_end=end,
                                      parent=None, grain="section"))

        # 去重与合法性断言
        seen: set[str] = set()
        for u in units:
            assert u["code"] not in seen, f"代号重复: {u['code']} ({rel})"
            assert re.match(r"^[A-Za-z]+\d+(\.\d+)?$", u["code"]), f"非法代号: {u['code']}"
            seen.add(u["code"])
        manifest.extend(units)

    # 落盘
    (STATE / "slices.json").write_text(
        json.dumps(dict(notebook_commit=commit, units=manifest), ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    (STATE / "provenance.json").write_text(
        json.dumps(dict(notebook_commit=commit, slicer="build/slice_notebook.py",
                        generated_at="deterministic"), ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    for u in manifest:
        ch = chapter_of(u["code"])
        d = SLICES / ch
        d.mkdir(parents=True, exist_ok=True)
        src = NB / u["file"]
        body = "\n".join(src.read_text(encoding="utf-8").splitlines()[u["line_start"] - 1: u["line_end"]])
        parent_note = f"\n（所属节：{u['parent']}）\n" if u["parent"] else "\n"
        md = (
            f"# 切片 {u['code']}\n\n"
            f"- file: notebook/{u['file']}\n"
            f"- lines: {u['line_start']}-{u['line_end']}（1-based 闭区间）\n"
            f"- title: {u['title']}\n"
            f"- chapter: {ch}\n"
            f"- notebook_commit: {commit}\n"
            f"{parent_note}\n## 原文（LaTeX 逐字，行号 {u['line_start']}-{u['line_end']}）\n\n"
            f"```latex\n{body}\n```\n"
        )
        (d / f"{u['code']}.md").write_text(md, encoding="utf-8")

    # 汇总
    per_file: dict[str, int] = {}
    for u in manifest:
        per_file[u["file"]] = per_file.get(u["file"], 0) + 1
    print(f"notebook_commit={commit}")
    for f, n in sorted(per_file.items()):
        print(f"  {f}: {n} 单元")
    print(f"TOTAL {len(manifest)} 单元 → {SLICES}")

    # 对拍：小目数（subsubsection 计数）应全部被覆盖
    n_subsub = sum(1 for u in manifest if u["grain"] == "subsubsection")
    raw = subprocess.run(["grep", "-rc", r"subsubsection{", *map(str, CONTENT_FILES)],
                         capture_output=True, text=True)
    grep_total = sum(int(x.split(":")[1]) for x in raw.stdout.strip().splitlines())
    print(f"对拍：切片小目单元 {n_subsub} vs grep subsubsection 计数 {grep_total}"
          f" → {'OK' if n_subsub == grep_total else 'MISMATCH!'}")
    if n_subsub != grep_total:
        sys.exit(1)

if __name__ == "__main__":
    main()
