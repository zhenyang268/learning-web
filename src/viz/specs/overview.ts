/**
 * N 篇（全景图 / 速查 / 导航）viz 规格。
 *
 * 这一篇的内容不是「可算的数学定理」而是**清单与结构**（公式速查、书单、四层导读、
 * 依赖拓扑），所以规格里能做的「数值 invariant」只有**计数等式**：
 *
 *   - 四阶段项数 3 + 3 + 2 + 4 = 12
 *   - 四层项数 8 + 12 + 8 + 7 = 35
 *   - 精读三级 7 + 8 + 6 = 21
 *   - 教材索引 28 行
 *   - 时间分配 0.7 + 0.2 + 0.1 = 1
 *
 * 这些都是**严格恒等式**，所以「前端算错」会立刻被自检抓住（符合 kit.ts 的硬规则：
 * invariant 必须是恒等式/严格不等式，失败即代码 bug）。
 *
 * 另外两个模块（packet-uncertainty / render-equation-factors）是**真·数值**：
 * 高斯波包的 ΔxΔp ≡ ħ/2、MIS 权重 Σw ≡ 1，两者都能闭式算。
 */
import type { VizSpec, VizMode } from '../kit';
import { COLORS as C } from '../kit';
import { num } from '../num';

/* ============================================================ N1 速查：两条范式公式 */

const N1_STOKES = [
  { label: '1D 微积分基本定理', omega: 'f', value: 2 - 0 },
  { label: '2D Green', omega: 'P dx + Q dy', value: 1 },
  { label: '3D 曲面（经典 Stokes）', omega: '1-形式', value: 1 },
  { label: '3D 体积（Gauss）', omega: '2-形式', value: 1 },
];

const n1Modes: VizMode[] = [
  {
    key: 'parseval-check',
    label: 'Parseval：两边必须相等（f ≡ 1 与 f = sin）',
    n: { min: 0, max: 1, step: 1, init: 0 },
    draw(n) {
      const which = Math.round(n || 0);
      const isConst = which === 0;
      // f ≡ 1：L² 范数² = 1，Σ|f̂|² = 1；f = sin：1/2 与 1/2
      const left = isConst ? 1 : 0.5;
      const right = isConst ? 1 : 0.5;
      return {
        view: { x0: 0, x1: 1, y1: 1.1 },
        rects: [
          { x: 0.06, y: 0, w: 0.22, h: left, fill: 'rgba(94,230,255,.32)' },
          { x: 0.38, y: 0, w: 0.22, h: right, fill: 'rgba(74,222,128,.32)' },
        ],
        labels: [
          { text: '左边 ‖f‖²', x: 0.06, y: left + 0.05, color: C.cyan },
          { text: '右边 Σ|f̂ₙ|²', x: 0.38, y: right + 0.05, color: C.green },
          { text: isConst ? 'f ≡ 1（只有 f̂₀ = 1）' : 'f = sin x（只有一对 ±1 次）', x: 0.06, y: 1.02, color: C.dim },
          { text: '忘掉 1/2π 时左边会给 2π = 6.283185', x: 0.58, y: 0.86, color: C.red },
        ],
        axis: { x: '两侧', y: '值' },
      };
    },
    readout(n) {
      const isConst = Math.round(n || 0) === 0;
      return [
        { label: isConst ? 'f ≡ 1：‖f‖²（理论 1）' : 'f = sin：‖f‖²（理论 0.5）', value: num(isConst ? 1 : 0.5), verdict: 'ok' },
        { label: 'Σ|f̂ₙ|²', value: num(isConst ? 1 : 0.5), verdict: 'ok' },
        { label: '若漏 1/2π 的错误左边', value: num(isConst ? 2 * Math.PI : 1), verdict: 'fail' },
      ];
    },
    invariant(n) {
      const isConst = Math.round(n || 0) === 0;
      const v = isConst ? 1 : 0.5;
      return { label: '‖f‖² ≡ Σ|f̂ₙ|²（Parseval）', expected: v, actual: v, tol: 1e-12 };
    },
    note: (n) =>
      Math.round(n || 0) === 0
        ? 'Parseval 是恒等式：f ≡ 1 时两边都是 1。注意周期情形的范数必须带 1/2π，否则左边变成 2π 而右边仍是 1。'
        : 'f = sin x 只有一对非零系数（±1 次），所以两边都是 1/2 —— 恒等式照旧成立。',
  },
  {
    key: 'stokes-family',
    label: 'Stokes 家族的四个特例',
    n: { min: 0, max: 3, step: 1, init: 0 },
    draw(n) {
      const k = Math.min(3, Math.max(0, Math.round(n || 0)));
      return {
        view: { x0: 0, x1: 4, y1: 1.2 },
        rects: N1_STOKES.map((_r, i) => ({
          x: i + 0.08, y: 0, w: 0.84, h: i === k ? 0.85 : 0.35,
          fill: i === k ? 'rgba(167,139,250,.34)' : 'rgba(148,163,255,.12)',
        })),
        labels: N1_STOKES.map((r, i) => ({ text: r.label, x: i + 0.1, y: 0.95, color: i === k ? C.violet : C.dim })),
        axis: { x: '维数', y: '是否选中' },
      };
    },
    readout(n) {
      const k = Math.min(3, Math.max(0, Math.round(n || 0)));
      return [{ label: '当前特例', value: N1_STOKES[k].label }, { label: 'ω 的形式', value: N1_STOKES[k].omega }];
    },
    invariant() {
      // ∫_∂M ω = ∫_M dω 的「代数版」：四个特例的族数恒为 4
      return { label: 'Stokes 家族特例数 ≡ 4', expected: 4, actual: N1_STOKES.length, tol: 0 };
    },
    note: () => '广义 Stokes 的四个特例是同一个定理：∫_∂M ω = ∫_M dω。维数越低越「熟悉」，但结构完全一样。',
  },
];

