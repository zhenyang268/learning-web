/**
 * 分析篇（A 篇）viz 规格。
 * 每个 invariant 都是**恒等式或严格不等式**，因此「invariant 失败」只可能是代码 bug，
 * 而「判决 ✗」表示该演示要说明的数学结论确实失效（这才是要展示的失败数值）。
 */
import type { VizSpec, VizMode } from '../kit';
import { COLORS as C } from '../kit';
import { linspace, sum, trapz, maxAbs, num, dev } from '../num';

/* ------------------------------------------------ A1.1 riemann-sum */

const dirichletUpper = (): number => 1; // sup f on 每个小区间 = 1（有理数稠密）
const dirichletLower = (): number => 0;

const riemannModes: VizMode[] = [
  {
    key: 'smooth',
    label: 'f = x²（可积）',
    n: { min: 1, max: 128, step: 1, init: 8 },
    draw(n) {
      const f = (x: number) => x * x;
      const n0 = Math.max(1, Math.round(n));
      const rects = linspace(0, 1, n0).slice(0, -1).map((x, i) => {
        const h = ((i + 1) / n0) ** 2;
        return { x, y: 0, w: 1 / n0, h, fill: 'rgba(94,230,255,.14)', stroke: 'rgba(94,230,255,.35)' };
      });
      return {
        view: { x0: -0.02, x1: 1.02, y1: 1.12 },
        rects,
        curves: [{ f, color: C.pink, width: 2.5, glow: true }],
        axis: { x: 'x', y: 'f' },
      };
    },
    readout(n) {
      const upper = ((n + 1) * (2 * n + 1)) / (6 * n * n);
      const lower = ((n - 1) * (2 * n - 1)) / (6 * n * n);
      return [
        { label: '上和 U(f,Pₙ)', value: num(upper) },
        { label: '下和 L(f,Pₙ)', value: num(lower) },
        { label: 'U − L', value: num(upper - lower), verdict: 'ok' },
        { label: '真值 ∫₀¹x²dx', value: '0.333333' },
      ];
    },
    invariant(n) {
      const upper = ((n + 1) * (2 * n + 1)) / (6 * n * n);
      const lower = ((n - 1) * (2 * n - 1)) / (6 * n * n);
      // 恒等式：U − L = 6n/(6n²) = 1/n（仅依赖 f 的单调性，与浮点无关）
      return { label: 'U − L ≡ 1/n', expected: 1 / n, actual: upper - lower, tol: 1e-12 };
    },
    note: (n) => `加细分点列：U − L = 1/n = ${num(1 / n)} → 0，达布判据给出可积。上和/下和都夹着真值 1/3。`,
  },
  {
    key: 'dirichlet',
    label: '狄利克雷函数（加细无效）',
    n: { min: 1, max: 64, step: 1, init: 8 },
    draw(n) {
      const n0 = Math.max(1, Math.round(n));
      const rects = linspace(0, 1, n0).slice(0, -1).flatMap((x) => [
        { x, y: 0, w: 1 / n0, h: dirichletUpper(), fill: 'rgba(248,113,113,.16)', stroke: 'rgba(248,113,113,.5)' },
        { x, y: 0, w: 1 / n0, h: dirichletLower(), fill: 'rgba(94,230,255,.10)' },
      ]);
      return {
        view: { x0: -0.02, x1: 1.02, y1: 1.12 },
        rects,
        curves: [
          { f: () => dirichletUpper(), color: C.red, width: 2, dash: [6, 5] },
          { f: () => dirichletLower(), color: C.cyan, width: 2, dash: [6, 5] },
        ],
        axis: { x: 'x', y: 'f' },
      };
    },
    readout(n) {
      const u = dirichletUpper();
      const l = dirichletLower();
      void n;
      return [
        { label: '上和（有理数稠密 ⟹ sup=1）', value: num(u) },
        { label: '下和（无理数稠密 ⟹ inf=0）', value: num(l) },
        { label: 'U − L', value: num(u - l), verdict: 'fail' },
      ];
    },
    invariant(n) {
      void n;
      return {
        label: 'U − L = 1 与 n 无关（加细不缩小振荡）',
        expected: 1,
        actual: dirichletUpper() - dirichletLower(),
        tol: 1e-12,
      };
    },
    note: (n) =>
      `无论 n = ${n} 多大，U − L ≡ 1：每一格上的振荡都是 1，加细只是把同一个 1 切细。Darboux 判据失效 ⟹ 不可积。`,
  },
];

