/**
 * 蒙特卡洛篇 viz 规格（C8.2 MCMC / C9.1 重要性采样 / C9.2 方差缩减）。
 *
 * 这一篇的叙事全在**方差与支撑**上：能解析算的一律用闭式，需要积分的用 Simpson，
 * 再用「数值 vs 闭式」的一致性做 invariant —— 积分写错会立刻被自检抓住。
 */
import type { VizSpec, VizMode } from '../kit';
import { COLORS as C } from '../kit';
import { linspace, simpson, num, dev } from '../num';

/* =============================================== C9.1 mc-estimator */

/** 待估函数在 U(0,1) 下的 (均值 m, 二阶矩 E f²)，闭式 */
const MC_FUNCS: Record<string, { f: (x: number) => number; m: number; e2: number; label: string }> = {
  x: { f: (x) => x, m: 0.5, e2: 1 / 3, label: 'f = x' },
  'x^2': { f: (x) => x * x, m: 1 / 3, e2: 1 / 5, label: 'f = x²' },
  exp: { f: (x) => Math.exp(x), m: Math.E - 1, e2: (Math.E ** 2 - 1) / 2, label: 'f = eˣ' },
  '(x-0.5)^2': { f: (x) => (x - 0.5) ** 2, m: 1 / 12, e2: 1 / 80, label: 'f = (x−0.5)²' },
};

const mcModes: VizMode[] = [
  {
    key: 'support-gap',
    label: '支撑不匹配：偏差不随 N 缩小',
    n: { min: 10, max: 10000, step: 10, init: 1000 },
    draw(n) {
      const N = Math.max(10, n || 1000);
      const sd = 0.8944 / Math.sqrt(N);
      return {
        view: { x0: 0, x1: 1, y1: 1.2 },
        rects: [{ x: 0, y: 0, w: 0.5, h: 1.15, fill: 'rgba(94,230,255,.10)' }],
        curves: [
          { f: (x) => 3 * x * x, color: C.cyan, width: 2.6, glow: true },
          { f: () => 1, color: C.green, width: 2, dash: [6, 5] },
          { f: () => 0.125, color: C.red, width: 2.4, dash: [4, 4] },
        ],
        labels: [
          { text: '真值 ∫₀¹3x²dx = 1', x: 0.53, y: 1.06, color: C.green },
          { text: '估计量极限 0.125', x: 0.53, y: 0.22, color: C.red },
          { text: `提案支撑只有 [0, 0.5]（N = ${N}）`, x: 0.02, y: 0.9, color: C.cyan },
          { text: `±2σ/√N 带高 ${num(2 * sd, 4)} —— 缩得再小也够不到 1`, x: 0.02, y: 0.52, color: C.dim },
        ],
        axis: { x: 'x', y: 'f' },
      };
    },
    readout(n) {
      const N = Math.max(10, n || 1000);
      return [
        { label: '真值（f = 3x² on [0,1]）', value: '1' },
        { label: '估计量极限 ∫₀^0.5 f', value: '0.125' },
        { label: '系统偏差（与 N 无关）', value: num(0.875, 4), verdict: 'fail' },
        { label: `N = ${N} 时的随机项 ±2σ/√N`, value: num((2 * 0.8944) / Math.sqrt(N), 4) },
      ];
    },
    invariant() {
      // 恒等式：∫₀^0.5 3x²dx = 0.5³ = 0.125 —— 「估计量极限」就是它
      const numeric = simpson((x) => 3 * x * x, 0, 0.5, 2000);
      return { label: '∫₀^0.5 3x² ≡ 0.125', expected: 0.125, actual: numeric, tol: 1e-12 };
    },
    note: () =>
      '提案只覆盖一半区间：估计量稳稳收敛到 0.125 而不是 1。这不是样本不够 —— N 加到 10⁶ 也不会动，支撑不匹配是系统性偏差。',
  },
  {
    key: 'n-converge',
    label: '支撑正确：误差只剩 1/√N',
    n: { min: 10, max: 10000, step: 10, init: 1000 },
    draw(n) {
      const N = Math.max(10, n || 1000);
      const s = MC_FUNCS['x^2'];
      const V = s.e2 - s.m * s.m;
      const band = (2 * Math.sqrt(V)) / Math.sqrt(N);
      return {
        view: { x0: 0, x1: 1, y1: 1.2 },
        curves: [
          { f: s.f, color: C.cyan, width: 2.6, glow: true },
          { f: () => s.m, color: C.green, width: 2, dash: [6, 5] },
          { f: () => s.m + band, color: 'rgba(250,204,21,.7)', width: 1.6, dash: [3, 4] },
          { f: () => s.m - band, color: 'rgba(250,204,21,.7)', width: 1.6, dash: [3, 4] },
        ],
        labels: [
          { text: `${s.label}，真值 ${num(s.m, 6)}`, x: 0.03, y: 1.1, color: C.green },
          { text: `±2σ/√N = ±${num(band, 5)}（N = ${N}）`, x: 0.03, y: 0.98, color: C.yellow },
        ],
        axis: { x: 'x', y: 'f' },
      };
    },
    readout(n) {
      const N = Math.max(10, n || 1000);
      const s = MC_FUNCS['x^2'];
      const V = s.e2 - s.m * s.m;
      return [
        { label: `${s.label} 真值`, value: num(s.m, 8) },
        { label: 'σ = √(E f² − m²)', value: num(Math.sqrt(V), 8) },
        { label: `N = ${N} 时 ±2σ/√N`, value: num((2 * Math.sqrt(V)) / Math.sqrt(N), 6) },
        { label: '判决', value: '无系统偏差，误差 O(1/√N)', verdict: 'ok' },
      ];
    },
    invariant() {
      const s = MC_FUNCS['x^2'];
      // 数值积分 vs 闭式：∫₀¹x² = 1/3、∫₀¹x⁴ = 1/5（方差就是从这里来的）
      const m = simpson(s.f, 0, 1, 4000);
      const e2 = simpson((x) => s.f(x) ** 2, 0, 1, 4000);
      return { label: '数值 ∫f、∫f² 与闭式一致', expected: 0, actual: Math.max(dev(m, s.m), dev(e2, s.e2)), tol: 1e-12 };
    },
    note: (n) => {
      const N = Math.max(10, n || 1000);
      const s = MC_FUNCS['x^2'];
      const V = s.e2 - s.m * s.m;
      return `支撑对了就没有系统偏差：误差只剩 ±2σ/√N = ±${num(
        (2 * Math.sqrt(V)) / Math.sqrt(N),
        5,
      )}。N 加 100 倍，误差减 10 倍 —— 这就是那条 1/√N 律。`;
    },
  },
];

