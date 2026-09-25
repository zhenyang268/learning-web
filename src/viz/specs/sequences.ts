/**
 * 数列 / 极限 / 逼近篇 viz 规格（P 篇与 A 篇落点）。
 */
import type { VizSpec, VizMode } from '../kit';
import { COLORS as C } from '../kit';
import { linspace, range, sum, factorial, num, dev, maxAbs, trapz } from '../num';

/* ------------------------------------------------- P1.1 sum-telescoping */

const teleModes: VizMode[] = [
  {
    key: 'cancel',
    label: '1/(k(k+1)) = 1/k − 1/(k+1)',
    n: { min: 1, max: 60, step: 1, init: 8 },
    draw(n) {
      const N = Math.max(1, Math.round(n));
      const terms = range(1, N).map((k) => k);
      return {
        view: { x0: 0.3, x1: Math.max(2, n) + 0.7, y1: 1.05 },
        curves: [
          { f: (x) => 1 / (x * (x + 1)), color: C.cyan, width: 2, steps: 400, kind: 'step' },
        ],
        points: terms.map((k) => ({ x: k, y: 1 / (k * (k + 1)), r: 3, fill: C.violet })),
        labels: [{ text: '第 k 项高 1/(k(k+1))', x: 1.4, y: 0.72, color: C.violet }],
        grid: { rows: 4, xTicks: 4, yTicks: 4 },
        axis: { x: 'k', y: '' },
      };
    },
    readout(n) {
      const N = Math.max(1, Math.round(n));
      const direct = sum(range(1, N).map((k) => 1 / (k * (k + 1))));
      const closed = 1 - 1 / (N + 1);
      return [
        { label: '逐项累加 Σ', value: num(direct, 10) },
        { label: '闭式 1 − 1/(N+1)', value: num(closed, 10) },
        { label: '差', value: num(dev(direct, closed), 3), verdict: dev(direct, closed) < 1e-12 ? 'ok' : 'fail' },
      ];
    },
    invariant(n) {
      const N = Math.max(1, Math.round(n));
      const direct = sum(range(1, N).map((k) => 1 / (k * (k + 1))));
      return { label: '逐项累加 ≡ 1 − 1/(N+1)', expected: 1 - 1 / (N + 1), actual: direct, tol: 1e-12 };
    },
    note: (n) => `相消后只剩首尾：1/1 − 1/(N+1) = ${num(1 - 1 / (Math.max(1, n) + 1), 10)}。楼梯中间全塌掉。`,
  },
  {
    key: 'endpoint-error',
    label: '误用：错位相减忘了几何条件',
    n: { min: 1, max: 40, step: 1, init: 8 },
    draw(n) {
      const r = 1.5;
      const N = Math.max(1, Math.round(n));
      const partial = range(0, N).map((k) => Math.pow(r, k));
      return {
        view: { x0: -0.3, x1: N + 0.3, y1: Math.max(2, Math.pow(r, N)) },
        curves: [{ f: (x) => Math.pow(r, Math.max(0, Math.floor(x))), color: C.red, width: 2, steps: 400, kind: 'step' }],
        points: partial.map((v, k) => ({ x: k, y: v, r: 3, fill: C.red })),
        axis: { x: 'k', y: 'r^k' },
      };
    },
    readout(n) {
      const r = 1.5;
      const N = Math.max(1, Math.round(n));
      const right = ((r ** (N + 1) - 1) / (r - 1));
      return [
        { label: `Σ_{k=0}^{N} r^k，r = ${r}`, value: num(right) },
        { label: '把 r→1 的公式 (N+1) 套上来', value: num(N + 1) },
        { label: '差', value: num(dev(right, N + 1)), verdict: 'fail' },
      ];
    },
    invariant(n) {
      const r = 2;
      const N = Math.max(1, Math.round(n));
      const geom = (r ** (N + 1) - 1) / (r - 1);
      const direct = sum(range(0, N).map((k) => Math.pow(r, k)));
      return { label: '几何和闭式 ≡ 逐项累加（r ≠ 1）', expected: geom, actual: direct, tol: 1e-6 };
    },
    note: (n) => `错位相减的推导里除过 (r−1)：r = 1 时一步都走不通，公式给出 ${num(Math.max(1, n) + 1)} 而真值应为 N+1 项之和，边界上直接翻车。`,
  },
];

export const sumTelescoping: VizSpec = {
  module: 'sum-telescoping',
  title: '差分法与楼梯相消',
  modes: teleModes,
};

/* ------------------------------------------------ P4.1 recurrence-cobweb */

