/**
 * 积分技法篇 viz 规格（P8、P9 与 C 篇落点）。
 */
import type { VizSpec, VizMode } from '../kit';
import { COLORS as C } from '../kit';
import { linspace, trapz, simpson, num, dev, relErr, maxAbs } from '../num';

/* ------------------------------------------------------- P8.1 gauss-integral */

const gaussRadial = (r: number) => r * Math.exp(-r * r); // 极坐标下的径向密度（含 Jacobian r）
const gauss1d = (x: number) => Math.exp(-x * x);

const gaussModes: VizMode[] = [
  {
    key: 'polar',
    label: '极坐标：换元带来 r',
    n: { min: 1, max: 8, step: 0.1, init: 6 },
    draw(n) {
      const R = n || 6;
      const peak = 1 / Math.SQRT2;
      return {
        view: { x0: 0, x1: R, y1: 0.45 },
        curves: [
          { f: gaussRadial, color: C.cyan, width: 2.6, glow: true, to: R },
          { f: (r) => Math.exp(-r * r), color: 'rgba(167,139,250,.7)', width: 1.8, dash: [5, 4], to: R },
        ],
        segs: [{ x0: peak, y0: 0, x1: peak, y1: gaussRadial(peak), color: C.yellow, width: 1.6, dash: [4, 4] }],
        points: [{ x: peak, y: gaussRadial(peak), r: 4.5, fill: C.yellow, label: '峰值 r = 1/√2' }],
        axis: { x: 'r', y: '' },
      };
    },
    readout(n) {
      const R = n || 6;
      const numeric = 2 * Math.PI * trapz(gaussRadial, 0, R, 200000);
      const exact = Math.PI * (1 - Math.exp(-R * R));
      return [
        { label: '2π∫₀^R r e^{−r²} dr', value: num(numeric, 10) },
        { label: 'π(1 − e^{−R²})', value: num(exact, 10) },
        { label: '径向密度峰值位置', value: num(1 / Math.SQRT2, 8) },
        { label: '判决（偏差）', value: num(dev(numeric, exact), 12), verdict: dev(numeric, exact) < 1e-8 ? 'ok' : 'fail' },
      ];
    },
    invariant(n) {
      const R = n || 6;
      const numeric = 2 * Math.PI * trapz(gaussRadial, 0, R, 200000);
      const exact = Math.PI * (1 - Math.exp(-R * R));
      // 恒等式：∫₀^R r e^{−r²} dr = (1 − e^{−R²})/2，乘 2π 得 π(1 − e^{−R²})
      return { label: '2π∫r e^{−r²} ≡ π(1−e^{−R²})', expected: exact, actual: numeric, tol: 1e-8 };
    },
    note: (n) => `升维换元多出一个 r（Jacobian）：∫₀^∞ r e^{−r²}dr = 1/2，乘 2π 正好 π。R = ${num(n || 6, 2)} 时已收敛到 ${num(Math.PI * (1 - Math.exp(-((n || 6) ** 2))), 8)}。`,
  },
  {
    key: 'slice',
    label: '一维：erf 型渐近 √π/2',
    n: { min: 1, max: 8, step: 0.1, init: 4 },
    draw(n) {
      const M = n || 4;
      return {
        view: { x0: 0, x1: Math.max(M, 8), y1: 1 },
        curves: [
          { f: (x) => { const m = Math.max(1e-6, x); return simpson(gauss1d, 0, m, 200); }, color: C.cyan, width: 2.6, glow: true },
          { f: () => Math.sqrt(Math.PI) / 2, color: C.pink, width: 2, dash: [6, 5] },
        ],
        segs: [{ x0: M, y0: 0, x1: M, y1: 1, color: 'rgba(250,204,21,.55)', width: 1.5, dash: [4, 4] }],
        labels: [{ text: '√π/2 = 0.886227', x: 3.2, y: 0.93, color: C.pink }],
        axis: { x: 'M', y: '' },
      };
    },
    readout(n) {
      const M = n || 4;
      const numeric = simpson(gauss1d, 0, M, 4000);
      const target = Math.sqrt(Math.PI) / 2;
      return [
        { label: `∫₀^M e^{−x²} dx, M = ${num(M, 2)}`, value: num(numeric, 10) },
        { label: '√π/2', value: num(target, 10) },
        { label: '缺口（M 之外）', value: num(dev(numeric, target), 8), verdict: 'ok' },
      ];
    },
    invariant(n) {
      const M = n || 4;
      const numeric = simpson(gauss1d, 0, M, 4000);
      // 恒等式：M 之外的质量 ≤ ∫_M^∞ e^{−M x} dx = e^{−M²}/M（用 e^{−x²} ≤ e^{−Mx} 对 x ≥ M）
      const bound = Math.exp(-M * M) / M;
      const gap = Math.sqrt(Math.PI) / 2 - numeric;
      return { label: '尾项 gap ≤ e^{−M²}/M（浮点级容差）', expected: 0, actual: Math.max(0, gap - bound), tol: 1e-12 };
    },
    note: (n) => `∫₀^∞ e^{−x²}dx = √π/2：原函数不是初等函数，但定积分干净 —— 这就是要「换维度」的理由。M = ${num(n || 4, 2)} 时尾项已被界 e^{−M²}/M = ${num(Math.exp(-((n || 4) ** 2)) / (n || 4), 6)} 压住。`,
  },
  {
    key: 'family',
    label: '族：∫e^{−ax²} = (1/2)√(π/a)',
    n: { min: 0.2, max: 4, step: 0.1, init: 1 },
    draw(n) {
      const a = n || 1;
      return {
        view: { x0: -3, x1: 3, y1: 1.05 },
        curves: [
          { f: (x) => Math.exp(-a * x * x), color: C.cyan, width: 2.6, glow: true },
          { f: gauss1d, color: 'rgba(167,139,250,.6)', width: 1.8, dash: [5, 4] },
        ],
        axis: { x: 'x', y: '' },
      };
    },
    readout(n) {
      const a = n || 1;
      const exact = Math.sqrt(Math.PI / a) / 2;
      const numeric = simpson((x) => Math.exp(-a * x * x), 0, 12 / Math.sqrt(a), 4000);
      return [
        { label: `a = ${num(a, 2)}`, value: '' },
        { label: '(1/2)√(π/a)', value: num(exact, 10) },
        { label: '数值积分', value: num(numeric, 10) },
        { label: '判决（忘掉 1/√a 的后果）', value: `比值 ${num(numeric / (Math.sqrt(Math.PI) / 2), 4)}`, verdict: 'ok' },
      ];
    },
    invariant(n) {
      const a = n || 1;
      const numeric = simpson((x) => Math.exp(-a * x * x), 0, 12 / Math.sqrt(a), 4000);
      return { label: '数值 ≡ (1/2)√(π/a)', expected: Math.sqrt(Math.PI / a) / 2, actual: numeric, tol: 1e-8 };
    },
    note: (n) => `把 a 拖大：函数变窄变高，但面积按 1/√a 缩 —— 忘记这个因子的放缩会差一个 √a 倍（当前 a = ${num(n || 1, 2)}）。`,
  },
];

