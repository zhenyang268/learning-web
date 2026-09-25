/**
 * 图谱数据装载：graph/index.json（清单）→ 各 graph/<L>.yaml（语义边真源）。
 *
 * 降级规则（红线：绝不白屏）：
 *  - 清单拉不到 → 只用派生边（links 启发式），渲染器顶部出非阻断提示；
 *  - 某个 yaml 拉不到/解析失败 → 记 null 进 map，mergeGraph 会写进 yamlStatus；
 *  - 全部失败 → 图谱仍可看（派生边视图）。
 */
import { parse as parseYaml } from 'yaml';
import { mergeGraph, type MergedGraph, type SemYaml } from './graph-model';
import type { UnitMeta } from '../types';

let cache: { units: UnitMeta[]; merged: MergedGraph } | null = null;

export async function loadMergedGraph(units: UnitMeta[]): Promise<MergedGraph> {
  if (cache && cache.units === units) return cache.merged;
  const semYamls = new Map<string, SemYaml | null>();
  let letters: string[] = [];
  try {
    const res = await fetch('graph/index.json', { cache: 'no-store' });
    if (res.ok) {
      const idx = (await res.json()) as { letters?: unknown };
      if (Array.isArray(idx.letters)) letters = idx.letters.filter((l): l is string => typeof l === 'string');
    }
  } catch {
    /* 清单缺失：全派生边降级 */
  }
  for (const letter of letters) {
    try {
      const r = await fetch(`graph/${encodeURIComponent(letter)}.yaml`, { cache: 'no-store' });
      if (!r.ok) {
        semYamls.set(letter, null);
        continue;
      }
      const doc = parseYaml(await r.text()) as SemYaml;
      semYamls.set(letter, doc && typeof doc === 'object' ? doc : null);
    } catch {
      semYamls.set(letter, null);
    }
  }
  const merged = mergeGraph(units, semYamls);
  cache = { units, merged };
  return merged;
}
