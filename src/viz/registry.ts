/**
 * viz 模块的**浏览器侧**注册表：模块名 → 一个动态 import。
 *
 * 为什么要这样：12 个 specs 文件（源约 237KB，`cg.ts` 43KB、`sequences.ts` 35KB）
 * 原先被静态 import 进主包 —— 首屏为此多背 20%+ 的 JS，而多数单元根本不挂演示。
 * 现在改成按需：只有某个词条真要挂 viz 时，才去取它所在的那一个 chunk。
 *
 * 手写的 59 条映射有漂移风险，因此 `npm run check:viz` 会核对三件事：
 *   ① 数据里声明的每个 module 都能在这里找到；
 *   ② 这里没有多余条目（映射了但数据没人用）；
 *   ③ 每个条目真能解析出一个 module 名相同的 spec（或一个带 mount 的自定义模块）。
 *
 * 静态汇总（`specs` / `registry` / `validateTree`）留在 `specs-all.ts`，**只给 Node 工具**。
 */
import type { VizModule, VizSpec } from './kit';

type VizChunk = () => Promise<unknown>;

const convergenceThm = () => import('./convergence-thm');
const analysis = () => import('./specs/analysis');
const sequences = () => import('./specs/sequences');
const algebra = () => import('./specs/algebra');
const integrals = () => import('./specs/integrals');
const stochastic = () => import('./specs/stochastic');
const decision = () => import('./specs/decision');
const asymptotic = () => import('./specs/asymptotic');
const mc = () => import('./specs/mc');
const sde = () => import('./specs/sde');
const cg = () => import('./specs/cg');
const pathFluid = () => import('./specs/path-fluid');
const overview = () => import('./specs/overview');

/** 模块名 → 所在 chunk（同名 chunk 复用同一个 loader，Vite 只会打一个分包） */
export const vizLoaders: Record<string, VizChunk> = {
  'convergence-thm': convergenceThm,
  // specs/analysis
  'riemann-sum': analysis,
  'layer-cake': analysis,
  'density-asymptotics': analysis,
  'lp-ball': analysis,
  'shrink-box': analysis,
  'log-scale': analysis,
  // specs/sequences
  'classic-limits': sequences,
  'double-origin-line': sequences,
  'limit-toolkit': sequences,
  'recurrence-cobweb': sequences,
  'sum-telescoping': sequences,
  'taylor-approx': sequences,
  'stirling-approx': sequences,
  // specs/algebra
  'unit-circle': algebra,
  'gram-schmidt': algebra,
  'block-superposition': algebra,
  'parabola-vertex': algebra,
  'root-coefficient': algebra,
  'square-dissection': algebra,
  // specs/integrals
  'chf-collapse': integrals,
  'chf-product': integrals,
  'gauss-integral': integrals,
  'ibp-shift': integrals,
  // specs/stochastic
  'markov-chain-mixing': stochastic,
  'rw-return-prob': stochastic,
  // specs/asymptotic
  'asymptotic-notation': asymptotic,
  // specs/mc
  'mc-estimator': mc,
  'variance-reduction': mc,
  'mh-accept': mc,
  // specs/sde
  'fp-drift-form': sde,
  'gbm-mean-vs-typical': sde,
  'ito-endpoint-choice': sde,
  'ito-taylor': sde,
  'ito-vs-stratonovich': sde,
  'qv-scaling': sde,
  // specs/cg
  'angle-deficit': cg,
  'mean-curvature-area': cg,
  'curvature-noise-scaling': cg,
  'brdf-sanity-check': cg,
  'rendering-equation': cg,
  'projected-solid-angle': cg,
  'lambert-normalization': cg,
  'microfacet-ndf': cg,
  'microfacet-reciprocity': cg,
  // specs/path-fluid
  'path-contribution': pathFluid,
  'viscosity-curves': pathFluid,
  // specs/overview
  'learning-path-map': overview,
  'index-lookup': overview,
  'load-bearing-map': overview,
  'support-layer-map': overview,
  'tool-trigger-map': overview,
  'study-plan-view': overview,
  'quick-ref': overview,
  'packet-uncertainty': overview,
  'render-equation-factors': overview,
  'stage-dependency-graph': overview,
  'geometry-concrete-to-abstract': overview,
  // 非声明式（自带 mount）
  'inequality-decision-tree': decision,
};

/** 名字清单（不触发加载）：数据侧核对与「未注册」占位用 */
export const implementedModules = (): string[] => Object.keys(vizLoaders).sort();

/** 已解析过的模块（含解析失败记 null，避免同一个坏名字反复 import） */
const resolved = new Map<string, VizModule | null>();

/** 从 chunk 的导出里找 `module === name` 的规格（导出可能是单条，也可能是数组） */
function pickSpec(chunk: Record<string, unknown>, name: string): VizSpec | undefined {
  for (const value of Object.values(chunk)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      if (obj.module === name && Array.isArray(obj.modes)) return item as VizSpec;
    }
  }
  return undefined;
}

/** 非声明式模块：chunk 里那个自带 mount 的对象 */
function pickCustom(chunk: Record<string, unknown>): VizModule | undefined {
  for (const value of Object.values(chunk)) {
    if (!value || typeof value !== 'object') continue;
    if (typeof (value as { mount?: unknown }).mount === 'function') return value as VizModule;
  }
  return undefined;
}

/**
 * 按名字取模块（首次调用才加载对应 chunk）。
 * 找不到返回 undefined —— 调用方渲染「尚未在前端注册」占位，不抛错。
 */
export async function loadVizModule(name: string): Promise<VizModule | undefined> {
  const hit = resolved.get(name);
  if (hit !== undefined) return hit ?? undefined;
  const load = vizLoaders[name];
  if (!load) {
    resolved.set(name, null);
    return undefined;
  }
  const chunk = (await load()) as Record<string, unknown>;
  const spec = pickSpec(chunk, name);
  const mod = spec ? (await import('./kit')).vizFromSpec(spec) : pickCustom(chunk);
  resolved.set(name, mod ?? null);
  return mod ?? undefined;
}