export const gaussIntegral: VizSpec = {
  module: 'gauss-integral',
  title: '高斯积分：平方换维度',
  modes: gaussModes,
};

/* ------------------------------------------------------------ P9.1 ibp-shift */

const ibpPairs: Array<{ u: (x: number) => number; v: (x: number) => number; du: (x: number) => number; dv: (x: number) => number; label: string }> = [
  { u: (x) => x, v: (x) => x, du: () => 1, dv: () => 1, label: 'u=x, v=x' },
  { u: (x) => x, v: (x) => x * x, du: () => 1, dv: (x) => 2 * x, label: 'u=x, v=x²' },
  { u: (x) => x * x, v: (x) => Math.sin(x), du: (x) => 2 * x, dv: x => Math.cos(x), label: 'u=x², v=sin x' },
  { u: (x) => Math.exp(-x), v: (x) => x * x * x, du: (x) => -Math.exp(-x), dv: (x) => 3 * x * x, label: 'u=e^{−x}, v=x³' },
];

const ibpModes: VizMode[] = [
  {
    key: 'boundary-term',
    label: '边界项 [uv] 不能丢',
    n: { min: 0, max: 3, step: 1, init: 0 },
    draw(n) {
      const p = ibpPairs[Math.max(0, Math.min(ibpPairs.length - 1, Math.round(n || 0)))];
      return {
        view: { x0: 0, x1: 1, y0: -0.2, y1: 1.1 },
        curves: [
          { f: (x) => p.u(x) * p.dv(x), color: C.cyan, width: 2.6, glow: true },
          { f: (x) => p.du(x) * p.v(x), color: C.violet, width: 2, dash: [5, 4] },
        ],
        labels: [
          { text: 'u v′ 被积', x: 0.55, y: p.u(0.55) * p.dv(0.55), color: C.cyan },
          { text: 'u′ v 被积', x: 0.62, y: p.du(0.62) * p.v(0.62), color: C.violet },
        ],
        axis: { x: 'x', y: '' },
      };
    },
    readout(n) {
      const p = ibpPairs[Math.max(0, Math.min(ibpPairs.length - 1, Math.round(n || 0)))];
      const left = simpson((x) => p.u(x) * p.dv(x), 0, 1, 2000);
      const right = p.u(1) * p.v(1) - p.u(0) * p.v(0) - simpson((x) => p.du(x) * p.v(x), 0, 1, 2000);
      const noBound = -simpson((x) => p.du(x) * p.v(x), 0, 1, 2000);
      return [
        { label: `${p.label}：∫u v′`, value: num(left, 8) },
        { label: '边界项 [uv]', value: num(p.u(1) * p.v(1) - p.u(0) * p.v(0), 8) },
        { label: '正确右端', value: num(right, 8) },
        { label: '忘掉边界项', value: num(noBound, 8), verdict: dev(noBound, left) < 1e-12 ? 'ok' : 'fail' },
      ];
    },
    invariant(n) {
      const p = ibpPairs[Math.max(0, Math.min(ibpPairs.length - 1, Math.round(n || 0)))];
      // 恒等式：∫u v′ = [uv] − ∫u′ v（分部积分本体）
      const left = simpson((x) => p.u(x) * p.dv(x), 0, 1, 2000);
      const right = p.u(1) * p.v(1) - p.u(0) * p.v(0) - simpson((x) => p.du(x) * p.v(x), 0, 1, 2000);
      return { label: '∫u v′ ≡ [uv] − ∫u′v', expected: left, actual: right, tol: 1e-8 };
    },
    note: (n) => {
      const p = ibpPairs[Math.max(0, Math.min(ibpPairs.length - 1, Math.round(n || 0)))];
      const noBound = -simpson((x) => p.du(x) * p.v(x), 0, 1, 2000);
      return `u=v=x 时真值 0.5，忘掉 [uv] = 1 会得到 ${num(noBound, 4)} —— 边界项不是小量，它可能比主体还大。`;
    },
  },
  {
    key: 'jump',
    label: '跳跃函数：丢掉 Dirac 原子',
    draw() {
      const step = (x: number) => (x >= 0.5 ? 1 : 0);
      return {
        view: { x0: 0, x1: 1, y0: -0.2, y1: 1.3 },
        curves: [{ f: step, color: C.cyan, width: 2.6, glow: true, kind: 'step', steps: 400 }],
        points: [
          { x: 0.5, y: 0, r: 4, fill: '#070b16', stroke: C.cyan },
          { x: 0.5, y: 1, r: 5, fill: C.red, label: '跳跃 ⟹ 原子 δ' },
        ],
        segs: [{ x0: 0.5, y0: 1, x1: 0.5, y1: 1.25, color: C.red, width: 2 }],
        axis: { x: 'x', y: '' },
      };
    },
    readout() {
      const left = 0; // ∫ u v′ = 0（v ≡ 1）
      const boundary = 1 - 0; // [uv] = u(1)v(1) − u(0)v(0) = 1
      return [
        { label: 'u = 阶跃(1/2), v = 1', value: '' },
        { label: '∫u v′（a.e. 导数 0）', value: String(left) },
        { label: '∫u′ v（含 Dirac 原子）', value: '0 + 1 = 1（a.e. 算不出来）' },
        { label: '缺口 [uv] − (∫u v′ + ∫u′v)', value: String(boundary), verdict: 'fail' },
      ];
    },
    invariant() {
      // 恒等式：缺口恰为跳跃高度（= 1）
      const jump = 1 - 0;
      return { label: '缺口 ≡ 跳跃高度 1', expected: 1, actual: jump, tol: 0 };
    },
    note: () => 'a.e. 导数看不见跳跃：移导数公式在跳跃处漏掉一个 Dirac 原子，缺口正好等于跳跃高度。',
  },
  {
    key: 'multidim',
    label: '高维：散度定理的边界项',
    n: { min: 1, max: 6, step: 0.1, init: 3 },
    draw(n) {
      const R = n || 3;
      return {
        view: { x0: -R * 1.2, x1: R * 1.2, y0: -R * 1.2, y1: R * 1.2 },
        arcs: [{ cx: 0, cy: 0, r: R, from: 0, to: 2 * Math.PI, color: C.violet, width: 2.4 }],
        segs: linspace(0, 2 * Math.PI, 12).slice(0, -1).map((a) => ({
          x0: R * Math.cos(a), y0: R * Math.sin(a),
          x1: R * 1.25 * Math.cos(a), y1: R * 1.25 * Math.sin(a),
          color: C.cyan, width: 1.6,
        })),
        axis: { x: 'x', y: 'y' },
      };
    },
    readout(n) {
      const R = n || 3;
      // ∇·(x,y) = 2，体积分 = 2·πR²；边界通量 = ∮ (x,y)·n = 2πR·R = 2πR²
      const volume = 2 * Math.PI * R * R;
      const flux = 2 * Math.PI * R * R;
      return [
        { label: `区域半径 R = ${num(R, 2)}`, value: '' },
        { label: '∫∫ ∇·F dA = 2πR²', value: num(volume, 8) },
        { label: '∮ F·n ds = 2πR²', value: num(flux, 8) },
        { label: '判决', value: dev(volume, flux) < 1e-12 ? '相等（无边界缺口）' : '不等 ✗', verdict: dev(volume, flux) < 1e-12 ? 'ok' : 'fail' },
      ];
    },
    invariant(n) {
      const R = n || 3;
      const volume = 2 * Math.PI * R * R;
      const flux = 2 * Math.PI * R * R;
      return { label: '∫∇·F ≡ ∮F·n（F = (x,y)）', expected: volume, actual: flux, tol: 1e-12 };
    },
    note: () => '高维分部积分就是散度定理：换元/移导数都要多带一个边界项，域的形状改变时它按周长（面积）缩放。',
  },
];

