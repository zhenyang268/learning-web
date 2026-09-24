/**
 * P9.3 渐近记号（O / o / ∼）viz 规格。
 *
 * 三个记号的差别全在**比值**上，所以本模块所有模式都画比值曲线：
 *   O   ⟺ 比值最终**有界**（天花板）
 *   o   ⟺ 比值 → **0**（矮一截）
 *   ∼   ⟺ 比值 → **1**（同一条轨道）
 * 误用现场也都在比值上现形：O 当 ∼ 用会把系数吃掉，∼ 相加会把低阶项放大成主导项。
 */
import type { VizSpec, VizMode } from '../kit';
import { COLORS as C } from '../kit';
import { num, dev, maxAbs } from '../num';

/* ------------------------------------------------ O vs o：比值 → 0 */

const oVsOMode: VizMode = {
  key: 'O-vs-o',
  label: 'O vs o：比值压到 0',
  n: { min: 0.001, max: 1, step: 0.001, init: 0.5 },
  draw(n) {
    const x0 = Math.max(0.001, n || 0.5);
    // f = x², g = x ⟹ f/g = x：比值随 x → 0 贴地 ⟹ x² = o(x)
    return {
      view: { x0: 0, x1: x0, y1: Math.max(0.05, x0 * 1.15) },
      curves: [
        { f: (x) => (x === 0 ? NaN : x), color: C.cyan, width: 2.6, glow: true },
        { f: (x) => (x === 0 ? NaN : 2), color: 'rgba(167,139,250,.7)', width: 2, dash: [6, 5] },
        { f: (x) => (x === 0 ? NaN : 1), color: 'rgba(244,114,182,.8)', width: 2, dash: [3, 4] },
      ],
      points: [{ x: x0, y: x0, r: 4.5, fill: C.yellow, label: `比值 = ${num(x0, 3)}` }],
      labels: [
        { text: 'f/g = x  → 0', x: x0 * 0.05, y: Math.max(0.02, x0 * 0.5), color: C.cyan },
        { text: 'O 的天花板（比值有界）', x: x0 * 0.35, y: 2, color: C.violet },
        { text: '∼ 的轨道（比值 → 1）', x: x0 * 0.35, y: 1, color: C.pink },
      ],
      axis: { x: 'x', y: 'f/g' },
    };
  },
  readout(n) {
    const x = Math.max(0.001, n || 0.5);
    const r = (x * x) / x;
    return [
      { label: 'f = x²，g = x', value: '' },
      { label: `x = ${num(x, 3)} 处 f/g`, value: num(r, 8) },
      { label: '判决', value: '比值 → 0 ⟹ x² = o(x)', verdict: 'ok' },
      { label: '同时 x² = O(x)（o 蕴含 O）', value: '是' },
    ];
  },
  invariant(n) {
    const x = Math.max(0.001, n || 0.5);
    // 恒等式：f/g ≡ x（这就是「比值曲线就是 x」）
    return { label: 'f/g ≡ x', expected: x, actual: (x * x) / x, tol: 1e-15 };
  },
  note: (n) => `比值曲线本身就是 x：x = ${num(Math.max(0.001, n || 0.5), 3)} 处比值 ${num(
    Math.max(0.001, n || 0.5),
    3,
  )}。它一路压到 0，所以 x² 比 x「矮一截」——这是 o 的判据。`,
};

/* ---------------------------------------- 比值有界但无极限：只有 O 成立 */

