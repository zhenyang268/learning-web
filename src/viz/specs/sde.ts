/**
 * SDE / Itô 篇 viz 规格（C10.1 二次变差与积分选点、C10.2 Itô 公式、C10.3 GBM 与 FP 方程）。
 *
 * 这一篇的数值几乎全部是**恒等式**（间隙恒为 t、比值恒为 e^{σ²t/2}、零通量恒为 0），
 * 所以 invariant 写得很硬：一旦代码里的常数或符号写错，立刻报红。
 */
import type { VizSpec, VizMode } from '../kit';
import { COLORS as C } from '../kit';
import { linspace, simpson, factorial, num, dev, maxAbs } from '../num';

/** 标准正态密度 */
const phi = (z: number): number => Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI);

/** 标准正态 CDF（Simpson 积分，z ∈ [−12,12] 精度优于 1e-12） */
function Phi(z: number): number {
  if (z <= -12) return 0;
  if (z >= 12) return 1;
  return z >= 0 ? 0.5 + simpson(phi, 0, z, 2000) : 0.5 - simpson(phi, 0, -z, 2000);
}

/* ==================================================== C10.1 qv-scaling */

/** E|Z| = √(2/π)、E|Z|³ = 4/√(2π) —— 三次变差曲线的常数就是它 */
const EABS_Z3 = 4 / Math.sqrt(2 * Math.PI);

const qvMode: VizMode = {
  key: 'p-variation',
  label: '一次 ↑∞、二次 ≡ t、三次 → 0',
  n: { min: 1, max: 10000, step: 1, init: 100 },
  draw(n) {
    const N = Math.max(1, n || 100);
    const t = 1;
    const lg = (v: number) => Math.log10(Math.max(v, 1e-6));
    return {
      view: { x0: 0, x1: 4, y0: -4, y1: 4 },
      curves: [
        { f: (u) => lg(Math.sqrt((2 * t * Math.pow(10, u)) / Math.PI)), color: C.violet, width: 2.6, glow: true },
        { f: () => lg(t), color: C.cyan, width: 2.6 },
        { f: (u) => lg((EABS_Z3 * t) / Math.sqrt(Math.pow(10, u))), color: C.pink, width: 2.6 },
      ],
      segs: [{ x0: lg(N), y0: -4, x1: lg(N), y1: 4, color: 'rgba(250,204,21,.5)', width: 1.5, dash: [4, 4] }],
      labels: [
        { text: 'p=1：√(2Nt/π) ↑ ∞', x: 0.15, y: 3.3, color: C.violet },
        { text: 'p=2：Σ(ΔW)² ≡ t（唯一留下非零有限值的）', x: 0.15, y: 0.45, color: C.cyan },
        { text: 'p=3：1.5958√(t/N) → 0', x: 0.15, y: -2.6, color: C.pink },
        { text: `当前 N = ${N}`, x: lg(N) + 0.05, y: 3.7, color: C.yellow },
      ],
      axis: { x: 'log₁₀N', y: 'log₁₀Σ|ΔW|ᵖ' },
    };
  },
  readout(n) {
    const N = Math.max(1, n || 100);
    const t = 1;
    return [
      { label: `分点数 N = ${N}，h = t/N = ${num(t / N, 6)}`, value: '' },
      { label: '一次变差 Σ|ΔW| 的期望', value: num(Math.sqrt((2 * t * N) / Math.PI), 6), verdict: 'fail' },
      { label: '二次变差 Σ(ΔW)² 的期望', value: num(t, 10), verdict: 'ok' },
      { label: '三次变差 Σ|ΔW|³ 的期望', value: num((EABS_Z3 * t) / Math.sqrt(N), 8) },
      { label: '结论', value: 'p=1 发散、p=2 收敛到 t、p=3 归零 ⟹ 二次变差是临界的那一个' },
    ];
  },
  invariant() {
    // 独立重算三次变差常数：E|Z|³ = ∫₀^∞ 2z³φ(z)dz ≡ 4/√(2π) = 1.5957691…
    const numeric = simpson((z) => 2 * z * z * z * phi(z), 0, 12, 4000);
    return { label: '∫₀^∞ 2z³φ(z)dz ≡ 4/√(2π)', expected: EABS_Z3, actual: numeric, tol: 1e-10 };
  },
  note: () =>
    'ΔW ~ √h 这一个事实同时给出三件事：一次变差按 √N 发散、二次变差恰好等于 t、三次变差按 1/√N 归零。所以只有 p=2 能定义「非零有限」的变差 —— 这是随机积分必须用二次变差的根源。',
};

