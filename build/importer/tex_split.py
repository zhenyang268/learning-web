"""LaTeX → Markdown 的确定性转换（只覆盖 survey / bridges 实际用到的构造）。

设计取舍：
- **单次转换 + 哨兵切分**：先在原文里插入 `@@U<n>@@` / `@@F:<名>@@` / `@@K:<编号>|<名称>|<状态>@@`
  哨兵，整段转换一次，再按哨兵切开。这样「切开后拼回去」在构造上就与「转换后全文」相等，
  不需要两套转换器对拍（两套必然漂移）。
- 宏展开用**花括号配平**解析，不用正则 —— `\\abs{\\frac{a}{b}}` 这类嵌套正则必错。
- 不认识的命令逐条计数报出来，**不静默丢弃**。
"""
from __future__ import annotations

import re

# ---------------------------------------------------------------- 基础扫描

_SIMPLE = {
    r"\eps": r"\varepsilon",
    r"\C": r"\mathbb{C}",
    r"\R": r"\mathbb{R}",
    r"\Z": r"\mathbb{Z}",
    r"\HH": r"\mathbb{H}",
    r"\noindent": "",
    r"\par": "\n\n",
    r"\medskip": "\n\n",
    r"\smallskip": "\n",
    r"\bigskip": "\n\n",
    r"\newpage": "\n\n",
    r"\clearpage": "\n\n",
    r"\centering": "",
    r"\sloppy": "",
    r"\hfill": "",
    r"\quad": " ",
    r"\qquad": "  ",
}

_UNKNOWN: dict[str, int] = {}

# KaTeX 认识、原样保留的命令（不逐个处理，只用来把「未知」报告压到真正的排版命令上）
KNOWN_MATH = {
    "begin", "end", "item", "frac", "dfrac", "tfrac", "sqrt", "left", "right", "big", "Big",
    "bigg", "Bigg", "text", "mathrm", "mathbf", "mathbb", "mathcal", "mathfrak", "mathsf",
    "mathit", "operatorname", "overline", "underline", "hat", "widehat", "tilde", "widetilde",
    "bar", "vec", "dot", "ddot", "partial", "nabla", "cdot", "times", "div", "ast", "star",
    "circ", "bullet", "oplus", "otimes", "le", "leq", "ge", "geq", "ne", "neq", "approx",
    "sim", "simeq", "lesssim", "gtrsim", "ll", "gg", "pm", "mp", "to", "mapsto", "infty",
    "sum", "prod", "int", "iint", "oint", "lim", "log", "ln", "exp", "sin", "cos", "tan",
    "max", "min", "sup", "inf", "arg", "det", "dim", "ker", "deg", "gcd", "lcm", "mod",
    "bmod", "pmod", "quad", "qquad", "ldots", "cdots", "dots", "vdots", "ddots", "hbar",
    "ell", "Re", "Im", "in", "notin", "subset", "subseteq", "supset", "supseteq", "cup",
    "cap", "setminus", "emptyset", "forall", "exists", "neg", "land", "lor", "rightarrow",
    "leftarrow", "Rightarrow", "Leftarrow", "leftrightarrow", "Leftrightarrow", "implies",
    "iff", "prime", "backslash", "lvert", "rvert", "lVert", "rVert", "langle", "rangle",
    "vert", "Vert", "binom", "stackrel", "overset", "underset", "alpha", "beta", "gamma",
    "delta", "epsilon", "varepsilon", "zeta", "eta", "theta", "iota", "kappa", "lambda",
    "mu", "nu", "xi", "pi", "rho", "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega",
    "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi", "Sigma", "Upsilon", "Phi", "Psi",
    "Omega", "textbackslash", "check", "breve", "acute", "grave", "mathring", "coprod",
    "bigcup", "bigcap", "bigoplus", "varnothing", "propto", "perp", "parallel", "angle",
    "triangle", "square", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0",
    # 2026-11-14 实测补：survey/bridges 里出现且 KaTeX 支持，只是本转换器不特殊处理
    "varphi", "vartheta", "varsigma", "varrho", "cong", "wedge", "vee", "mid", "equiv",
    "arccos", "arcsin", "arctan", "sinh", "cosh", "tanh", "coth", "sech", "circledast",
    "longrightarrow", "longleftarrow", "Longleftrightarrow", "Longrightarrow",
    "longleftrightarrow", "xrightarrow", "xleftarrow", "gets", "underbrace", "overbrace",
    "boxed", "downarrow", "uparrow", "Bigl", "Bigr", "bigl", "bigr", "lfloor", "rfloor",
    "lceil", "rceil", "ldotp", "dotsb", "cdotp", "hbar", "imath", "jmath", "aleph",
    "binom", "ddagger", "dagger", "because", "therefore", "nmid", "nleq", "ngeq",
}


