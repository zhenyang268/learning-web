#!/usr/bin/env python
"""剥离模型输出外层 markdown 围栏（```json ... ```），输出到 stdout。"""
import re
import sys

raw = sys.stdin.read()
# 常见形态：```json\n{...}\n``` 或 ```\n{...}\n```
m = re.search(r"```(?:json)?\s*\n(.*)\n\s*```", raw, re.DOTALL)
out = m.group(1) if m else raw
print(out.strip())
