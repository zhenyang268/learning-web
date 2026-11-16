"""导入线的公共件：路径、归一、条目构造、稳定写盘。

**只读 notebook**：本模块只提供读函数；所有写入都在 `write_unit` 里，
写盘前断言目标在 learning-web 下（`assert_inside_web`）。
"""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

WEB = Path(__file__).resolve().parents[2]
NOTEBOOK = WEB.parent / "notebook"
MATH = NOTEBOOK / "math"
KAOYAN = NOTEBOOK / "kaoyan"
PROJECTS = NOTEBOOK / "projects"

SCHEMA = "doc-card/v1"
CODE_RE = re.compile(r"^[A-Z]{2}\d{2}(\.\d+)?$")
ID_RE = re.compile(r"^[A-Z]{2}\d{2}(\.\d+)?:[a-z0-9-]+\.[a-z0-9-]+$")


# ------------------------------------------------------------------ 归一与对账


def norm(text: str) -> str:
    """**逐行**归一：只保留非空行、去尾空格。

    为什么不保留空行：源文件的「标题前一个空行 vs 两个空行」并不一致，而拼回时
    统一用 `\\n\\n` 分隔。保留空行会让对账把「空行数量」当成内容差异（假阳性）。
    去掉空行后仍然是**逐行强比对**：漏段、重段、错位、改字都会被抓到。
    """
    return "\n".join(line.rstrip() for line in text.splitlines() if line.strip())


def reconstruct(source_h1: str | None, entries: list[dict]) -> str:
    """把词条拼回源文本（无损对账的右式）。level=0 的词条只拼 content。"""
    parts: list[str] = []
    if source_h1:
        parts.append(f"# {source_h1}")
    for e in entries:
        level = int(e.get("level", 2))
        if level == 0:
            parts.append(e["content"])
        else:
            parts.append("#" * level + " " + e["title"] + "\n\n" + e["content"])
    return norm("\n\n".join(parts))


