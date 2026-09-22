# learning-web — 展示平台

> **读者**：人 + 编码 agent ｜ **最后更新**：2026-09-22
> **本仓是 `learning ← viz ← web` 三层的最外层：统一外壳 + 模块注册，本身不做任何数学计算。**
>
> **真源约定（不重复维护）**&#8203;
> - 笔记类模块的契约与管线 → `learning-viz/python/notes_pipeline/DESIGN.md`（子仓内）
> - 三层职责与样板 → 父仓 `README.md`；协作硬规则 → 父仓 `AGENTS.md`
> - 进度与 Gate → 父仓 `dev-progress.md`

---

## 定位

**一个外壳，托管多类后端模块。** 这是父仓 `README.md` 所说「`web` 可被多个后端仓复用」的落点。

| 模块类型 | 数据来源 | 渲染器 | 例子 |
|---|---|---|---|
| 计算模块 | `learning` 出结果 → `viz` 出契约 | `graph` / `plot2d` / 3D | 行星轨道、自动微分 DAG |
| 内容模块 | `viz` 跑 pandoc 管线 | **`doc`** | 笔记章节（`notebook/*.tex`） |

两类模块共用同一个外壳、导航、主题。未来的 `408` 仓（TCP 时间轴）复用同一 `timeline` 渲染器。

**红线**

- **前端只绘制，不计算。** 契约是纯数据；数值正确性由 `viz` 侧 pytest 保证。
- **不引 CDN。** KaTeX / 其他依赖由 Vite 打进产物，断网可用。
- **路由 ID 用笔记代号**（`/#/A1`、`/#/H4.1`），与父仓 `AGENTS.md` 的代号写法一字不差；
  **不要用 `§NN.N`**（编译后全局编号，插入新 `.tex` 即整体位移）。

---

## 目录

```
src/
  shell/         # （待写）导航 · 路由 · 主题 · 三栏布局
  renderers/     # （待写）doc.ts · graph.ts · plot2d.ts
  viz/           # （待写）插槽实现，如 convergence-thm.ts（只绘制，不计算）
  modules/       # （待写）注册表：代号 → 端点 + 契约版本 + 渲染器
public/          # 静态资源（贴图等小文件；大贴图走 Git LFS）
vite.config.ts   # （待写）dev 时 proxy /api → Flask:5000
```

---

## 三栏布局

| 栏 | 内容 |
|---|---|
| 左 | 代号树导航 + 进度标记（对齐父仓 `learning-todo/ns-progress.md` 的 L0–L5，**只读展示**，不在 web 里改进度） |
| 中 | 正文（公式已渲染的 fragment）+ 内联 viz 插槽 |
| 右 | 上下文面板：前置依赖 · 反向链接 · 教材对照 · 本节挂载的实验 |

> PDF 是线性的；web 的增量价值就在于**把「这一节在整个知识网里的位置」常驻显示**。

---

## 快速开始

环境：**Vite + Vanilla TS**（不上 React/Vue —— 需要 HMR 调 Canvas/WebGL，且单人维护，少一层心智模型）。

```bash
npm install
npm run dev        # 需 learning-viz 的 Flask 同时在 5000 端口
npm run build
```

dev/prod 分野：dev 用 Vite proxy 转发 `/api`；prod 由 Flask serve 构建产物。

---

## 与父仓的关系（路径坑）

- 本仓是**独立 git 仓**，有自己的 remote；父仓不跟踪（无 `.gitmodules`、无 gitlink）。
- 它在 `git worktree` 与新 clone 中**都不出现**，只能按绝对路径访问。
- **改动须在本仓内提交**；未经明确要求不要 `git push`。