def read_group(s: str, i: int) -> tuple[str, int]:
    """s[i] 必须是 `{`；返回 (内容, 右括号后一位)。花括号配平，跳过转义。"""
    if i >= len(s) or s[i] != "{":
        raise ValueError(f"期望 {{，实际 {s[i:i+20]!r}")
    depth = 0
    j = i
    while j < len(s):
        c = s[j]
        if c == "\\":
            j += 2
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return s[i + 1 : j], j + 1
        j += 1
    raise ValueError("花括号不配平")


def _sub_cmd(s: str, name: str, fn, nargs: int) -> str:
    token = "\\" + name
    out: list[str] = []
    i = 0
    while True:
        k = s.find(token, i)
        if k < 0:
            out.append(s[i:])
            return "".join(out)
        # 边界：后面不能紧跟字母（避免 \abs 命中 \absval）
        after = k + len(token)
        if after < len(s) and (s[after].isalpha()):
            out.append(s[i:after])
            i = after
            continue
        out.append(s[i:k])
        j = after
        # 星号与可选参数：`\subsection*{...}` / `\item[...]`
        if j < len(s) and s[j] == "*":
            j += 1
        while j < len(s) and s[j] in " \t":
            j += 1
        if j < len(s) and s[j] == "[":
            close = s.find("]", j)
            if close > 0:
                j = close + 1
        while j < len(s) and s[j] in " \t":
            j += 1
        args = []
        ok = True
        for _ in range(nargs):
            if j >= len(s) or s[j] != "{":
                ok = False
                break
            grp, j = read_group(s, j)
            args.append(grp)
            while j < len(s) and s[j] in " \t\n":
                j += 1
        if not ok:
            out.append(token)
            i = after
            continue
        out.append(fn(*args) if nargs > 1 else fn(args[0]))
        i = j


def expand_macros(s: str) -> str:
    # 结尾必须留一个空格：`\norm{x}e_1` 直接拼会变成未定义命令 `\rVerte`
    s = _sub_cmd(s, "abs", lambda x: r"\left\lvert " + x + r"\right\rvert ", 1)
    s = _sub_cmd(s, "norm", lambda x: r"\left\lVert " + x + r"\right\rVert ", 1)
    s = _sub_cmd(s, "inner", lambda a, b: r"\langle " + a + "," + b + r"\rangle ", 2)
    s = _sub_cmd(s, "field", lambda x: "\n\n**" + x + "** ", 1)
    s = _sub_cmd(s, "textbf", lambda x: "**" + x + "**", 1)
    s = _sub_cmd(s, "textit", lambda x: "*" + x + "*", 1)
    s = _sub_cmd(s, "emph", lambda x: "*" + x + "*", 1)
    s = _sub_cmd(s, "texttt", lambda x: "`" + x + "`", 1)
    # 无花括号写法 `$\\abs q$` / `$\\norm u$`：只吞一个记号，并补尾空格
    s = re.sub(
        r"\\abs\s*(\\[A-Za-z]+|[A-Za-z0-9])",
        lambda m: r"\left\lvert " + m.group(1) + r"\right\rvert ",
        s,
    )
    s = re.sub(
        r"\\norm\s*(\\[A-Za-z]+|[A-Za-z0-9])",
        lambda m: r"\left\lVert " + m.group(1) + r"\right\rVert ",
        s,
    )
    # 简单宏：加字母边界，避免 `\eps` 命中 `\varepsilon` 造出 `\varepsilonilon`
    for cmd, rep in _SIMPLE.items():
        s = re.sub(re.escape(cmd) + r"(?![A-Za-z])", lambda _m, r=rep: r, s)
    return s