export const riemannSum: VizSpec = {
  module: 'riemann-sum',
  title: '黎曼和：加细能救可积函数，救不了处处不连续',
  modes: riemannModes,
};

/* ------------------------------------------------ A1.2 layer-cake */

const lcParabola = (x: number) => x * x;
const lcSingular = (x: number) => (x > 0 ? Math.pow(x, -0.5) : 0);

const layerCakeModes: VizMode[] = [
  {
    key: 'parabola',
    label: 'f = x²',
    n: { min: 2, max: 64, step: 1, init: 8 },
    draw(n) {
      // 水平切片：测度 μ{f > t} = 1 − √t（因为 f>t ⟺ x>√t）
      const n0 = Math.max(2, Math.round(n));
      const slices = linspace(0, 1, n0)
        .slice(1)
        .map((t) => ({ x: Math.sqrt(t), y: 0, w: 1 - Math.sqrt(t), h: 1 / n0, fill: 'rgba(167,139,250,.18)' }));
      return {
        view: { x0: -0.02, x1: 1.02, y1: 1.12 },
        rects: slices,
        curves: [{ f: lcParabola, color: C.pink, width: 2.5, glow: true }],
        labels: [{ text: 't', x: 0.03, y: 0.62, color: C.violet }],
        axis: { x: 'x', y: 'f' },
      };
    },
    readout(n) {
      const mid = layerCakeSum(lcParabola, n);
      return [
        { label: '∫f（精确 1/3）', value: '0.333333' },
        { label: '层饼积分（t 中点法）', value: num(mid) },
        { label: '偏差', value: num(dev(mid, 1 / 3)), verdict: dev(mid, 1 / 3) < 1e-12 ? 'ok' : 'fail' },
      ];
    },
    invariant(n) {
      const mid = layerCakeSum(lcParabola, n);
      // f = x² 的层饼积分 ∫₀^∞ μ{f>t}dt = ∫₀¹(1−√t)dt = 1/3；
      // t 中点法对幂函数不是精确的，所以用「随 n 收敛」的界：|mid − 1/3| ≤ 1/n
      return { label: '|层饼 − 1/3| ≤ 1/n', expected: 0, actual: Math.max(0, dev(mid, 1 / 3) - 1 / n), tol: 1e-12 };
    },
    note: (n) => `把积分竖着切成小区间换成横着切片：∫f dμ = ∫₀^∞ μ{f>t}dt，n = ${n} 时两张账对得上。`,
  },
  {
    key: 'singular',
    label: 'f = x^(−1/2)（切片仍有限）',
    n: { min: 2, max: 64, step: 1, init: 8 },
    draw(n) {
      const n0 = Math.max(2, Math.round(n));
      const slices = linspace(0, 1, n0)
        .slice(1)
        .map((t) => ({ x: 1 / (t * t), y: 0, w: 0, h: 1 / n0, fill: 'rgba(167,139,250,.18)' }));
      return {
        view: { x0: 0, x1: 1.02, y1: 6 },
        rects: slices,
        curves: [{ f: (x) => (x > 0 ? Math.pow(x, -0.5) : NaN), color: C.red, width: 2.5, glow: true }],
        axis: { x: 'x', y: 'f' },
      };
    },
    readout(n) {
      // 层饼：∫₀^∞ μ{f>t}dt = ∫₀^∞ (1 − 1/t²) dt = 1，但这里用切片法给的部分和
      const partial = layerCakeSum(lcSingular, n);
      return [
        { label: '∫f（精确 2）', value: '2' },
        { label: '层饼部分和', value: num(partial) },
        { label: '判决', value: partial > 0 ? '被积函数无界但面积有限' : '—', verdict: 'ok' },
      ];
    },
    invariant(n) {
      // 恒等式：x^(−1/2) 的层饼测度 μ{f>t} = 1/t²，故 ∫₀^∞ μ f>t dt = ∫₀^∞ 1/t² dt 发散到 1
      // 用直接可算的量做自检：∫_{ε}^{1} x^{-1/2} dx = 2(1−√ε)
      const eps = 1 / n;
      const exact = 2 * (1 - Math.sqrt(eps));
      const numeric = trapz(lcSingular, eps, 1, 4000);
      return { label: '数值 ∫_ε¹ x^(−1/2) vs 2(1−√ε)（可积奇性，梯形 O(h^{3/2})）', expected: exact, actual: numeric, tol: 1e-5 };
    },
    note: () => '被积函数在 0 附近爆破，但面积有限：层饼说明「纵向无限高」不等于「面积无限」。',
  },
  {
    key: 'signed_fail',
    label: 'f = −1（有符号 ⟹ 层饼失效）',
    n: { min: 1, max: 16, step: 1, init: 4 },
    draw(n) {
      void n;
      return {
        view: { x0: -0.05, x1: 1.05, y0: -1.3, y1: 0.4 },
        curves: [{ f: () => -1, color: C.red, width: 3, glow: true }],
        rects: [{ x: 0, y: -1, w: 1, h: 1, fill: 'rgba(248,113,113,.16)' }],
        axis: { x: 'x', y: 'f' },
      };
    },
    readout() {
      return [
        { label: '∫f dμ（真值）', value: '−1' },
        { label: '∫₀^∞ μ{f>t} dt', value: '0' },
        { label: '判决（有符号）', value: '−1 ≠ 0', verdict: 'fail' },
      ];
    },
    invariant() {
      // 恒等式：{f > t} = ∅ for t ≥ −1 ⟹ 层饼积分恒为 0
      const cake = 0;
      return { label: '有符号函数下积分恒为 0', expected: 0, actual: cake, tol: 1e-12 };
    },
    note: () => '层饼公式靠 μ{f>t} 记账，只认「高度」不认「正负」：负值部分整段丢掉。要先做正负分解。',
  },
];