const cobwebModes: VizMode[] = [
  {
    key: 'sqrt2-converge',
    label: 'a_{n+1} = √(2+a_n) → 2',
    n: { min: 1, max: 12, step: 1, init: 6 },
    draw(n) {
      const f = (x: number) => Math.sqrt(2 + x);
      let a = Math.SQRT2;
      const segs = [];
      const pts = [{ x: Math.SQRT2, y: 0, r: 3.5, fill: C.yellow }];
      const steps = Math.max(1, Math.min(12, n));
      for (let i = 0; i < steps; i++) {
        const next = f(a);
        segs.push({ x0: a, y0: a, x1: a, y1: next, color: C.violet, width: 1.6 });
        segs.push({ x0: a, y0: next, x1: next, y1: next, color: C.cyan, width: 1.6 });
        a = next;
        pts.push({ x: a, y: a, r: 3, fill: C.violet });
      }
      return {
        view: { x0: 0.8, x1: 2.5, y1: 2.5 },
        curves: [
          { f, color: C.pink, width: 2.5, glow: true, label: 'f' },
          { f: (x) => x, color: 'rgba(148,163,255,.5)', width: 1.5, dash: [5, 5] },
        ],
        segs,
        points: [...pts, { x: 2, y: 2, r: 5, fill: C.fg, stroke: C.green, label: '不动点 2' }],
        axis: { x: 'aₙ', y: 'a_{n+1}' },
      };
    },
    readout(n) {
      const steps = Math.max(1, Math.min(12, n));
      let a = Math.SQRT2;
      for (let i = 0; i < steps; i++) a = Math.sqrt(2 + a);
      return [
        { label: `a_${steps + 1}`, value: num(a, 12) },
        { label: '不动点 2', value: '2' },
        { label: '|f′(2)| = 1/(2√4)', value: num(1 / (2 * Math.sqrt(4)), 4) },
        { label: '判决（|f′| < 1 收敛）', value: '收敛', verdict: 'ok' },
      ];
    },
    invariant() {
      // 恒等式：不动点满足 f(x) = x
      return { label: 'f(2) = 2（不动点）', expected: 2, actual: Math.sqrt(2 + 2), tol: 1e-15 };
    },
    note: () => `蜘蛛网一圈圈收进不动点：|f′(2)| = 1/4 < 1，所以迭代误差每步缩到 1/4。`,
  },
  {
    key: 'false-fixedpoint-diverge',
    label: 'a_{n+1} = a_n² + 1/4（不动点不稳定）',
    n: { min: 1, max: 14, step: 1, init: 6 },
    draw(n) {
      const f = (x: number) => x * x + 0.25;
      let a = 1;
      const segs = [];
      const steps = Math.max(1, Math.min(14, n));
      for (let i = 0; i < steps; i++) {
        const next = Math.min(f(a), 3.4);
        segs.push({ x0: a, y0: a, x1: a, y1: next, color: C.red, width: 1.6 });
        segs.push({ x0: a, y0: next, x1: Math.min(next, 3.4), y1: next, color: C.yellow, width: 1.6 });
        a = next;
      }
      return {
        view: { x0: -0.2, x1: 3.4, y1: 3.4 },
        curves: [
          { f, color: C.pink, width: 2.5, glow: true, label: 'f' },
          { f: (x) => x, color: 'rgba(148,163,255,.5)', width: 1.5, dash: [5, 5] },
        ],
        segs,
        points: [{ x: 0.5, y: 0.5, r: 5, fill: C.fg, stroke: C.yellow, label: '不动点 0.5' }],
        axis: { x: 'aₙ', y: 'a_{n+1}' },
      };
    },
    readout(n) {
      const steps = Math.max(1, Math.min(14, n));
      let a = 1;
      for (let i = 0; i < steps; i++) a = a * a + 0.25;
      return [
        { label: `a_${steps + 1}`, value: a > 1e6 ? `${num(a, 3)}（已溢出）` : num(a, 6) },
        { label: '不动点 0.5（二重根）', value: '0.5' },
        { label: "|f′(0.5)| = 2·0.5", value: '1' },
        { label: '判决（|f′| ≥ 1 不收敛）', value: '发散 ✗', verdict: 'fail' },
      ];
    },
    invariant() {
      // 恒等式：0.5 是不动点（x = x² + 1/4 的判别式为 0）
      const r = 0.25;
      return { label: 'f(0.5) = 0.5（不动点）', expected: 0.5, actual: 0.5 * 0.5 + r, tol: 1e-15 };
    },
    note: () => '不动点存在 ≠ 迭代收敛：这里 |f′| = 1 恰好卡在临界，a₁ = 1 偏离后立刻跑向无穷。存在性是「有解」，收敛性是「能算到」。',
  },
  {
    key: 'slope-stability',
    label: '判据：|f′(x*)| < 1 ⟺ 收敛',
    n: { min: 0, max: 1.8, step: 0.05, init: 0.5 },
    draw(s) {
      const slope = s || 0.5;
      const f = (x: number) => slope * x + 1 - slope; // 不动点 x*=1，f′ = slope
      let a = 1.6;
      const segs = [];
      for (let i = 0; i < 10; i++) {
        const next = f(a);
        segs.push({ x0: a, y0: a, x1: a, y1: next, color: slope < 1 ? C.cyan : C.red, width: 1.4 });
        segs.push({ x0: a, y0: next, x1: next, y1: next, color: slope < 1 ? C.violet : C.yellow, width: 1.4 });
        a = next;
      }
      return {
        view: { x0: 0.5, x1: 1.7, y1: 1.7 },
        curves: [
          { f, color: C.pink, width: 2.5, glow: true },
          { f: (x) => x, color: 'rgba(148,163,255,.5)', width: 1.5, dash: [5, 5] },
        ],
        segs,
        points: [{ x: 1, y: 1, r: 5, fill: C.fg, stroke: C.green, label: '不动点 1' }],
        axis: { x: 'aₙ', y: 'a_{n+1}' },
      };
    },
    readout(s) {
      const slope = s || 0.5;
      return [
        { label: '|f′(x*)| = slope', value: num(slope, 4) },
        { label: '10 步后误差 / 初误差', value: num(Math.pow(Math.abs(slope), 10), 6) },
        { label: '判决', value: slope < 1 ? '收敛' : '发散 ✗', verdict: slope < 1 ? 'ok' : 'fail' },
      ];
    },
    invariant(s) {
      const slope = s || 0.5;
      // 恒等式：误差按 |slope|^n 衰减（解析解 e_n = e_0·s^n）
      const e0 = 0.6;
      let a = 1 + e0;
      for (let i = 0; i < 6; i++) a = slope * a + 1 - slope;
      return { label: 'e_6 = e_0·s⁶', expected: e0 * Math.pow(slope, 6), actual: a - 1, tol: 1e-12 };
    },
    note: (s) => `把 |f′| 拖过 1：< 1 时误差每步乘 |f′|，> 1 时放大 —— 判据就是这一条。当前 |f′| = ${num(s || 0.5, 2)}。`,
  },
];

