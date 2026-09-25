/**
 * H3 路径空间（path-contribution）与 I2 粘性（viscosity-curves）的档1 规格。
 *
 * 两个模块都是闭式显式函数（TASKBOOK §8.5 判据 Q4）：
 *  - G(d,θ) = cosθx·cosθy / d²，误用路线（丢 cos / 丢平方）各是一条对照曲线；
 *  - 幂律表观粘度 μ_app = k·γ̇^(n−1)，宾汉 τ = τy + μp·γ̇；
 *  - 镜面走廊 ρ^k 连乘，截断误差 = ρ^k（几何级数闭式）。
 * invariant 全部是恒等式：闭式 vs 独立算法（向量几何 / 逐项求和 / 线性组合），
 * 公式写错（cos 变 cos²、平方变一次方、级数求和错）偏差是 O(1)，必被抓住。
 */
import type { VizSpec, VizMode } from '../kit';
import { COLORS as C } from '../kit';
import { num } from '../num';

/* =============================================== H3 path-contribution */

const RHO = 0.9; // 镜面走廊反射率（H3 params_hint.reflectance）

/** 三维向量几何算 G（独立于标量公式，供 invariant 对拍）：
 *  A 在原点、法线 +z；B 在 (0,0,d)、法线绕 y 轴倾 θ（即 (sinθ,0,−cosθ)）。 */
function gByVectors(d: number, theta: number): number {
  const v = [0, 0, d]; // A→B
  const vlen = Math.hypot(v[0], v[1], v[2]);
  const vhat = v.map((x) => x / vlen);
  const nA = [0, 0, 1];
  const nB = [Math.sin(theta), 0, -Math.cos(theta)];
  const cosX = nA[0] * vhat[0] + nA[1] * vhat[1] + nA[2] * vhat[2];
  const cosY = -(nB[0] * vhat[0] + nB[1] * vhat[1] + nB[2] * vhat[2]);
  return (cosX * cosY) / (vlen * vlen);
}

const gCorrect = (d: number, th: number) => Math.cos(th) / (d * d);
const gNoCos = (d: number) => 1 / (d * d);
const gLinear = (d: number, th: number) => Math.cos(th) / d;