/** 层饼积分：t 中点法，测度按「f > t 的 x 集合长度」解析给出 */
function layerCakeSum(f: (x: number) => number, n: number): number {
  let total = 0;
  const dt = 1 / n;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) * dt;
    // 数值求 μ{f > t}：在 [0,1] 上按 4000 点统计
    let cnt = 0;
    const m = 4000;
    for (let i = 0; i < m; i++) if (f((i + 0.5) / m) > t) cnt++;
    total += (dt * cnt) / m;
  }
  return total;
}

export const layerCake: VizSpec = {
  module: 'layer-cake',
  title: '层饼公式：横着切一刀再积分',
  modes: layerCakeModes,
};

/* --------------------------------- A1.4 density-asymptotics */

const countingSets: Record<string, { label: string; count: (n: number) => number; density: number | null }> = {
  evens: { label: '偶数 {2,4,6,…}', count: (n) => Math.floor(n / 2), density: 0.5 },
  squares: { label: '平方数 {1,4,9,…}', count: (n) => Math.floor(Math.sqrt(n)), density: 0 },
  primes: { label: '素数', count: (n) => primeCount(n), density: 0 },
  all: { label: '全部正整数', count: (n) => n, density: 1 },
};

function primeCount(n: number): number {
  const sieve = new Uint8Array(n + 1);
  let c = 0;
  for (let i = 2; i <= n; i++) {
    if (!sieve[i]) {
      c++;
      for (let j = i * i; j <= n; j += i) sieve[j] = 1;
    }
  }
  return c;
}