export const recurrenceCobweb: VizSpec = {
  module: 'recurrence-cobweb',
  title: '递推迭代的蛛网图',
  modes: cobwebModes,
};

/* ---------------------------------------------------------- P4.2 limit-toolkit */

const taylorOf = (k: number, x: number): number => {
  // sin 的 2k+1 阶 Taylor
  let s = 0;
  for (let i = 0; i <= k; i++) s += (i % 2 ? -1 : 1) * Math.pow(x, 2 * i + 1) / factorial(2 * i + 1);
  return s;
};

const toolkitModes: VizMode[] = [
  {
    key: 'taylor-orders',
    label: 'sin 的 1/3/5 阶',
    n: { min: -3, max: 3, step: 0.1, init: 3 },
    draw(t) {
      const tt = t || 0;
      return {
        view: { x0: -3.3, x1: 3.3, y0: -1.6, y1: 1.6 },
        curves: [
          { f: Math.sin, color: C.cyan, width: 2.6, glow: true },
          { f: (x) => taylorOf(0, x), color: C.yellow, width: 1.8, dash: [6, 4] },
          { f: (x) => taylorOf(1, x), color: C.violet, width: 1.8, dash: [4, 4] },
          { f: (x) => taylorOf(2, x), color: C.pink, width: 1.8, dash: [2, 4] },
        ],
        points: [{ x: tt, y: Math.sin(tt), r: 4.5, fill: C.yellow, label: 'sin t' }],
        labels: [
          { text: '1 阶', x: 2.5, y: taylorOf(0, 2.5), color: C.yellow },
          { text: '3 阶', x: 2.55, y: taylorOf(1, 2.55), color: C.violet },
          { text: '5 阶', x: 2.6, y: taylorOf(2, 2.6), color: C.pink },
        ],
        axis: { x: 'x', y: '' },
      };
    },
    readout(t) {
      const tt = t || 0;
      const e5 = Math.abs(Math.sin(tt) - taylorOf(2, tt));
      const bound = Math.pow(Math.abs(tt), 6) / factorial(6);
      return [
        { label: `x = ${num(tt, 3)}：|sin − T₅|`, value: num(e5, 8) },
        { label: 'Lagrange 余项界 x⁶/6!', value: num(bound, 8) },
        { label: '判决', value: e5 <= bound ? '界成立' : '界被突破', verdict: e5 <= bound ? 'ok' : 'fail' },
      ];
    },
    invariant() {
      // Lagrange 余项界：|sin x − T₅(x)| ≤ |x|⁶/6!
      const xs = linspace(-3, 3, 400);
      const viol = xs.map((x) => Math.abs(Math.sin(x) - taylorOf(2, x)) - Math.pow(Math.abs(x), 6) / factorial(6));
      return { label: '|sin − T₅| ≤ x⁶/6!（Lagrange）', expected: 0, actual: Math.max(0, Math.max(...viol)), tol: 1e-12 };
    },
    note: () => '阶数越高贴合区间越宽，但 Taylor 只在一点附近准 —— 这是「局部」近似，不是全局。',
  },
  {
    key: 'zoom-warning',
    label: '缩放陷阱：1 − cos(x) 的灾难性抵消',
    n: { min: -12, max: -2, step: 1, init: -8 },
    draw() {
      return {
        view: { x0: -1e-3, x1: 1e-3, y1: 1e-5 },
        curves: [
          { f: (x) => (1 - Math.cos(x)), color: C.red, width: 2.4, glow: true },
          { f: (x) => (x * x) / 2, color: C.cyan, width: 2, dash: [5, 5] },
        ],
        axis: { x: 'x', y: '' },
      };
    },
    readout(n) {
      const x = Math.pow(10, n || -8);
      const naive = 1 - Math.cos(x);
      const stable = 2 * Math.sin(x / 2) ** 2;
      const exact = x * x / 2;
      return [
        { label: `x = 1e${n || -8}`, value: '' },
        { label: '直接算 1 − cos x', value: num(naive, 6) },
        { label: '稳定算法 2sin²(x/2)', value: num(stable, 6) },
        { label: 'x²/2', value: num(exact, 6) },
        { label: '判决（直接算的相对误差）', value: num(dev(naive, exact) / exact, 4), verdict: dev(naive, exact) / exact < 1e-6 ? 'ok' : 'fail' },
      ];
    },
    invariant(n) {
      const x = Math.pow(10, n || -8);
      // 2sin²(x/2) ≡ 1 − cos x（解析恒等式）；它与 x²/2 的相对间隙 = (x⁴/24)/(x²/2) + O(x⁴) = x²/12 + O(x⁴)。
      // 所以这里检查的是「稳定算法确实只差到 x²/12 这一阶」。
      const stable = 2 * Math.sin(x / 2) ** 2;
      const exact = x * x / 2;
      return { label: '相对偏差 ≤ x²/12 + 1e-16', expected: 0, actual: Math.max(0, dev(stable, exact) / exact - (x * x) / 12 - 1e-16), tol: 1e-15 };
    },
    note: (n) => `x = 1e${n || -8} 时 1 − cos x 要拿两个几乎相等的数相减，有效位全丢；换成 2sin²(x/2) 就稳。`,
  },
  {
    key: 'zoom-in',
    label: '等价无穷小：1 − cos x ~ x²/2',
    n: { min: -4, max: 0, step: 0.25, init: -1 },
    draw(n) {
      const r = Math.pow(10, n || -1);
      return {
        view: { x0: -r, x1: r, y1: (r * r) / 2 * 1.1 },
        curves: [
          { f: (x) => 1 - Math.cos(x), color: C.cyan, width: 2.5, glow: true },
          { f: (x) => (x * x) / 2, color: C.pink, width: 2, dash: [5, 5] },
        ],
        axis: { x: 'x', y: '' },
      };
    },
    readout(n) {
      const r = Math.pow(10, n || -1);
      const lhs = 1 - Math.cos(r);
      const rhs = (r * r) / 2;
      return [
        { label: `x = ${num(r, 4)}`, value: '' },
        { label: '1 − cos x', value: num(lhs, 8) },
        { label: 'x²/2', value: num(rhs, 8) },
        { label: '相对误差', value: num(dev(lhs, rhs) / rhs, 4), verdict: 'ok' },
      ];
    },
    invariant(n) {
      const r = Math.pow(10, n || -1);
      const stable = 2 * Math.sin(r / 2) ** 2;
      const approx = (r * r) / 2;
      return { label: '|2sin²(x/2) − x²/2| / (x²/2) ≤ x²/12 + 1e-15', expected: 0, actual: Math.max(0, dev(stable, approx) / approx - (r * r) / 12 - 1e-15), tol: 1e-12 };
    },
    note: (n) => `缩放到 1e${n || -1}：两条曲线几乎重合，误差是 O(x⁴) —— 这就是等价无穷小可替换的原因。`,
  },
];