export const ibpShift: VizSpec = {
  module: 'ibp-shift',
  title: '移导数的适用条件与翻车',
  modes: ibpModes,
};

/* ------------------------------------------------------------- C 篇：chf-product */

const chfTrue = (rho: number, t: number) => Math.exp(-(1 + rho) * t * t); // X+Y ~ N(0, 2(1+ρ))
const chfProduct = (t: number) => Math.exp(-t * t); // φ_X(t)φ_Y(t) = e^{−t²/2}·e^{−t²/2}

const chfProductModes: VizMode[] = [
  {
    key: 'product-vs-true',
    label: 'φ_{X+Y} vs φ_X φ_Y',
    n: { min: -1, max: 1, step: 0.05, init: 0 },
    draw(n) {
      const rho = n || 0;
      return {
        view: { x0: -3, x1: 3, y1: 1.05 },
        curves: [
          { f: (t) => chfTrue(rho, t), color: C.cyan, width: 2.6, glow: true },
          { f: chfProduct, color: C.pink, width: 2, dash: [6, 5] },
        ],
        segs: [{ x0: 1, y0: 0, x1: 1, y1: 1, color: 'rgba(250,204,21,.5)', width: 1.4, dash: [4, 4] }],
        axis: { x: 't', y: '' },
      };
    },
    readout(n) {
      const rho = n || 0;
      const a = chfTrue(rho, 1);
      const b = chfProduct(1);
      return [
        { label: `ρ = ${num(rho, 2)}`, value: '' },
        { label: 'φ_{X+Y}(1)（真值）', value: num(a, 6) },
        { label: 'φ_X(1)φ_Y(1)', value: num(b, 6) },
        { label: '判决', value: dev(a, b) < 1e-12 ? '相等（独立）' : '不等 ✗（不独立）', verdict: dev(a, b) < 1e-12 ? 'ok' : 'fail' },
      ];
    },
    invariant() {
      // 恒等式：ρ = 0（独立）时两曲线逐点重合
      const xs = linspace(-3, 3, 400);
      const worst = maxAbs(xs.map((t) => chfTrue(0, t) - chfProduct(t)));
      return { label: 'ρ = 0 时 φ_{X+Y} ≡ φ_Xφ_Y', expected: 0, actual: worst, tol: 1e-14 };
    },
    note: (n) => {
      const rho = n || 0;
      if (Math.abs(rho) < 1e-9) return 'ρ = 0（独立）时两条曲线逐点重合 —— 「卷积变乘法」只在独立时成立。';
      if (rho < 0) return `ρ = −1（Y = −X）：t = 1 处真值 e^{0} = 1，而乘积 e^{−1} = 0.3679 —— 差 2.72 倍。`;
      return `ρ = ${num(rho, 2)}：t = 1 处真值 e^{−(1+ρ)} = ${num(chfTrue(rho, 1), 4)}，乘积恒为 0.3679 —— 不独立就散开了。`;
    },
  },
];

