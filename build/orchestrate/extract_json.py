#!/usr/bin/env python
r"""从 CLI 原始输出中鲁棒提取 JSON（写到 stdout）。

提取策略（依次尝试，首个成功即停）：
  1. 整体直接解析
  2. 剥 markdown 围栏（```json ... ```）后解析
  3. 从首个 `{` 到末个 `}` 切片后解析（覆盖 DSML 工具调用包裹：
     模型有时把 JSON 塞进 Write 工具的参数里）
  4. 切片 + 清洗哨兵条目（{"__END__": true}）+ 修尾逗号后解析

校验：解析结果必须是含 entries 数组的对象，否则退出码 1。
"""
from __future__ import annotations

import json
import re
import sys

SENTINEL_RE = re.compile(r",\s*\{\s*\"__END__\"\s*:\s*(?:true|false)\s*\}")
TRAILING_COMMA_RE = re.compile(r",\s*([]}])")


def looks_valid(obj) -> bool:
    return isinstance(obj, dict) and isinstance(obj.get("entries"), list) and len(obj["entries"]) > 0


def try_parse(text: str):
    try:
        obj = json.loads(text)
    except Exception:
        return None
    return obj if looks_valid(obj) else None


def clean(text: str) -> str:
    t = SENTINEL_RE.sub("", text)
    t = TRAILING_COMMA_RE.sub(r"\1", t)
    return t


def main() -> None:
    raw = sys.stdin.read()
    candidates: list[str] = [raw]

    # 2) 围栏剥离
    m = re.search(r"```(?:json)?\s*\n(.*)\n\s*```", raw, re.DOTALL)
    if m:
        candidates.append(m.group(1))

    # 3) 首 { 到尾 } 切片
    i, j = raw.find("{"), raw.rfind("}")
    if 0 <= i < j:
        candidates.append(raw[i:j + 1])
        # 4) 切片 + 清洗
        candidates.append(clean(raw[i:j + 1]))

    # 全文清洗兜底
    candidates.append(clean(raw))

    for text in candidates:
        obj = try_parse(text)
        if obj is not None:
            json.dump(obj, sys.stdout, ensure_ascii=False, indent=2)
            print()
            return
    sys.exit(1)


if __name__ == "__main__":
    main()