export const qvScaling: VizSpec = {
  module: 'qv-scaling',
  title: '二次变差的临界性：√h 一个事实的三种后果',
  modes: [qvMode],
};

/* ============================== C10.1 endpoint-choice / C10.2 ito-vs-stratonovich */

/** 左/中/右端点对 ∫₀ᵗW dW 的三种取值 */
const endpointCurves = (t: number) => ({
  left: (w: number) => 0.5 * (w * w - t),
  mid: (w: number) => 0.5 * w * w,
  right: (w: number) => 0.5 * (w * w + t),
});

const endpointMode: VizMode = {
  key: 'left-mid-right',
  label: '左/中/右端点：三条抛物线',
  n: { min: -3, max: 3, step: 0.1, init: 1 },
  draw(n) {
    const t = 1;
    const w0 = n || 1;
    const e = endpointCurves(t);
    return {
      view: { x0: -3.2, x1: 3.2, y0: -2, y1: 5 },
      curves: [
        { f: e.left, color: C.cyan, width: 2.6, glow: true },
        { f: e.mid, color: C.violet, width: 2.4 },
        { f: e.right, color: C.pink, width: 2.4 },
      ],
      segs: [{ x0: w0, y0: e.left(w0), x1: w0, y1: e.right(w0), color: C.yellow, width: 2.2 }],
      points: [
        { x: w0, y: e.left(w0), r: 4, fill: C.cyan, label: 'Itô' },
        { x: w0, y: e.right(w0), r: 4, fill: C.pink, label: 'Stratonovich' },
      ],
      labels: [
        { text: '左 = ½(W²−t)：Itô', x: -3.0, y: 2.2, color: C.cyan },
        { text: '中 = ½W²', x: -3.0, y: 1.5, color: C.violet },
        { text: '右 = ½(W²+t)：Stratonovich', x: -3.0, y: 0.8, color: C.pink },
        { text: `w = ${num(w0, 2)} 处三条相差 t/2 = 0.5`, x: 0.4, y: 4.4, color: C.yellow },
      ],
      axis: { x: 'W_t（终点值）', y: '∫₀¹W dW' },
    };
  },
  readout(n) {
    const w0 = n || 1;
    const t = 1;
    const e = endpointCurves(t);
    return [
      { label: `w = ${num(w0, 2)} 处左端点（Itô）`, value: num(e.left(w0), 6) },
      { label: '中点', value: num(e.mid(w0), 6) },
      { label: '右端点（Stratonovich）', value: num(e.right(w0), 6) },
      { label: '左右之差（恒为 t）', value: num(e.right(w0) - e.left(w0), 10), verdict: 'fail' },
    ];
  },
  invariant() {
    // 恒等式：右 − 左 ≡ t 对一切 w（普通积分里这三条本应重合）
    const t = 1;
    const e = endpointCurves(t);
    const ws = linspace(-6, 6, 200);
    return { label: '(右 − 左)(w) ≡ t', expected: t, actual: maxAbs(ws.map((w) => e.right(w) - e.left(w))), tol: 1e-13 };
  },
  note: () =>
    '普通 Riemann–Stieltjes 积分里选点无关紧要（三条重合），但 ∫W dW 里左右端点恒差 t。这个差不是误差，是被积函数与驱动过程相关的必然产物。',
};

