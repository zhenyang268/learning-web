# learning-web — 项目总纲（人读）

> **读者**：人 ｜ **最后更新**：2026-10-30
> **给 agent 的规约一律在 `AGENTS.md`（本仓入口文件）**，本文不重复。
> 真源约定见 `AGENTS.md` §0 —— 同一条事实只在一个文件里定义，别处只引用不重述。

> 把父仓 `notebook/*.tex` 转成**可交互的知识图谱与阅读面**：离线单文件 HTML 给「看」，
> web 外壳给「联」，计算演示按分级判据决定放前端还是走 `learning-viz`。

---

## 在项目中的位置

父仓 `README.md` 的三层是 `learning ← viz ← web`。本仓是最外层：

```
learning/  ──构建──▶  .so + python 绑定  ──被调用──▶  viz/  ──Flask+契约──▶  web/
  内容真源              计算实现                      计算后端              外壳 + 渲染
```

**本仓承载两类东西**：

| 类型 | 数据来源 | 产物 | 例子 |
|---|---|---|---|
| **内容** | `../notebook/*.tex` 经本仓 `build/` 转换 | `dist/graph/<chapter>.html`（单文件、双击即开）+ 阅读面 | 笔记章节、知识图谱 |
| **计算演示** | 按 `AGENTS.md` §2 四问判据分级：前端 JS 或 `learning-viz` | 正文内联插槽 | 收敛定理反例、Rodrigues 公式 |

两条职责边界（决策 D1 / D6，见 `DESIGN.md`）：

- **笔记的转换链路（`build/`）在本仓** —— standalone 产物是纯静态的，不经 Flask。
- **计算模块的后端在 `learning-viz`** —— 本仓只做注册与渲染，不重复实现算法。

---

## 文档导航

| 文件 | 一句话 |
|---|---|
| `AGENTS.md` | **本仓入口**：文档地图与真源、上游依赖解析、四问判据、目录、命令、硬规则、红线、风险 |
| `DESIGN.md` | 设计：决策记录 D1–D17、数据流、`provenance.json`、契约样例、A1 切片验收判据 |
| `TASKBOOK.md` | 知识库自动生成 + 前端的施工任务书（v1.4） |
| `build/orchestrate/HANDOFF-json.md` | 知识库生成线进度真源（**318/318 已完成**，文内 §1 的 85/318 是旧快照，以 §6 日志为准） |
| `build/orchestrate/RUNBOOK-cli.md` | 生成线执行手册：会话内 `--bg` 派发 / 外部终端两条通道 |
| `build/orchestrate/HANDOFF-frontend.md` | 前端线接力任务书 |
| `graph/<chapter>.yaml` | 知识图谱语义边真源（**本仓**，决策 D7） |
| `../AGENTS.md`（父仓） | 代号体系、符号规范、环境坑、三子仓红线 |
| `../dev-progress.md` | 进度唯一真源 |
| `../learning-todo/ns-progress.md` | 数学线关卡与掌握度真源（只读） |

---

## 快速开始

```bash
# 外壳（需 learning-viz 的 Flask 在 :5000 提供计算端点）
npm run dev

# 类型 + 图 + 语义边 + viz + 全量 DOM 断言
npm run check

# 出全部产物（tsc → vite → 字体瘦身 → 单文件快照）
npm run build
```

---

## 产物与打开方式（2026-10-30 增，方案 A）

**`dist/` 里同时存在两种形态，打开方式不同 —— 混用就是「双击白屏」。**

| 产物 | 形态 | 怎么打开 | 用途 |
|---|---|---|---|
| `dist/knowledge.html` | 单文件：数据 gzip 内联、字体 base64、**普通 `<script>`** | **双击即开**（`file://`） | 分发、存档、发给人看 |
| `dist/index.html` + `dist/json/` | Vite 多页 + **运行时 `fetch()`** | **必须 HTTP** | 开发、内容维护 |
| `dist/cs408.html` + `dist/cs408/` | 同上，数据根独立 | **必须 HTTP** | 408 子站 |
| `dist/graph/<ch>.yaml` | 语义边副本 | 数据文件，不直接打开 | 构建 / 校验的输入 |

**为什么 `dist/index.html` 双击会白屏（两个独立原因，缺一仍白屏）：**

1. `<script type="module" crossorigin>` 在 `file://` 下被 CORS 拦 —— 本地文件 origin 是 `null`，模块脚本根本不执行；
2. 数据不在 HTML 里，是 `fetch()` 读 `json/*.json`（全库 10 MB，按需逐单元拉），`file://` 下同样被拦。

本地起静态服务即可：`npx vite preview`（或 `uv run python -m http.server --directory dist 4173`）。

> **`json/` 的角色**：只读数据集的**唯一真源**（318 单元 / 9.7 MB / 3000+ 词条），
> **不是可从 tex 机械重建的中间态** —— tex 只有 5687 行，直觉、反例（带独立算出的数值）、
> probe、应用建议都是生成物，删掉即不可复现。它在架构上等价于「只读文件型数据库」：
> 单元文件=表、`entries[]`=行、`code`+词条 `id`=主键、`json/index.json`=物化二级索引、
> `links`/`sem`=无约束外键（由 `verify_kb` / `check-sem-sync` 在构建期兜底）。
> 因此**它必须随站点一起部署**，这正是 `dist/index.html` 需要 HTTP 的根因。

---

## 当前状态（2026-10-30）

- **知识库 318/318 单元**入库（2026-09-25 收工），`verify_kb` 全量 **CRIT 0 · MAJ 0**。
- **全量体检全绿**：前端 318 单元 P0 0 / P1 0 / P2 0，断言 PASS 13836 FAIL 0。
- **双学科骨架已通**（D18）：`cs408.html` + `cs408/{json,graph}`，`npm run check:cs408` 通过；408 内容目前仅 `OS1.1` 一个单元。
- 历史开工顺序见 `AGENTS.md` §12，验收判据见 `DESIGN.md` §5（**§12 的「目录为空」描述已过期**）。

---

## 三条最容易踩的

1. **`notebook/*.tex` 只读** —— 本仓任何脚本不得写入父仓笔记。
2. **禁 CDN** —— 产物必须断网可用；公式走构建期 KaTeX 预渲染（`DESIGN.md` D8）。
3. **代号只到两级**（`A1`、`G1.2`），且**禁止**用 `§NN.N` 全局编号做路由。

---

## 与父仓的关系（路径坑）

- 本仓是**独立 git 仓**，有自己的 remote；父仓不跟踪（无 `.gitmodules`、无 gitlink）。
- 它在 `git worktree` 与新 clone 中**都不出现**，只能按绝对路径访问
  （通常是 `~/develop/learning/learning-web/`）。
- **改动须在本仓内提交**；未经明确要求不要 `git push`。
- 依赖例外：本仓在父仓目录树内，`uv run` / `uv add` 作用于**父仓** `pyproject.toml`
  （`AGENTS.md` §6 校正 C5）—— 依赖改动属父仓改动，在父仓提交。