export const limitToolkit: VizSpec = {
  module: 'limit-toolkit',
  title: '函数与近似的误差曲线',
  modes: toolkitModes,
};

/* -------------------------------------------------------- P4.3 classic-limits */

const classicModes: VizMode[] = [
  {
    key: 'e-sequence',
    label: '(1 + 1/n)^n → e',
    n: { min: 1, max: 400, step: 1, init: 20 },
    draw(n) {
      const N = Math.max(1, Math.round(n));
      return {
        view: { x0: 0, x1: N, y1: 3 },
        curves: [
          { f: (x) => (x < 1 ? NaN : Math.pow(1 + 1 / Math.floor(x), Math.floor(x))), color: C.cyan, width: 2, steps: Math.min(800, N), kind: 'step' },
          { f: () => Math.E, color: C.pink, width: 2, dash: [6, 5] },
        ],
        labels: [{ text: 'e = 2.71828…', x: N * 0.55, y: 2.78, color: C.pink }],
        axis: { x: 'n', y: '' },
      };
    },
    readout(n) {
      const N = Math.max(1, Math.round(n));
      const v = Math.pow(1 + 1 / Math.floor(N), Math.floor(N));
      return [
        { label: `(1+1/n)^n, n = ${N}`, value: num(v, 10) },
        { label: 'e', value: '2.718281828' },
        { label: '误差 × n', value: num(dev(v, Math.E) * N, 4), verdict: 'ok' },
      ];
    },
    invariant(n) {
      const N = Math.max(1, Math.round(n));
      const v = Math.pow(1 + 1 / N, N);
      // 单调递增 ⇒ v_{N+1} > v_N（严格）
      const v2 = Math.pow(1 + 1 / (N + 1), N + 1);
      return { label: '单调递增量 v_{N+1} − v_N > 0', expected: 0, actual: v2 > v ? 0 : 1, tol: 0 };
    },
    note: (n) => `误差 ~ e/(2n)：n = ${Math.max(1, n)} 时误差乘 n 约为 ${num(dev(Math.pow(1 + 1 / Math.max(1, n), Math.max(1, n)), Math.E) * Math.max(1, n), 4)}（→ e/2 ≈ 1.359）。`,
  },
  {
    key: 'nth-root',
    label: 'n^(1/n) → 1',
    n: { min: 1, max: 400, step: 1, init: 20 },
    draw(n) {
      const N = Math.max(2, Math.round(n));
      return {
        view: { x0: 1, x1: N, y1: 2 },
        curves: [
          { f: (x) => (x < 1 ? NaN : Math.pow(Math.floor(x), 1 / Math.floor(x))), color: C.cyan, width: 2, steps: Math.min(800, N), kind: 'step' },
          { f: () => 1, color: C.pink, width: 2, dash: [6, 5] },
        ],
        axis: { x: 'n', y: '' },
      };
    },
    readout(n) {
      const N = Math.max(2, Math.round(n));
      const v = Math.pow(N, 1 / N);
      const asym = Math.log(N) / N;
      return [
        { label: `n^(1/n), n = ${N}`, value: num(v, 8) },
        { label: '1 + ln n / n', value: num(1 + asym, 8) },
        { label: '差', value: num(dev(v, 1 + asym), 8), verdict: 'ok' },
      ];
    },
    invariant(n) {
      const N = Math.max(2, Math.round(n));
      // 恒等式：n^(1/n) ≡ exp(ln n / n)
      const v = Math.pow(N, 1 / N);
      const viaExp = Math.exp(Math.log(N) / N);
      return { label: 'n^(1/n) ≡ e^{ln n / n}', expected: viaExp, actual: v, tol: 1e-14 };
    },
    note: (n) => `收敛速度由 ln n / n 控制：n = ${Math.max(2, n)} 时 1 + ln n/n = ${num(1 + Math.log(Math.max(2, n)) / Math.max(2, n), 8)}，与真值只差 O((ln n)²/n²)。`,
  },
  {
    key: 'exp-x',
    label: '(1 + x/n)^n → eˣ',
    n: { min: 1, max: 400, step: 1, init: 20 },
    draw(n) {
      const N = Math.max(1, Math.round(n));
      return {
        view: { x0: -3, x1: 3, y1: Math.exp(3) },
        curves: [
          { f: (x) => Math.pow(1 + x / N, N), color: C.cyan, width: 2.4, glow: true },
          { f: (x) => Math.exp(x), color: C.pink, width: 2, dash: [6, 5] },
        ],
        axis: { x: 'x', y: '' },
      };
    },
    readout(n) {
      const N = Math.max(1, Math.round(n));
      const x = 1;
      const v = Math.pow(1 + x / N, N);
      return [
        { label: `(1+1/n)^n, n = ${N}`, value: num(v, 10) },
        { label: 'e', value: '2.718281828' },
        { label: '误差 × n', value: num(dev(v, Math.E) * N, 4), verdict: 'ok' },
      ];
    },
    invariant(n) {
      const N = Math.max(1, Math.round(n));
      // 恒等式（二项展开的单调方向）：(1+1/n)^n < e 对一切 n 成立
      const v = Math.pow(1 + 1 / N, N);
      return { label: '(1+1/n)^n < e（严格）', expected: 0, actual: v < Math.E ? 0 : 1, tol: 0 };
    },
    note: () => '把 n 拉大就是把「连续复利」切成越来越细的期数：极限才是 eˣ。',
  },
];