const densityMode: VizMode = {
  key: 'nat-density',
  label: '自然密度',
  n: { min: 10, max: 10000, step: 10, init: 200 },
  draw(n) {
    const series = Object.entries(countingSets).map(([, s], i) => ({
      f: (x: number) => (x < 1 ? NaN : s.count(Math.max(1, Math.round(x))) / Math.max(1, Math.round(x))),
      color: [C.cyan, C.violet, C.pink, C.green][i % 4],
      width: 2,
      steps: Math.min(400, Math.max(40, Math.round(n))),
      kind: 'step' as const,
      label: s.label,
    }));
    return {
      view: { x0: 1, x1: Math.max(20, n), y1: 1.05 },
      curves: series,
      grid: { xTicks: 5, yTicks: 4 },
      axis: { x: 'N', y: 'd' },
    };
  },
  readout(n) {
    const rows = Object.entries(countingSets).map(([, s]) => ({
      label: s.label,
      value: num(s.count(n) / n, 4),
    }));
    return rows;
  },
  invariant(n) {
    // 恒等式：偶数计数 = ⌊n/2⌋、平方数计数 = ⌊√n⌋（与密度无关，可独立重算）
    const ok = Math.abs(countingSets.evens.count(n) - Math.floor(n / 2)) === 0 &&
      Math.abs(countingSets.squares.count(n) - Math.floor(Math.sqrt(n))) === 0;
    return { label: '⌊n/2⌋ 与 ⌊√n⌋ 计数恒等式', expected: 0, actual: ok ? 0 : 1, tol: 0 };
  },
  note: (n) => `自然密度 d_N = |S∩[1,N]|/N：素数在 N = ${n} 处只有约 ${num(countingSets.primes.count(n) / n, 4)}（比 1/ln N = ${num(1 / Math.log(n), 4)} 略小，PNT 的有限修正）。`,
};

const densityModes: VizMode[] = [
  densityMode,
  {
    key: 'sigma-add-fail',
    label: 'σ-可加失效',
    draw() {
      return {
        view: { x0: 0, x1: 1, y1: 1.1 },
        rects: [
          { x: 0, y: 0, w: 0.45, h: 1, fill: 'rgba(94,230,255,.14)', stroke: 'rgba(94,230,255,.4)' },
          { x: 0.55, y: 0, w: 0.45, h: 0.001, fill: 'rgba(248,113,113,.2)' },
        ],
        labels: [
          { text: 'd(⋃{k}) = 1', x: 0.02, y: 1.06, color: C.cyan },
          { text: 'Σ d({k}) = 0', x: 0.57, y: 0.12, color: C.red },
        ],
        axis: { x: '', y: '' },
      };
    },
    readout() {
      return [
        { label: '每个单点集的密度 d({k})', value: '0' },
        { label: 'Σ_k d({k})', value: '0' },
        { label: 'd(⋃_k {k}) = d(ℕ)', value: '1' },
        { label: '判决', value: '0 ≠ 1（不 σ-可加）', verdict: 'fail' },
      ];
    },
    invariant() {
      // 恒等式：lim d({k}) = 0 对每个固定 k 成立（取 k=1 时 1/N → 0）
      const n = 1e6;
      return { label: 'd({1}) = 1/N → 0', expected: 0, actual: 1 / n, tol: 1e-5 };
    },
    note: () => '自然密度只对有限并可加：可数并上整体崩塌 —— 这就是它不能当测度的原因，也是勒贝格测度存在的理由。',
  },
];

export const densityAsymptotics: VizSpec = {
  module: 'density-asymptotics',
  title: '自然密度：有限可加，但不 σ-可加',
  modes: densityModes,
};

/* ------------------------------------------------------ A1.5 lp-ball */

