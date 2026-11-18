#!/usr/bin/env python3
"""把四类生成器的产物汇总成 `readable/index.json`。

页面只读这一个文件做目录，点进去再 fetch 具体单元，所以首屏不会把
3981 个词条全拉下来。

`generated` 与每个单元的 `sourceSha` 一起用于漂移检测：`notebook` 改了
但没重跑生成器时，页面顶部显示「源已变更，需重生成」。
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

ROOT = Path("/Users/apple/develop/learning/learning-web/readable")

LINES = [
    # 讲解稿在前、笔记清理稿在后：先听「这块怎么长出来的」，再听原笔记
    ("math1", "数一数学", ["math1/_talk.json", "math1/_units.json"]),
    # 讲解稿在前、考纲清单在后：先听「这科考什么」，再听考点清单
    ("cs408", "408", ["cs408/_talk.json", "cs408/_units.json"]),
    ("english1", "英语一", ["english1/_talk.json", "english1/_words.json", "english1/_writing.json"]),
    # 工程线只有方向级大纲，没有逐篇考点稿
    ("projects", "工程线", ["projects/_talk.json"]),
]


def load(rel: str) -> list[dict]:
    path = ROOT / rel
    if not path.exists():
        print(f"  ! 缺 {rel}，先跑对应生成器")
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    out: list[dict] = []
    for line_id, title, files in LINES:
        names = [files] if isinstance(files, str) else files
        units: list[dict] = []
        for name in names:
            units.extend(load(name))
        # 页面 fetch 用：数据根 + 单元 id。放这里派生，页面不拼路径。
        for u in units:
            u["path"] = f"readable/{line_id}/{u['id']}.json"
        out.append({"id": line_id, "title": title, "units": units})
        print(f"{title}: {len(units)} 单元")

    payload = {
        "version": "reading/v1",
        "generated": date.today().isoformat(),
        "lines": out,
    }
    path = ROOT / "index.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"已写入 {path}（{sum(len(x['units']) for x in out)} 单元）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