# ---------------------------------------------------------------- 环境


def _find_env(s: str, name: str, start: int = 0) -> int:
    return s.find("\\begin{" + name + "}", start)


def _skip_opt(s: str, i: int) -> int:
    """跳过 `{...}` 与 `[...]` 形式的可选参数。"""
    while i < len(s) and s[i] in " \t\n":
        i += 1
    if i < len(s) and s[i] == "{":
        _, i = read_group(s, i)
        while i < len(s) and s[i] in " \t\n":
            i += 1
    if i < len(s) and s[i] == "[":
        j = s.find("]", i)
        if j > 0:
            i = j + 1
    return i


def convert_tabular(s: str) -> str:
    out: list[str] = []
    i = 0
    while True:
        k = min(
            [x for x in (_find_env(s, "tabular", i), _find_env(s, "longtable", i)) if x >= 0],
            default=-1,
        )
        if k < 0:
            out.append(s[i:])
            return "".join(out)
        out.append(s[i:k])
        env = "tabular" if s.startswith("\\begin{tabular}", k) else "longtable"
        j = _skip_opt(s, k + len("\\begin{" + env + "}"))
        end = s.find("\\end{" + env + "}", j)
        if end < 0:
            raise ValueError(f"{env} 未闭合")
        body = s[j:end]
        out.append(_tabular_to_md(body))
        i = end + len("\\end{" + env + "}")


def _tabular_to_md(body: str) -> str:
    body = re.sub(r"\\(toprule|midrule|bottomrule|hline|endhead)\b", "", body)
    rows = [r.strip() for r in re.split(r"\\\\", body) if r.strip()]
    parsed: list[list[str]] = []
    for row in rows:
        cells = [c.strip() for c in row.split("&")]
        if len(cells) < 2:
            continue
        parsed.append(cells)
    if not parsed:
        return ""
    width = max(len(r) for r in parsed)
    parsed = [r + [""] * (width - len(r)) for r in parsed]
    lines = ["| " + " | ".join(cell.strip() or " " for cell in row) + " |" for row in parsed]
    lines.insert(1, "|" + "|".join(["---"] * width) + "|")
    return "\n\n" + "\n".join(lines) + "\n\n"


def convert_lists(s: str) -> str:
    for env, bullet in (("itemize", "- "), ("enumerate", "1. ")):
        while True:
            k = s.find("\\begin{" + env + "}")
            if k < 0:
                break
            j = _skip_opt(s, k + len("\\begin{" + env + "}"))
            end = s.find("\\end{" + env + "}", j)
            if end < 0:
                raise ValueError(f"{env} 未闭合")
            body = s[j:end]
            items = [re.sub(r"^\s*", "", x).strip() for x in re.split(r"\\item\b", body)]
            items = [x for x in items if x]
            md = "\n" + "\n".join(bullet + x.replace("\n", "\n  ") for x in items) + "\n"
            s = s[:k] + md + s[end + len("\\end{" + env + "}") :]
    return s


def convert_verbatim(s: str) -> str:
    while True:
        k = s.find("\\begin{verbatim}")
        if k < 0:
            break
        j = k + len("\\begin{verbatim}")
        end = s.find("\\end{verbatim}", j)
        if end < 0:
            raise ValueError("verbatim 未闭合")
        body = s[j:end].strip("\n")
        s = s[:k] + "\n```\n" + body + "\n```\n" + s[end + len("\\end{verbatim}") :]
    return s


def convert_math_env(s: str) -> str:
    for env in ("equation", "equation*", "align", "align*", "gather", "gather*", "multline", "multline*"):
        pat = re.compile(r"\\begin\{" + re.escape(env) + r"\}(.*?)\\end\{" + re.escape(env) + r"\}", re.S)
        while True:
            m = pat.search(s)
            if not m:
                break
            body = m.group(1).strip()
            if env.startswith("align") or env.startswith("gather"):
                body = "\\begin{aligned}\n" + body + "\n\\end{aligned}"
            s = s[: m.start()] + "\n$$\n" + body + "\n$$\n" + s[m.end() :]
    # \[ ... \] → $$ ... $$
    s = re.sub(r"\\\[(.*?)\\\]", lambda m: "\n$$\n" + m.group(1).strip() + "\n$$\n", s, flags=re.S)
    s = re.sub(r"\\\((.*?)\\\)", lambda m: "$" + m.group(1).strip() + "$", s, flags=re.S)
    return s