const ratioLimitMode: VizMode = {
  key: 'ratio-limit',
  label: 'O 但比值无极限',
  n: { min: 0.001, max: 1, step: 0.001, init: 1 },
  draw(n) {
    const x0 = Math.max(0.001, n || 1);
    return {
      view: { x0: 0, x1: x0, y0: -1.4, y1: 1.4 },
      curves: [
        { f: (x) => (x === 0 ? NaN : Math.sin(1 / x)), color: C.cyan, width: 2.2, glow: true },
        { f: () => 1, color: 'rgba(74,222,128,.8)', width: 2, dash: [6, 5] },
        { f: () => -1, color: 'rgba(74,222,128,.8)', width: 2, dash: [6, 5] },
      ],
      labels: [{ text: 'f/g = sin(1/x) 在 [−1,1] 里振荡', x: x0 * 0.06, y: 1.2, color: C.green }],
      axis: { x: 'x', y: 'f/g' },
    };
  },
  readout() {
    const xs = [0.5, 0.2, 0.1, 0.05, 0.02];
    const vals = xs.map((x) => Math.sin(1 / x));
    return [
      { label: 'f = x·sin(1/x)，g = x', value: '' },
      { label: '比值取样（x = .5/.2/.1/.05/.02）', value: vals.map((v) => num(v, 3)).join(' / ') },
      { label: '上确界 |f/g|', value: num(maxAbs(vals), 4) },
      { label: '判决', value: '有界但无极限 ⟹ 只有 O，没有 o、没有 ∼', verdict: 'fail' },
    ];
  },
  invariant() {
    // 严格不等式：|sin(1/x)| ≤ 1 对一切 x > 0
    const xs = Array.from({ length: 400 }, (_, i) => 1e-3 + (i * (1 - 1e-3)) / 399);
    const worst = Math.max(...xs.map((x) => Math.abs(Math.sin(1 / x))));
    return { label: '|f/g| ≤ 1 恒成立（有界）', expected: 0, actual: Math.max(0, worst - 1), tol: 1e-15 };
  },
  note: () =>
    '比值永远在 [−1,1] 里，所以 f = O(g) 成立；但它不收敛到 0 也不收敛到 1，所以 o 与 ∼ 都不成立。O 是三者里最弱的一条。',
};

/* ------------------------------------ O 当 ∼ 用：系数被吃掉 */

const oVsTildeMode: VizMode = {
  key: 'O-vs-tilde',
  label: '把 O 当 ∼ 用（吃掉系数）',
  n: { min: 0.001, max: 0.05, step: 0.001, init: 0.05 },
  draw(n) {
    const x0 = Math.max(0.001, n || 0.05);
    return {
      view: { x0: 0, x1: x0, y1: 110 },
      curves: [
        { f: () => 100, color: C.cyan, width: 2.6, glow: true },
        { f: () => 1, color: C.pink, width: 2, dash: [5, 4] },
      ],
      labels: [
        { text: 'f/g ≡ 100（不是 1）', x: x0 * 0.06, y: 100, color: C.cyan },
        { text: '∼ 要求比值 → 1', x: x0 * 0.06, y: 1, color: C.pink },
      ],
      axis: { x: 'x', y: 'f/g' },
    };
  },
  readout(n) {
    const x = Math.max(0.001, n || 0.05);
    const truth = 100 * x;
    return [
      { label: 'f = 100x，g = x', value: '' },
      { label: `x = ${num(x, 3)} 处真值 f`, value: num(truth, 6) },
      { label: '把 f 换成 g（当作 ∼）', value: num(x, 6) },
      { label: '低估倍数', value: num(truth / x, 2), verdict: 'fail' },
    ];
  },
  invariant(n) {
    const x = Math.max(0.001, n || 0.05);
    // 恒等式：f/g ≡ 100（与 x 无关）
    return { label: 'f/g ≡ 100', expected: 100, actual: (100 * x) / x, tol: 1e-12 };
  },
  note: (n) => `O 只说「比值有界」，100 也是有界；∼ 要求比值 → 1。把 O 当 ∼ 用会把系数当成 1，
    x = ${num(Math.max(0.001, n || 0.05), 3)} 处直接低估 ${num(1 / Math.max(0.001, n || 0.05), 1)} 倍。`,
};

/* ------------------------------------ ∼ 不可相加：低阶项被放大成主导 */

