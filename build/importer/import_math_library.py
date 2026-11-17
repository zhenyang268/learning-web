"""数值库导入：`notebook/math/survey|bridges` → `json/NL01…NL18`。

口径（`src/content/content-map.json` 的 numericChapters）：
- **以库模块为章**，不以 survey 的字母为章。
- 单元 = 一个 `know` 条目（A1…M7 共 97 个）+ 3 个散文单元（总图 / 两条轴 / 覆盖自查）。
- bridges 一篇一单元：BR0 骨架（含附录）、BR1 S4、BR2 S3、BR3 跨 S1–S6、BR4 S5。
- 转换用**哨兵切分**：先插 `@@K/@@F`，整段转换一次，再按哨兵切开 —— 切分不丢字由构造保证。

用法：uv run python build/importer/import_math_library.py
"""
from __future__ import annotations

import re
import sys

from common import MATH, WEB, Unit, build_entries, notebook_state, write_unit
from tex_split import convert, expand_macros, read_group, unknown_report

CHAPTER_OF = {
    "A": "NL01",
    "L": "NL02",
    "N": "NL03",
    "C": "NL04",
    "H": "NL05",
    "P": "NL06",
    "G": "NL09",
    "T": "NL12",
    "M": "NL13",
}
SURVEY_DIR = "math/survey"
BRIDGES_DIR = "math/bridges"
MANUAL = {  # 没有 know 的三节：总图 / 两条轴 / 覆盖自查
    "p1-overview.tex": "NL01.0",
    "p12-axes.tex": "NL01.7",
    "p11-audit.tex": "NL01.8",
}
BRIDGE_CODE = {
    "br0_skeleton.tex": "NL14.1",
    "br1_slerp_geodesic.tex": "NL15.1",
    "br2_fourier_gauss.tex": "NL16.1",
    "br3_ode_pde_tensor_lie.tex": "NL17.1",
    "br4_probability_map.tex": "NL18.1",
    "appendix_foundations.tex": "NL14.2",
}
TOKEN_RE = re.compile(r"(@@K:[^@]*@@|@@/K@@|@@F:[^@]*@@)")


def chapter_of(entry_id: str) -> str:
    letter = entry_id[0]
    if letter in CHAPTER_OF:
        return CHAPTER_OF[letter]
    num = int(re.sub(r"\D", "", entry_id) or 0)
    if letter == "D":
        return "NL07" if num <= 5 else "NL08"
    if letter == "F":
        return "NL10" if num <= 6 else "NL11"
    raise ValueError(f"未知 survey 编号：{entry_id}")


def split_sections(text: str) -> list[tuple[str, str]]:
    """按顶层 `\\section{}` 切；返回 [(标题, 正文（不含 section 行）)]。"""
    out: list[tuple[str, str]] = []
    starts = [m.start() for m in re.finditer(r"\\section\{", text)]
    for n, start in enumerate(starts):
        title, after = read_group(text, start + len("\\section"))
        end = starts[n + 1] if n + 1 < len(starts) else len(text)
        out.append((title.strip(), text[after:end]))
    return out


SEP = "\x1f"  # 字段分隔：`|` 会出现在公式里，\x1f 不会


def mark(body: str) -> str:
    """插入哨兵并去掉结构命令（know / field / end），其余交给 converter。

    **用花括号配平解析**，不能正则：`\\begin{know}{P8}{$\\mathrm{erf}$、$\\Phi$…}{…}`
    的标题里有 `}`，`[^}]*` 会在 `\\mathrm{erf}` 处截断（2026-11-14 实测丢了 8 条）。
    """
    out: list[str] = []
    i = 0
    while True:
        k = body.find("\\begin{know}", i)
        if k < 0:
            out.append(body[i:])
            break
        out.append(body[i:k])
        j = k + len("\\begin{know}")
        args = []
        for _ in range(3):
            while j < len(body) and body[j] in " \t\n":
                j += 1
            grp, j = read_group(body, j)
            args.append(grp)
        out.append("@@K:" + SEP.join(args) + "@@")
        i = j
    s = "".join(out).replace("\\end{know}", "@@/K@@")

    out = []
    i = 0
    while True:
        k = s.find("\\field", i)
        if k < 0:
            out.append(s[i:])
            break
        after = k + len("\\field")
        if after < len(s) and s[after].isalpha():
            out.append(s[i:after])
            i = after
            continue
        j = after
        while j < len(s) and s[j] in " \t\n":
            j += 1
        grp, j = read_group(s, j)
        out.append(s[i:k])
        out.append(f"@@F:{grp}@@")
        i = j
    return "".join(out)


def parse_segments(converted: str) -> tuple[str, list[dict], str]:
    """把转换后的文本拆成 (前置散文, [know], 末尾散文)。"""
    pre: list[str] = []
    tail: list[str] = []
    knows: list[dict] = []
    cur: dict | None = None
    field: str | None = None
    buf: list[str] = []

    def flush() -> None:
        nonlocal buf
        text = "".join(buf).strip()
        buf = []
        if not text:
            return
        if cur is None:
            (tail if knows else pre).append(text)
        elif field is None:
            cur["prose"].append(text)
        else:
            cur["fields"].append((field, text))

    for tok in TOKEN_RE.split(converted):
        if not tok:
            continue
        if tok.startswith("@@K:"):
            flush()
            inner = tok[4:-2].split(SEP)
            cur = {
                "id": inner[0],
                "name": inner[1],
                "status": inner[2] if len(inner) > 2 else "",
                "fields": [],
                "prose": [],
            }
            knows.append(cur)
            field = None
        elif tok == "@@/K@@":
            flush()
            cur = None
            field = None
        elif tok.startswith("@@F:"):
            flush()
            field = tok[4:-2]
        else:
            buf.append(tok)
    flush()
    return "\n\n".join(x for x in pre if x), knows, "\n\n".join(x for x in tail if x)