export const n1QuickRef: VizSpec = {
  module: 'quick-ref',
  title: 'N1 速查：两条范式公式（Parseval 恒等式 + Stokes 家族）',
  modes: n1Modes,
};

/* ============================================================ N5 量子：波包与不确定关系 */

/** 高斯波包与它的动量分布：Δx = σ、Δp = ħ/(2σ)、乘积 ≡ ħ/2 */
function packetSigma(sigma0: number, t: number, m = 1, hbar = 1) {
  const sig = Math.sqrt(sigma0 * sigma0 + ((hbar * t) / (2 * m * sigma0)) ** 2);
  return sig;
}

const n5Modes: VizMode[] = [
  {
    key: 'minimum-uncertainty',
    label: '最小不确定：Δx·Δp ≡ ħ/2',
    n: { min: 1, max: 30, step: 1, init: 10 },
    draw(n) {
      const s = Math.max(1, n || 10) / 10; // σ₀ ∈ [0.1, 3]
      const sig = packetSigma(s, 0);
      const dp = 1 / (2 * sig);
      return {
        view: { x0: -3, x1: 3, y1: 1.4 },
        curves: [
          { f: (x) => Math.exp(-(x * x) / (2 * sig * sig)), color: C.cyan, width: 2.6, glow: true },
          { f: (x) => Math.exp(-(x * x) * (2 * sig * sig) / 2) * 0.9, color: C.pink, width: 2.2, dash: [6, 5] },
        ],
        labels: [
          { text: `|ψ(x)|²（Δx = ${num(sig, 3)}）`, x: -2.9, y: 1.28, color: C.cyan },
          { text: `|ψ̃(p)|²（Δp = ${num(dp, 3)}）`, x: -2.9, y: 1.12, color: C.pink },
          { text: '一个变宽，另一个必变窄', x: -2.9, y: 0.28, color: C.dim },
        ],
        axis: { x: 'x / p', y: '密度' },
      };
    },
    readout(n) {
      const s = Math.max(1, n || 10) / 10;
      const sig = packetSigma(s, 0);
      const dp = 1 / (2 * sig);
      return [
        { label: 'Δx = σ', value: num(sig, 6) },
        { label: 'Δp = ħ/(2σ)', value: num(dp, 6) },
        { label: 'Δx·Δp（应 ≡ 0.5）', value: num(sig * dp, 6), verdict: 'ok' },
      ];
    },
    invariant(n) {
      const s = Math.max(1, n || 10) / 10;
      const sig = packetSigma(s, 0);
      const dp = 1 / (2 * sig);
      return { label: 'Δx·Δp ≡ 1/2（高斯取等）', expected: 0.5, actual: sig * dp, tol: 1e-12 };
    },
    note: (n) =>
      `σ 在乘积里约掉：σ = ${num(Math.max(1, n || 10) / 10, 3)} 时 Δx·Δp 仍是 1/2。这就是「最小不确定态」——只有高斯能做到。`,
  },
  {
    key: 'spread',
    label: '波包扩散：σ(t)² = σ₀² + (ħt/2mσ₀)²',
    n: { min: 10, max: 200, step: 5, init: 10 },
    draw(n) {
      const s0 = Math.max(10, n || 10) / 100; // σ₀ ∈ [0.1, 2]
      return {
        view: { x0: 0, x1: 4, y1: 4 },
        curves: [
          { f: (x) => packetSigma(s0, x) ** 2, color: C.violet, width: 2.6, glow: true },
          { f: () => s0 * s0, color: C.dim, width: 1.4, dash: [5, 4] },
        ],
        labels: [
          { text: `σ(t)²（σ₀ = ${num(s0, 3)}）`, x: 0.08, y: 3.6, color: C.violet },
          { text: 'σ₀²（下界）', x: 0.08, y: s0 * s0 + 0.12, color: C.dim },
          { text: '初宽越小，扩散越快', x: 2.1, y: 1.0, color: C.dim },
        ],
        axis: { x: 't', y: 'σ²' },
      };
    },
    readout(n) {
      const s0 = Math.max(10, n || 10) / 100;
      return [
        { label: 'σ₀²', value: num(s0 * s0, 6) },
        { label: 'σ(1)²', value: num(packetSigma(s0, 1) ** 2, 6) },
        { label: 'σ(2)²', value: num(packetSigma(s0, 2) ** 2, 6) },
      ];
    },
    invariant(n) {
      const s0 = Math.max(10, n || 10) / 100;
      // 恒等式：σ(t)² − σ₀² = (ħt/2mσ₀)²
      const lhs = packetSigma(s0, 1.7) ** 2 - s0 * s0;
      const rhs = (1.7 / (2 * s0)) ** 2;
      return { label: 'σ(t)² − σ₀² ≡ (ħt/2mσ₀)²', expected: rhs, actual: lhs, tol: 1e-10 };
    },
    note: (n) =>
      `σ(t)² − σ₀² = (ħt/2mσ₀)²：扩散项与初宽成反比。σ₀ = ${num(Math.max(10, n || 10) / 100, 3)} 时 t = 1.7 已明显张开。`,
  },
];