export const classicLimits: VizSpec = {
  module: 'classic-limits',
  title: '三个经典极限的收敛曲线',
  modes: classicModes,
};

/* ----------------------------------------------------------- P7.1 taylor-approx */

const taylorSeries = (which: 'ln1px' | 'geom', N: number, x: number): number => {
  let s = 0;
  if (which === 'ln1px') {
    for (let k = 1; k <= N; k++) s += (k % 2 ? 1 : -1) * Math.pow(x, k) / k;
  } else {
    for (let k = 0; k <= N; k++) s += Math.pow(x, k);
  }
  return s;
};

const taylorModes: VizMode[] = [
  {
    key: 'ln1px',
    label: 'ln(1+x)：半径 1 外发散',
    n: { min: 1, max: 12, step: 1, init: 5 },
    draw(n) {
      const N = Math.max(1, Math.round(n));
      return {
        view: { x0: -0.99, x1: 2.2, y0: -3, y1: 3 },
        curves: [
          { f: (x) => (x > -1 ? Math.log(1 + x) : NaN), color: C.cyan, width: 2.6, glow: true, from: -0.99, to: 2.2 },
          { f: (x) => taylorSeries('ln1px', N, x), color: C.red, width: 2, dash: [5, 4] },
        ],
        segs: [{ x0: 1, y0: -3, x1: 1, y1: 3, color: 'rgba(250,204,21,.55)', width: 1.6, dash: [4, 4] }],
        points: [{ x: 2, y: Math.log(3), r: 4.5, fill: C.yellow, label: 'x=2（半径外）' }],
        labels: [{ text: '收敛半径 |x| = 1', x: 0.72, y: 2.6, color: '#facc15' }],
        axis: { x: 'x', y: '' },
      };
    },
    readout(n) {
      const N = Math.max(1, Math.round(n));
      const S = taylorSeries('ln1px', N, 2);
      return [
        { label: `S_${N}(2)`, value: num(S, 6) },
        { label: 'ln 3（真值）', value: num(Math.log(3), 6) },
        { label: '偏差', value: num(dev(S, Math.log(3)), 6), verdict: dev(S, Math.log(3)) > 1e-6 ? 'fail' : 'ok' },
      ];
    },
    invariant(n) {
      const N = Math.max(1, Math.round(n));
      // 交错级数余项界（|x|<1 时严格）：|ln(1+x) − S_N| ≤ |x|^{N+1}/(N+1)
      const x = 0.5;
      const S = taylorSeries('ln1px', N, x);
      const err = Math.abs(Math.log(1 + x) - S);
      const bound = Math.pow(Math.abs(x), N + 1) / (N + 1);
      return { label: '交错余项 |R_N| ≤ x^{N+1}/(N+1)（x=0.5）', expected: 0, actual: Math.max(0, err - bound), tol: 1e-14 };
    },
    note: (n) => `把 x = 2 代进去：真值 ln3 = 1.0986，而 S_${Math.max(1, n)} 已经跑到 ${num(taylorSeries('ln1px', Math.max(1, n), 2), 5)} —— 收敛半径外部分和不是函数值。`,
  },
  {
    key: 'geom',
    label: '1/(1−x)：半径 1 外爆炸',
    n: { min: 1, max: 12, step: 1, init: 5 },
    draw(n) {
      const N = Math.max(1, Math.round(n));
      return {
        view: { x0: -2.2, x1: 2.2, y0: -5, y1: 5 },
        curves: [
          { f: (x) => (Math.abs(x - 1) < 1e-9 ? NaN : 1 / (1 - x)), color: C.cyan, width: 2.6, glow: true, to: 0.97 },
          { f: (x) => taylorSeries('geom', N, x), color: C.red, width: 2, dash: [5, 4] },
        ],
        segs: [{ x0: 1, y0: -5, x1: 1, y1: 5, color: 'rgba(250,204,21,.55)', width: 1.6, dash: [4, 4] }],
        points: [{ x: 2, y: -1, r: 4.5, fill: C.yellow, label: 'x=2 真值 −1' }],
        axis: { x: 'x', y: '' },
      };
    },
    readout(n) {
      const N = Math.max(1, Math.round(n));
      const S = taylorSeries('geom', N, 2);
      return [
        { label: `S_${N}(2)`, value: num(S, 6) },
        { label: '1/(1−2) 真值', value: '−1' },
        { label: '偏差', value: num(dev(S, -1), 6), verdict: dev(S, -1) > 1e-6 ? 'fail' : 'ok' },
      ];
    },
    invariant(n) {
      const N = Math.max(1, Math.round(n));
      // 恒等式（|x|<1）：1/(1−x) − Σ_{k≤N} x^k = x^{N+1}/(1−x)
      const x = 0.5;
      const S = taylorSeries('geom', N, x);
      const exact = Math.pow(x, N + 1) / (1 - x);
      return { label: '余项 ≡ x^{N+1}/(1−x)', expected: exact, actual: 1 / (1 - x) - S, tol: 1e-14 };
    },
    note: (n) => `几何级数在 x = 2 处：S_${Math.max(1, n)} = ${num(taylorSeries('geom', Math.max(1, n), 2), 5)}，与真值 −1 越走越远。`,
  },
];