def chunks_of(text: str) -> list[tuple[int, str, str]]:
    """散文转 chunks：第一个 `### ` 之前是引言，之后一节一个 chunk。"""
    parts = re.split(r"^###\s+(.+)$", text, flags=re.M)
    chunks: list[tuple[int, str, str]] = []
    if parts[0].strip():
        chunks.append((0, "", parts[0].strip()))
    for i in range(1, len(parts), 2):
        chunks.append((3, parts[i].strip(), parts[i + 1].strip()))
    if not chunks and text.strip():
        chunks.append((0, "", text.strip()))
    return chunks


def field_chunks(know: dict) -> list[tuple[int, str, str]]:
    chunks = [(3, name, content) for name, content in know["fields"]]
    for prose in know["prose"]:
        chunks.append((2, "串讲", prose))
    return chunks


def main() -> int:
    commit, dirty = notebook_state()
    root = WEB / "emath" / "json"

    # 只清 NL* 章目录（2026-11-17 起数值库归工程数学站，根是 emath/json）；
    # 工程数学站里手写/搬来的章（AN02–04、NM、CG、EQ、PR09）一个不动
    for child in sorted(root.glob("NL*")):
        for f in child.iterdir():
            f.unlink()
        child.rmdir()

    seq: dict[str, int] = {}
    per_chapter: dict[str, int] = {}
    units = 0
    anomalies: list[str] = []

    def next_code(chapter: str) -> str:
        seq[chapter] = seq.get(chapter, 0) + 1
        return f"{chapter}.{seq[chapter]}"

    def emit(code: str, title: str, src: str, chunks: list[tuple[int, str, str]], meta: dict) -> None:
        nonlocal units
        entries = build_entries(code, chunks)
        if "@@" in "".join(e["content"] for e in entries):
            raise SystemExit(f"哨兵残留：{code}")
        write_unit(
            root,
            Unit(
                code=code,
                chapter=code.split(".")[0],
                title=title,
                src=src,
                entries=entries,
                meta=meta,
            ),
            commit,
            dirty,
        )
        per_chapter[code.split(".")[0]] = per_chapter.get(code.split(".")[0], 0) + 1
        units += 1

    # ---------- survey ----------
    for path in sorted((MATH / "survey").glob("p*.tex")):
        rel = f"{SURVEY_DIR}/{path.name}"
        raw = path.read_text(encoding="utf-8")
        sections = split_sections(raw)
        if not sections:
            anomalies.append(f"{path.name}（无 section）")
            continue

        manual = MANUAL.get(path.name)
        if manual:
            title, body = sections[0]
            emit(
                manual,
                expand_macros(title).strip(),
                rel,
                chunks_of(convert(mark(body))),
                {"kind": "library-section", "surveyFile": path.name},
            )
            continue

        for title, body in sections:
            converted = convert(mark(body))
            pre, knows, tail = parse_segments(converted)
            if not knows:
                anomalies.append(f"{path.name} §{title}（无 know）")
                continue
            for idx, know in enumerate(knows):
                chapter = chapter_of(know["id"])
                code = next_code(chapter)
                chunks = field_chunks(know)
                if idx == 0 and pre:
                    chunks.insert(0, (0, "", pre))
                if idx == len(knows) - 1 and tail:
                    chunks.append((2, "串讲", tail))
                emit(
                    code,
                    expand_macros(know["name"]).strip(),
                    rel,
                    chunks,
                    {
                        "kind": "library-know",
                        "surveyId": know["id"],
                        "status": know["status"].strip(),
                        "section": title,
                    },
                )

    # ---------- bridges ----------
    for path in sorted((MATH / "bridges").glob("*.tex")):
        if path.name == "main.tex":
            continue
        code = BRIDGE_CODE.get(path.name)
        if not code:
            raise SystemExit(f"未登记的 bridges 文件：{path.name}")
        rel = f"{BRIDGES_DIR}/{path.name}"
        raw = path.read_text(encoding="utf-8")
        sections = split_sections(raw)
        if sections:
            title, body = sections[0]
        else:  # appendix 无 \section 时整篇当正文
            title, body = path.stem, raw
        emit(
            code,
            expand_macros(title).strip(),
            rel,
            chunks_of(convert(body)),
            {"kind": "library-bridge", "bridgeFile": path.name},
        )

    print(f"数值库：单元 {units}；章分布 {dict(sorted(per_chapter.items()))}")
    if anomalies:
        print("异常（已跳过）：" + "；".join(anomalies))
    unknown = unknown_report()
    if unknown:
        print("未识别命令（保留原文）：" + "、".join(f"{k}×{v}" for k, v in unknown.items()))
    print(f"notebook commit {commit[:12]} · dirty={dirty}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