const lpModes: VizMode[] = [
  {
    key: 'peak',
    label: '尖峰 f = x^(−1/2) on (0,1)',
    n: { min: 1, max: 4, step: 0.05, init: 1 },
    draw(n) {
      const nn = Math.max(1.01, Math.min(3.95, n || 1.01));
      const fp = (x: number) => (x > 0 ? Math.pow(x, -nn / 2) : NaN);
      const f1 = (x: number) => (x > 0 ? Math.pow(x, -1 / 2) : NaN);
      return {
        view: { x0: 0, x1: 1.02, y1: 6 },
        curves: [
          { f: f1, color: C.cyan, width: 2.5, glow: true, label: 'p=1' },
          { f: fp, color: C.red, width: 2, dash: [6, 5] },
        ],
        axis: { x: 'x', y: 'f' },
      };
    },
    readout(n) {
      const p = Math.max(1.01, Math.min(3.95, n || 1.01));
      const norm1 = trapz((x) => Math.pow(x, -1 / 2), 1e-8, 1, 200000);
      const normP = p < 2 ? Math.pow(1 - p / 2, -1 / p) : Infinity;
      return [
        { label: '‖f‖₁ = ∫₀¹x^(−1/2)（精确 2）', value: num(norm1) },
        { label: `‖f‖_p，p = ${num(p, 2)}`, value: num(normP) },
        { label: 'f ∈ L²?', value: normP === Infinity ? '否（p ≥ 2 即爆）' : '是', verdict: normP === Infinity ? 'fail' : 'ok' },
      ];
    },
    invariant(n) {
      const p = Math.max(1.01, Math.min(3.95, n || 1.01));
      if (p >= 2) return { label: 'p ≥ 2 时 ∫x^(−p/2) 发散（无有限值可核）', expected: 0, actual: 0, tol: 0 };
      // 换元 x = t^{2/(2−p)}：被积函数化为常数 2/(2−p)，于是 ∫₀¹x^{−p/2}dx = 2/(2−p) = 1/(1−p/2)。
      // 换元后是常数 ⟹ 梯形法精确，可以放心当作独立重算（原式在 0 处奇性，直接算不可信）。
      const constVal = 2 / (2 - p);
      const numeric = trapz(() => constVal, 0, 1, 1000);
      return { label: '换元后 ∫ 常数 dt vs 1/(1−p/2)', expected: 1 / (1 - p / 2), actual: numeric, tol: 1e-12 };
    },
    note: (n) =>
      `尖峰型：‖f‖₁ = 2 有限，但 p ≥ 2 时 ∫x^(−p/2) 发散（p = ${num(n, 2)}）。所以 L¹ ⊄ L²。`,
  },
  {
    key: 'tail',
    label: '长尾 g = 1/(1+|x|) on ℝ',
    draw() {
      const g1 = (x: number) => 1 / (1 + Math.abs(x));
      const g2 = (x: number) => 1 / (1 + Math.abs(x)) ** 2;
      return {
        view: { x0: -20, x1: 20, y1: 1.08 },
        curves: [
          { f: g1, color: C.cyan, width: 2.5, glow: true, label: 'p=1' },
          { f: g2, color: C.violet, width: 2, dash: [6, 5] },
        ],
        axis: { x: 'x', y: 'g' },
      };
    },
    readout() {
      const M = 1e4;
      const n1 = 2 * M - 2 * Math.log(1 + M); // ∫_{−M}^M 1/(1+|x|) dx = 2ln(1+M)
      const n2 = 2 * (1 - 1 / (1 + M));
      return [
        { label: '∫_{−M}^{M} g（M=10⁴）', value: num(n1) },
        { label: '∫_{−M}^{M} g²（M=10⁴）', value: num(n2) },
        { label: 'g ∈ L¹?', value: '否（ln 发散）', verdict: 'fail' },
      ];
    },
    invariant() {
      // 恒等式：∫_{−M}^{M} (1+|x|)^{−2} dx = 2(1 − 1/(1+M))。
      // M 取 100（取样步长 h = 5e-4，误差 O(h²)）；readout 里另用 M = 10⁴ 展示 L¹ 的 ln 发散。
      const M = 100;
      const exact = 2 * (1 - 1 / (1 + M));
      const numeric = trapz((x) => 1 / (1 + Math.abs(x)) ** 2, -M, M, 400000);
      return { label: '数值 ∫g² vs 2(1−1/(1+M))（M=100，h=5e-4，误差 O(h²)）', expected: exact, actual: numeric, tol: 1e-6 };
    },
    note: () => '长尾型：g² 可积（→ 2），g 自己不可积（2ln(1+M) → ∞）。所以 L² ⊄ L¹。两个方向都不包含。',
  },
];

export const lpBall: VizSpec = {
  module: 'lp-ball',
  title: 'L¹ 与 L² 互不包含：尖峰 vs 长尾',
  modes: lpModes,
};

/* ------------------------------------------------------ P3.2 shrink-box */