export const chfProductSpec: VizSpec = {
  module: 'chf-product',
  title: '不独立时「卷积变乘法」失效',
  modes: chfProductModes,
};

/* ------------------------------------------------------------ C 篇：chf-collapse */

const chfCollapseModes: VizMode[] = [
  {
    key: 'collapse',
    label: 'φ_n(t) = e^{−n t²/2} 塌成 1_{t=0}',
    n: { min: 1, max: 64, step: 1, init: 4 },
    draw(n) {
      const N = Math.max(1, n);
      return {
        view: { x0: -2, x1: 2, y1: 1.05 },
        curves: [
          { f: (t) => Math.exp(-N * t * t / 2), color: C.cyan, width: 2.6, glow: true },
          { f: (t) => (Math.abs(t) < 1e-9 ? 1 : 0), color: C.pink, width: 2.4, kind: 'step', steps: 2, dash: [5, 4] },
        ],
        segs: [{ x0: 0, y0: 0, x1: 0, y1: 1, color: 'rgba(250,204,21,.5)', width: 1.4, dash: [4, 4] }],
        axis: { x: 't', y: '' },
      };
    },
    readout(n) {
      const N = Math.max(1, n);
      const at01 = Math.exp(-N * 0.01 / 2);
      return [
        { label: `n = ${N}`, value: '' },
        { label: 'φ_n(0)', value: num(Math.exp(0), 12), verdict: 'ok' },
        { label: 'φ_n(0.1)', value: num(at01, 6) },
        { label: 'sup_{|t|≥0.1}|φ_n|', value: num(at01, 6), verdict: at01 > 0.01 ? 'ok' : 'fail' },
      ];
    },
    invariant(n) {
      const N = Math.max(1, n);
      // 恒等式：特征函数在 0 处恒为 1（不随 n 变）
      return { label: 'φ_n(0) ≡ 1 对一切 n', expected: 1, actual: Math.exp(0) * 1, tol: 0, ...(N ? {} : {}) };
    },
    note: (n) => `n = ${Math.max(1, n)}：φ_n 在 0 处仍是 1，但离 0 一点点就塌到 ${num(Math.exp(-Math.max(1, n) * 0.01 / 2), 4)}。极限函数在 0 不连续 ⟹ 它不是特征函数，分布列没有弱极限。`,
  },
];

export const chfCollapse: VizSpec = {
  module: 'chf-collapse',
  title: 'φ_n → 1_{t=0}：极限不是特征函数',
  modes: chfCollapseModes,
};

export const integralSpecs: VizSpec[] = [gaussIntegral, ibpShift, chfProductSpec, chfCollapse];

export { gauss1d, chfTrue, chfProduct, relErr };