export const mcEstimator: VizSpec = {
  module: 'mc-estimator',
  title: '重要性采样：支撑错了就永远错',
  modes: mcModes,
};

/* =============================================== C9.2 variance-reduction */

const funcKeys = (): string[] => Object.keys(MC_FUNCS);
const funcOf = (idx: number): string => funcKeys()[Math.max(0, Math.min(funcKeys().length - 1, Math.round(idx || 0)))];

const VOf = (key: string): number => MC_FUNCS[key].e2 - MC_FUNCS[key].m ** 2;

/** 对偶变量的协方差 C = ∫f(x)f(1−x)dx − m²（数值积分） */
function antitheticCov(key: string): number {
  const s = MC_FUNCS[key];
  return simpson((x) => s.f(x) * s.f(1 - x), 0, 1, 4000) - s.m * s.m;
}

/** 控制变量（g = x，均值 1/2、方差 1/12）的 ρ² */
function controlRho2(key: string): number {
  const s = MC_FUNCS[key];
  const cov = simpson((x) => x * s.f(x), 0, 1, 4000) - 0.5 * s.m;
  return (cov * cov) / (VOf(key) * (1 / 12));
}

/** m 层等宽分层后的总方差系数（Var·N） */
function stratifiedCoef(key: string, m: number): number {
  const s = MC_FUNCS[key];
  let within = simpson((x) => s.f(x) ** 2, 0, 1, 4000);
  for (let h = 0; h < m; h++) {
    const seg = simpson(s.f, h / m, (h + 1) / m, 400) * m; // 层内均值
    within -= (seg * seg) / m;
  }
  return Math.max(0, within / m);
}