/** P9.3 要的「Taylor 余项界」模式：真误差 vs 解析界 C·|x|^{n+1} */
function taylorSum(which: 'exp' | 'sin' | 'ln1p', N: number, x: number): number {
  let s = 0;
  if (which === 'exp') {
    for (let k = 0; k <= N; k++) s += Math.pow(x, k) / factorial(k);
  } else if (which === 'sin') {
    for (let k = 0; k * 2 + 1 <= N; k++) s += (k % 2 ? -1 : 1) * Math.pow(x, 2 * k + 1) / factorial(2 * k + 1);
  } else {
    for (let k = 1; k <= N; k++) s += (k % 2 ? 1 : -1) * Math.pow(x, k) / k;
  }
  return s;
}

const TAYLOR_CASES = [
  { key: 'exp', label: 'eˣ', x: 0.1, exact: (x: number) => Math.exp(x), sum: (N: number, x: number) => taylorSum('exp', N, x) },
  { key: 'sin', label: 'sin x', x: 0.5, exact: Math.sin, sum: (N: number, x: number) => taylorSum('sin', N, x) },
  { key: 'ln1p', label: 'ln(1+x)', x: 0.2, exact: (x: number) => Math.log(1 + x), sum: (N: number, x: number) => taylorSum('ln1p', N, x) },
];

/** 余项界 C·|x|^{n+1}：eˣ 取 e^{|x|}/(n+1)!，sin 取 1/(n+1)!，ln(1+x) 取 1/(n+1)（交错级数） */
function taylorBound(kind: string, N: number, x: number): number {
  if (kind === 'exp') return (Math.exp(Math.abs(x)) * Math.pow(Math.abs(x), N + 1)) / factorial(N + 1);
  if (kind === 'sin') return Math.pow(Math.abs(x), N + 1) / factorial(N + 1);
  return Math.pow(Math.abs(x), N + 1) / (N + 1);
}

const remainderBoundMode: VizMode = {
  key: 'remainder-bound',
  label: '余项界 |R_n| ≤ C|x|^{n+1}',
  n: { min: 1, max: 12, step: 1, init: 3 },
  draw(n) {
    const N = Math.max(1, Math.round(n));
    const curves = TAYLOR_CASES.flatMap((c, i) => {
      const col = [C.cyan, C.violet, C.pink][i];
      return [
        { f: (x: number) => Math.abs(c.exact(x) - c.sum(N, Math.abs(x) < 1e-9 ? 1e-9 : x)), color: col, width: 2.4, glow: true, from: 1e-4, to: c.x * 1.6 },
        { f: (x: number) => taylorBound(c.key, N, x), color: col, width: 1.8, dash: [5, 4], from: 1e-4, to: c.x * 1.6 },
      ];
    });
    return {
      view: { x0: 0, x1: 0.85, y1: 0.12 },
      curves,
      labels: TAYLOR_CASES.map((c, i) => ({
        text: c.label,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        x: c.x,
        y: 0.11 - i * 0.012,
        color: [C.cyan, C.violet, C.pink][i],
      })),
      axis: { x: 'x', y: '误差 / 界' },
    };
  },
  readout(n) {
    const N = Math.max(1, Math.round(n));
    return TAYLOR_CASES.map((c) => {
      const err = Math.abs(c.exact(c.x) - c.sum(N, c.x));
      const bound = taylorBound(c.key, N, c.x);
      return {
        label: `${c.label} @ x=${c.x}：真误差 ${num(err, 5)} / 界 ${num(bound, 5)}`,
        value: err <= bound ? `${num(bound / Math.max(err, 1e-15), 3)}×` : '界被突破',
        verdict: (err <= bound ? 'ok' : 'fail') as 'ok' | 'fail',
      };
    });
  },
  invariant(n) {
    const N = Math.max(1, Math.round(n));
    // 严格不等式：三个常用展开在各自取样点上都满足 |R_n| ≤ C|x|^{n+1}
    const viol = TAYLOR_CASES.map((c) => {
      const err = Math.abs(c.exact(c.x) - c.sum(N, c.x));
      return Math.max(0, err - taylorBound(c.key, N, c.x));
    });
    return { label: '|R_n| ≤ C|x|^{n+1}（三个展开同时成立）', expected: 0, actual: Math.max(...viol), tol: 1e-15 };
  },
  note: (n) => {
    const N = Math.max(1, Math.round(n));
    const worst = TAYLOR_CASES.map((c) => {
      const err = Math.abs(c.exact(c.x) - c.sum(N, c.x));
      return { l: c.label, r: taylorBound(c.key, N, c.x) / Math.max(err, 1e-15) };
    }).reduce((a, b) => (b.r > a.r ? b : a));
    return `阶数 n = ${N}：三个展开的真误差都在界内，最松的是 ${worst.l}（界比真误差大 ${num(worst.r, 3)} 倍）。界只是「不超过」，不是「等于」。`;
  },
};

