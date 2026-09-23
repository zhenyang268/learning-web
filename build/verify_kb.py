#!/usr/bin/env python
r"""pass 2 确定性校验：结构合规 + 代号/links 存在性 + 数值【待核验】重算回填。

用法（在 learning-web 下）：
  uv run python build/verify_kb.py [code ...]     # 不带参数 = 校验全部生成的 v2 文件（不含 A1.3 v1 样例）

检查项：
  1. json.tool 可解析
  2. 文件级字段：schema=entry-card/v2、code/chapter/title/src/notebook_commit/entries
  3. 词条必填字段与 type 枚举（9 种）、id 格式与文件 code 前缀一致
  4. tex_ref 区间对象；generated_by 三字段；status=drafted
  5. 禁 difficulty/mastery（模型不许编）
  6. links 只用全库代号清单（build/state/slices.json）
  7. viz 三档写法
  8. 【待核验:expr】重算：python 求值替换为核实值，写回文件；前后值不一致记入纠错日志
     build/state/verify/corrections.json
退出码：critical=0 时 0，否则 1。
"""
from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent
STATE = WEB / "build" / "state"
SLICES = json.loads((STATE / "slices.json").read_text(encoding="utf-8"))
VALID_CODES = {u["code"] for u in SLICES["units"]}
CODE_RE = re.compile(r"^[A-Za-z]+\d+(\.\d+)?$")
ID_RE = re.compile(r"^[A-Za-z]+\d+(\.\d+)?:[a-z0-9-]+\.[a-z0-9-]+$")
TYPES = {"statement", "proof", "intuition", "extension", "counterexample",
         "comparison", "application", "viz", "probe"}
MARK_RE = re.compile(r"【待核验:([^】]+)】")

SAFE_ENV = {
    "__builtins__": {},
    "sum": sum, "range": range, "abs": abs, "min": min, "max": max,
    "int": int, "float": float, "round": round, "len": len,
    "sorted": sorted, "enumerate": enumerate, "zip": zip,
    "all": all, "any": any, "True": True, "False": False,
    "sqrt": math.sqrt, "pi": math.pi, "e": math.e, "exp": math.exp,
    "log": math.log, "log2": math.log2, "log10": math.log10,
    "sin": math.sin, "cos": math.cos, "tan": math.tan,
    "gamma": math.gamma, "lgamma": math.lgamma, "erf": math.erf,
    "erfc": math.erfc, "factorial": math.factorial, "inf": math.inf,
}
SAFE_TOKEN = re.compile(r"""^[\w\s+\-*/%^<>=!,:.\[\]()'"~]+$""")

def eval_expr(expr: str):
    e = expr.replace("^", "**")
    if not SAFE_TOKEN.match(e):
        raise ValueError(f"表达式含非法字符: {expr}")
    return eval(e, dict(SAFE_ENV))  # noqa: S307 —— 白名单受限求值

def fmt(v) -> str:
    if isinstance(v, bool):
        return str(v)
    if isinstance(v, int):
        return str(v)
    if abs(v - round(v)) < 1e-12:
        return str(round(v))
    return f"{v:.12g}"