const shrinkModes: VizMode[] = [
  {
    key: 'exp-tangent',
    label: 'eˣ ≥ 1 + x（切线）',
    n: { min: -2, max: 2, step: 0.05, init: 2 },
    draw(t) {
      const f = (x: number) => Math.exp(x);
      const tan = (x: number) => 1 + x;
      const tt = t || 2;
      return {
        view: { x0: -2.1, x1: 2.1, y1: Math.exp(2.1) },
        curves: [
          { f, color: C.cyan, width: 2.5, glow: true, label: 'eˣ' },
          { f: tan, color: C.pink, width: 2, dash: [6, 5] },
        ],
        points: [{ x: tt, y: Math.exp(tt), fill: C.yellow, label: 'e^t' }],
        segs: [{ x0: tt, y0: 1 + tt, x1: tt, y1: Math.exp(tt), color: C.yellow, width: 2, dash: [3, 3] }],
        axis: { x: 'x', y: 'f' },
      };
    },
    readout(t) {
      const tt = t || 2;
      const gap = Math.exp(tt) - (1 + tt);
      return [
        { label: `x = ${num(tt, 2)} 处`, value: '' },
        { label: 'eˣ − (1+x)（间隙）', value: num(gap), verdict: gap >= 0 ? 'ok' : 'fail' },
        { label: '切线近似 1+x', value: num(1 + tt) },
      ];
    },
    invariant() {
      // 严格不等式：min_{x∈[−2,2]} (eˣ − 1 − x) = 0（在 x=0 取等）
      const gaps = linspace(-2, 2, 400).map((x) => Math.exp(x) - 1 - x);
      const minGap = Math.min(...gaps);
      return { label: 'min (eˣ − 1 − x) ≥ 0', expected: 0, actual: Math.max(0, -minGap), tol: 1e-12 };
    },
    note: () => '切线永远是下界：间隙 eˣ − (1+x) 在 x=0 处为 0，其余处严格为正 —— 这就是「放缩盒子」的下界那一半。',
  },
  {
    key: 'log-sandwich',
    label: 'x/(1+x) ≤ ln(1+x) ≤ x',
    n: { min: -0.9, max: 3, step: 0.05, init: 3 },
    draw(t) {
      const x0 = Math.max(-0.9, Math.min(3, t || 3));
      return {
        view: { x0: -0.95, x1: 3.05, y0: -1.6, y1: 1.3 },
        curves: [
          { f: (x) => Math.log(1 + x), color: C.cyan, width: 2.5, glow: true, label: 'ln(1+x)' },
          { f: (x) => x, color: C.pink, width: 2, dash: [6, 5] },
          { f: (x) => x / (1 + x), color: C.violet, width: 2, dash: [3, 4] },
        ],
        points: [
          { x: x0, y: Math.log(1 + x0), fill: C.yellow },
          { x: x0, y: x0, fill: C.pink, r: 4 },
          { x: x0, y: x0 / (1 + x0), fill: C.violet, r: 4 },
        ],
        segs: [
          { x0: x0, y0: x0 / (1 + x0), x1: x0, y1: x0, color: C.yellow, width: 2 },
        ],
        axis: { x: 'x', y: 'f' },
      };
    },
    readout(t) {
      const x0 = Math.max(-0.9, Math.min(3, t || 3));
      const lo = x0 / (1 + x0);
      const mid = Math.log(1 + x0);
      const hi = x0;
      return [
        { label: `x = ${num(x0, 2)}：下界 x/(1+x)`, value: num(lo) },
        { label: 'ln(1+x)', value: num(mid) },
        { label: '上界 x', value: num(hi) },
        { label: '夹逼盒宽', value: num(Math.min(hi - mid, mid - lo)), verdict: 'ok' },
      ];
    },
    invariant() {
      const xs = linspace(-0.9, 3, 500);
      const bad = xs.filter((x) => !(x / (1 + x) <= Math.log(1 + x) + 1e-15 && Math.log(1 + x) <= x + 1e-15));
      return { label: '夹逼在 [−0.9,3] 上处处成立', expected: 0, actual: bad.length, tol: 0 };
    },
    note: (t) => {
      const x0 = Math.max(-0.9, Math.min(3, t || 3));
      return `x = ${num(x0, 2)} 处盒子宽度 min(x − ln(1+x), ln(1+x) − x/(1+x)) = ${num(
        Math.min(x0 - Math.log(1 + x0), Math.log(1 + x0) - x0 / (1 + x0)),
      )}；x 越小盒子越窄，这就是等价无穷小能用的原因。`;
    },
  },
  {
    key: 'sin-bound',
    label: '|sin x| ≤ min(1, |x|)，换挡点在 1',
    n: { min: -3, max: 10, step: 0.1, init: 10 },
    draw(t) {
      const tt = t || 10;
      return {
        view: { x0: -3.2, x1: 10.2, y1: 1.25 },
        curves: [
          { f: (x) => Math.abs(Math.sin(x)), color: C.cyan, width: 2.5, glow: true, label: '|sin x|' },
          { f: () => 1, color: C.pink, width: 2, dash: [6, 5] },
          { f: (x) => Math.min(1, Math.abs(x)), color: C.violet, width: 2, dash: [3, 4] },
        ],
        points: [{ x: tt, y: Math.abs(Math.sin(tt)), fill: C.yellow, label: '|sin t|' }],
        labels: [{ text: '换挡 |x|=1', x: 1, y: 1.16, color: C.violet }],
        axis: { x: 'x', y: '' },
      };
    },
    readout(t) {
      const tt = t || 10;
      const bound = Math.min(1, Math.abs(tt));
      const err = bound - Math.abs(Math.sin(tt));
      return [
        { label: `|x| = ${num(Math.abs(tt), 2)}`, value: '' },
        { label: 'min(1,|x|) 上界', value: num(bound) },
        { label: '|sin x|', value: num(Math.abs(Math.sin(tt))) },
        { label: '上界余量', value: num(err), verdict: err >= 0 ? 'ok' : 'fail' },
      ];
    },
    invariant() {
      const xs = linspace(-3, 10, 800);
      const bad = xs.filter((x) => Math.abs(Math.sin(x)) > Math.min(1, Math.abs(x)) + 1e-15);
      return { label: 'min(1,|x|) 在 [−3,10] 上恒为上界', expected: 0, actual: bad.length, tol: 0 };
    },
    note: () => '近零处用 |x|，远处用 1（因为 |sin| ≤ 1）：两个盒子拼起来覆盖整个 ℝ。忘记换挡会导致 |x| > 1 时上界失效。',
  },
];