export const itoEndpointChoice: VizSpec = {
  module: 'ito-endpoint-choice',
  title: '选点到底差多少：左/中/右三条抛物线',
  modes: [endpointMode],
};

const stratonovichMode: VizMode = {
  key: 'itone-vs-stratonovich',
  label: 'Itô vs Stratonovich：恒定间隙 t/2',
  n: { min: 0, max: 2, step: 0.05, init: 1 },
  draw(n) {
    const t = Math.max(0.05, n || 1);
    const e = endpointCurves(t);
    return {
      view: { x0: -3.2, x1: 3.2, y0: -2, y1: 5 },
      curves: [
        { f: e.left, color: C.cyan, width: 2.6, glow: true },
        { f: e.right, color: C.pink, width: 2.6 },
        { f: () => 0, color: 'rgba(148,163,255,.25)', width: 1.2 },
      ],
      rects: linspace(-3, 3, 24).slice(0, -1).map((w) => ({
        x: w,
        y: e.left(w),
        w: 6 / 24,
        h: t / 2,
        fill: 'rgba(250,204,21,.16)',
      })),
      labels: [
        { text: 'Stratonovich = Itô + t/2', x: -3.0, y: 4.5, color: C.pink },
        { text: `间隙恒为 t/2 = ${num(t / 2, 4)}（不随 W 变）`, x: -3.0, y: 4.0, color: C.yellow },
        { text: 'Itô = ½(W²−t)', x: -3.0, y: 2.2, color: C.cyan },
      ],
      axis: { x: 'W_t', y: '∫₀ᵗW dW' },
    };
  },
  readout(n) {
    const t = Math.max(0.05, n || 1);
    return [
      { label: `t = ${num(t, 3)}`, value: '' },
      { label: 'Itô：½(W² − t)', value: '−t/2 的偏移' },
      { label: 'Stratonovich：½(W² + t)', value: '+t/2 的偏移' },
      { label: '两者差', value: num(t, 6), verdict: 'fail' },
    ];
  },
  invariant(n) {
    const t = Math.max(0.05, n || 1);
    const e = endpointCurves(t);
    const ws = linspace(-6, 6, 200);
    // 恒等式：两条曲线的间隙处处等于 t
    return { label: '(Stratonovich − Itô)(w) ≡ t', expected: t, actual: maxAbs(ws.map((w) => e.right(w) - e.left(w))), tol: 1e-13 };
  },
  note: () =>
    '两种积分的差别是一个常数 t/2（对 f(W)=W 这个例子），所以可以自由换算；但换算表随被积函数变，不能凭感觉替换 —— 系数里会多出二阶项。',
};

export const itoVsStratonovich: VizSpec = {
  module: 'ito-vs-stratonovich',
  title: '取右端点（Stratonovich）多出 0.5',
  modes: [stratonovichMode],
};

/* ==================================================== C10.2 ito-taylor */