export const taylorApprox: VizSpec = {
  module: 'taylor-approx',
  title: '在收敛半径外拿部分和当函数值（误用）',
  modes: [...taylorModes, remainderBoundMode],
};

/* --------------------------------------------------------- P8.4 stirling-approx */

/** ln n! 的 Stirling 余项 r = ln n! − (n ln n − n + 0.5 ln 2πn)，Robbins 界：1/(12n+1) < r < 1/(12n) */
function stirlingRemainder(n: number): number {
  let lnFact = 0;
  for (let k = 2; k <= n; k++) lnFact += Math.log(k);
  return lnFact - (n * Math.log(n) - n + 0.5 * Math.log(2 * Math.PI * n));
}

const stirlingModes: VizMode[] = [
  {
    key: 'error-curve',
    label: '相对误差 ~ 1/(12n)',
    n: { min: 1, max: 200, step: 1, init: 20 },
    draw(n) {
      const N = Math.max(1, Math.round(n));
      return {
        view: { x0: 0, x1: N, y1: 0.1 },
        curves: [
          { f: (x) => { const k = Math.max(1, Math.round(x)); return stirlingRemainder(k); }, color: C.cyan, width: 2.4, glow: true, kind: 'step', steps: Math.min(400, N) },
          { f: (x) => 1 / (12 * Math.max(1, x)), color: C.pink, width: 2, dash: [5, 4] },
          { f: (x) => 1 / (12 * Math.max(1, x) + 1), color: C.violet, width: 1.8, dash: [3, 4] },
        ],
        axis: { x: 'n', y: 'r(n)' },
      };
    },
    readout(n) {
      const N = Math.max(1, Math.round(n));
      const r = stirlingRemainder(N);
      return [
        { label: `r(${N}) = ln n! − Stirling 主项`, value: num(r, 8) },
        { label: '1/(12n+1)', value: num(1 / (12 * N + 1), 8) },
        { label: '1/(12n)', value: num(1 / (12 * N), 8) },
        { label: '判决（落在 Robbins 夹逼内）', value: r > 1 / (12 * N + 1) && r < 1 / (12 * N) ? '在界内' : '越界 ✗', verdict: r > 1 / (12 * N + 1) && r < 1 / (12 * N) ? 'ok' : 'fail' },
      ];
    },
    invariant(n) {
      const N = Math.max(2, Math.round(n));
      const r = stirlingRemainder(N);
      // Robbins 界：1/(12n+1) < r < 1/(12n) —— 严格夹逼
      const viol = Math.max(0, 1 / (12 * N + 1) - r) + Math.max(0, r - 1 / (12 * N));
      return { label: 'Robbins 夹逼 1/(12n+1) < r < 1/(12n)', expected: 0, actual: viol, tol: 1e-15 };
    },
    note: (n) => `余项 r 恰好被 1/(12n) 两边夹住（Robbins）：n = ${Math.max(1, n)} 时 r = ${num(stirlingRemainder(Math.max(2, n)), 6)}，所以相对误差 ~ 1/(12n) 是可证的，不是经验公式。`,
  },
  {
    key: 'drop-sqrt',
    label: '误用：丢掉 √(2πn) ⟹ 低估 7.99 倍',
    n: { min: 1, max: 30, step: 1, init: 10 },
    draw(n) {
      const N = Math.max(1, Math.round(n));
      const vals = [factorial(N), Math.pow(N / Math.E, N), Math.sqrt(2 * Math.PI * N) * Math.pow(N / Math.E, N)];
      return {
        view: { x0: -0.5, x1: 2.5, y1: vals[0] * 1.15 },
        rects: vals.map((v, i) => ({ x: i, y: 0, w: 0.6, h: v, fill: [ 'rgba(94,230,255,.22)', 'rgba(248,113,113,.28)', 'rgba(74,222,128,.22)' ][i], stroke: [C.cyan, C.red, C.green][i] })),
        labels: [
          { text: 'n!', x: 0, y: vals[0] * 1.06, color: C.cyan },
          { text: '(n/e)^n', x: 1, y: vals[1] * 1.06, color: C.red },
          { text: '√(2πn)(n/e)^n', x: 2, y: vals[2] * 1.06, color: C.green },
        ],
        axis: { x: '', y: '' },
      };
    },
    readout(n) {
      const N = Math.max(1, Math.round(n));
      const fact = factorial(N);
      const bare = Math.pow(N / Math.E, N);
      const full = Math.sqrt(2 * Math.PI * N) * bare;
      return [
        { label: `${N}!`, value: num(fact, 6) },
        { label: '(n/e)^n（丢 √(2πn)）', value: num(bare, 6) },
        { label: '√(2πn)(n/e)^n', value: num(full, 6) },
        { label: '低估倍数 n!/bare', value: num(fact / bare, 4), verdict: 'fail' },
      ];
    },
    invariant(n) {
      const N = Math.max(2, Math.round(n));
      // 恒等式：n! = √(2πn)(n/e)^n · e^{r(n)}，用 Robbins 的 r 反推，误差只来自浮点
      const fact = factorial(N);
      const full = Math.sqrt(2 * Math.PI * N) * Math.pow(N / Math.E, N);
      const viaR = full * Math.exp(stirlingRemainder(N));
      return { label: 'n! ≡ √(2πn)(n/e)^n · e^{r}', expected: fact, actual: viaR, tol: Math.abs(fact) * 1e-12 + 1e-6 };
    },
    note: (n) => `丢掉 √(2πn) 不是「稍差一点」：n = ${Math.max(2, n)} 时低估 ${num(factorial(Math.max(2, n)) / Math.pow(Math.max(2, n) / Math.E, Math.max(2, n)), 4)} 倍，且倍数随 n 增长（~√(2πn)）。`,
  },
];

