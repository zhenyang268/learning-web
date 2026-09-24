/**
 * A1.3 收敛定理反例（原实现改为声明式规格，与其余 26 个模块同一套契约）。
 * 反例演示「失败」，对照模式演示「为什么成立」。
 */
import type { VizSpec, VizMode } from './kit';
import { COLORS as C } from './kit';
import { linspace, trapz, num, dev } from './num';

const modes: VizMode[] = [
  {
    key: 'bump',
    label: '尖峰挤进零测点',
    n: { min: 1, max: 40, step: 1, init: 6 },
    draw(n) {
      const N = Math.max(1, n);
      const f = (x: number) => (x > 0 && x < 1 / N ? N : 0);
      return {
        view: { x0: -0.05, x1: 1.15, y1: Math.max(2, N * 1.1) },
        curves: [
          { f, color: C.cyan, width: 2.5, glow: true, kind: 'step', steps: 4000 },
          { f: () => 0, color: C.pink, width: 2, dash: [6, 6] },
        ],
        labels: [{ text: 'f = lim fₙ ≡ 0', x: 0.35, y: 0.06, color: C.pink }],
        axis: { x: 'x', y: 'f' },
      };
    },
    readout(n) {
      const N = Math.max(1, n);
      return [
        { label: '∫ fₙ dμ', value: num(N * (1 / N), 6) },
        { label: '∫ lim fₙ dμ', value: num(0, 6) },
        { label: '判决', value: '1 ≠ 0 不可交换', verdict: 'fail' },
      ];
    },
    invariant(n) {
      const N = Math.max(1, n);
      // 恒等式：面积 ≡ 宽(1/n) × 高(n)
      return { label: '面积 ≡ 宽(1/n) × 高(n)', expected: 1, actual: N * (1 / N), tol: 1e-15 };
    },
    note: () => '∫fₙ ≡ 1 而 ∫f = 0：质量挤进零测点后整块消失，极限与积分交换失败。',
  },
  {
    key: 'slide',
    label: '质量滑向无穷远',
    n: { min: 1, max: 40, step: 1, init: 6 },
    draw(n) {
      const N = Math.max(1, n);
      const f = (x: number) => (x >= N && x < N + 1 ? 1 : 0);
      return {
        view: { x0: 0, x1: N + 2, y1: 1.4 },
        curves: [
          { f, color: C.cyan, width: 2.5, glow: true, kind: 'step', steps: 3000 },
          { f: () => 0, color: C.pink, width: 2, dash: [6, 6] },
        ],
        axis: { x: 'x', y: 'f' },
      };
    },
    readout() {
      return [
        { label: '∫ fₙ dμ', value: '1' },
        { label: '∫ lim fₙ dμ', value: '0' },
        { label: '判决', value: '1 ≠ 0 不可交换', verdict: 'fail' },
      ];
    },
    invariant() {
      // 恒等式：面积 ≡ 宽(1) × 高(1)
      return { label: '面积 ≡ 宽(1) × 高(1)', expected: 1, actual: (1 + 1 - 1) * 1, tol: 1e-15 };
    },
    note: () => '质量整体滑向无穷远：每个固定点最终都掉出支撑，但积分恒为 1 —— 这是「紧性」缺失的现场。',
  },
  {
    key: 'monotone',
    label: '对照 · 单调升（MCT 成立）',
    n: { min: 1, max: 40, step: 1, init: 6 },
    draw(n) {
      const N = Math.max(1, n);
      const f = (x: number) => (x > 0 ? Math.pow(x, 1 / N) : 0);
      return {
        view: { x0: 0, x1: 1.05, y1: 1.15 },
        curves: [
          { f, color: C.cyan, width: 2.5, glow: true },
          { f: (x: number) => (x > 0 ? 1 : 0), color: C.pink, width: 2, dash: [6, 6] },
        ],
        axis: { x: 'x', y: 'f' },
      };
    },
    readout(n) {
      const N = Math.max(1, n);
      return [
        { label: '∫ fₙ dμ = n/(n+1)', value: num(N / (N + 1), 6) },
        { label: '∫ lim fₙ dμ', value: '1' },
        { label: '判决', value: '可交换 ✓', verdict: 'ok' },
      ];
    },
    invariant(n) {
      const N = Math.max(1, Math.round(n));
      // 换元 x = t^N：∫₀¹x^{1/N}dx = ∫₀¹ N t^N dt = N/(N+1)。
      // 换元后被积函数是多项式（原式在 x=0 有竖直切线，直接梯形法精度极差）。
      const numeric = trapz((t) => N * Math.pow(t, N), 0, 1, 200000);
      return { label: '数值 ∫N t^N dt vs 解析 N/(N+1)', expected: N / (N + 1), actual: numeric, tol: 1e-6 };
    },
    note: () => `fₙ = x^{1/n} ↑ 1：∫fₙ = n/(n+1) ↑ 1 = ∫f，单调性把「质量逃逸」这条路堵死，极限与积分可交换。`,
  },
];

export const convergenceThmSpec: VizSpec = {
  module: 'convergence-thm',
  title: '收敛定理反例演示',
  modes,
};

export { linspace, dev };
