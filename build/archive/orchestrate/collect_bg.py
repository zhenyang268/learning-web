#!/usr/bin/env python
"""从 `codebuddy --bg` 后台会话回收模型输出（WorkBuddy 沙盒可用）。

背景（2026-09-24 实测）：
- WorkBuddy 沙盒里嵌套 `codebuddy -p` 前台跑会假死、拿不到输出；
- `codebuddy --bg --name X -p ...` 派发的托管后台会话能正常生成，
  但 `~/.workbuddy/logs/<name>.log` 恒为 0 字节，且进程被沙盒回收后
  `jobs/<id>/state.json` 的 state 常被误标为 "failed"；
- **唯一可靠的输出真源是 transcript**：
  `~/.workbuddy/projects/<cwd-slug>/<sessionId>.jsonl` 中最后一条
  role=assistant 的 output_text。slug = cwd 去掉前导 `/` 后把 `/` 换成 `-`。

用法：
  collect_bg.py <name> <out_raw>   回收输出写入 out_raw
  collect_bg.py --probe <name>     仅探测：会话存在且进程活着则退出码 0

退出码（回收模式）：
  0 = 已回收（进程已终结且 transcript 里有助手输出）
  1 = 进程已终结但无输出（真失败，需重派）
  2 = 仍在运行（或会话不存在）
  3 = 会话不存在（probe 模式下与运行中区分开：probe 时退出码见下）

退出码（--probe 模式）：
  0 = 存在且活着；1 = 存在但已终结；3 = 不存在
"""
from __future__ import annotations

import glob
import json
import os
import sys

JOBS = os.path.expanduser("~/.workbuddy/jobs")
PROJECTS = os.path.expanduser("~/.workbuddy/projects")


def find_state(name: str) -> dict | None:
    """按 name 或 shortId 在 jobs/*/state.json 里找会话。"""
    for sj in glob.glob(os.path.join(JOBS, "*", "state.json")):
        try:
            with open(sj) as f:
                st = json.load(f)
        except Exception:
            continue
        if st.get("name") == name or st.get("shortId") == name:
            return st
    return None


def transcript_path(st: dict) -> str | None:
    slug = st["cwd"].lstrip("/").replace("/", "-")
    p = os.path.join(PROJECTS, slug, st["sessionId"] + ".jsonl")
    return p if os.path.exists(p) else None


def last_assistant_text(path: str) -> str | None:
    last = None
    with open(path) as f:
        for line in f:
            try:
                d = json.loads(line)
            except Exception:
                continue
            if d.get("type") == "message" and d.get("role") == "assistant":
                for c in d.get("content", []):
                    if c.get("type") in ("output_text", "text") and str(c.get("text", "")).strip():
                        last = c["text"]
    return last


def is_alive(st: dict) -> bool:
    """workerGeneration 就是启动时打印的 PID。kill(pid,0) 判活；
    沙盒可能 EPERM —— 按「活着」处理（宁可多等，不误杀判死）。"""
    pid = st.get("workerGeneration")
    if not isinstance(pid, int) or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except Exception:
        return False


def main() -> int:
    args = sys.argv[1:]
    probe = args and args[0] == "--probe"
    if probe:
        args = args[1:]
    if len(args) < (1 if probe else 2):
        print(__doc__)
        return 64
    name = args[0]
    st = find_state(name)
    if st is None:
        if not probe:
            print(f"[miss] 会话不存在: {name}（可能从未派发或已被 rm）", file=sys.stderr)
        return 3
    alive = is_alive(st)
    if probe:
        return 0 if alive else 1

    out_raw = args[1]
    tp = transcript_path(st)
    txt = last_assistant_text(tp) if tp else None
    if alive:
        print(f"[pend] {name} 仍在运行（transcript 已有输出={bool(txt)}）", file=sys.stderr)
        return 2
    if txt:
        os.makedirs(os.path.dirname(out_raw) or ".", exist_ok=True)
        with open(out_raw, "w") as f:
            f.write(txt)
        print(f"[collect] {name} -> {out_raw}（{len(txt)} 字符）", file=sys.stderr)
        return 0
    print(f"[fail] {name} 进程已终结但 transcript 无输出（state={st.get('state')}）", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