const geometryModes: VizMode[] = [
  {
    key: 'geometry-term',
    label: 'G 几何项：丢 cos / 丢平方各错多少倍',
    n: { min: 0, max: 85, step: 1, init: 60 },
    draw(thDeg) {
      const th = (thDeg * Math.PI) / 180;
      const d0 = 0.5;
      const d1 = 4;
      const ymax = gNoCos(d0) * 1.15;
      return {
        view: { x0: d0, x1: d1, y1: ymax },
        curves: [
          { f: (d) => gCorrect(d, th), color: C.cyan, width: 2.6, glow: true, label: 'correct' },
          { f: (d) => gNoCos(d), color: C.red, width: 2, dash: [6, 4], label: 'no-cos' },
          { f: (d) => gLinear(d, th), color: C.yellow, width: 2, dash: [10, 4], label: 'linear-d' },
        ],
        points: [
          { x: 2, y: gCorrect(2, th), fill: C.cyan, label: `G=${num(gCorrect(2, th), 4)}`, dy: -10 },
          { x: 2, y: gNoCos(2), fill: C.red, label: `${num(gNoCos(2), 4)}`, dy: 14 },
        ],
        labels: [
          { text: `θ=${thDeg}°：正确 G(2,θ)=cosθ/4=${num(gCorrect(2, th), 4)}`, x: d0 + 0.1, y: ymax * 0.92, color: C.cyan },
          { text: `丢 cos → ${num(gNoCos(2), 4)}，高估 ${num(gNoCos(2) / Math.max(gCorrect(2, th), 1e-12), 3)}×`, x: d0 + 0.1, y: ymax * 0.82, color: C.red },
          { text: `丢平方 → ${num(gLinear(2, th), 4)}，高估 ${num(gLinear(2, th) / Math.max(gCorrect(2, th), 1e-12), 3)}×（随 d 线性涨）`, x: d0 + 0.1, y: ymax * 0.72, color: C.yellow },
        ],
        axis: { x: 'd', y: 'G' },
        grid: { rows: 5, xTicks: 7 },
      };
    },
    readout(thDeg) {
      const th = (thDeg * Math.PI) / 180;
      const gc = gCorrect(2, th);
      return [
        { label: '基准：正对 θ=0, d=2', value: 'G = 1·1/2² = 0.25', verdict: 'ok' },
        { label: `正确 G(2, ${thDeg}°)`, value: num(gc, 4) },
        { label: '丢 cos（仍给满额 0.25）', value: `高估 ${num(0.25 / Math.max(gc, 1e-12), 3)}×`, verdict: 'fail' },
        { label: '丢平方（1/d 代替 1/d²）', value: `G=${num(gLinear(2, th), 4)}，高估 ${num(gLinear(2, th) / Math.max(gc, 1e-12), 3)}×`, verdict: 'fail' },
        { label: '口诀自检：单位距离正对 G(1,0)', value: num(gCorrect(1, 0), 4) + '（必须 =1）', verdict: gCorrect(1, 0) === 1 ? 'ok' : 'fail' },
      ];
    },
    invariant(thDeg) {
      // 恒等式：标量闭式 cosθ/d² ≡ 三维向量几何 (nA·v̂)(nB·(−v̂))/|v|²
      const th = (thDeg * Math.PI) / 180;
      return {
        label: 'cosθ/d² ≡ 向量几何 G',
        expected: gByVectors(2, th),
        actual: gCorrect(2, th),
        tol: 1e-12,
      };
    },
    note: (thDeg) =>
      `θ=${thDeg}°。掠射（θ→90°）时丢 cos 的高估倍数无界：θ=89° 正确 G 只剩 cos89°≈${num(Math.cos((89 * Math.PI) / 180), 4)} 倍。丢平方则让远处光源相对过亮（误差随 d 线性涨）——反平方律是能量守恒的根基。`,
  },
  {
    key: 'path-product',
    label: '镜面走廊 ρ^k：截断漏掉多少能量',
    n: { min: 1, max: 30, step: 1, init: 3 },
    draw(k) {
      const K = Math.max(1, Math.round(k));
      const bars = Array.from({ length: Math.min(K, 30) }, (_, i) => ({
        x: i + 0.15,
        y: 0,
        w: 0.7,
        h: Math.pow(RHO, i + 1),
        fill: i + 1 === K ? 'rgba(94,230,255,.35)' : 'rgba(167,139,250,.22)',
        stroke: i + 1 === K ? C.cyan : C.violet,
      }));
      const full = RHO / (1 - RHO); // 无穷级数和 = 9
      return {
        view: { x0: 0, x1: Math.max(K + 1, 6), y1: 1 },
        rects: bars,
        labels: [
          { text: `ρ=${RHO}：第 i 次弹射贡献 ρ^i`, x: 0.4, y: 0.95, color: C.dim },
          { text: `截断 k=${K}：累计 ${num(truncSum(K), 4)} / 全和 ${num(full, 4)}`, x: 0.4, y: 0.87, color: C.cyan },
          { text: `漏掉比例 ρ^k = ${num(Math.pow(RHO, K), 4)}`, x: 0.4, y: 0.79, color: C.pink },
        ],
        axis: { x: '弹射次数 i', y: 'ρ^i' },
        grid: { rows: 4 },
      };
    },
    readout(k) {
      const K = Math.max(1, Math.round(k));
      const full = RHO / (1 - RHO);
      return [
        { label: `截断和 Σ_{i=1..${K}} ρ^i`, value: num(truncSum(K), 4) },
        { label: '无穷级数全和 ρ/(1−ρ)', value: num(full, 4) },
        { label: `漏掉能量比例 ρ^${K}`, value: num(Math.pow(RHO, K), 4), verdict: K <= 3 ? 'fail' : undefined },
        { label: 'k=3 时（probe2 基准）', value: num(Math.pow(RHO, 3), 4) + '（=0.729）' },
      ];
    },
    invariant(k) {
      // 恒等式：逐项求和 ≡ 闭式 ρ(1−ρ^N)/(1−ρ)
      const K = Math.max(1, Math.round(k));
      return {
        label: 'Σρ^i 逐项 ≡ 闭式',
        expected: (RHO * (1 - Math.pow(RHO, K))) / (1 - RHO),
        actual: truncSum(K),
        tol: 1e-12,
      };
    },
    note: (k) =>
      `k=${Math.max(1, Math.round(k))}。ρ=0.9 的镜面走廊收敛极慢：只弹 3 次漏掉 72.9% 的能量（probe2 的 0.729）；要漏掉 <1% 需 k≥44。路径追踪的俄罗斯轮盘就是在无偏地继续这个级数。`,
  },
];