const vrModes: VizMode[] = [
  {
    key: 'technique-compare',
    label: '四项技术：方差系数对比',
    n: { min: 0, max: 3, step: 1, init: 1 },
    draw(n) {
      const key = funcOf(n);
      const V = VOf(key);
      const coef = {
        mc: V,
        anti: (V + antitheticCov(key)) / 2,
        strat: stratifiedCoef(key, 10),
        ctrl: V * (1 - controlRho2(key)),
      };
      const lg = (v: number) => Math.log10(Math.max(v, 1e-9)) - 2;
      return {
        view: { x0: 1, x1: 5, y0: -6, y1: 0.3 },
        // 双对数坐标下「方差 ∝ 1/N」是一条斜率 −1 的直线
        curves: [
          { f: (t) => lg(coef.mc) - (t - 1) * 0 + -(t - 1), color: C.red, width: 2.4 },
          { f: (t) => lg(coef.anti) - (t - 1), color: C.cyan, width: 2.4, glow: true },
          { f: (t) => lg(coef.strat) - (t - 1), color: C.violet, width: 2.4 },
          { f: (t) => lg(coef.ctrl) - (t - 1), color: C.green, width: 2.4 },
        ],
        labels: [
          { text: `MC      ${num(coef.mc, 4)}`, x: 3.1, y: lg(coef.mc) - 2, color: C.red },
          { text: `对偶    ${num(coef.anti, 4)}`, x: 3.1, y: lg(coef.anti) - 2.4, color: C.cyan },
          { text: `分层10  ${num(coef.strat, 4)}`, x: 3.1, y: lg(coef.strat) - 2.8, color: C.violet },
          { text: `控制变量 ${num(coef.ctrl, 4)}`, x: 3.1, y: lg(coef.ctrl) - 3.2, color: C.green },
        ],
        axis: { x: 'log₁₀N', y: 'log₁₀(Var·N²)' },
      };
    },
    readout(n) {
      const key = funcOf(n);
      const V = VOf(key);
      const anti = (V + antitheticCov(key)) / 2;
      const strat = stratifiedCoef(key, 10);
      const ctrl = V * (1 - controlRho2(key));
      const row = (label: string, c: number) => ({
        label: `${label} 缩减比（越小越好）`,
        value: `${num(c / V, 4)}×`,
        verdict: (c / V < 1 ? 'ok' : 'fail') as 'ok' | 'fail',
      });
      return [
        { label: `${MC_FUNCS[key].label}：MC 系数 Var·N`, value: num(V, 6) },
        row('对偶变量', anti),
        row('分层（10 层）', strat),
        row('控制变量 g=x', ctrl),
      ];
    },
    invariant(n) {
      const key = funcOf(n);
      // 数值积分必须与闭式 (m, e2) 一致 —— 整张表的数值地基
      const s = MC_FUNCS[key];
      const mNum = simpson(s.f, 0, 1, 4000);
      const e2Num = simpson((x) => s.f(x) ** 2, 0, 1, 4000);
      return {
        label: '数值 ∫f、∫f²、（V）与闭式一致',
        expected: 0,
        actual: Math.max(dev(mNum, s.m), dev(e2Num, s.e2), dev(e2Num - mNum * mNum, VOf(key))),
        tol: 1e-10,
      };
    },
    note: (n) => {
      const key = funcOf(n);
      const V = VOf(key);
      const C = antitheticCov(key);
      const rho2 = controlRho2(key);
      return `${MC_FUNCS[key].label}：对偶变量吃「f 与 f(1−x) 的负相关」（系数 ${num(
        (V + C) / 2,
        4,
      )}），控制变量吃「与 g=x 的相关性」（ρ² = ${num(rho2, 4)} → 系数 ${num(
        V * (1 - rho2),
        4,
      )}）。四项技术都只减方差，不改期望。`;
    },
  },
  {
    key: 'importance-fail',
    label: '失效现场：错的 q 让方差发散',
    n: { min: 1, max: 200, step: 1, init: 10 },
    draw(n) {
      const eps = 1 / Math.max(1, n || 10);
      return {
        view: { x0: 0, x1: 1, y1: 40 },
        curves: [
          // w = f/q = x²/(3(1−x)²)，只画到 1−ε 之前
          { f: (x) => (x < 1 ? (x * x) / (3 * (1 - x) ** 2) : NaN), color: C.red, width: 2.6, glow: true, to: 1 - eps },
          { f: (x) => (x < 1 ? (x * x) / (9 * (1 - x) ** 4) : NaN), color: 'rgba(250,204,21,.6)', width: 1.8, dash: [4, 4], to: 1 - eps },
        ],
        segs: [{ x0: 1 - eps, y0: 0, x1: 1 - eps, y1: 40, color: 'rgba(250,204,21,.4)', width: 1.4, dash: [3, 3] }],
        labels: [
          { text: 'w = f/q ~ 1/(3(1−x)²) —— 在 x→1 爆破', x: 0.03, y: 36, color: C.red },
          { text: 'E_q[w²] = ∫x⁴/(3(1−x)²)dx = +∞', x: 0.03, y: 31, color: C.yellow },
        ],
        axis: { x: 'x', y: 'w, w²q' },
      };
    },
    readout(n) {
      const eps = 1 / Math.max(1, n || 10);
      return [
        { label: 'f = x²，q = 3(1−x)²（质量堆在 x=1）', value: '' },
        { label: '重权 w = f/q 在 x→1 的阶', value: '~ (1/3)(1−x)^(−2)' },
        { label: `尾部 ∫_{1−ε}^{1}(1−x)^(−2)dx = 1/ε（ε = ${num(eps, 4)}）`, value: num(1 / eps, 6), verdict: 'fail' },
        { label: '判决', value: 'E_q[w²] = ∞ ⟹ 估计量不收敛（大数律失效）' },
      ];
    },
    invariant() {
      const eps = 0.01;
      const delta = 0.001;
      // 换元 u = 1/(1−x)：∫_{1−ε}^{1−δ}(1−x)^{−2}dx = ∫_{1/ε}^{1/δ} du = 1/δ − 1/ε
      // 换元后被积函数是常数 1 ⟹ Simpson 精确，可作独立重算
      const numeric = simpson(() => 1, 1 / eps, 1 / delta, 4000);
      return { label: '换元后 ∫du ≡ 1/δ − 1/ε', expected: 1 / delta - 1 / eps, actual: numeric, tol: 1e-9 };
    },
    note: () =>
      '判据是 E_q[(f/q)²] < ∞，不是「q 的支撑盖住 f」。把 q 的质量堆到与 f 错开的地方，方差直接发散 —— 连大数律都失效，采样再多也没用。',
  },
];