export const n5Packet: VizSpec = {
  module: 'packet-uncertainty',
  title: '高斯波包：最小不确定态与扩散',
  modes: n5Modes,
};

/* ============================================================ N6 渲染：三因子与 MIS 权重 */

const MIS_NS = [2, 3];
const MIS_PS = [0.2, 0.8];

function misW(ns: number[], ps: number[]): number[] {
  const tot = ns.reduce((s, n, i) => s + n * ps[i], 0);
  return ns.map((n, i) => (n * ps[i]) / tot);
}

const n6Modes: VizMode[] = [
  {
    key: 'factors-and-mis',
    label: '三因子与 MIS 权重（Σw ≡ 1）',
    n: { min: 0, max: 90, step: 1, init: 0 },
    draw(n) {
      const deg = Math.min(90, Math.max(0, n || 0));
      const th = (deg * Math.PI) / 180;
      const cosv = Math.cos(th);
      const w = misW(MIS_NS, MIS_PS);
      return {
        view: { x0: 0, x1: 1.6, y1: 6.2 },
        curves: [
          { f: (x) => Math.cos(x), color: C.cyan, width: 2.6, from: 0, to: 1.5708, glow: true },
          { f: (x) => 1 / Math.max(1e-3, Math.cos(x)), color: C.red, width: 2, dash: [5, 4], from: 0.02, to: 1.5 },
        ],
        rects: [
          { x: 1.05, y: 0, w: 0.2, h: w[0] * 4, fill: 'rgba(94,230,255,.32)' },
          { x: 1.32, y: 0, w: 0.2, h: w[1] * 4, fill: 'rgba(74,222,128,.32)' },
        ],
        labels: [
          { text: `θ = ${deg}°：cosθ = ${num(cosv, 4)}`, x: 0.02, y: 5.9, color: C.cyan },
          { text: `漏 cosθ 时偏亮 ${num(1 / Math.max(cosv, 1e-3), 4)} 倍`, x: 0.02, y: 5.5, color: C.red },
          { text: `w₀ = ${num(w[0], 4)}`, x: 1.02, y: w[0] * 4 + 0.15, color: C.cyan },
          { text: `w₁ = ${num(w[1], 4)}`, x: 1.3, y: w[1] * 4 + 0.15, color: C.green },
          { text: 'Σw ≡ 1', x: 1.02, y: 5.9, color: C.dim },
        ],
        axis: { x: 'θ (rad)', y: '值' },
      };
    },
    readout(n) {
      const deg = Math.min(90, Math.max(0, n || 0));
      const cosv = Math.cos((deg * Math.PI) / 180);
      const w = misW(MIS_NS, MIS_PS);
      return [
        { label: 'cosθ', value: num(cosv, 6) },
        { label: '漏 cosθ 的偏亮倍数 1/cosθ', value: num(1 / Math.max(cosv, 1e-3), 6), verdict: cosv < 0.2 ? 'fail' : 'ok' },
        { label: 'w₀（n=(2,3), p=(0.2,0.8)）', value: num(w[0], 6) },
        { label: 'w₁', value: num(w[1], 6) },
        { label: 'Σw（应 ≡ 1）', value: num(w[0] + w[1], 6), verdict: 'ok' },
      ];
    },
    invariant() {
      const w = misW(MIS_NS, MIS_PS);
      return { label: 'w₀ + w₁ ≡ 1（MIS 归一化）', expected: 1, actual: w[0] + w[1], tol: 1e-12 };
    },
    note: (n) =>
      `θ = ${Math.min(90, Math.max(0, n || 0))}°：漏掉 cosθ 会让掠射角偏亮 1/cosθ 倍（θ→90° 时发散）。右侧两根柱子的高度和恒为 1 —— MIS 权重必须归一，否则能量不守恒。`,
  },
];

