r"""朗读稿生成：公共清洗与口语化规则。

被 `gen_*.py` import，不单独运行。

## 设计口径（2026-11-18 与用户定稿）

朗读稿服务的是「浏览器 TTS 能顺畅念出来」，不是「看起来好看」。因此：

1. **英文标识符保留英文**，因为 Edge 念英文单词没问题；只有三类要改：
   - 下划线 → 空格（`epoll_wait` → `epoll wait`），否则念成「下划线」三字
   - 由完整单词截断来的缩写 → 展开（`exec` → `execute`），否则逐字母念
   - 协议字段/变量名 → 展开成中文（`cwnd` → 拥塞窗口），逐字母念完全听不懂
2. **全大写多词常量转小写**（`CLONE_FILES` → `clone files`），避免逐字母。
3. **行业本来就逐字母念的缩写不动**（`KMP`、`CPU`、`TLB`），用户自己也这么念。
4. **数学公式按意义念**，不按字符念。`|A|` 是「A 的行列式」而不是「竖线 A 竖线」。
5. **乘号默认省略**（`Q^{T}AQ` → `Q 转置 A Q`），只在两个单字母紧贴时补「乘」
   （`AB` → `A 乘 B`），否则念成一个词。
6. **首现展开、复现念短**：术语在本单元第一次出现时给一句注解，之后只念名字。
   状态由各 `gen_*.py` 的 `Ctx` 维护。

## 竖线的五种写法（实测，必须区分）

| 写法 | 人数 | 含义 |
|---|---|---|
| `|A|` 裸竖线包大写字母 | 28 次/10 文件，全在 la/ | 行列式 |
| `\lvert A\rvert` | 9 次/2 文件 | 行列式 |
| `\|Ax\|` | 数处（la/0203、0303、0602） | 范数 |
| `\left|...\right|` | 2 次（hs/0702、ps/0801） | 绝对值 |
| `\mid` 在 la/ | 9 次/5 文件 | 增广/分块矩阵分隔 |
| `\mid` 在 ps/ | 13 次/4 文件 | 条件概率「在…条件下」 |

最后一行是**唯一必须按子目录分派**的地方：同一个 `\mid`，在 `la/` 念「增广」，
在 `ps/` 念「在…条件下」。写反了就是 `r(A|b)` 被念成「在 b 条件下 A 的秩」。
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path

NOTEBOOK = Path("/Users/apple/develop/learning/notebook")

# ---------------------------------------------------------------------------
# 一、字符级替换：中文夹注符号与数学符号
# ---------------------------------------------------------------------------
# 这些字符 TTS 要么念错、要么念成「小于等于号」这种怪词。
CHAR_MAP = {
    "⇒": "推出",
    "⇔": "等价于",
    "↔": "对应",
    "←": "来自",
    "→": "变成",
    "≤": "小于等于",
    "≥": "大于等于",
    "≈": "约等于",
    "≠": "不等于",
    "≡": "恒等于",
    "±": "正负",
    "×": "乘",
    "−": "减",
    "÷": "除以",
    "∵": "因为",
    "∴": "所以",
    "↑": "上升",
    "↓": "下降",
    "〔": "",
    "〕": "",
    "§": "",
    "∑": "求和",
    "∫": "积分",
    "√": "根号",
    "∞": "无穷",
    "∂": "偏导",
    "α": "alpha",
    "β": "beta",
    "γ": "gamma",
    "δ": "delta",
    "ε": "epsilon",
    "θ": "theta",
    "λ": "lambda",
    "μ": "mu",
    "π": "pi",
    "ρ": "rho",
    "σ": "sigma",
    "τ": "tau",
    "φ": "phi",
    "ω": "omega",
    "Δ": "Delta",
    "Λ": "Lambda",
    "Σ": "Sigma",
    "Ω": "Omega",
    "∇": "nabla",
}

# ---------------------------------------------------------------------------
# 二、LaTeX 命令 → 中文读法
# ---------------------------------------------------------------------------
# 顺序敏感：长模式在前，避免 `\le` 先吃掉 `\leq`。
GREEK_CMD = {
    "alpha": "alpha", "beta": "beta", "gamma": "gamma", "delta": "delta",
    "epsilon": "epsilon", "varepsilon": "epsilon", "zeta": "zeta", "eta": "eta",
    "theta": "theta", "vartheta": "theta", "iota": "iota", "kappa": "kappa",
    "lambda": "lambda", "mu": "mu", "nu": "nu", "xi": "xi", "pi": "pi",
    "rho": "rho", "sigma": "sigma", "tau": "tau", "upsilon": "upsilon",
    "phi": "phi", "varphi": "phi", "chi": "chi", "psi": "psi", "omega": "omega",
    "Gamma": "Gamma", "Delta": "Delta", "Theta": "Theta", "Lambda": "Lambda",
    "Xi": "Xi", "Pi": "Pi", "Sigma": "Sigma", "Phi": "Phi", "Psi": "Psi",
    "Omega": "Omega",
}

# 算子名：必须成词念，不能逐字母
OPERATOR_CMD = {
    r"\det": "行列式",
    r"\dim": "维数",
    r"\ker": "核",
    r"\gcd": "最大公约数",
}

# 函数名：保留英文单词（TTS 念得对），但要吃掉反斜杠
FUNC_CMD = {
    "sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan",
    "sinh", "cosh", "tanh", "ln", "log", "lg", "exp", "max", "min", "sup",
    "inf", "lim", "arg", "deg", "gcd", "Pr",
}

# `\mathrm{...}` / `\operatorname{...}` 里的语义词
SEMANTIC_WORD = {
    "tr": "迹",
    "diag": "对角阵",
    "div": "散度",
    "curl": "旋度",
    "sgn": "符号函数",
    "span": "张成",
    "Var": "方差",
    "Cov": "协方差",
    "rank": "秩",
    "adj": "伴随",
}

# ---------------------------------------------------------------------------
# 三、英文标识符：缩写展开表（只放「逐字母念听不懂」的）
# ---------------------------------------------------------------------------
ABBREV = {
    # 系统调用 / 函数：由完整单词截断而来
    "exec": "execute",
    "syscall": "system call",
    "strlen": "string length",
    "memcpy": "memory copy",
    "memset": "memory set",
    # `break` 会与 C 的 break 语句混淆（reviewer 2026-11-18 指出），改写为动作
    "sbrk": "调整堆顶",
    # `COW` 会被 TTS 念成 "cow"（奶牛），必须改写成中文
    "COW": "写时复制",
    # 408 协议字段 / 变量名：逐字母完全听不懂，必须中文
    "cwnd": "拥塞窗口",
    "rwnd": "接收窗口",
    "ssthresh": "慢开始门限",
    "snd_una": "发送未确认序号",
    "rcv_nxt": "接收下一个序号",
    "snd_nxt": "发送下一个序号",
    "ASL": "平均查找长度",
    "WPL": "带权路径长度",
    "CPI": "每条指令平均时钟周期数",
    "PCB": "进程控制块",
    "TLB": "快表",
    "DMA": "直接存储器访问",
    "ve": "事件最早发生时间",
    "vl": "事件最迟发生时间",
}

# 行业标准逐字母念的缩写：一律不动（列出来是为了让 review 能核对「我们是有意保留的」）
KEEP_AS_IS = {
    "CPU", "MDR", "MAR", "ALU", "KMP", "CRC", "TCP", "UDP", "HTTP", "DNS",
    "RIP", "OSPF", "BGP", "CIDR", "NAT", "LIFO", "FIFO", "DFS", "BFS", "BST",
    "AVL", "STL", "GBN", "SR", "ET", "LT", "OSS", "SCAN", "LOOK",
    "SISD", "SIMD", "MIMD", "IEEE", "IT", "DB", "SQL", "ACID", "MVCC",
    # 408 大纲实测命中（逐字母或整词念都对，不需要中文化）
    "MIPS", "MFLOPS", "ASCII", "FCFS", "HRRN", "FDMA", "TDMA", "WDMA",
    "CSMA", "FTTB", "ADSL", "SRAM", "DRAM", "SSTF", "UNIX", "CDMA",
    "ALOHA", "VLAN", "PPP", "SSD", "RAID", "BIOS", "ROM", "RAM",
    "ASID", "CISC", "RISC", "HDLC", "DHCP", "ICMP", "ARP", "IGMP",
}

# 首现注解（只在单元首次出现时插一次）
FIRST_NOTE = {
    # 首现必须交代**语义**而不只是「这是个接口名」——听的人学的是概念
    "execute": "execute，也就是用新程序替换当前进程",
    "调整堆顶": "调整堆顶，也就是 sbrk 这个调用",
    "拥塞窗口": "拥塞窗口，也就是 cwnd",
    "接收窗口": "接收窗口，也就是 rwnd",
    "慢开始门限": "慢开始门限，也就是 ssthresh",
    "写时复制": "写时复制，也就是 COW",
}


# ---------------------------------------------------------------------------
# 四、上下文：维护「本单元已出现过哪些术语」
# ---------------------------------------------------------------------------
@dataclass
class Ctx:
    """单个文档的生成上下文。`subdir` 决定 `\\mid` 与裸竖线的语义。"""
    subdir: str = ""          # 'la' / 'ps' / 'hs' / '' —— 决定竖线语义
    seen: set[str] = field(default_factory=set)
    warnings: list[str] = field(default_factory=list)

    def first_time(self, key: str) -> bool:
        if key in self.seen:
            return False
        self.seen.add(key)
        return True


# ---------------------------------------------------------------------------
# 五、英文标识符处理
# ---------------------------------------------------------------------------
_UNDERSCORE = re.compile(r"([A-Za-z0-9])_([A-Za-z0-9])")
_UPPER_WORD = re.compile(r"\b[A-Z][A-Z0-9]{3,}\b")


def read_ident(name: str, ctx: Ctx) -> str:
    """把正文里一个英文标识符转成可朗读形式。

    规则顺序：缩写展开 → 下划线换空格 → 全大写转小写（不在 KEEP_AS_IS 里时）。
    """
    if name in KEEP_AS_IS:
        return name
    if name in ABBREV:
        word = ABBREV[name]
        if ctx.first_time(word) and word in FIRST_NOTE:
            return FIRST_NOTE[word]
        return word
    out = _UNDERSCORE.sub(r"\1 \2", name)          # epoll_wait → epoll wait
    # 多段下划线逐个替换
    while "_" in out:
        out = out.replace("_", " ")
    if _UPPER_WORD.fullmatch(out.replace(" ", "")) and out not in KEEP_AS_IS:
        out = out.lower()                          # CLONE FILES → clone files
    return out


# ---------------------------------------------------------------------------
# 六、数学：LaTeX → 中文口语
# ---------------------------------------------------------------------------
def _read_brace(cmd: str, arg: str) -> str:
    r"""处理带花括号的命令（\frac \sqrt \mathrm \operatorname 等）。"""
    if cmd in ("mathrm", "operatorname", "text", "textbf", "mathbf", "mathbb"):
        word = arg.strip().replace("\\", "")
        return SEMANTIC_WORD.get(word, word)
    if cmd == "overline":
        return f"{arg} 上划线"
    if cmd == "hat":
        return f"{arg} 帽"
    if cmd == "vec":
        return f"向量 {arg}"
    if cmd == "bar":
        return f"{arg} 平均"
    if cmd == "binom":
        return arg
    return arg


def _brace_arg(s: str, i: int) -> tuple[str | None, int]:
    """从 `s[i]`（应为 `{`）开始，取配平花括号里的内容。返回 (内容, 结束下标)。"""
    if i >= len(s) or s[i] != "{":
        return None, i
    depth = 0
    for j in range(i, len(s)):
        if s[j] == "{":
            depth += 1
        elif s[j] == "}":
            depth -= 1
            if depth == 0:
                return s[i + 1:j], j + 1
    return None, i


def _token(s: str, i: int) -> tuple[str | None, int]:
    r"""取一个 LaTeX 参数 token。

    LaTeX 允许**省略单 token 参数的括号**，实测数一笔记里这三种写法都大量存在：
        `\bar A`（111 处的绝大多数）、`\frac12`、`\sqrt n`（`\sigma/\sqrt n`）。
    只认 `{...}` 会让这些命令全部落进兜底被删掉。

    返回 (token, 结束下标)；token 已去掉外层花括号。
    """
    if i >= len(s):
        return None, i
    if s[i] == "{":
        return _brace_arg(s, i)
    if s[i] == "\\":
        m = re.match(r"\\[A-Za-z]+", s[i:])
        if m:
            return m.group(0), i + len(m.group(0))
        return s[i], i + 1
    return s[i], i + 1


def expand_two_arg(s: str) -> str:
    r"""展开双参数命令（`\frac` `\dfrac` `\tfrac` `\binom`），支持参数内嵌套花括号。

    为什么不能只用正则：`\frac{x^{2}}{y}` 的第一个参数含 `{}`，
    `\{([^{}]*)\}` 直接失配。实测数一目录里 `\frac` 有 108 处、
    `\dfrac` 46 处因此落进兜底被整段删掉（分式信息全丢）。
    这里按配平括号扫，嵌套再深也能取对。
    """
    import re as _re

    pat = _re.compile(r"\\(dbinom|dfrac|tfrac|frac|binom)")
    out: list[str] = []
    i = 0
    while i < len(s):
        m = pat.match(s, i)
        if not m:
            out.append(s[i])
            i += 1
            continue
        j = m.end()
        while j < len(s) and s[j] == " ":
            j += 1
        a, j2 = _token(s, j)
        while j2 < len(s) and s[j2] == " ":
            j2 += 1
        b, j3 = _token(s, j2)
        if a is None or b is None:
            out.append(s[i:m.end()])
            i = m.end()
            continue
        if m.group(1) in ("binom", "dbinom"):
            out.append(f" 组合数 {a} 取 {b} ")
        else:
            out.append(f" {a} 除以 {b} ")
        i = j3
    return "".join(out)


def expand_one_arg(s: str) -> str:
    r"""展开单参数修饰命令：`\bar` `\vec` `\hat` `\overline` `\tilde` `\dot`。

    同样是括号失配问题：`\bar{\lambda}` 若被兜底删掉就只剩 `lambda`，
    「平均」这层信息没了（实测 `\bar` 111 处、`\vec` 74 处）。
    """
    import re as _re

    pat = _re.compile(r"\\(overline|bar|vec|hat|tilde|dot)")
    words = {
        "bar": "的平均", "overline": "上划线", "vec": "向量",
        "hat": "帽", "tilde": "波浪", "dot": "导数",
    }
    out: list[str] = []
    i = 0
    while i < len(s):
        m = pat.match(s, i)
        if not m:
            out.append(s[i])
            i += 1
            continue
        j = m.end()
        while j < len(s) and s[j] == " ":
            j += 1
        a, j2 = _token(s, j)
        if a is None:
            out.append(s[i:m.end()])
            i = m.end()
            continue
        word = words[m.group(1)]
        out.append(f"{word} {a} " if word == "向量" else f" {a} {word} ")
        i = j2
    return "".join(out)


def expand_sqrt(s: str) -> str:
    r"""`\sqrt` / `\sqrt[n]` 的配平展开（参数可含嵌套，如 `\sqrt{a^2+b^2}`）。"""
    import re as _re

    pat = _re.compile(r"\\sqrt")
    out: list[str] = []
    i = 0
    while i < len(s):
        m = pat.match(s, i)
        if not m:
            out.append(s[i])
            i += 1
            continue
        j = m.end()
        while j < len(s) and s[j] == " ":
            j += 1
        root = ""
        if j < len(s) and s[j] == "[":
            k = s.find("]", j)
            if k > 0:
                root = s[j + 1:k]
                j = k + 1
                while j < len(s) and s[j] == " ":
                    j += 1
        a, j2 = _token(s, j)
        if a is None:
            out.append(s[i:m.end()])
            i = m.end()
            continue
        out.append(f" {a} 开 {root} 次方 " if root else f" 根号 {a} ")
        i = j2
    return "".join(out)


def read_math(tex: str, ctx: Ctx) -> str:
    """把一段 LaTeX 读成中文口语。tex 不含 `$` 定界符。"""
    s = tex

    # ---- ① 语义级模式：必须在删命令之前处理，否则会先被吃掉 ----
    # 条件概率 / 增广矩阵：同一个 \mid 两种意思，按子目录分派
    def _mid(m: re.Match[str]) -> str:
        a, b = m.group(1), m.group(2)
        if ctx.subdir == "ps":
            return f"在 {b} 发生条件下 {a} 的概率"
        return f"{a} 增广 {b}"

    # `P(A\mid B)` 在 ps 里是条件概率，整体替换（保留 P 与括号语义）
    if ctx.subdir == "ps":
        s = re.sub(
            r"P\s*\(\s*([A-Za-z][A-Za-z0-9]*)\s*\\mid\s*([A-Za-z][A-Za-z0-9]*)\s*\)",
            r" 在 \2 发生条件下 \1 的概率 ", s)
    # 秩里的增广：r(A\mid b) → A 增广 b 的秩
    s = re.sub(
        r"\br\s*\(\s*([A-Za-z]+)\s*\\mid\s*([A-Za-z0-9\\{}_^*]+)\s*\)",
        r" \1 增广 \2 的秩 ", s)
    # 通用：X\mid Y。**不吃两侧括号**（原写法里的 `\(?` `\)?` 会把 `(A|b)` 的右括号吃掉）
    s = re.sub(r"([A-Za-z])\s*\\mid\s*([A-Za-z0-9\\{}_^*]+)", _mid, s)

    # 范数：\|x\| —— 必须在裸竖线之前，否则 \| 的竖线会被当成成对边界
    s = re.sub(r"\\\|([^|]*?)\\\|", r" \1 的范数 ", s)
    # 绝对值：\left| ... \right|
    s = re.sub(r"\\left\|(.*?)\\right\|", r" \1 的绝对值 ", s)
    # 行列式：\lvert ... \rvert
    s = re.sub(r"\\lvert\s*(.*?)\s*\\rvert", r" \1 的行列式 ", s)
    # 求值竖线：`|_{P_0}` / `\big|_{P_0}` → 在 P 0 处。
    # 这是**孤立**竖线，必须在成对匹配之前，否则会被当成一对的开头。
    s = re.sub(r"\|\s*_\s*\{?([^{}|\s]*)\}?", r" 在 \1 处 ", s)
    # 成对竖线：按子目录分派。`la` 是行列式，其余学科是绝对值
    # （`|x_n-a|≤g(n)` 这种在 hs 里是绝对值，念成行列式就错了）。
    bar_verb = "行列式" if ctx.subdir == "la" else "绝对值"
    s = re.sub(rf"\|([^|\n]{{1,40}})\|", rf" \1 的{bar_verb} ", s)

    # 秩 r(A) / 迹 \mathrm{tr} / 伴随 A^*
    s = re.sub(r"\br\s*\(([A-Za-z][A-Za-z0-9\\{}_^]*)\)", r" \1 的秩 ", s)
    # 期望与方差
    s = re.sub(r"\bE\s*\(([A-Za-z])\)", r" \1 的期望 ", s)
    s = re.sub(r"\bD\s*\(([A-Za-z])\)", r" \1 的方差 ", s)
    # 转置 / 逆 / 伴随 / 平方 / n 次方（上标）
    #
    # ⚠ 这里**不能**用 `\^\{?\s*2\s*\}?` 那种「左括号和右括号都可选」的写法：
    # 对 `b^2}`（外层还有括号，如 `\sqrt{a^2+b^2}`），`\}` 会匹配到 **外层** 的
    # 右括号并把它吃掉，于是 `\sqrt{...}` 少一半括号，后续配平解析全部失配 ——
    # 实测这一步让 111 处 `\bar`、96 处 `\frac` 落进兜底被整段删除。
    # 所以拆成两支：带花括号的整块消费；不带花括号的只吃一个字符、**绝不消费 `}`**。
    _sup = {
        "T": " 转置 ", "t": " 转置 ", "*": " 的伴随 ",
        "2": " 平方 ", "n": " 的 n 次方 ", "-1": " 的逆 ",
    }
    s = re.sub(r"\^\s*\{([^{}]*)\}",
               lambda m: _sup.get(m.group(1).strip(), f" 的 {m.group(1).strip()} 次方 "), s)
    s = re.sub(r"\^\s*(-1|[Tt*2n])(?![A-Za-z0-9{])",
               lambda m: _sup.get(m.group(1), " "), s)

    # ---- ② 结构化命令 ----
    # LaTeX 换行 `\\`（也用作 md 行内换行）先吃掉，否则会在兜底后留下裸反斜杠
    s = s.replace("\\\\", " ")
    # `\_` 是完形填空的空位占位（`$\_$` 表示空串），念「空」
    s = s.replace("\\_", " 空 ")
    # 花括号文本命令先剥成纯文本，否则 `\frac{\text{a}}{b}` 里的 `{}` 会让 frac 匹配失败
    for _ in range(2):
        s = re.sub(
            r"\\(?:mathrm|operatorname|text|textbf|mathbf|mathbb)\s*\{([^{}]*)\}",
            lambda m: _read_brace("mathrm", m.group(1)), s,
        )
    s = re.sub(r"\\vphantom\s*\{[^{}]*\}", " ", s)

    # 双参数 / 单参数 / 根式：一律走配平括号扫描（循环 3 次处理多层嵌套）
    for _ in range(3):
        s = expand_two_arg(s)
        s = expand_one_arg(s)
        s = expand_sqrt(s)

    def bounded(cmd: str, verb: str) -> None:
        """带上下限的大运算符。上下限可能带花括号也可能不带：
        `\\sum_{i=1}^{n}` 与 `\\sum_{i=1}^n` 都出现在实测数据里。"""
        nonlocal s
        s = re.sub(
            rf"\\{cmd}\s*_\s*\{{?([^{{}}^_]*)\}}?\s*\^\s*\{{?([^{{}}]*)\}}?",
            rf" 从 \1 到 \2 {verb} ", s,
        )
        s = re.sub(rf"\\{cmd}\s*_\s*\{{?([^{{}}^_]*)\}}?", rf" 从 \1 起{verb} ", s)
        s = re.sub(rf"\\{cmd}", f" {verb} ", s)

    # 顺序敏感：\iint 必须先于 \int，否则被当成 \int 吃掉一个 i
    for name, verb in (
        ("iiint", "三重积分"), ("iint", "双重积分"), ("oint", "环路积分"),
        ("sum", "求和"), ("prod", "连乘"), ("int", "积分"),
    ):
        bounded(name, verb)
    s = re.sub(r"\\lim\s*_\s*\{([^{}]*)\}", r" 当 \1 时的极限 ", s)
    s = re.sub(r"\\lim", " 极限 ", s)
    # 上取整 / 下取整
    s = re.sub(r"\\lceil\s*(.*?)\s*\\rceil", r" 向上取整 \1 ", s)
    s = re.sub(r"\\lfloor\s*(.*?)\s*\\rfloor", r" 向下取整 \1 ", s)

    # ---- ③ 反斜杠命令逐类吃掉 ----
    for cmd, word in OPERATOR_CMD.items():
        s = s.replace(cmd, f" {word} ")
    # 用 `(?![A-Za-z])` 而不是 `\b`：`\lambda_1` 里 `a` 与 `_` 之间**不是**词边界
    # （`_` 是词字符），`\b` 会漏掉所有带下标的希腊字母（实测 wr-06 的 `\lambda_{\text{语言}}`）。
    for name, word in sorted(GREEK_CMD.items(), key=lambda kv: -len(kv[0])):
        s = re.sub(rf"\\{name}(?![A-Za-z])", f" {word} ", s)

    plain = {
        r"\le": " 小于等于 ", r"\leq": " 小于等于 ",
        r"\ge": " 大于等于 ", r"\geq": " 大于等于 ",
        r"\neq": " 不等于 ", r"\ne": " 不等于 ",
        r"\approx": " 约等于 ", r"\equiv": " 恒等于 ",
        r"\to": " 趋于 ", r"\rightarrow": " 趋于 ",
        r"\longrightarrow": " 趋于 ", r"\iff": " 等价于 ",
        r"\Rightarrow": " 推出 ", r"\Longrightarrow": " 推出 ",
        r"\Leftrightarrow": " 等价于 ",
        r"\in": " 属于 ", r"\notin": " 不属于 ",
        r"\subset": " 包含于 ", r"\subseteq": " 包含于 ",
        r"\cup": " 并 ", r"\cap": " 交 ", r"\varnothing": " 空集 ",
        r"\emptyset": " 空集 ", r"\infty": " 无穷 ",
        r"\partial": " 偏导 ", r"\nabla": " nabla ",
        r"\forall": " 任意 ", r"\exists": " 存在 ",
        r"\cdot": " ", r"\times": " 乘 ", r"\div": " 除以 ",
        r"\pm": " 正负 ", r"\mp": " 负正 ",
        r"\perp": " 垂直于 ", r"\parallel": " 平行于 ",
        r"\mapsto": " 映射到 ", r"\oiint": " 闭合曲面积分 ",
        r"\prime": " 撇 ", r"\Box": " 方框 ",
        r"\cdots": " 等等 ", r"\dots": " 等等 ", r"\ldots": " 等等 ",
        r"\quad": " ", r"\qquad": " ", r"\,": " ", r"\;": " ", r"\!": " ",
        r"\left": " ", r"\right": " ", r"\Big": " ", r"\big": " ",
        r"\displaystyle": " ", r"\limits": " ",
        r"\begin": " ", r"\end": " ",
    }
    for pat, rep in sorted(plain.items(), key=lambda kv: -len(kv[0])):
        s = s.replace(pat, rep)
    # `\sim` 两义：概率语境是「服从…分布」（`X\sim N(0,1)`），其余是「等价于/相似」
    s = s.replace("\\sim", " 服从 " if ctx.subdir == "ps" else " 等价于 ")
    # 除号：`\sigma/\sqrt n`、`n/2` —— 不转文字会念成 slash 或静默
    s = s.replace("/", " 除以 ")
    # 关系符：中文 TTS 对裸 `= < >` 的读法不稳定（有时念 equals、有时静默），统一成文字
    # 兜底：前面正则没覆盖到的零散 `\mid`（如 `(A\mid B)`）。按子目录分派语义。
    s = s.replace("\\mid", " 增广 " if ctx.subdir != "ps" else " 条件下 ")
    s = s.replace("<=", " 小于等于 ").replace(">=", " 大于等于 ").replace("!=", " 不等于 ")
    s = s.replace("=", " 等于 ")
    s = re.sub(r"(?<![<>=])<(?![=])", " 小于 ", s)
    s = re.sub(r"(?<![<>=])>(?![=])", " 大于 ", s)
    # 矩阵与分段环境的壳子
    s = re.sub(r"\{?(?:pmatrix|bmatrix|vmatrix|matrix|cases|array|aligned)\}?", " ", s)
    for name in sorted(FUNC_CMD, key=len, reverse=True):
        s = re.sub(rf"\\{name}(?![A-Za-z])", f" {name} ", s)

    # 下标：`X_1` → `X 1`，`a_{n+1}` → `a n+1`。
    # 放在上下限处理之后 —— 此时 `\sum_{i=1}^n` 已被 bounded 吃掉，剩的是变量下标。
    s = re.sub(r"_\s*\{([^{}]*)\}", r" \1 ", s)
    s = re.sub(r"_\s*([A-Za-z0-9])", r" \1 ", s)

    # ---- ④ 兜底：剩下的反斜杠命令直接丢 ----
    leftovers = re.findall(r"\\[a-zA-Z]+", s)
    if leftovers:
        ctx.warnings.append("未映射命令：" + " ".join(sorted(set(leftovers))[:6]))
    s = re.sub(r"\\[a-zA-Z]+", " ", s)
    s = s.replace("\\", " ")          # 裸反斜杠（`\ ` 这类）
    s = s.replace("_", " ")
    s = s.replace("{", " ").replace("}", " ").replace("&", " ")
    s = s.replace("$", " ")
    # 收尾：压制多余空白，乘号与相邻符号之间留一个空格
    s = re.sub(r"\s+", " ", s).strip(" ，、")
    return s


# ---------------------------------------------------------------------------
# 七、Markdown → blocks
# ---------------------------------------------------------------------------
_HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
_FENCE = re.compile(r"^```")
_LIST = re.compile(r"^\s*(?:[-*+]|\d+\.)\s+(.*)$")
_QUOTE = re.compile(r"^>\s?(.*)$")


def code_or_ident(raw: str, ctx: Ctx) -> str:
    """反引号内容分两类。

    - **标识符**（`epoll_wait`、`CLONE_FILES`）→ 走 `read_ident`，保留并可读
    - **命令 / 代码片段**（`grep -c "\\bI\\b"`、`ls -l /proc/$PID/fd`）→ 整段丢弃

    判据：含反斜杠、或含空格、或以短横开头的，一律当命令。朗读这些是纯噪音，
    而且 `\\b`、`$PID` 这类片段会把后面的正文一起带偏。
    """
    if "\\" in raw or " " in raw or raw.startswith("-"):
        return " "
    return read_ident(raw, ctx)


def clean_bare(text: str, ctx: Ctx) -> str:
    """清理**没被 `$` 包裹**的裸符号。

    实测发现笔记里有大量正文直接写成公式形态却没加定界符，例如
    `分母放大让|x_n-a|≤g(n)失效`（`M1-HS-0102` 第 5 行）、`能再验 f=f_Xf_Y`
    （`M1-PS-0302` 第 5 行）。这类不进 `read_math`，只能在这里兜。

    竖线语义仍按子目录分派：`la` 的行列式、其余学科的绝对值。
    """
    # 完形填空的空位：`___` / `__` → 空格（实测 01-完形填空 大量使用）
    text = re.sub(r"_{2,}", " 空格 ", text)
    # 求值竖线：`|_{P_0}` → 在 P 0 处（必须在成对竖线之前）
    text = re.sub(r"\|\s*_\s*\{?([^{}|\s]*)\}?", r" 在 \1 处 ", text)
    # 成对竖线
    verb = "行列式" if ctx.subdir == "la" else "绝对值"
    text = re.sub(rf"\|([^|\n]{{1,30}})\|", rf" \1 的{verb} ", text)
    # 裸上标
    text = re.sub(r"([A-Za-z0-9])\s*\^\s*\+", r"\1 正", text)
    text = re.sub(r"([A-Za-z0-9])\s*\^\s*-", r"\1 负", text)
    text = re.sub(r"([A-Za-z0-9])\s*\^\s*2\b", r"\1 平方", text)
    text = re.sub(r"([A-Za-z0-9])\s*\^\s*\{?[Tt]\}?", r"\1 转置", text)
    # 二阶导
    text = re.sub(r"([A-Za-z])\s*''", r"\1 的二阶导", text)
    # 裸下标：x_n → x n（只认「字母数字_字母数字」，路径里的下划线不动）
    text = re.sub(r"(?<=[A-Za-z0-9])_(?=[A-Za-z0-9])", " ", text)
    return text


def inline(text: str, ctx: Ctx) -> str:
    """行内清洗：行内公式 → 反引号标识符 → markdown 标记 → 裸符号 → 字符替换。

    公式先摘成 `\\x00<i>\\x00` 占位符再回填。这个顺序不能反：markdown 的
    粗体/斜体正则会把公式里的 `*`、`_` 一起吃进去（`$A^{*}$` 就是典型），
    表格竖线替换也会误伤公式里的 `|`。

    表格行（以 `|` 开头且竖线 ≥4 个）走「整行换逗号」；其余行才做裸竖线判定，
    否则 `| KP | 节 |` 会被当成若干个绝对值。
    """
    stash: list[str] = []

    def hold(m: re.Match[str]) -> str:
        stash.append(read_math(m.group(1), ctx))
        return f"\x00{len(stash) - 1}\x00"

    text = re.sub(r"\$([^$]+)\$", hold, text)

    # 反引号：标识符保留、命令行丢弃
    text = re.sub(r"`([^`]+)`", lambda m: code_or_ident(m.group(1).strip(), ctx), text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    # 英文斜体也写作 `_word_`，必须在 clean_bare 吃掉下划线之前剥掉标记
    text = re.sub(r"(?<![A-Za-z0-9_])_([^_\n]+)_(?![A-Za-z0-9_])", r"\1", text)
    text = re.sub(r"~~([^~]+)~~", r"\1", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)

    is_table = text.strip().startswith("|") and text.count("|") >= 4
    if not is_table:
        text = clean_bare(text, ctx)
    text = text.replace("|", "，")          # 表格列分隔 / 剩余孤立竖线

    for i, val in enumerate(stash):
        text = text.replace(f"\x00{i}\x00", val)
    # 正文里裸的全大写多词（`DISCOVER 变成 OFFER`、`CLONE_FILES` 已被反引号分支处理过）
    # 会被 TTS 逐字母念，转小写；`KMP`/`CPU` 这类行业标准缩写保留。
    text = re.sub(
        r"\b[A-Z][A-Z0-9]{3,}\b",
        lambda m: m.group(0) if m.group(0) in KEEP_AS_IS else m.group(0).lower(),
        text,
    )
    for ch, rep in CHAR_MAP.items():
        text = text.replace(ch, rep)
    text = re.sub(r"\s+", " ", text)
    # 中文标点后的空格是 markdown 强调标记留下的残渣（`**定义。** 图画…` → `定义。 图画…`），
    # 删掉。英文句号后的空格**不能**删，那是正常的词间分隔。
    text = re.sub(r"(?<=[。；，、：！？）】])\s+", "", text)
    return text.strip()


def read_blocks(md: str, ctx: Ctx) -> list[dict]:
    """Markdown → blocks。块级公式单独成 f 块，保留 tex 供页面折叠显示。"""
    blocks: list[dict] = []
    lines = md.splitlines()
    i = 0
    buf: list[str] = []

    def flush() -> None:
        if not buf:
            return
        raw = " ".join(x.strip() for x in buf if x.strip())
        buf.clear()
        if not raw:
            return
        text = inline(raw, ctx)
        if text:
            blocks.append({"t": "p", "x": text})

    while i < len(lines):
        line = lines[i]
        if _FENCE.match(line.strip()):
            flush()
            i += 1
            while i < len(lines) and not _FENCE.match(lines[i].strip()):
                i += 1
            i += 1
            continue

        # 块级公式 $$...$$
        stripped = line.strip()
        if stripped.startswith("$$"):
            flush()
            body: list[str] = []
            rest = stripped[2:]
            if rest.endswith("$$") and len(rest) > 2:
                body.append(rest[:-2])
                i += 1
            else:
                if rest:
                    body.append(rest)
                i += 1
                while i < len(lines) and not lines[i].strip().endswith("$$"):
                    body.append(lines[i].strip())
                    i += 1
                if i < len(lines):
                    tail = lines[i].strip()[:-2]
                    if tail:
                        body.append(tail)
                    i += 1
            tex = " ".join(x for x in body if x)
            if tex:
                blocks.append({"t": "f", "x": read_math(tex, ctx), "tex": tex})
            continue

        m = _HEADING.match(line)
        if m:
            flush()
            level = len(m.group(1))
            text = inline(m.group(2), ctx)
            if text:
                blocks.append({"t": f"h{min(level, 3)}", "x": text})
            i += 1
            continue

        m = _QUOTE.match(line)
        if m:
            flush()
            text = inline(m.group(1), ctx)
            # 元信息引用块（章号 / 档位 / 真题落点 / 一课位置）不进朗读稿：
            # 它们指向的是记账与文件，不是知识本身，念出来只是噪音。
            meta = ("档位：", "真题落点", "一课位置", "对位考点", "讲解稿｜")
            if text and not any(k in text for k in meta):
                blocks.append({"t": "q", "x": text})
            i += 1
            continue

        m = _LIST.match(line)
        if m:
            flush()
            text = inline(m.group(1), ctx)
            if text:
                blocks.append({"t": "li", "x": text})
            i += 1
            continue

        if not line.strip():
            flush()
        else:
            buf.append(line)
        i += 1

    flush()
    return blocks


# ---------------------------------------------------------------------------
# 八、工具
# ---------------------------------------------------------------------------
RESIDUE = re.compile(r"[$\\|`_]")
UPPER_RUN = re.compile(r"\b[A-Z][A-Z0-9]{3,}\b")


def check(blocks: list[dict]) -> list[str]:
    """产物自检：返回问题清单（空表示通过）。"""
    problems: list[str] = []
    for b in blocks:
        x = b.get("x", "")
        if RESIDUE.search(x):
            problems.append(f"残留符号 {RESIDUE.findall(x)[:3]}：{x[:40]}")
        for run in UPPER_RUN.findall(x):
            if run not in KEEP_AS_IS:
                problems.append(f"未处理的全大写 {run}：{x[:40]}")
    return problems


def sha8(path: Path) -> str:
    return hashlib.sha1(path.read_bytes()).hexdigest()[:8]


def emit(unit: dict, out_dir: Path) -> Path:
    """写单个单元 json。"""
    import json

    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{unit['id']}.json"
    path.write_text(
        json.dumps(unit, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    return path