export const varianceReduction: VizSpec = {
  module: 'variance-reduction',
  title: '方差缩减：各自吃什么结构',
  modes: vrModes,
};

/* =============================================== C8.2 mh-accept */

/** 双峰目标（未归一化）：两个 N(±2, 0.5²) */
const bimodal = (x: number): number =>
  Math.exp(-((x + 2) ** 2) / 0.5) + Math.exp(-((x - 2) ** 2) / 0.5);

/** 对称随机游走提案 ⟹ α = min{1, π(y)/π(x)}（q 比值精确约掉） */
const mhAlpha = (x: number, y: number): number => Math.min(1, bimodal(y) / bimodal(x));

/** 从 x 出发、步长 s 的平均接受率（对 y 数值积分） */
function mhAcceptRate(x: number, s: number, steps = 400): number {
  const lo = x - 6 * s;
  const hi = x + 6 * s;
  const k = 1 / (s * Math.sqrt(2 * Math.PI));
  const q = (y: number) => k * Math.exp(-((y - x) ** 2) / (2 * s * s));
  const tot = simpson(q, lo, hi, steps);
  const acc = simpson((y) => mhAlpha(x, y) * q(y), lo, hi, steps);
  return acc / (tot || 1);
}

const mhModes: VizMode[] = [
  {
    key: 'accept-ratio',
    label: 'α = min{1, π(y)/π(x)}',
    n: { min: 0.05, max: 6, step: 0.05, init: 1 },
    draw(n) {
      const s = n || 1;
      const x0 = 0;
      const lo = Math.min(-6, x0 - 4 * s);
      const hi = Math.max(6, x0 + 4 * s);
      const peak = bimodal(x0);
      return {
        view: { x0: lo, x1: hi, y1: 1.25 },
        curves: [
          { f: (y) => bimodal(y) / peak, color: 'rgba(148,163,255,.45)', width: 1.8 },
          { f: (y) => mhAlpha(x0, y), color: C.cyan, width: 2.6, glow: true },
          { f: () => 1, color: 'rgba(74,222,128,.7)', width: 1.6, dash: [5, 4] },
          { f: (y) => Math.exp(-((y - x0) ** 2) / (2 * s * s)), color: 'rgba(244,114,182,.45)', width: 1.6, dash: [3, 4] },
        ],
        segs: [{ x0: x0, y0: 0, x1: x0, y1: 1, color: C.yellow, width: 2 }],
        labels: [
          { text: 'α(y)：π 比 x 高就恒为 1（上坡必放行）', x: lo + 0.2, y: 1.14, color: C.cyan },
          { text: 'π(y)/π(x)（归一化到 x 处为 1）', x: lo + 0.2, y: 0.42, color: C.dim },
          { text: `提案 N(x, s²)，s = ${num(s, 2)}`, x: lo + 0.2, y: 0.26, color: C.pink },
        ],
        axis: { x: 'y', y: 'α' },
      };
    },
    readout(n) {
      const s = n || 1;
      return [
        { label: '起点 x = 0（双峰之间），峰在 ±2', value: '' },
        { label: 'y = 2（上坡）α', value: num(mhAlpha(0, 2), 6), verdict: 'ok' },
        { label: 'y = 4（下坡，π(4) ≪ π(0)）α', value: num(mhAlpha(0, 4), 6) },
        { label: `平均接受率（s = ${num(s, 2)}）`, value: num(mhAcceptRate(0, s, 2000), 4) },
      ];
    },
    invariant() {
      // 严格不等式 + 双向刻画：α ≤ 1，且 π(y) ≥ π(x) ⟹ α = 1
      const x0 = 0;
      const ys = linspace(-8, 8, 400);
      const over = ys.filter((y) => mhAlpha(x0, y) > 1 + 1e-15).length;
      const upNotOne = ys.filter((y) => bimodal(y) >= bimodal(x0) && Math.abs(mhAlpha(x0, y) - 1) > 1e-15).length;
      return { label: 'α ≤ 1，且上坡必为 1', expected: 0, actual: over + upNotOne, tol: 0 };
    },
    note: () =>
      '对称提案下 q 的比值精确约掉，接受率只剩高度比：上坡必放行、下坡按比例打折。这正是细致平衡 π(x)α(x,y) = π(y)α(y,x) 的可操作版本。',
  },
  {
    key: 'step-size',
    label: '步长：太小挪不动，太大全拒绝',
    n: { min: 0.05, max: 6, step: 0.05, init: 1 },
    draw(n) {
      const s = n || 1;
      const marks = [0.1, 1, 6];
      return {
        view: { x0: 0.05, x1: 6, y1: 1.08 },
        curves: [
          { f: (t) => mhAcceptRate(0, Math.max(0.05, t), 200), color: C.cyan, width: 2.6, glow: true, steps: 160 },
        ],
        points: marks.map((m, i) => ({
          x: m,
          y: mhAcceptRate(0, m, 2000),
          r: 4.5,
          fill: [C.violet, C.green, C.red][i],
          label: `s=${m}`,
        })),
        segs: [{ x0: s, y0: 0, x1: s, y1: 1, color: 'rgba(250,204,21,.5)', width: 1.5, dash: [4, 4] }],
        labels: [
          { text: '接受率随步长的下落曲线', x: 0.4, y: 1.02, color: C.cyan },
          { text: `当前 s = ${num(s, 2)} → 接受率 ${num(mhAcceptRate(0, s, 2000), 3)}`, x: 0.4, y: 0.06, color: C.yellow },
        ],
        axis: { x: '提案步长 s', y: '平均接受率' },
      };
    },
    readout() {
      return [0.1, 1, 6].map((s) => ({
        label: `s = ${s}（起点 x = 0）的平均接受率`,
        value: num(mhAcceptRate(0, s, 2000), 4),
        verdict: (s === 6 ? 'fail' : 'ok') as 'ok' | 'fail',
      }));
    },
    invariant() {
      // 接受率是概率：0 ≤ ā ≤ 1（三档步长同时成立）
      const bad = [0.1, 1, 6].filter((s) => {
        const r = mhAcceptRate(0, s, 2000);
        return !(r >= -1e-12 && r <= 1 + 1e-12);
      }).length;
      return { label: '平均接受率 ∈ [0,1]（三档步长）', expected: 0, actual: bad, tol: 0 };
    },
    note: (n) =>
      `步长是 MH 唯一要调的旋钮：s = ${num(n || 1, 2)}。太小几乎必接受但每次只挪一点（样本强相关）；太大几乎全拒绝（原地不动）。常用折中是接受率 25%–50%。`,
  },
];

export const mhAccept: VizSpec = {
  module: 'mh-accept',
  title: 'Metropolis–Hastings：上坡必放行，下坡按比例',
  modes: mhModes,
};

export const mcSpecs: VizSpec[] = [mcEstimator, varianceReduction, mhAccept];