def convert_headings(s: str) -> str:
    def h(level):
        def fn(title):
            return "\n" + "#" * level + " " + title.strip() + "\n\n"
        return fn

    s = _sub_cmd(s, "subsubsection", h(4), 1)
    s = _sub_cmd(s, "subsection", h(3), 1)
    return s


def strip_commands(s: str) -> str:
    for name in ("label", "index", "cite", "ref", "eqref", "footnote", "hspace", "vspace"):
        s = _sub_cmd(s, name, lambda *a: "", 1)
    s = _sub_cmd(s, "setlength", lambda *a: "", 2)
    s = re.sub(r"\\(begin|end)\{(center|quote|small|footnotesize|large|LARGE)\}", "", s)
    s = re.sub(r"\\(begin|end)\{document\}", "", s)
    s = re.sub(r"\\(makeatletter|maketitle|tableofcontents)\b", "", s)
    # 字号 / 字体开关：直接去掉（留着会变成可见的 `\small`）
    s = re.sub(
        r"\\(small|normalsize|footnotesize|scriptsize|large|Large|LARGE|huge|Huge|"
        r"itshape|bfseries|ttfamily|rmfamily|sffamily|slshape|upshape)\b",
        "",
        s,
    )
    # 未识别命令：只计数，不删（删了会静默丢内容）
    for m in re.finditer(r"\\([A-Za-z]{2,})", s):
        name = m.group(1)
        if name in KNOWN_MATH:
            continue
        _UNKNOWN[name] = _UNKNOWN.get(name, 0) + 1
    return s


def cleanup(s: str) -> str:
    s = s.replace("\r\n", "\n")
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip("\n")


def unescape_outside_math(s: str) -> str:
    """把 `\\%` `\\_` `\\&` `\\#` 还原成字符，**但只在不处于 `$…$` 内的文本段**。

    为什么不能全局 replace（2026-11-14 实测 3 处 KaTeX 报错）：
    - `\\text{real\\_t}` 里的 `\\_` 是 text 模式的合法写法，还原成 `_` 就变成
      “Can't use function '_' in text mode”；
    - `\\#` 还原成 `#` 在公式里是**非法字符**（LaTeX 的宏参数字符）；
    - `\\%` 还原成 `%` 在公式里会被当成注释起点，把整条公式吃掉。
    """
    out: list[str] = []
    i = 0
    in_math = False
    while i < len(s):
        if s.startswith("\\$", i):  # 转义美元：两种模式下都原样保留
            out.append("\\$")
            i += 2
            continue
        c = s[i]
        if c == "$":
            if s.startswith("$$", i):
                out.append("$$")
                i += 2
                continue
            in_math = not in_math
            out.append("$")
            i += 1
            continue
        if not in_math:
            for a, b in (("\\%", "%"), ("\\_", "_"), ("\\&", "&"), ("\\#", "#")):
                if s.startswith(a, i):
                    out.append(b)
                    i += 2
                    break
            else:
                out.append(c)
                i += 1
            continue
        out.append(c)
        i += 1
    return "".join(out)


def convert(text: str) -> str:
    """整段转换。顺序有讲究：verbatim → 表格 → 列表 → 数学环境 → 标题 → 正文命令。"""
    s = convert_verbatim(text)
    s = convert_tabular(s)
    s = convert_lists(s)
    s = convert_math_env(s)
    s = expand_macros(s)
    s = convert_headings(s)
    s = strip_commands(s)
    s = unescape_outside_math(s)
    s = s.replace("~", " ")
    # 行尾的 `\\` 换行命令
    s = re.sub(r"\\\\\s*$", "", s, flags=re.M)
    return cleanup(s)


def unknown_report() -> dict[str, int]:
    return dict(sorted(_UNKNOWN.items(), key=lambda kv: -kv[1]))
