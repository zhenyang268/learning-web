/**
 * 档1 模块注册表：数据里 `viz.module` 的名字 → 前端实现。
 * 每个 spec 都是纯函数规格（见 kit.ts），因此可以被 tools/dom-harness.mjs 在 Node 里独立重算。
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

/** 全部声明式规格（供 Node 侧数值校验遍历） */
export const specs: VizSpec[] = [
  convergenceThmSpec,
  ...analysisSpecs,
  ...sequenceSpecs,
  ...algebraSpecs,
  ...integralSpecs,
  ...stochasticSpecs,
  ...asymptoticSpecs,
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
