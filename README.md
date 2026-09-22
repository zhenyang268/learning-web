# learning-web — 项目总纲（人读）

> **读者**：人 ｜ **最后更新**：2026-09-22
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
| `DESIGN.md` | 设计：决策记录 D1–D8、数据流、`provenance.json`、契约样例、A1 切片验收判据 |
| `graph/<chapter>.yaml` | 知识图谱语义边真源（**本仓**，决策 D7） |
| `../AGENTS.md`（父仓） | 代号体系、符号规范、环境坑、三子仓红线 |
| `../dev-progress.md` | 进度唯一真源 |
| `../learning-todo/ns-progress.md` | 数学线关卡与掌握度真源（只读） |

---

## 快速开始

```bash
# 转换单章（Python 走父仓 uv 环境，见 AGENTS.md §6）
uv run python build/build_html.py --chapter A1

# 出数据供外壳消费
uv run python build/build_graph.py --chapter A1 --out dist/graph/A1.json

# 外壳（需 learning-viz 的 Flask 在 :5000 提供计算端点）
npm run dev
```

**当前状态**：仓骨架 + 文档已落地（2026-09-22）；
`build/`、`graph/`、`src/` 均为空目录，尚无实现代码。
开工顺序见 `AGENTS.md` §12，验收判据见 `DESIGN.md` §5。

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