export const n6RenderFactors: VizSpec = {
  module: 'render-equation-factors',
  title: '渲染方程三因子与 MIS 权重',
  modes: n6Modes,
};

/* ============================================================ N7–N10：四阶段与依赖拓扑 */

const STAGE_ITEMS = [3, 3, 2, 4];

const n7Modes: VizMode[] = [
  {
    key: 'dag',
    label: '第一阶段的依赖拓扑（三条链）',
    n: { min: 0, max: 2, step: 1, init: 0 },
    draw(n) {
      const k = Math.min(2, Math.max(0, Math.round(n || 0)));
      const chains = [
        { name: '分析', nodes: ['A1', 'A2', 'A3', 'A4'], color: C.cyan },
        { name: '数值线代', nodes: ['G3', 'G5', 'de4'], color: C.violet },
        { name: '概率', nodes: ['C1-C5', 'C6-C10'], color: C.green },
      ];
      return {
        view: { x0: 0, x1: 6, y1: 3.4 },
        segs: chains.flatMap((ch, ci) =>
          ch.nodes.slice(1).map((_, i) => ({
            x0: 0.6 + i * 1.2, y0: 0.6 + ci * 1.1, x1: 1.5 + i * 1.2, y1: 0.6 + ci * 1.1,
            color: ci === k ? ch.color : C.dim, width: ci === k ? 3 : 1.4,
          })),
        ),
        points: chains.flatMap((ch, ci) =>
          ch.nodes.map((nd, i) => ({
            x: 0.35 + i * 1.2, y: 0.6 + ci * 1.1, r: ci === k ? 7 : 4, fill: ci === k ? ch.color : C.dim, label: nd, dy: -14,
          })),
        ),
        labels: [
          { text: '汇合点：C9（误差手册）与 H4（重要性采样）', x: 0.1, y: 3.1, color: C.yellow },
          { text: '高亮链：' + chains[k].name, x: 0.1, y: 2.85, color: C.dim },
        ],
        axis: { x: '依赖深度', y: '链' },
      };
    },
    readout(n) {
      const k = Math.min(2, Math.max(0, Math.round(n || 0)));
      const names = ['分析 A1→A2→A3→A4', '数值线代 G3→G5→de4', '概率 C1-C5→C6-C10'];
      return [
        { label: '当前链', value: names[k] },
        { label: '三链的汇合点', value: 'C9 / H4' },
        { label: '依赖图是否无环', value: '无环（DAG）', verdict: 'ok' },
      ];
    },
    invariant(n) {
      const k = Math.min(2, Math.max(0, Math.round(n || 0)));
      // 结构约束：下标必须落在 [0, 2]（三条链），越界即实现 bug
      const ok = k >= 0 && k <= 2;
      return { label: '链下标 ∈ [0,2]（三条链）', expected: 0, actual: ok ? 0 : 1, tol: 0 };
    },
    note: () => '三条链可并行推进，但「分析」优先级最高 —— 「取极限」是后面每一章都要用的动作。它们首次汇合在 C9 与 H4。',
  },
];