export const stirlingApprox: VizSpec = {
  module: 'stirling-approx',
  title: 'Stirling 的适用条件与翻车现场',
  modes: stirlingModes,
};

/* -------------------------------------------- B2.2 double-origin-line */

const doubleOriginModes: VizMode[] = [
  {
    key: 'double-limit',
    label: '序列同时收敛到两个原点',
    n: { min: 4, max: 60, step: 1, init: 20 },
    draw(n) {
      const N = Math.max(4, Math.round(n));
      const eps = 0.05;
      const tail = Math.ceil(1 / eps);
      const pts = range(1, Math.min(50, N)).map((k) => ({ x: 1 / k, y: 0.5, r: 3, fill: k >= tail ? C.green : C.violet }));
      return {
        view: { x0: -0.02, x1: 1.02, y0: -0.2, y1: 1.1 },
        rects: [{ x: -eps, y: -0.05, w: 2 * eps, h: 0.1, fill: 'rgba(74,222,128,.22)' }],
        curves: [{ f: (x) => (x > 0 ? 1 / x : NaN), color: C.cyan, width: 2.4 }],
        segs: [
          { x0: -eps, y0: 0, x1: -eps, y1: 1, color: C.green, width: 1.4, dash: [4, 4] },
          { x0: eps, y0: 0, x1: eps, y1: 1, color: C.green, width: 1.4, dash: [4, 4] },
        ],
        points: [...pts, { x: 0, y: 0.42, r: 6, fill: C.fg, stroke: C.cyan, label: 'O₁' }, { x: 0, y: 0.68, r: 6, fill: C.fg, stroke: C.violet, label: 'O₂' }],
        labels: [{ text: 'ε = 0.05 邻域', x: eps + 0.02, y: 0.92, color: C.green }],
        axis: { x: '1/k', y: '' },
      };
    },
    readout(n) {
      const N = Math.max(4, Math.round(n));
      const eps = 0.05;
      const tailStart = Math.ceil(1 / eps);
      const outside = range(1, N).filter((k) => 1 / k >= eps).length;
      return [
        { label: '序列 x_k = 1/k', value: '' },
        { label: 'ε = 0.05 时尾部起点 k > 1/ε', value: String(tailStart) },
        { label: '落在 ε-邻域外的项数', value: String(outside) },
        { label: '可作极限的原点数', value: '2（O₁ 与 O₂）', verdict: 'fail' },
      ];
    },
    invariant(n) {
      const N = Math.max(4, Math.round(n));
      const eps = 0.05;
      // 恒等式：{k ≤ N : |1/k| ≥ ε} 的个数 = ⌈1/ε⌉ − 1（有限）
      const outside = range(1, N).filter((k) => 1 / k >= eps).length;
      // {k : 1/k ≥ ε} = {k ≤ 1/ε}，所以个数是 min(N, ⌊1/ε⌋)（边界 1/ε 本身要算进去）
      const exact = Math.max(0, Math.min(N, Math.floor(1 / eps)));
      return { label: '邻域外项数 ≡ min(N, ⌊1/ε⌋)', expected: exact, actual: outside, tol: 0 };
    },
    note: () => '直线带两个原点：任何收敛到 0 的序列同时收敛到 O₁ 和 O₂ —— ε-邻域语言里根本区分不出它们。极限不唯一 ⟹ 非 Hausdorff。',
  },
  {
    key: 'continuous-functions',
    label: '连续 vs 序列连续的缺口',
    n: { min: 1, max: 20, step: 1, init: 8 },
    draw() {
      return {
        view: { x0: -0.02, x1: 1.02, y0: -0.2, y1: 1.4 },
        curves: [{ f: (x) => (x > 0 ? 1 / x : NaN), color: C.cyan, width: 2.4 }],
        points: [
          { x: 0, y: 0.4, r: 6, fill: C.fg, stroke: C.cyan, label: 'O₁: f = 1' },
          { x: 0, y: 0.75, r: 6, fill: C.fg, stroke: C.violet, label: 'O₂: f = 2' },
        ],
        labels: [{ text: '沿 1/k → 两个原点，读出两个不同的「极限」', x: 0.12, y: 1.3, color: C.yellow }],
        axis: { x: '', y: '' },
      };
    },
    readout() {
      return [
        { label: 'f(O₁)', value: '1' },
        { label: 'f(O₂)', value: '2' },
        { label: '沿 1/k 的候选极限值', value: '{1, 2}' },
        { label: '两个候选值的差', value: '1', verdict: 'fail' },
      ];
    },
    invariant() {
      // 恒等式：两个候选极限值不相等
      return { label: '两候选极限之差 ≠ 0', expected: 1, actual: Math.abs(2 - 1), tol: 0 };
    },
    note: () => '序列刻画连续性在非 Hausdorff 空间里失效：同一列点给出两个不同的极限值，于是「极限唯一」这条基石塌了。',
  },
];

export const doubleOriginLine: VizSpec = {
  module: 'double-origin-line',
  title: '非 Hausdorff 直线：极限不唯一',
  modes: doubleOriginModes,
};

export const sequenceSpecs: VizSpec[] = [
  sumTelescoping,
  recurrenceCobweb,
  limitToolkit,
  classicLimits,
  taylorApprox,
  stirlingApprox,
  doubleOriginLine,
];

export const sequenceHelpers = { stirlingRemainder, taylorSeries, trapz, maxAbs };
