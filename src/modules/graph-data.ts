/**
 * 图谱数据装载：**直接吃索引里烘进来的语义边**（`UnitMeta.sem`），零请求。
 *
 * 为什么不再 fetch `graph/*.yaml`：yaml 是**构建期输入**，已由 kb-index.ts 的 attachSem
 * 规范化后烘进 `json/index.json`。运行期再拉一遍就是第二个数据源 —— 本轮实测正是这个
 * 双源漂移，让「图谱视图给 P3.1 画出 16 条入箭头、右栏却说它是起点」。单一真源后不可能再漂。
 *
 * 附带收益：图谱视图从 26 个 yaml 请求降为 **0**（「零外部请求」红线天然满足；
 * standalone 也不再依赖内联 yaml 才能显示语义边）。
 *
 * 降级规则（红线：绝不白屏）：
 *  - 索引里一个 sem 都没有（新章节刚入库、yaml 还没铺）→ yamlStatus 为空，
 *    渲染器顶部出非阻断提示，图谱仍用 links 派生边显示；
 *  - 某 letter 的边全空 → 照常合并，不报错。
 */
import { mergeGraph, type MergedGraph, type SemYaml } from './graph-model';
import type { UnitMeta } from '../types';

let cache: { units: UnitMeta[]; merged: MergedGraph } | null = null;

/**
 * 从索引的 sem 字段**反构造** mergeGraph 期望的 SemYaml map（按章节组分组）。
 * 这样合并/拓扑/聚合逻辑只有一份（graph-model.ts），不必为「已烘入」另写一条路径。
 *
 * notebook_commit 填占位值：normalizeSemYaml 会检查它缺失并记 problem，但烘入的数据
 * 在构建期已过 `check:graph`（跑的就是同一份 yaml + 同一个 normalizeSemYaml），运行期
 * 无需重复校验 —— 占位只为让 yamlStatus 报 ok 而不是误报「部分降级」。
 */
function semYamlsFromIndex(units: UnitMeta[]): Map<string, SemYaml | null> {
  const byLetter = new Map<string, SemYaml>();
  for (const u of units) {
    if (!u.sem) continue;
    const letter = u.code.split('.')[0]; // graph/<L>.yaml 的 L = 代号去掉 .k（A1.3 → A1）
    let doc = byLetter.get(letter);
    if (!doc) {
      doc = { notebook_commit: 'baked-into-index', nodes: {} };
      byLetter.set(letter, doc);
    }
    doc.nodes![u.code] = {
      prereq: u.sem.prereq,
      applies: u.sem.applies,
      tension: u.sem.tension,
      dual: u.sem.dual,
    };
  }
  return byLetter;
}

export async function loadMergedGraph(units: UnitMeta[]): Promise<MergedGraph> {
  if (cache && cache.units === units) return cache.merged;
  const merged = mergeGraph(units, semYamlsFromIndex(units));
  cache = { units, merged };
  return merged;
}