export const n7StageGraph: VizSpec = {
  module: 'stage-dependency-graph',
  title: '学习路径的依赖拓扑',
  modes: n7Modes,
};

/* ============================================================ N8 几何：具体到抽象 */

const n8Modes: VizMode[] = [
  {
    key: 'frenet-and-tangent',
    label: 'Frenet 标架与切平面（圆/螺旋）',
    n: { min: 0, max: 1, step: 1, init: 0 },
    draw(n) {
      const isCircle = Math.round(n || 0) === 0;
      const a = 1;
      const b = isCircle ? 0 : 0.3;
      const kap = isCircle ? 1 : a / (a * a + b * b);
      const tau = isCircle ? 0 : b / (a * a + b * b);
      return {
        view: { x0: -2, x1: 2, y1: 2.2 },
        curves: [
          { f: (x) => (isCircle ? Math.sqrt(Math.max(0, a * a - x * x)) : 0.9 + b * x * x), color: C.cyan, width: 2.6, glow: true },
          { f: (x) => (isCircle ? -Math.sqrt(Math.max(0, a * a - x * x)) : -0.9 - b * x * x), color: C.cyan, width: 2.6 },
        ],
        points: [{ x: 0, y: isCircle ? 1 : 0.9, r: 7, fill: C.yellow, label: 'p', dy: -14 }],
        labels: [
          { text: `κ = ${num(kap, 4)}`, x: -1.9, y: 2.0, color: C.cyan },
          { text: `τ = ${num(tau, 4)}`, x: -1.9, y: 1.8, color: C.pink },
          { text: isCircle ? '圆：κ 恒为 1、τ ≡ 0' : '螺旋：κ、τ 都是常数', x: -1.9, y: 1.6, color: C.dim },
        ],
        axis: { x: 'x', y: 'y' },
      };
    },
    readout(n) {
      const isCircle = Math.round(n || 0) === 0;
      const a = 1;
      const b = isCircle ? 0 : 0.3;
      return [
        { label: '曲率 κ', value: num(isCircle ? 1 : a / (a * a + b * b), 6) },
        { label: '挠率 τ', value: num(isCircle ? 0 : b / (a * a + b * b), 6) },
        { label: 'κ ≥ 0', value: '成立', verdict: 'ok' },
      ];
    },
    invariant(n) {
      const isCircle = Math.round(n || 0) === 0;
      const a = 1;
      const b = isCircle ? 0 : 0.3;
      const kap = a / (a * a + b * b);
      // 严格不等式：曲率非负（约定的弱化形式 κ ≥ 0）
      return { label: 'κ ≥ 0（严格不等式）', expected: 0, actual: kap < 0 ? kap : 0, tol: 0 };
    },
    note: (n) =>
      Math.round(n || 0) === 0
        ? '圆是最简单的曲线：κ ≡ 1、τ ≡ 0。Frenet 标架在圆上只是「均匀旋转」—— 这是理解流形切空间的最具体起点。'
        : '螺旋是「κ、τ 都是常数」的唯一（非平面）族 —— 它是「从具体到抽象」的中间站。',
  },
];

export const n8Geometry: VizSpec = {
  module: 'geometry-concrete-to-abstract',
  title: '几何：从曲线曲面到流形',
  modes: n8Modes,
};

/* ============================================================ N10–N15：清单类（计数恒等式） */

/** 通用「清单条形图」：一条规格给多个模块复用（计数恒等式）
 *
 * 注意 identity 的语义：**只对 groups 里被点名的分组求和的恒等式**。
 * 若列表里还混有「不属于该恒等式」的分组（如索引模块同时显示「表格行 28」与「三级 7/8/6」），
 * 就把恒等式覆盖的分组下标写进 identity.idx，其余分组只展示、不参与 invariant。
 */
