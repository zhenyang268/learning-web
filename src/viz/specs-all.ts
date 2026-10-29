/**
 * viz 规格的**静态汇总**（全部 58 条 spec + 1 个自定义模块）。
 *
 * 只给 Node 侧工具用：`tools/viz-model-check.mjs`（逐模式算数值、查 invariant）
 * 与 `tools/dom-harness.mjs` 的模块名核对。
 *
 * **浏览器入口绝对不要 import 本文件** —— 它会把 12 个 specs 文件（源约 237KB）
 * 一起拉进主包，动态加载就白做了。浏览器侧走 `registry.ts` 的 `vizLoaders`。
 * 这条约束由 `npm run check:viz` 里的「主包不含 specs」静态扫描兜住。
 */
import type { VizModule, VizSpec } from './kit';
import { vizFromSpec } from './kit';
import { convergenceThmSpec } from './convergence-thm';
import { analysisSpecs } from './specs/analysis';
import { sequenceSpecs } from './specs/sequences';
import { algebraSpecs } from './specs/algebra';
import { integralSpecs } from './specs/integrals';
import { stochasticSpecs } from './specs/stochastic';
import { inequalityDecisionTree, validateTree } from './specs/decision';
import { asymptoticSpecs } from './specs/asymptotic';
import { mcSpecs } from './specs/mc';
import { sdeSpecs } from './specs/sde';
import { cgSpecs } from './specs/cg';
import { pathFluidSpecs } from './specs/path-fluid';
import { nSpecs } from './specs/overview';

/** 全部声明式规格（供 Node 侧数值校验遍历） */
export const specs: VizSpec[] = [
  convergenceThmSpec,
  ...analysisSpecs,
  ...sequenceSpecs,
  ...algebraSpecs,
  ...integralSpecs,
  ...stochasticSpecs,
  ...asymptoticSpecs,
  ...mcSpecs,
  ...sdeSpecs,
  ...cgSpecs,
  ...pathFluidSpecs,
  ...nSpecs,
];

/** 非声明式模块（交互以 HTML 为主） */
export const customModules: Record<string, VizModule> = {
  'inequality-decision-tree': inequalityDecisionTree,
};

export const registry: Record<string, VizModule> = {
  ...Object.fromEntries(specs.map((s) => [s.module, vizFromSpec(s)])),
  ...customModules,
};

export { validateTree };

/** 供工具链核对「数据要求的模块是否都实现了」 */
export const implementedModules = (): string[] => Object.keys(registry).sort();