const tildeAddMode: VizMode = {
  key: 'tilde-add',
  label: '∼ 不能相加',
  n: { min: 10, max: 100000, step: 10, init: 10000 },
  draw(n) {
    const N = Math.max(10, n || 10000);
    const fg = (n2: number) => (n2 + Math.pow(n2, 0.75)) / n2;
    const hk = (n2: number) => (n2 - 1) / (n2 - Math.pow(n2, 0.5));
    const sum = (n2: number) => (Math.pow(n2, 0.75) + 1) / Math.pow(n2, 0.5);
    const scale = Math.max(fg(N), hk(N), sum(N), 1);
    return {
      view: { x0: 0, x1: 11, y1: scale * 1.2 },
      curves: [
        { f: (t) => (t < 1 ? NaN : fg(Math.pow(10, t))), color: C.cyan, width: 2.4, glow: true },
        { f: (t) => (t < 1 ? NaN : hk(Math.pow(10, t))), color: C.violet, width: 2.4 },
        { f: (t) => (t < 1 ? NaN : sum(Math.pow(10, t))), color: C.red, width: 2.6 },
        { f: () => 1, color: 'rgba(74,222,128,.7)', width: 1.8, dash: [5, 4] },
      ],
      labels: [
        { text: 'f/g → 1.1', x: 8.2, y: fg(N), color: C.cyan },
        { text: 'h/k → 1.01', x: 8.2, y: hk(N), color: C.violet },
        { text: '（f+h)/(g+k) → 10.01', x: 6.2, y: sum(N), color: C.red },
      ],
      axis: { x: 'log₁₀n', y: '比值' },
    };
  },
  readout(n) {
    const N = Math.max(10, n || 10000);
    const fg = (N + Math.pow(N, 0.75)) / N;
    const hk = (N - 1) / (N - Math.pow(N, 0.5));
    const sum = (Math.pow(N, 0.75) + 1) / Math.pow(N, 0.5);
    return [
      { label: `n = ${N}：f/g`, value: num(fg, 6) },
      { label: 'h/k', value: num(hk, 6) },
      { label: '（f+h)/(g+k)', value: num(sum, 6), verdict: 'fail' },
      { label: '两个 ∼ 却得到 10.01，差', value: num(dev(sum, 1), 4) },
    ];
  },
  invariant(n) {
    const N = Math.max(10, n || 10000);
    // 恒等式：(f+h)/(g+k) = (n^{3/4} + 1)/n^{1/2}（分子分母的 n 项精确抵消）
    const exact = (Math.pow(N, 0.75) + 1) / Math.pow(N, 0.5);
    const fh = N + Math.pow(N, 0.75) - N + 1;
    const gk = N - N + Math.pow(N, 0.5);
    return { label: '(f+h)/(g+k) ≡ (n^{3/4}+1)/n^{1/2}', expected: exact, actual: fh / gk, tol: 1e-12 };
  },
  note: (n) => {
    const N = Math.max(10, n || 10000);
    return `f ∼ g 与 h ∼ k 各自比值都趋 1，但相加后 (f+h)/(g+k) → n^{1/4} = ${num(
      Math.pow(N, 0.25),
      3,
    )}：低阶项在相加时被放大成主导项。∼ 不满足可加性。`;
  },
};

/* ------------------------------------ 三种记号的对照 */

const threeNotionsMode: VizMode = {
  key: 'three-notions',
  label: 'O / o / ∼ 三条比值曲线',
  n: { min: 0.001, max: 1, step: 0.001, init: 1 },
  draw(n) {
    const x0 = Math.max(0.001, n || 1);
    return {
      view: { x0: 0, x1: x0, y1: 2.3 },
      curves: [
        { f: () => 2, color: C.violet, width: 2.4, glow: true },
        { f: (x) => (x === 0 ? NaN : x), color: C.cyan, width: 2.4 },
        { f: (x) => (x === 0 ? NaN : 1 + x), color: C.pink, width: 2.4 },
      ],
      labels: [
        { text: 'O：2x /x ≡ 2（天花板）', x: x0 * 0.08, y: 2, color: C.violet },
        { text: 'o：x²/x = x → 0', x: x0 * 0.08, y: 0.35, color: C.cyan },
        { text: '∼：(x+x²)/x → 1', x: x0 * 0.08, y: 1.12, color: C.pink },
      ],
      axis: { x: 'x', y: 'f/g' },
    };
  },
  readout(n) {
    const x = Math.max(0.001, n || 1);
    return [
      { label: 'g = x（基准）', value: '' },
      { label: 'O：比值 2x/x', value: num(2, 6) },
      { label: 'o：比值 x²/x', value: num(x, 6) },
      { label: '∼：比值 (x+x²)/x', value: num(1 + x, 6) },
    ];
  },
  invariant(n) {
    const x = Math.max(0.001, n || 1);
    // 恒等式：三个比值分别是 2、x、1+x
    const errs = [Math.abs(2 - 2), Math.abs((x * x) / x - x), Math.abs((x + x * x) / x - (1 + x))];
    return { label: '三条比值 ≡ 2 / x / (1+x)', expected: 0, actual: maxAbs(errs), tol: 1e-14 };
  },
  note: () => '三个记号画在同一张图上是三条比值曲线的三种归宿：停在常数（O）、压到 0（o）、收敛到 1（∼）。强弱顺序 o ⟹ O，∼ ⟹ O。',
};

export const asymptoticNotation: VizSpec = {
  module: 'asymptotic-notation',
  title: '渐近记号：O 是天花板，o 矮一截，∼ 同一条轨道',
  modes: [oVsOMode, ratioLimitMode, oVsTildeMode, tildeAddMode, threeNotionsMode],
};

export const asymptoticSpecs: VizSpec[] = [asymptoticNotation];