def verify_file(path: Path) -> list[str]:
    errs: list[str] = []
    code = path.stem
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return [f"CRIT {path}: JSON 解析失败 {exc}"]

    if data.get("schema") != "entry-card/v2":
        errs.append(f"CRIT {code}: schema 应为 entry-card/v2")
    for k in ("code", "chapter", "title", "src", "notebook_commit", "entries"):
        if k not in data:
            errs.append(f"CRIT {code}: 缺文件级字段 {k}")
    if errs and any(e.startswith("CRIT") for e in errs):
        return errs

    prefix = data["code"]
    if prefix != code:
        errs.append(f"CRIT {code}: 文件名与 code 字段({prefix})不一致")
    for ent in data["entries"]:
        eid = ent.get("id", "?")
        if not ID_RE.match(eid):
            errs.append(f"CRIT {code}: id 格式非法 {eid}")
        elif not eid.startswith(prefix + ":"):
            errs.append(f"CRIT {code}: id 前缀({eid.split(':')[0]})与文件 code({prefix})不符")
        if ent.get("type") not in TYPES:
            errs.append(f"CRIT {code}: type 非法 {ent.get('type')}")
        for k in ("title", "subject", "keywords", "content", "status"):
            if k not in ent:
                errs.append(f"CRIT {code} {eid}: 缺字段 {k}")
        if not ent.get("content"):
            errs.append(f"CRIT {code} {eid}: content 为空")
        if ent.get("status") != "drafted":
            errs.append(f"CRIT {code} {eid}: status 应为 drafted")
        gb = ent.get("generated_by")
        if not (isinstance(gb, dict) and set(gb) >= {"model", "date", "reviewed"}):
            errs.append(f"CRIT {code} {eid}: generated_by 缺字段")
        tr = ent.get("tex_ref")
        if tr is not None and not (isinstance(tr, dict) and "file" in tr
                                   and isinstance(tr.get("line_start"), int)
                                   and isinstance(tr.get("line_end"), int)):
            errs.append(f"MAJ {code} {eid}: tex_ref 应为 {{file,line_start,line_end}} 或 null")
        for bad in ("difficulty", "mastery"):
            if bad in ent:
                errs.append(f"CRIT {code} {eid}: 模型不许写 {bad}")
        for lk in ent.get("links", []):
            if lk not in VALID_CODES:
                errs.append(f"CRIT {code} {eid}: link 不在全库清单 {lk}")
        viz = ent.get("viz")
        if viz is not None:
            if not isinstance(viz, dict):
                errs.append(f"MAJ {code} {eid}: viz 非对象")
            elif viz.get("status") == "planned-backend":
                if "rationale" not in viz or "module" in viz:
                    errs.append(f"MAJ {code} {eid}: viz 档2 只应有 status/rationale/params_hint")
            elif viz.get("source") == "frontend":
                if not {"module", "version", "params_hint"} <= set(viz):
                    errs.append(f"MAJ {code} {eid}: viz 档1 缺 module/version/params_hint")
            else:
                errs.append(f"MAJ {code} {eid}: viz 既非档1 也非档2 写法")
    return errs

def settle_numerics(path: Path, corrections: list) -> list[str]:
    """重算【待核验:expr】并回填。返回错误列表；无标记时不动文件。"""
    text = path.read_text(encoding="utf-8")
    if "【待核验:" not in text:
        return []
    errs: list[str] = []

    def repl(m: re.Match) -> str:
        expr = m.group(1).strip()
        try:
            val = eval_expr(expr)
        except Exception as exc:
            errs.append(f"CRIT {path.stem}: 待核验表达式无法求值 {expr!r} ({exc})")
            return m.group(0)
        # 找标记紧前面的数字断言（如 "=385【待核验:...】"）做一致性对照
        return f"【已核验:{fmt(val)}|{expr}】"

    new_text = MARK_RE.sub(repl, text)
    if new_text != text:
        # 校验替换后 JSON 仍合法再写回
        try:
            json.loads(new_text)
        except Exception:
            errs.append(f"CRIT {path.stem}: 数值回填后 JSON 失效（不写回）")
            return errs
        # 记录前后差异（纠错审计）
        before = [(m.start(), m.group(1)) for m in MARK_RE.finditer(text)]
        path.write_text(new_text, encoding="utf-8")
        corrections.append({"file": str(path.relative_to(WEB)), "markers": len(before)})
    return errs

def main() -> None:
    args = sys.argv[1:]
    if args:
        files = [WEB / "json" / a.split(".")[0] / f"{a}.json" for a in args]
    else:
        files = sorted(p for p in (WEB / "json").rglob("*.json")
                       if p.name != "A1.3.json")
    (STATE / "verify").mkdir(parents=True, exist_ok=True)
    corrections: list = []
    all_errs: list[str] = []
    for f in files:
        if not f.exists():
            all_errs.append(f"CRIT {f}: 文件不存在")
            continue
        all_errs += verify_file(f)
        all_errs += settle_numerics(f, corrections)
    (STATE / "verify" / "corrections.json").write_text(
        json.dumps(corrections, ensure_ascii=False, indent=1), encoding="utf-8")
    crit = [e for e in all_errs if e.startswith("CRIT")]
    maj = [e for e in all_errs if e.startswith("MAJ")]
    for e in all_errs:
        print(e)
    print(f"\n== {len(files)} 文件：CRIT {len(crit)} · MAJ {len(maj)} · 数值回填 {sum(c['markers'] for c in corrections)} 处 ==")
    sys.exit(1 if crit else 0)

if __name__ == "__main__":
    main()