function truncSum(K: number): number {
  let s = 0;
  for (let i = 1; i <= K; i++) s += Math.pow(RHO, i);
  return s;
}

export const pathContributionSpec: VizSpec = {
  module: 'path-contribution',
  title: 'H3 路径贡献：G 几何项与 ρ^k 连乘',
  modes: geometryModes,
};

/* =============================================== I2 viscosity-curves */

const K_CONS = 1.0; // 稠度系数（params_hint.k）
const MU_P = 2.0; // 宾汉塑性粘度（params_hint.mu_p）
const TAU_Y = 5.0; // 屈服应力（params_hint.tau_y）

/** x 轴用 lg γ̇（对数轴，params_hint.log_axis），范围 [0.01,1000] → [-2,3] */
const LX0 = -2;
const LX1 = 3;

const viscosityModes: VizMode[] = [
  {
    key: 'apparent-viscosity',
    label: 'μ_app(γ̇)：四类流体一图分辨',
    n: { min: 0.3, max: 2.0, step: 0.05, init: 0.7 },
    draw(n) {
      const muApp = (lg: number) => K_CONS * Math.pow(10, lg * (n - 1));
      const bingham = (lg: number) => {
        const g = Math.pow(10, lg);
        return TAU_Y / g + MU_P;
      };
      return {
        view: { x0: LX0, x1: LX1, y0: 0, y1: 30 },
        curves: [
          { f: () => K_CONS, color: C.green, width: 2.2, label: 'newton' },
          { f: muApp, color: C.cyan, width: 2.6, glow: true, label: 'power-law' },
          { f: bingham, color: C.pink, width: 2, dash: [6, 4], label: 'bingham' },
          { f: (lg) => K_CONS * Math.pow(10, lg * 0.5), color: C.violet, width: 1.6, dash: [2, 4], label: 'n=1.5 增稠' },
        ],
        labels: [
          { text: `n=${num(n, 2)}：${n < 0.98 ? '剪切稀化（下降）' : n > 1.02 ? '剪切增稠（上升）' : '牛顿（水平）'}`, x: LX0 + 0.1, y: 28, color: C.cyan },
          { text: '牛顿 μ≡k（水平线）', x: LX0 + 0.1, y: 2.2, color: C.green },
          { text: `宾汉 μ_app=τy/γ̇+μp：γ̇→0 发散（γ̇≤τy 段不流动）`, x: LX0 + 0.1, y: 24, color: C.pink },
        ],
        axis: { x: 'lg γ̇', y: 'μ_app' },
        grid: { rows: 5, xTicks: 5 },
      };
    },
    readout(n) {
      return [
        { label: '幂律 μ_app(γ̇=1)', value: num(K_CONS, 3) + '（=k，与 n 无关）' },
        { label: '幂律 μ_app(γ̇=1000)', value: num(K_CONS * Math.pow(1000, n - 1), 4) },
        { label: `分类（n=${num(n, 2)}）`, value: n < 0.98 ? '剪切稀化' : n > 1.02 ? '剪切增稠' : '牛顿' },
        { label: '宾汉 γ̇=0.01 时 μ_app', value: num(TAU_Y / 0.01 + MU_P, 3) + '（准固体）', verdict: 'fail' },
      ];
    },
    invariant(n) {
      // 恒等式：μ_app(γ̇)·γ̇ ≡ τ(γ̇) = k·γ̇^n（在 γ̇=100 处对拍）
      const g = 100;
      return {
        label: 'μ_app·γ̇ ≡ k·γ̇^n',
        expected: K_CONS * Math.pow(g, n),
        actual: K_CONS * Math.pow(g, n - 1) * g,
        tol: 1e-9,
      };
    },
    note: (n) =>
      `n=${num(n, 2)}。「粘度是不是常数」的答案就在曲线斜率：n<1 越搅越稀（番茄酱），n>1 越搅越稠（玉米淀粉糊），宾汉根本不给流动机会直到 τ>τy（牙膏）。`,
  },
  {
    key: 'bingham-flow',
    label: '宾汉流动曲线 τ(γ̇)：屈服截距',
    n: { min: 0, max: 10, step: 0.5, init: 5 },
    draw(tauY) {
      return {
        view: { x0: 0, x1: 10, y0: 0, y1: 30 },
        curves: [
          { f: (g) => tauY + MU_P * g, color: C.pink, width: 2.6, glow: true, label: 'bingham' },
          { f: (g) => MU_P * g, color: C.green, width: 2, dash: [6, 4], label: 'newton' },
        ],
        rects: [{ x: 0, y: 0, w: 10, h: tauY, fill: 'rgba(244,114,182,.08)' }],
        labels: [
          { text: `τ ≤ τy=${num(tauY, 2)}：γ̇ ≡ 0（不流动）`, x: 0.3, y: tauY / 2, color: C.pink },
          { text: `τ=3 时 γ̇ = ${tauY >= 3 ? '0（3 < τy，推不动）' : num((3 - tauY) / MU_P, 3)}`, x: 0.3, y: 27, color: tauY >= 3 ? C.red : C.cyan },
          { text: '牛顿对照：过原点直线 τ=μp·γ̇', x: 5.5, y: 4, color: C.green },
        ],
        points: [{ x: 0, y: tauY, fill: C.pink, label: `截距 τy=${num(tauY, 2)}`, dx: 8, dy: -6 }],
        axis: { x: 'γ̇', y: 'τ' },
        grid: { rows: 5, xTicks: 5 },
      };
    },
    readout(tauY) {
      const flows = tauY < 3;
      return [
        { label: '屈服应力 τy', value: num(tauY, 2) + ' Pa' },
        { label: 'τ=3 Pa 时 γ̇', value: flows ? num((3 - tauY) / MU_P, 4) : '0', verdict: flows ? 'ok' : 'fail' },
        { label: 'γ̇=5 时 τ', value: num(tauY + MU_P * 5, 3) + ' Pa' },
        { label: '与牛顿的差（任意 γ̇）', value: num(tauY, 3) + '（恒为 τy）' },
      ];
    },
    invariant(tauY) {
      // 恒等式：τ(γ̇) − μp·γ̇ ≡ τy（对 γ̇=7 对拍）
      return {
        label: 'τ(γ̇) − μp·γ̇ ≡ τy',
        expected: tauY,
        actual: tauY + MU_P * 7 - MU_P * 7,
        tol: 1e-12,
      };
    },
    note: (tauY) =>
      `τy=${num(tauY, 2)}。默认 τy=5 时「τ=3 → γ̇=0」正是要在图上读出的失败数值：应力不到屈服点，材料是固体。泥浆/牙膏/熔岩都靠这层截距「挂得住」。`,
  },
];

export const viscosityCurvesSpec: VizSpec = {
  module: 'viscosity-curves',
  title: 'I2 粘度曲线：牛顿/幂律/宾汉',
  modes: viscosityModes,
};

export const pathFluidSpecs: VizSpec[] = [pathContributionSpec, viscosityCurvesSpec];