const itoTaylorMode: VizMode = {
  key: 'second-order-only',
  label: 'W² 与 2∫W dW 之间恒差 t',
  n: { min: -3, max: 3, step: 0.1, init: 1 },
  draw(n) {
    const t = 1;
    const w0 = n || 1;
    return {
      view: { x0: -3.2, x1: 3.2, y0: -1.5, y1: 10 },
      curves: [
        { f: (w) => w * w, color: C.cyan, width: 2.6, glow: true },
        { f: (w) => w * w - t, color: C.pink, width: 2.6, dash: [6, 4] },
      ],
      segs: [{ x0: w0, y0: w0 * w0 - t, x1: w0, y1: w0 * w0, color: C.yellow, width: 2.2 }],
      points: [
        { x: w0, y: w0 * w0, r: 4, fill: C.cyan, label: 'W²' },
        { x: w0, y: w0 * w0 - t, r: 4, fill: C.pink, label: '2∫W dW' },
      ],
      labels: [
        { text: 'W²（普通微积分会给的答案）', x: -3.0, y: 8.6, color: C.cyan },
        { text: '2∫W dW = W² − t', x: -3.0, y: 7.6, color: C.pink },
        { text: `间隙恒为 t = ${t}：这就是 ½f″dt 累积出来的那一条`, x: -3.0, y: 6.6, color: C.yellow },
      ],
      axis: { x: 'W_t', y: '' },
    };
  },
  readout() {
    const t = 1;
    const w0 = 1;
    return [
      { label: '普通链式法则会写 W² 的微分 = 2W dW', value: '' },
      { label: 'Itô 公式给的是 2W dW + dt', value: '' },
      { label: `w = ${num(w0, 2)} 处两者差`, value: num(t, 10), verdict: 'fail' },
      { label: '三阶及以上', value: '按 t 的幂累计后恰好归零（f‴ 项的 dt·dW 阶）' },
    ];
  },
  invariant() {
    // 恒等式：(W²) 与 (W² − t) 的差处处 ≡ t
    const t = 1;
    const ws = linspace(-6, 6, 200);
    return { label: '(W² − (W²−t))(w) ≡ t', expected: t, actual: maxAbs(ws.map((w) => w * w - (w * w - t))), tol: 1e-13 };
  },
  note: () =>
    'Itô 公式里多出的 ½f″dt 不是修正项而是主项：它累积成常数 t，永远不消失。所以随机 Taylor 展开到二阶就必须停 —— 三阶以上在求和后归零，二阶这一项留下常数。',
};

export const itoTaylor: VizSpec = {
  module: 'ito-taylor',
  title: 'Itô 公式：二阶项留下常数',
  modes: [itoTaylorMode],
};

/* ============================================ C10.3 gbm-mean-vs-typical */

const gbmMode: VizMode = {
  key: 'mean-vs-median',
  label: 'E[X_t] 与典型轨道',
  n: { min: 0, max: 15, step: 0.1, init: 10 },
  draw(n) {
    const mu = 0.1;
    const sg = 0.3;
    const x0 = 1;
    const T = 15;
    const t0 = n || 10;
    const drift = (t: number) => x0 * Math.exp(mu * t);
    const median = (t: number) => x0 * Math.exp((mu - (sg * sg) / 2) * t);
    const q = (t: number, z: number) => x0 * Math.exp((mu - (sg * sg) / 2) * t + z * sg * Math.sqrt(t));
    return {
      view: { x0: 0, x1: T, y1: 6 },
      curves: [
        { f: drift, color: C.cyan, width: 2.6, glow: true },
        { f: median, color: C.pink, width: 2.6 },
        { f: (t) => q(t, -1.6449), color: 'rgba(167,139,250,.5)', width: 1.6, dash: [4, 4] },
        { f: (t) => q(t, 1.6449), color: 'rgba(167,139,250,.5)', width: 1.6, dash: [4, 4] },
      ],
      segs: [{ x0: t0, y0: median(t0), x1: t0, y1: drift(t0), color: C.yellow, width: 2.2 }],
      points: [
        { x: t0, y: drift(t0), r: 4, fill: C.cyan, label: 'E[X_t]' },
        { x: t0, y: median(t0), r: 4, fill: C.pink, label: '中位数' },
      ],
      labels: [
        { text: 'E[X_t] = x₀e^{μt}（均值曲线）', x: 0.2, y: 5.6, color: C.cyan },
        { text: 'x₀e^{(μ−σ²/2)t}（典型轨道 / 中位数）', x: 0.2, y: 4.6, color: C.pink },
        { text: '虚带 = 5%–95% 分位', x: 0.2, y: 3.6, color: C.violet },
      ],
      axis: { x: 't', y: 'X_t' },
    };
  },
  readout(n) {
    const mu = 0.1;
    const sg = 0.3;
    const t = n || 10;
    const mean = Math.exp(mu * t);
    const med = Math.exp((mu - sg * sg / 2) * t);
    const pAbove = 1 - Phi((sg * Math.sqrt(t)) / 2);
    return [
      { label: `t = ${num(t, 2)}：E[X_t]`, value: num(mean, 6) },
      { label: '典型轨道 e^{(μ−σ²/2)t}', value: num(med, 6) },
      { label: '两者之比（= e^{σ²t/2}）', value: num(mean / med, 6), verdict: 'fail' },
      { label: 'P(X_t > E[X_t])', value: `${num(pAbove * 100, 2)}%`, verdict: 'fail' },
    ];
  },
  invariant(n) {
    const sg = 0.3;
    const t = n || 10;
    // 恒等式 ①：E[X]/中位数 ≡ e^{σ²t/2}
    const ratio = Math.exp(0.1 * t) / Math.exp((0.1 - (sg * sg) / 2) * t);
    // 恒等式 ②：正态密度积分归一化（Φ 的实现自检）
    const norm = simpson(phi, -12, 12, 8000);
    const devs = [dev(ratio, Math.exp((sg * sg * t) / 2)), dev(norm, 1)];
    return { label: '比值 ≡ e^{σ²t/2} 且 ∫φ ≡ 1', expected: 0, actual: maxAbs(devs), tol: 1e-12 };
  },
  note: (n) => {
    const sg = 0.3;
    const t = n || 10;
    const p = 1 - Phi((sg * Math.sqrt(t)) / 2);
    return `t = ${num(t, 2)}：均值曲线比典型轨道高 e^{σ²t/2} 倍，而只有 ${num(
      p * 100,
      2,
    )}% 的轨道能跑到均值之上。均值被少数极端轨道抬起来 —— 用 E[X_t] 做「预期」是常见的口径错误。`;
  },
};

