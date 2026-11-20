# 发布前检查规范：guide-card/v1 + 工程线重划

## 目标

在打 `release/` 之前，回答三个问题：

1. **内容缺没缺**：每个站该有导语的单元、每个 CD 章该写的正文，是否真的存在；
2. **引用断没断**：路线、自测、图定义、content-map 里是否还指向已归档或未生成的代号；
3. **能不能发**：类型、构建、快照、DOM 断言是否全绿，`release/` 是否与源一致。

只读检查为主；发现可修的问题先修，再决定是否发布。

## 输入（只读）

- `guide/<site>/_map.json` / `_progress.json` / `*.json`
- `src/content/content-map.json`、`src/content/project-routes.ts`、`src/content/selftest-projects.ts`
- `projects/json/**`、`projects/graph/*.yaml`
- `notebook/projects/**`（只读）
- `build/guide/prompt/guide-card.md`（内容判据）
- `release/README.md`（发布物说明）

## 四条并行轨

### A. 导语覆盖与质量

逐站统计 `_map.json` 与 `_progress.json`：

- `done + skip === units` 是否成立；
- 每个 `done` 是否有对应 `guide/<site>/<章>/<code>.json`；
- 每个 `skip` 是否有非空 `reason`；
- `check-guide --site <id>` 是否 CRIT=0；
- 抽 2 张卡（一 T 一 S）核对 `source.talk`/`unit` 与 sha 是否指向真实文件。

判据：任何 `pending` 记为 **MAJ**；任何 `done` 缺文件、sha 漂移、CRIT 记为 **CRIT**。

### B. 内容完整度（不是结构，是正文量）

- 对 `notebook/projects/codedesign/*/OUTLINE.md`：数出每个 leaf 声称的单元数（如「5 个单元」）；
- 对同目录 `NOTES.md`：数 `##` 小节数；
- 对 `learning-web/projects/json/CD0*/`：数实际单元数；
- 三者对齐：OUTLINE 声称 ≥ NOTES 小节 = json 单元（允许 OUTLINE 多出未写槽位，但必须显式标「未写」）。

判据：

- OUTLINE 声称有 N 个单元、NOTES/json 只有 1 个且无「未写」标记 → **CRIT（内容缺失但被当成完成）**；
- OUTLINE 明写「骨架/未写」→ **MAJ（已知缺口）**，不算发布阻断，但必须在报告里列出。

同时检查：

- 归档区的旧章是否仍出现在 `content-map.json` / `project-routes.ts` / `selftest-projects.ts`；
- `graph/*.yaml` 是否还有指向 `AL01/AL02/LG01/LG02` 的 prereq。

判据：任何失效代号 **CRIT**。

### C. 引用与路由

- `content-map.json` 的 projects `lines[].chapters` 并集 = `projects/json/` 目录集合，且无重复；
- `project-routes.ts` 的每个 `code:` 都能在 `projects/json` 找到；
- `selftest-projects.ts` 的每个键都能找到章；
- `check-graph --subject projects` PASS；
- `check-content-map` PASS。

判据：任一失配 **CRIT**。

### D. 构建与发布

- `npx tsc --noEmit`；
- `npm run build`（六份快照 + provenance）；
- `npm run check`（六站 DOM；耗时长，放最后）；
- `node tools/check-reading.mjs`；
- 构建后 `release/` 是否被 `sync-release` 同步（`release/` 与 `dist/` 的快照文件列表、大小一致）。

判据：任一命令非 0 → **CRIT**；`release/` 落后于 `dist/` → **MAJ**（发布前必须 `npm run release`）。

## 输出格式

先给一张表：

| 轨道 | CRIT | MAJ | 结论 |
|---|---:|---:|---|
| A 导语 | | | |
| B 内容 | | | |
| C 引用 | | | |
| D 构建 | | | |

再按严重度列问题，每条带 `文件:行` 或 `站点/code`，不贴全文。

最后一行给发布结论：

- `RELEASE READY`：CRIT=0，MAJ 已逐条列出并接受；
- `BLOCKED`：CRIT>0，禁止 `npm run release` / push。

## 停止条件

- 任一 CRIT 未修完 → 只出报告，不发布；
- 内容缺口是「已知骨架」而非「假装完成」→ 允许发布，但报告必须单列；
- 不为了让检查变绿而把 `pending` 改成 `skip`。