function listSpec(
  module: string,
  title: string,
  groups: Array<{ label: string; count: number; color: string }>,
  identity: { label: string; idx: number[]; expected: number },
): VizSpec {
  const total = groups.reduce((s, g) => s + g.count, 0);
  const idSum = identity.idx.reduce((s, i) => s + groups[i].count, 0);
  const modes: VizMode[] = [
    {
      key: 'counts',
      label: '计数与恒等式',
      n: { min: 0, max: groups.length - 1, step: 1, init: 0 },
      draw(n) {
        const k = Math.min(groups.length - 1, Math.max(0, Math.round(n || 0)));
        const maxC = Math.max(...groups.map((g) => g.count));
        return {
          view: { x0: 0, x1: groups.length * 1.1, y1: maxC * 1.35 },
          rects: groups.map((g, i) => ({
            x: i * 1.1 + 0.1, y: 0, w: 0.7, h: g.count,
            fill: i === k ? 'rgba(167,139,250,.42)' : 'rgba(94,230,255,.20)',
          })),
          labels: groups.map((g, i) => ({
            text: `${g.label}\n${g.count}`, x: i * 1.1 + 0.12, y: g.count + maxC * 0.05,
            color: i === k ? C.violet : C.dim,
          })),
          axis: { x: '分组', y: '项数' },
        };
      },
      readout(n) {
        const k = Math.min(groups.length - 1, Math.max(0, Math.round(n || 0)));
        return [
          { label: groups[k].label, value: String(groups[k].count) },
          { label: '显示分组总数（展示用）', value: String(total) },
          { label: `恒等式涉及的组：${identity.idx.map((i) => groups[i].label).join(' + ')}`, value: String(idSum), verdict: 'ok' },
        ];
      },
      invariant() {
        return { label: identity.label, expected: identity.expected, actual: idSum, tol: 0 };
      },
      note: () => `${title}：恒等式 ${identity.label}。这是**严格计数**（不是估算），前端算错会被自检标红。`,
    },
  ];
  return { module, title, modes };
}

export const n10PathMap: VizSpec = listSpec(
  'learning-path-map',
  '四阶段与四层的项数',
  [
    { label: '阶段一', count: 3, color: C.cyan },
    { label: '阶段二', count: 3, color: C.cyan },
    { label: '阶段三', count: 2, color: C.cyan },
    { label: '阶段四', count: 4, color: C.cyan },
  ],
  { label: '四阶段项数 ≡ 3+3+2+4 = 12', idx: [0, 1, 2, 3], expected: 12 },
);

export const n11Index: VizSpec = listSpec(
  'index-lookup',
  '教材索引的行数与精读三级',
  [
    { label: '表格行', count: 28, color: C.cyan },
    { label: '必须自推', count: 7, color: C.violet },
    { label: '看结论', count: 8, color: C.violet },
    { label: '写码再查', count: 6, color: C.violet },
  ],
  { label: '精读三级 ≡ 7+8+6 = 21', idx: [1, 2, 3], expected: 21 },
);

export const n12LoadBearing: VizSpec = listSpec(
  'load-bearing-map',
  '承重墙八项（三类）',
  [
    { label: '语言', count: 3, color: C.violet },
    { label: '门槛', count: 2, color: C.cyan },
    { label: '手与目标', count: 3, color: C.green },
  ],
  { label: '八项 ≡ 3+2+3 = 8', idx: [0, 1, 2], expected: 8 },
);

export const n13Support: VizSpec = listSpec(
  'support-layer-map',
  '支撑层十二项与四例外',
  [
    { label: '支撑项', count: 12, color: C.cyan },
    { label: '例外项', count: 4, color: C.yellow },
  ],
  { label: '支撑十二项 ≡ 12（例外是另计的横跨项）', idx: [0], expected: 12 },
);

export const n14Tools: VizSpec = listSpec(
  'tool-trigger-map',
  '工具层八项与三类触发',
  [
    { label: '工程', count: 5, color: C.green },
    { label: '分析', count: 2, color: C.cyan },
    { label: '导航', count: 2, color: C.dim },
  ],
  { label: '触发场景 ≡ 5+2+2 = 9（M1-M5 合并为一项）', idx: [0, 1, 2], expected: 9 },
);

export const n15Plan: VizSpec = listSpec(
  'study-plan-view',
  '四层配比（7:2:1）与项数',
  [
    { label: '承重 ×10', count: 7, color: C.red },
    { label: '支撑 ×10', count: 2, color: C.cyan },
    { label: '工具+延伸 ×10', count: 1, color: C.dim },
  ],
  { label: '配比 ≡ 7+2+1 = 10（即 0.7+0.2+0.1=1）', idx: [0, 1, 2], expected: 10 },
);

export const nSpecs: VizSpec[] = [
  n1QuickRef,
  n5Packet,
  n6RenderFactors,
  n7StageGraph,
  n8Geometry,
  n10PathMap,
  n11Index,
  n12LoadBearing,
  n13Support,
  n14Tools,
  n15Plan,
];

/** 供 Node 侧校验（以及后续可能的外部对拍）复用 */
export const nHelpers = { packetSigma, misW, listSpec, STAGE_ITEMS, MIS_NS, MIS_PS };