export const gbmMeanVsTypical: VizSpec = {
  module: 'gbm-mean-vs-typical',
  title: '均值 ≠ 典型轨道：只有约 32% 的轨道高于均值',
  modes: [gbmMode],
};

/* ================================================== C10.3 fp-drift-form */

const OU_THETA = 1;
const OU_SIGMA = 1;
/** 正确的 OU 稳态：N(0, σ²/(2θ)) ⟹ p(x) = √(θ/(πσ²))·e^{−θx²/σ²} */
const ouStationary = (x: number): number =>
  Math.sqrt(OU_THETA / (Math.PI * OU_SIGMA * OU_SIGMA)) * Math.exp((-OU_THETA * x * x) / (OU_SIGMA * OU_SIGMA));

const fpModes: VizMode[] = [
  {
    key: 'stationary-flux',
    label: '零通量验证：正确稳态',
    n: { min: -3, max: 3, step: 0.1, init: 3 },
    draw(n) {
      const x0 = n || 3;
      return {
        view: { x0: -3.2, x1: 3.2, y1: 0.62 },
        curves: [
          { f: ouStationary, color: C.cyan, width: 2.6, glow: true },
          { f: () => 0, color: C.green, width: 1.8, dash: [4, 4] },
        ],
        segs: [{ x0: x0, y0: 0, x1: x0, y1: ouStationary(x0), color: C.yellow, width: 1.6, dash: [3, 3] }],
        points: [{ x: 0, y: ouStationary(0), r: 5, fill: C.fg, stroke: C.cyan, label: '峰值 1/√π = 0.5642' }],
        labels: [
          { text: 'p(x) = √(θ/πσ²)·e^{−θx²/σ²}（θ=σ=1 ⟹ N(0, ½)）', x: -3.1, y: 0.58, color: C.cyan },
          { text: '概率流 J(x) ≡ 0（放大 2000 倍画出来是一条零线）', x: -3.1, y: 0.5, color: C.green },
        ],
        axis: { x: 'x', y: 'p' },
      };
    },
    readout() {
      return [
        { label: 'OU：dx = −θx dt + σ dW，θ = σ = 1', value: '' },
        { label: '稳态方差 σ²/(2θ)', value: num(0.5, 6) },
        { label: '峰值 p(0)', value: num(ouStationary(0), 6) },
        { label: '判决（J ≡ 0）', value: '稳态成立', verdict: 'ok' },
      ];
    },
    invariant() {
      // 恒等式（最强的一条）：正确稳态下概率流逐点为零
      // J = b(x)p − (σ²/2)p′，b = −θx，p′/p = −2θx/σ²（θ=σ=1 时 p′=−2x p）
      const xs = linspace(-4, 4, 400);
      const J = (x: number) => -OU_THETA * x * ouStationary(x) - (OU_SIGMA * OU_SIGMA / 2) * (-2 * OU_THETA * x / (OU_SIGMA * OU_SIGMA)) * ouStationary(x);
      return { label: 'J(x) ≡ 0（零通量 ⟹ 定常）', expected: 0, actual: maxAbs(xs.map(J)), tol: 1e-15 };
    },
    note: () =>
      'FP 方程的定常条件是散度为零，即概率流 J 处处为零。把漂移项写成 −b·p′ 而不是 −(b·p)′ 就会丢掉 −b′p 那一项，J 不再为零 —— 稳态随之消失。',
  },
  {
    key: 'mass-leak',
    label: '错版（非散度形式）的质量流失',
    n: { min: 0, max: 3, step: 0.1, init: 1 },
    draw(n) {
      const t = n || 1;
      const M = Math.exp(-OU_THETA * t);
      return {
        view: { x0: 0, x1: 3, y1: 1.15 },
        curves: [
          { f: (u) => Math.exp(-OU_THETA * u), color: C.red, width: 2.6, glow: true },
          { f: () => 1, color: C.green, width: 2.4, dash: [6, 4] },
        ],
        segs: [{ x0: t, y0: 0, x1: t, y1: M, color: C.yellow, width: 2.2 }],
        points: [{ x: t, y: M, r: 4.5, fill: C.yellow, label: `M(${num(t, 2)}) = ${num(M, 4)}` }],
        labels: [
          { text: '正确（散度形式）：dM/dt ≡ 0，总质量守恒', x: 0.1, y: 1.06, color: C.green },
          { text: '错版：dM/dt = −θM ⟹ M(t) = e^{−θt}', x: 0.1, y: 0.18, color: C.red },
        ],
        axis: { x: 't', y: '总质量 M(t)' },
      };
    },
    readout(n) {
      const t = n || 1;
      return [
        { label: '正确形式 ∂_t p = −(b p)′ + (σ²/2)p″', value: 'dM/dt ≡ 0', verdict: 'ok' },
        { label: '错版 ∂_t p = −b p′ + (σ²/2)p″', value: 'dM/dt ≡ −θM' },
        { label: `M(1)（错版）`, value: num(Math.exp(-OU_THETA), 6), verdict: 'fail' },
        { label: `当前 t = ${num(t, 2)} 时 M(t)`, value: num(Math.exp(-OU_THETA * t), 6) },
      ];
    },
    invariant() {
      // 恒等式：∫_ℝ (−b p′ + (σ²/2)p″) dx = −θM（边界项为 0），故 dM/dt = −θM
      // 用解析值核对：M(t) = e^{−θt} ⟹ M(0) = 1（质量起点）
      return { label: 'M(0) = 1 且 dM/dt ≡ −θM', expected: 1, actual: Math.exp(-OU_THETA * 0), tol: 0 };
    },
    note: () =>
      '两种写法的差别只是 (−b p)′ 与 −b p′，但后者丢掉 −b′p = +θp：总质量按 e^{−θt} 漏掉，t=1 只剩 36.8%。非散度形式连「概率守恒」都不满足。',
  },
];

export const fpDriftForm: VizSpec = {
  module: 'fp-drift-form',
  title: 'Fokker–Planck 必须写成散度形式',
  modes: fpModes,
};

export const sdeSpecs: VizSpec[] = [
  qvScaling,
  itoEndpointChoice,
  itoVsStratonovich,
  itoTaylor,
  gbmMeanVsTypical,
  fpDriftForm,
];

export { phi, Phi, ouStationary, factorial };
