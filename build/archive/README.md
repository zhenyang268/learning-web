# build/archive —— 内容生成线历史归档（2026-10-31）

**这条线已经跑完了：318/318 单元全部生成并校验通过。** 这里的代码不再维护、
不再被任何构建或校验入口调用，留档只为回答「这些 json 是怎么来的」。

## 为什么归档

两件事同时发生了：

1. **内容线收口**。生成、评审、仲裁、修复四个环节都已完成，`build/state/done/`
   记录了每个单元的终态。再跑一遍只会覆盖已经人工校订过的正文。
2. **本站与 `.tex` 笔记解耦**（`DESIGN.md` D26）。`json/` 是唯一真源，
   代号也不回写笔记 —— 于是「按 `.tex` 切片 → 生成词条」这条链路的输入端
   在整个站点的生命周期里不再需要。

## 里面是什么

| 路径 | 原本的职责 | 现在的状态 |
| --- | --- | --- |
| `slice_notebook.py` | 把 `../math-notebook` 的 `.tex` 切成单元切片，产出 `build/slices/` 与 `build/state/slices.json` | 归档。切片产物本身已被 `.gitignore` 忽略 |
| `make_prefix.py` | 拼接生成用的 prefix prompt（`build/archive/prompts/gen_prefix.md`） | 归档 |
| `inject_meta.py` | 把 `notebook_commit` / `src` 等元信息回填进 json | 归档（这些字段现已降级为溯源线索） |
| `orchestrate/` | 生成线总控：`pipeline.zsh`（`--bg` 派发 + transcript 回收）、批次定义、交接文档 | 归档 |
| `prompts/` | 生成 / 评审 / 修复 / 仲裁的 prompt 模板 | 归档 |
| `TASKBOOK.md` | 生成线施工任务书 v1.4（三 pass 流程、契约、批次） | 归档 |

## 仍然在用的（**没**归档）

| 路径 | 用途 |
| --- | --- |
| `build/verify_kb.py` | 内容校验器，`npm run audit:content` 会调用它（只读模式） |
| `build/logs/` | 体检与校验的报告输出（`.gitignore` 忽略） |
| `build/state/` `build/slices/` | 生成线派生物（`.gitignore` 忽略） |

## 如果以后要再生成内容

不要复活这套流水线。现在的做法是**直接改 `json/` 并跑校验**：

```bash
npm run audit:content      # 内容体检（只读，不回填）
npm run audit              # 前端全量体检
npm run check              # 类型 + 语义边 + viz + 逐单元 DOM 断言
```

改完代号请勿手改：`src/modules/taxonomy.ts` 是层级的唯一真源，
`node tools/remap-codes.mjs` 负责一次性迁移。