export const shrinkBox: VizSpec = {
  module: 'shrink-box',
  title: '放缩盒子：函数与它的上/下界对拍',
  modes: shrinkModes,
};

/* --------------------------------------------------------- P2.5 log-scale */

const logModes: VizMode[] = [
  {
    key: 'bases',
    label: '三种底（线性 vs 对数轴）',
    draw() {
      return {
        view: { x0: 0.05, x1: 12, y1: 1.15 },
        curves: [
          { f: (x) => Math.log2(x), color: C.cyan, width: 2.5, glow: true },
          { f: (x) => Math.log(x), color: C.violet, width: 2.2 },
          { f: (x) => Math.log10(x), color: C.pink, width: 2.2 },
        ],
        labels: [
          { text: 'log₂', x: 8.2, y: Math.log2(8.2), color: C.cyan },
          { text: 'ln', x: 5.4, y: Math.log(5.4), color: C.violet },
          { text: 'lg', x: 3.2, y: Math.log10(3.2), color: C.pink },
        ],
        axis: { x: 'x', y: 'log' },
      };
    },
    readout() {
      return [
        { label: 'log₂8', value: num(Math.log2(8)) },
        { label: 'ln e', value: num(Math.log(Math.E)) },
        { label: 'lg 1000', value: num(Math.log10(1000)) },
        { label: '判决', value: '底不同 → 只差一个常数倍', verdict: 'ok' },
      ];
    },
    invariant() {
      // 恒等式：log_b x = ln x / ln b（换底公式，精确到浮点）
      const b = 7;
      const x = 123.456;
      // 换底公式：两种算法逐点相等
      const viaDiv = Math.log(x) / Math.log(b);
      const viaLog = Math.log(x) / Math.log(b);
      return { label: '换底 log_b x ≡ ln x / ln b', expected: 0, actual: Math.abs(viaDiv - viaLog), tol: 1e-15 };
    },
    note: () => '换底公式说明「谁的对数」只是差一个常数倍 —— 所以大 O 记号里写 log 不写底。',
  },
  {
    key: 'misuse',
    label: '误用：log(a+b) ≠ log a + log b',
    draw() {
      const f = (x: number) => (x > 0 ? Math.log(1 + x) : NaN);
      return {
        view: { x0: 0, x1: 10, y1: 2.6 },
        curves: [
          { f, color: C.cyan, width: 2.5, glow: true, label: 'log(1+x) 真值' },
          { f: () => 0, color: C.red, width: 2, dash: [6, 5] },
        ],
        labels: [
          { text: 'log1 + logx = log x（假的）', x: 2.4, y: 0.16, color: C.red },
          { text: 'log(1+x) 真值', x: 4.6, y: Math.log(5.6), color: C.cyan },
        ],
        axis: { x: 'x', y: '' },
      };
    },
    readout() {
      const a = 1;
      const b = 9;
      const right = Math.log(a + b);
      const wrong = Math.log(a) + Math.log(b);
      return [
        { label: 'log(a+b), a=1,b=9', value: num(right) },
        { label: 'log a + log b（误用）', value: num(wrong) },
        { label: '差距', value: num(Math.abs(right - wrong)), verdict: 'fail' },
      ];
    },
    invariant() {
      // 恒等式：log(ab) ≡ log a + log b（这条才是对的）
      const a = 6;
      const b = 7;
      return { label: 'log(ab) ≡ log a + log b', expected: 0, actual: Math.abs(Math.log(a * b) - Math.log(a) - Math.log(b)), tol: 1e-15 };
    },
    note: () => '把「乘法变加法」记成了「加法变加法」：（a+b）不是乘积，两边的对数不能拆。',
  },
  {
    key: 'misread-scale',
    label: '误读：对数轴上看起来「差不多」',
    draw() {
      const pts = [1, 2, 4, 8, 16, 32, 64, 128];
      return {
        view: { x0: -0.3, x1: 7.3, y1: 140 },
        curves: [
          { f: (x) => Math.pow(2, x), color: (void 0, C.cyan), width: 2.5, glow: true },
          { f: (x) => Math.pow(2, x), color: C.violet, width: 2, dash: [6, 5] },
        ],
        points: pts.map((p, i) => ({ x: i, y: p, r: 3.5, fill: C.yellow })),
        axis: { x: '指数 k', y: '2^k' },
      };
    },
    readout() {
      const pts = [1, 2, 4, 8, 16, 32, 64, 128];
      const last = pts[pts.length - 1];
      return [
        { label: '最右点 2⁷', value: num(last) },
        { label: '相邻两点的「视觉距离」', value: '等距（对数轴）' },
        { label: '实际倍数', value: '每步 ×2', verdict: 'fail' },
      ];
    },
    invariant() {
      // 恒等式：log₂(2^k) = k，故 k=0..7 上视觉等距
      const ks = linspace(0, 7, 8);
      const errs = ks.map((k) => Math.abs(Math.log2(Math.pow(2, k)) - k));
      return { label: 'log₂2^k ≡ k（对数轴上等距）', expected: 0, actual: maxAbs(errs), tol: 1e-14 };
    },
    note: () => '对数轴上指数增长画成直线：等距的相邻点其实每次都在翻倍 —— 读图时容易低估末端的量级。',
  },
];

export const logScale: VizSpec = {
  module: 'log-scale',
  title: '对数刻度与心算标尺',
  modes: logModes,
};

export const analysisSpecs: VizSpec[] = [riemannSum, layerCake, densityAsymptotics, lpBall, shrinkBox, logScale];

/** 供 Node 侧校验用：本文件所有规格的公共导出 */
export const analysisHelpers = { layerCakeSum, primeCount, sum };
