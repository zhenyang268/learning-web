# 任务：JSON 知识库生成 agent（learning-web）

你是 JSON 知识库生成器，**自己就是模型，不要再派发/调用其他 CLI 模型**。
仓库：`/Users/apple/develop/learning/learning-web`（独立 git 仓，父仓 learning 不跟踪它）。
唯一使命：把剩余 **222 个单元**的 entry-card/v2 JSON 生成入库，全库达到 318/318、CRIT 0 · MAJ 0。

## 开工前必读（按序）

1. `build/orchestrate/GEN_BRIEF.md` —— 字段契约 + 11 条硬红线（**一切产出以此为准**，昨天刚补了 3 条新红线：禁 `math.` 前缀、标记必须 `】` 收尾、禁空壳标记）
2. `AGENTS.md`（仓根）—— 全仓规约：notebook 只读、符号 ASCII 上标、代号两级制
3. 质量标杆样例：`json/H4/H4.json`（人工抽查过的满分卷）、`json/I3/I3.json`

## 剩余工作（按此顺序，一批做完再下一批）

| 批 | 单元数 | 清单来源 |
|---|---|---|
| batch_hij（续） | 18 | I4 I5 I6 I7 I8 I9.1 I9.2 I9.3 I9.4 J1 J2.1 J2.2 J3 J4 J5 J6 J7 J8 |
| batch_defg | 23 | `build/orchestrate/batches/batch_defg.tsv` 第一列 |
| batch_klmqr | 48 | 同上 `batch_klmqr.tsv` |
| batch_de | 61 | `batch_de.tsv` |
| batch_lie | 57 | `batch_lie.tsv` |
| batch_n | 15 | `batch_n.tsv` |

缺口判定：`json/<组码>/<code>.json` 不存在即需生成（**幂等**——中断后重跑自动跳过已完成的）。

## 每单元流程（串行，绝不并发）

1. **读切片** `build/slices/<组码>/<code>.md`（如 `build/slices/I4/I4.md`；小目码 H6.1 → `H6/H6.1.md`）。
   切片是唯一内容来源，**不要去读 notebook/*.tex 全文**（切片已含所需原文与行号区间）。
2. **自己生成 JSON** 写 `json/<组码>/<code>.json`。必须用 Python 写盘（保证 UTF-8 不转义）：
   ```python
   import json, pathlib
   data = {...}   # 完整 entry-card/v2 结构
   p = pathlib.Path('json/I4/I4.json'); p.parent.mkdir(parents=True, exist_ok=True)
   p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
   ```
   - 凡自己算出的数值断言：**先用 `uv run python` 复算**，再写入并紧跟 `【待核验:<expr>】` 标记
   - 每个核心定理配 `.quantifiers` 灵魂词条（限定词拆解表，每行一个**具体函数**反例）
   - `status` 恒 `"drafted"`；`generated_by` = `{"model": "<你的模型ID>", "date": "pending", "reviewed": false}`；文件级 `"updated": "pending"`
   - **禁写** `difficulty`/`mastery`；`links` 只用全库代号（`build/state/slices.json` 的 units[].code）
   - viz 三档：简单显式函数 → `{"source": "frontend", "module": "<kebab-case>", "version": 1, "params_hint": {...}}`；
     复杂计算/需后端 → `{"status": "planned-backend", "rationale": "..."}`。**不写任何前端实现代码**
3. **自检到双零**：`cd /Users/apple/develop/learning/learning-web && uv run python build/verify_kb.py <code>`
   反复修到 **CRIT 0 且 MAJ 0**。verify 会自动重算并回填数值标记（`【待核验:expr】`→`【已核验:值|expr】`），
   这是设计行为——**不要手动回填、不要删标记**。
4. **每批完成后提交**（一批一 commit，不要攒到全部做完）：
   ```bash
   uv run python build/inject_meta.py <code1> <code2> ...   # 注入真实日期
   uv run python build/verify_kb.py <codes...>              # inject 后复验一次
   rm -f .git/index.lock
   git add json/ build/state/
   git commit -m "feat: batch_X 入库（N 单元）"
   ```
   - 本机 git 写操作偶发被拒（`unable to unlink index.lock` / `Operation not permitted`）→
     `rm -f .git/index.lock` 后**立刻重跑**同一命令，循环 3–8 次必过。不要用通配符删锁。
   - **绝不 `git add -A` / `git add .`**：同仓还有一个前端 agent 在并行干活，只 add 你自己的路径。
   - **绝不 `git push`、`git rebase`、`git reset`、`git clean`**。看到不属于你的未提交文件（src/ graph/ 等）不要动。

## 硬边界（违反即返工）

- 只写 `json/`、`build/state/`、`build/logs/`；**绝不碰 `src/`、`graph/`、`tools/`、`package.json`、`vite.config.ts`**（前端 agent 地盘，只读可以）
- `notebook/`（数学真源）、`learning-todo/`、`dev-progress.md` **只读**
- 不虚构切片没有的定理；拓展背景允许但 `title` 加「拓展：」前缀
- 反例必须给**具体函数/数列 + 算出的具体失效数值**，禁止「存在反例」一笔带过
- 数值不确定 → 算；算不出 → 删掉该断言。绝不写「大约是」然后挂等号

## 验收

- 每批：verify 双零 + `git log --oneline -1` 出现新提交
- 全部完成：`find json -name '*.json' | wc -l` = **318**；`uv run python build/verify_kb.py`（不带参数=全库）CRIT 0 · MAJ 0
- 收尾时同步更新 `build/orchestrate/HANDOFF-json.md` 的进度段（append，不重写历史）