def sha256_text(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


# ------------------------------------------------------------------ notebook 状态


def notebook_state() -> tuple[str, bool]:
    """源仓 commit + 是否有未提交改动（脏了要在报告里点名，不阻断导入）。"""
    try:
        head = subprocess.run(
            ["git", "-C", str(NOTEBOOK), "rev-parse", "HEAD"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        dirty = bool(
            subprocess.run(
                ["git", "-C", str(NOTEBOOK), "status", "--porcelain"],
                capture_output=True, text=True, check=True,
            ).stdout.strip()
        )
        return head, dirty
    except Exception:  # noqa: BLE001 - notebook 被单独拷走时没有 .git
        return "n/a（notebook 非 git 工作区）", False


# ------------------------------------------------------------------ 词条


ENTRY_TYPES: dict[str, str] = {
    "考法": "statement",
    "例题": "example",
    "真题": "probe",
    "坑": "counterexample",
    "陷阱": "counterexample",
    "思路": "intuition",
    "直觉": "intuition",
    "判据": "proof",
    "结论": "proof",
}


# ---------------------------------------------------------------- 源侧公式勘误
#
# notebook 只读，但源里确实有 KaTeX 编译不过的**写法**（不是内容错）。
# 原则：只做**能列成表的、局部的**勘误，逐条计数并打印；不做通用改写。
_MATH_SEG = re.compile(r"\$\$[\s\S]+?\$\$|\$[^$\n]+?\$")
_FIXUPS = [
    # 408 拔高 41 的源文件里 `\bmod` 的 `\b` 被写成了**退格控制字符**（U+0008，共 2 处），
    # 肉眼与 grep 都看不出来。这里把「退格 + mod」还原成 `\bmod`。
    (re.compile("[\x08]mod"), lambda m: r"\bmod", "backspace-mod"),
    # `(n-1)mod(k-1)` —— 若源就是裸 `mod`（KaTeX 里不是算子），补 `\bmod`。
    (re.compile(r"\)\s*mod\b"), lambda m: r")\bmod", "bare-mod"),
]
_fixup_hits: dict[str, int] = {}


def fix_math(text: str) -> str:
    """只在 `$…$` / `$$…$$` 段内应用勘误表，命中即计数。"""

    def one(m: re.Match[str]) -> str:
        seg = m.group(0)
        for pat, rep, name in _FIXUPS:
            seg, n = pat.subn(rep, seg)
            if n:
                _fixup_hits[name] = _fixup_hits.get(name, 0) + n
        return seg

    return _MATH_SEG.sub(one, text)


def fixup_report() -> dict[str, int]:
    return dict(_fixup_hits)


_H3_RE = re.compile(r"^###\s+(.+)$", re.M)


def split_exam_chunks(
    chunks: list[tuple[int, str, str]],
) -> list[tuple[int, str, str]]:
    """「真题原题」一节按 `### <年份> #<题号>` 拆成逐题词条（2026-11-14）。

    为什么：原稿一个 `## 真题原题（共 N 题）` 把 N 道题挤在同一个词条里，
    前端没法逐题折叠、也没法拿题号做镜像指针。拆开后父节只剩导语（可能为空 → heading），
    子节每题一个词条，标题保留原题号。
    """
    out: list[tuple[int, str, str]] = []
    for level, title, content in chunks:
        if level != 2 or "真题原题" not in title:
            out.append((level, title, content))
            continue
        parts = _H3_RE.split(content)
        head = parts[0].strip()
        if head:
            out.append((2, title, head))
        else:
            out.append((2, title, ""))
        for i in range(1, len(parts), 2):
            out.append((3, parts[i].strip(), parts[i + 1].strip()))
    return out


_QUESTION_RE = re.compile(r"^(\d{4})\s*#\s*(\d+)")


def annotate_exam(entries: list[dict]) -> None:
    """给逐题词条补 `mirror_of` / `question_id`，并把类型定为 probe。

    题干真源是 `exam/真题/<年>.md`，KP 单元里的是**照录镜像**（`kaoyan/AGENTS.md` 明写）；
    前端据此可以显示「→ 真题 2021 #16」而不是把它当原创内容。
    """
    for e in entries:
        m = _QUESTION_RE.match((e.get("title") or "").strip())
        if not m:
            continue
        year, no = m.group(1), m.group(2)
        e["type"] = "probe"
        e["mirror_of"] = f"EX{year[2:]}.1"
        e["question_id"] = f"{year}#{no}"


def entry_type_of(title: str) -> str:
    for key, typ in ENTRY_TYPES.items():
        if title.startswith(key) or key in title[:12]:
            return typ
    return "extension"


def entry_slug(title: str) -> str:
    t = title.strip()
    if t.startswith("考法"):
        return "kaofa"
    if t.startswith("例题"):
        return "example"
    if "真题" in t:
        return "exam"
    if t.startswith("坑") or "陷阱" in t:
        return "keng"
    if t.startswith("思路") or "直觉" in t:
        return "intuition"
    return "body"


@dataclass
class Unit:
    code: str
    chapter: str
    title: str
    src: str  # 相对 notebook/ 的路径
    entries: list[dict]
    source_h1: str | None = None
    meta: dict | None = None


_counter: dict[str, int] = {}


def build_entries(code: str, chunks: list[tuple[int, str, str]]) -> list[dict]:
    """chunks = (level, title, content)；level 0 表示无序言标题的引言。"""
    used: dict[str, int] = {}
    entries: list[dict] = []
    for level, title, content in chunks:
        slug = "intro" if level == 0 else entry_slug(title)
        used[slug] = used.get(slug, 0) + 1
        # 源里存在「标题下面直接跟同级标题」的写法（如 408-NET-0201 的 `## 考法 1` → `## 题`），
        # 这类小节正文为空。保留成 `heading` 词条（有标题无正文），既不失真也不冒充内容。
        typ = "introduction" if level == 0 else entry_type_of(title)
        if not content.strip():
            typ = "heading"
        entries.append(
            {
                "id": f"{code}:{slug}.s{used[slug]:02d}",
                "type": typ,
                "title": title,
                "level": level,
                # 幂等：md 线在切分阶段已修正过一次，这里对 tex 线再兜一次
                "content": fix_math(content),
            }
        )
    global _counter
    _counter[code] = len(entries)
    return entries


# ------------------------------------------------------------------ 写盘


def assert_inside_web(path: Path) -> None:
    resolved = path.resolve()
    if WEB.resolve() not in resolved.parents and resolved != WEB.resolve():
        raise RuntimeError(f"拒绝写入 learning-web 之外：{resolved}")


def write_unit(root: Path, unit: Unit, commit: str, dirty: bool) -> Path:
    path = root / unit.chapter / f"{unit.code}.json"
    assert_inside_web(path)
    if not CODE_RE.match(unit.code):
        raise ValueError(f"代号不合规：{unit.code}")
    for e in unit.entries:
        if not ID_RE.match(e["id"]):
            raise ValueError(f"词条 id 不合规：{e['id']}")

    obj: dict = {
        "schema": SCHEMA,
        "code": unit.code,
        "chapter": unit.chapter,
        "title": unit.title,
        "src": {
            "file": "notebook/" + unit.src,
            "sha256": sha256_text((NOTEBOOK / unit.src).read_text(encoding="utf-8")),
        },
        "notebook_commit": commit,
        "notebook_dirty": dirty,
        "entries": unit.entries,
    }
    if unit.source_h1:
        obj["source_h1"] = unit.source_h1
    if unit.meta:
        obj["meta"] = unit.meta

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def read_source(rel: str) -> str:
    return (NOTEBOOK / rel).read_text(encoding="utf-8")


def reset_root(root: Path) -> None:
    """整根重建：删掉旧的章目录（只动 learning-web 内的数据根）。"""
    assert_inside_web(root)
    if root.exists():
        for child in root.iterdir():
            if child.is_dir():
                for f in child.iterdir():
                    assert_inside_web(f)
                    f.unlink()
                child.rmdir()
            elif child.name != "index.json":
                assert_inside_web(child)
                child.unlink()
    root.mkdir(parents=True, exist_ok=True)
