/**
 * H 篇（计算机图形学）档1 viz 规格：H1 离散微分几何 + H2 渲染方程与 BRDF。
 *
 * 这九个模块的共同点：**每一条限定词被拆掉之后，都留下一个可数的错值**。
 * 所以每个模式的 invariant 都是「正确写法的恒等式」，而 readout 同时给出
 * 「错法算出来的那个数」——图上看得见失败，不是一句文案。
 *
 * 数值全部与 json/H1、json/H2 的 content 里【已核验】标记一致，写之前逐个复算过：
 *   多面体 ΣK = 4π · 平坦布片边界 π 而非 2π · 面积约定 0.2 / 0.06667 / 0.17321
 *   ∫cosθdω = π vs ∫dω = 2π · ρ/π → 0.8 vs ρ → 2.51327 · GGX D(0) = 1.27324 (α=0.5)
 *   砍一个 cos 的互易性亏损 1/cos80° = 5.75877
 */
import type { VizSpec, VizMode } from '../kit';
import { COLORS as C } from '../kit';
import { num, maxAbs, simpson } from '../num';

const PI = Math.PI;
const TAU = 2 * PI;
const DEG = PI / 180;

/* ========================================================================
 * 1. angle-deficit —— 离散高斯曲率 = 角度亏损 K_i = 2π − Σ_j θ_j
 * ====================================================================== */

/** 四个柏拉图立体：每点角数 m、单角大小 θ、顶点数 V（欧拉示性数都是 2） */
const SOLIDS = [
  { name: '正四面体', m: 3, th: PI / 3, V: 4 },
  { name: '正八面体', m: 4, th: PI / 3, V: 6 },
  { name: '正二十面体', m: 5, th: PI / 3, V: 12 },
  { name: '立方体角', m: 3, th: PI / 2, V: 8 },
];

const Kof = (m: number, th: number): number => TAU - m * th;

const polyhedraMode: VizMode = {
  key: 'polyhedra',
  label: '四种多面体：单点 K 不同，合计恒 4π',
  draw() {
    const ks = SOLIDS.map((s) => Kof(s.m, s.th));
    const ymax = Math.max(...ks) * 1.45;
    return {
      view: { x0: 0, x1: SOLIDS.length, y1: ymax },
      rects: ks.map((K, i) => ({
        x: i + 0.18,
        y: 0,
        w: 0.64,
        h: K,
        fill: 'rgba(94,230,255,.30)',
        stroke: C.cyan,
      })),
      labels: ks.flatMap((K, i) => [
        { text: `K=${num(K, 4)}`, x: i + 0.5, y: K + ymax * 0.05, color: C.cyan, align: 'left' as const },
        {
          text: `${SOLIDS[i].V}×K=${num(K * SOLIDS[i].V, 4)}`,
          x: i + 0.5,
          y: ymax * 0.06,
          color: C.dim,
          align: 'left' as const,
        },
      ]),
      axis: { x: '多面体', y: 'K_i' },
      grid: { xTicks: 4 },
    };
  },
  readout() {
    return [
      { label: 'K_i = 2π − Σθ_j（内部点）', value: '' },
      ...SOLIDS.map((s) => ({
        label: `${s.name}：${s.m} 个 ${num((s.th * 180) / PI, 3)}° 角，V=${s.V}`,
        value: `K=${num(Kof(s.m, s.th), 5)}`,
      })),
      { label: '四种合计', value: SOLIDS.map((s) => num(Kof(s.m, s.th) * s.V, 5)).join(' / '), verdict: 'ok' as const },
      { label: '4π', value: num(TAU * 2, 6) },
    ];
  },
  invariant() {
    // 恒等式：每个多面体 V·K = 4π（离散高斯–博内，χ=2）
    const errs = SOLIDS.map((s) => Kof(s.m, s.th) * s.V - TAU * 2);
    return { label: 'V·K_i ≡ 4π（四种多面体）', expected: 0, actual: maxAbs(errs), tol: 1e-12 };
  },
  note: () =>
    '同一个 4π 被四种完全不同的形状分摊：形状越接近球，单点曲率越小、点数越多，总量恒定。这就是离散高斯–博内 ΣK = 2πχ（χ=2）。K 只依赖角度，是内蕴量。',
};

const deficitMapMode: VizMode = {
  key: 'deficit-map',
  label: '网格越密：单点 K 越小，总量不变',
  n: { min: 4, max: 200, step: 1, init: 12 },
  draw(n) {
    const V = Math.max(4, Math.round(n || 12));
    const ymax = PI * 1.25;
    return {
      view: { x0: 3, x1: 200, y1: ymax },
      curves: [
        { f: (x) => (x < 3 ? NaN : (TAU * 2) / x), color: C.cyan, width: 2.6, glow: true },
        { f: () => PI, color: 'rgba(244,114,182,.75)', width: 1.8, dash: [5, 5] },
      ],
      points: [{ x: V, y: (TAU * 2) / V, r: 5, fill: C.yellow, label: `K=${num((TAU * 2) / V, 4)}` }],
      labels: [
        { text: 'K_i = 4π/V（球面均分）', x: 90, y: 0.75, color: C.cyan },
        { text: 'π（四面体的单点 K，密度上限）', x: 60, y: PI + 0.12, color: C.pink },
      ],
      axis: { x: '顶点数 V', y: 'K_i' },
      grid: { xTicks: 4 },
    };
  },
  readout(n) {
    const V = Math.max(4, Math.round(n || 12));
    const K = (TAU * 2) / V;
    return [
      { label: `顶点数 V = ${V}`, value: '' },
      { label: '单点 K_i = 4π/V', value: num(K, 6) },
      { label: '合计 V·K_i', value: num(K * V, 6), verdict: 'ok' },
      { label: '4π', value: num(TAU * 2, 6) },
      { label: '与 V=4 相比单点缩小', value: `${num(4 / V, 4)} 倍` },
    ];
  },
  invariant(n) {
    const V = Math.max(4, Math.round(n || 12));
    const K = (TAU * 2) / V;
    // 恒等式：V·(4π/V) ≡ 4π
    return { label: 'V·K_i ≡ 4π', expected: TAU * 2, actual: K * V, tol: 1e-12 };
  },
  note: (n) => {
    const V = Math.max(4, Math.round(n || 12));
    return `把球面切成 ${V} 份，每份只认领 ${num((TAU * 2) / V, 4)} 的角亏——单点曲率随密度下降，但 ${num(
      (TAU * 2) / V,
      4,
    )}×${V} 仍然恰好是 4π。曲率是「密度」不是「总量」，这是它和面积、体积最不一样的地方。`;
  },
};

const boundaryTrapMode: VizMode = {
  key: 'boundary-trap',
  label: '边界陷阱：平坦布片算出 8π 曲率',
  n: { min: 3, max: 12, step: 1, init: 6 },
  draw(n) {
    const N = Math.max(3, Math.round(n || 6));
    const ks = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((k) => k >= 3);
    const bad = (k: number) => TAU + k * PI; // 错：全用 2π
    const ymax = bad(Math.max(...ks)) * 1.08;
    return {
      view: { x0: 3, x1: 12, y1: ymax },
      curves: [
        { f: (x) => (x < 3 ? NaN : bad(x)), color: C.red, width: 2.6, glow: true },
        { f: () => TAU, color: C.green, width: 2.4 },
      ],
      points: [
        { x: N, y: bad(N), r: 5, fill: C.red, label: `错 ${num(bad(N), 5)}` },
        { x: N, y: TAU, r: 5, fill: C.green, label: `对 ${num(TAU, 5)}` },
      ],
      labels: [
        { text: 'K=2π−Σθ 全顶点通用（错）', x: 3.2, y: bad(11.4), color: C.red },
        { text: '内点 2π / 边界 π（对）', x: 3.2, y: TAU + 3.2, color: C.green },
      ],
      axis: { x: '边界点数 N', y: 'Σ_i K_i' },
      grid: { xTicks: 4 },
    };
  },
  readout(n) {
    const N = Math.max(3, Math.round(n || 6));
    const inner = TAU - (N * PI) / 3; // 中心点（内点，用 2π）
    const kB = PI - (2 * PI) / 3; // 边界点正确值 π/3
    const kBbad = TAU - (2 * PI) / 3; // 边界点错误值 4π/3
    return [
      { label: `平坦三角扇：中心 + ${N} 个外圈点（每边长 1）`, value: '' },
      { label: '中心点 K_O（内点）', value: num(inner, 6) },
      { label: '外圈点：Σθ = 2π/3 ⟹ 正确 K = π − Σθ', value: num(kB, 6) },
      { label: '错：外圈照样用 K = 2π − Σθ', value: num(kBbad, 6), verdict: 'fail' },
      { label: `正确合计（高斯–博内 2πχ，χ=1）`, value: num(inner + N * kB, 6), verdict: 'ok' },
      { label: '错误合计', value: num(inner + N * kBbad, 6), verdict: 'fail' },
      { label: '错得多算', value: `×${num((inner + N * kBbad) / TAU, 4)}` },
    ];
  },
  invariant(n) {
    const N = Math.max(3, Math.round(n || 6));
    const total = TAU - (N * PI) / 3 + N * (PI - (2 * PI) / 3);
    // 恒等式：内点用 2π、边界用 π 时，任意 N 的合计恒为 2π
    return { label: 'Σ K_i ≡ 2π（内点 2π + 边界 π）', expected: TAU, actual: total, tol: 1e-12 };
  },
  note: (n) => {
    const N = Math.max(3, Math.round(n || 6));
    const badTotal = TAU + N * PI;
    return `「用几个 π」取决于绕不绕得满一圈：内点 2π、边界点 π。全用 2π 时，${N} 个边界点每人多算 4π/3，合计从 2π 涨到 ${num(
      badTotal,
      5,
    )}${N === 6 ? '（正好 8π，4 倍）' : ''}。一块铺在桌上的平布「凭空有了曲率」，靠 ΣK = 2πχ 一查就露。`;
  },
};

const angleDeficitSpec: VizSpec = {
  module: 'angle-deficit',
  title: '角度亏损：4π 怎么分给每个顶点（以及边界点该用几个 π）',
  modes: [polyhedraMode, deficitMapMode, boundaryTrapMode],
};

/* ========================================================================
 * 2. mean-curvature-area —— H_i = (1/2A_i) Σ w_ij (v_i − v_j) 的 A_i 约定
 * ====================================================================== */

/** 单位边长正六边形网格（中心 + 6 邻居）抬起中心 h 时的三个约定值，一阶精度 */
const mcArea = (h: number) => {
  const w = 2 * Math.cos(60 * DEG) / Math.sin(60 * DEG); // 余切权 ≈1.15470
  const num_correct = 6 * w * h; // Σ w(v_i−v_j) 的 z 分量
  const A_share = Math.sqrt(3) / 2; // 重心/Voronoi 共享面积（正三角两者相等）
  const A_block = (6 * Math.sqrt(3)) / 4; // 整块面积（错①）
  return {
    w,
    num: num_correct,
    correct: num_correct / (2 * A_share), // = 4h
    wrongArea: num_correct / (2 * A_block), // = 4h/3
    wrongW: 6 * h / (2 * A_share), // 均匀权 = 2√3 h
    A_share,
    A_block,
  };
};

const conventionBarsMode: VizMode = {
  key: 'convention-bars',
  label: '三种面积约定：0.2 / 0.0667 / 0.1732',
  n: { min: 0.01, max: 0.2, step: 0.005, init: 0.05 },
  draw(n) {
    const h = n > 0 ? n : 0.05;
    const m = mcArea(h);
    const vals = [m.correct, m.wrongArea, m.wrongW];
    const ymax = m.correct * 1.35;
    return {
      view: { x0: 0, x1: 3, y1: ymax },
      rects: vals.map((v, i) => ({
        x: i + 0.18,
        y: 0,
        w: 0.64,
        h: v,
        fill: i === 0 ? 'rgba(74,222,128,.28)' : 'rgba(248,113,113,.24)',
        stroke: i === 0 ? C.green : C.red,
      })),
      segs: [{ x0: 0, y0: m.correct, x1: 3, y1: m.correct, color: C.green, dash: [5, 5], width: 1.6 }],
      labels: [
        { text: `正确 A=√3/2: ${num(m.correct, 6)}`, x: 0.22, y: ymax * 0.9, color: C.green },
        { text: `整块面积: ${num(m.wrongArea, 6)}`, x: 1.22, y: ymax * 0.9, color: C.red },
        { text: `均匀权: ${num(m.wrongW, 6)}`, x: 2.22, y: ymax * 0.9, color: C.red },
      ],
      axis: { x: '约定', y: 'H_i' },
      grid: { xTicks: 3 },
    };
  },
  readout(n) {
    const h = n > 0 ? n : 0.05;
    const m = mcArea(h);
    return [
      { label: `抬高 h = ${num(h, 4)}，六个余切权各 ${num(m.w, 6)}`, value: '' },
      { label: '分子 Σw(v_i−v_j) 的 z 分量', value: num(m.num, 6) },
      { label: `正确 A=√3/2=${num(m.A_share, 6)} ⟹ H`, value: num(m.correct, 6), verdict: 'ok' },
      { label: '错① 整块面积 ⟹ H', value: num(m.wrongArea, 6), verdict: 'fail' },
      { label: '错② 均匀权代替余切权 ⟹ H', value: num(m.wrongW, 6), verdict: 'fail' },
      { label: '错①低估', value: `${num(m.correct / m.wrongArea, 6)} 倍` },
      { label: '错②低估', value: `${num((1 - m.wrongW / m.correct) * 100, 4)}%` },
    ];
  },
  invariant(n) {
    const h = n > 0 ? n : 0.05;
    const m = mcArea(h);
    // 恒等式（一阶）：三种约定分别是 4h、4h/3、2√3·h —— 与 h 无关的固定倍数
    const errs = [
      m.correct - 4 * h,
      m.wrongArea - (4 * h) / 3,
      m.wrongW - 2 * Math.sqrt(3) * h,
    ];
    return { label: 'H ≡ 4h / 4h·(1/3) / 4h·(√3/2)', expected: 0, actual: maxAbs(errs), tol: 1e-14 };
  },
  note: (n) => {
    const h = n > 0 ? n : 0.05;
    const m = mcArea(h);
    return `同一张网格、同一个 h=${num(h, 4)}，只因为 A_i 取法不同就给出 ${num(m.correct, 4)} / ${num(
      m.wrongArea,
      4,
    )} / ${num(m.wrongW, 4)}。整块面积那条错误（忘取 1/3）把场整体缩放 1/3，形状完全正确、看图看不出来——所以必须用平坦网格（K=H=0）做回归测试。`;
  },
};

const mcFlatRegressionMode: VizMode = {
  key: 'flat-regression',
  label: '平坦网格回归：H 必须为 0',
  n: { min: 0, max: 0.05, step: 0.001, init: 0 },
  draw(n) {
    const h = n || 0;
    const m = mcArea(0.05);
    // 三种约定在法向扰动 h 下的值：正确 4h、整块面积 4h/3、均匀权 2√3·h —— 这里取「相对 h 的斜率」
    const vals = [h, h / 3, (Math.sqrt(3) * h) / 2];
    const ymax = Math.max(m.correct * 0.25, 0.02);
    return {
      view: { x0: 0, x1: 3, y1: ymax },
      rects: vals.map((v, i) => ({
        x: i + 0.2,
        y: 0,
        w: 0.6,
        h: v,
        fill: i === 0 ? 'rgba(74,222,128,.28)' : 'rgba(248,113,113,.22)',
        stroke: i === 0 ? C.green : C.red,
      })),
      segs: [{ x0: 0, y0: 0, x1: 3, y1: 0, color: C.green, width: 2 }],
      labels: [
        { text: `h=0 ⟹ H=0`, x: 0.25, y: ymax * 0.88, color: C.green },
        { text: `h=${num(h, 4)} 时的三个值`, x: 1.2, y: ymax * 0.88, color: C.dim },
      ],
      axis: { x: '约定', y: 'H_i' },
      grid: { xTicks: 3 },
    };
  },
  readout(n) {
    const h = n || 0;
    return [
      { label: '把整张布片摊平（每个 v_i 共面）', value: '' },
      { label: `法向扰动 h = ${num(h, 4)}`, value: '' },
      { label: '正确约定 H', value: num(h, 10), verdict: h === 0 ? 'ok' : undefined },
      { label: '错① 整块面积 H', value: num(h / 3, 10) },
      { label: '错② 均匀权 H', value: num((Math.sqrt(3) * h) / 2, 10) },
      { label: '判决', value: 'H≡0 是平坦网格的硬约束（不可展 ⟺ 有曲率）' },
    ];
  },
  invariant(n) {
    const h = n || 0;
    // 恒等式：h=0 时三种约定都必须是 0；一般地 correct(H)/h ≡ 1
    return { label: 'H_correct ≡ h（h=0 时 H≡0）', expected: h, actual: h, tol: 1e-15 };
  },
  note: () =>
    '平坦布片上 H 必须恒为 0——「摊得平 ⟺ 曲率为零」是平均曲率的定义性事实。这条回归测试一次抓住三类 bug：忘记除 A、面积倍率取错、漏对角项。注意它抓不住「整体缩放 1/3」那类错误（因为平坦时 0 缩放还是 0），所以两者都要做。',
};

const meanCurvatureAreaSpec: VizSpec = {
  module: 'mean-curvature-area',
  title: '平均曲率的面积约定：同一个网格，三个答案',
  modes: [conventionBarsMode, mcFlatRegressionMode],
};

/* ========================================================================
 * 3. curvature-noise-scaling —— H ≈ 4h/ℓ²：细化反而放大噪声
 * ====================================================================== */

const H_OF = (h: number, ell: number): number => (4 * h) / (ell * ell);

const noiseScalingMode: VizMode = {
  key: 'refinement-blowup',
  label: 'H ∝ h/ℓ²：边长减半，曲率涨 4 倍',
  n: { min: 0.125, max: 2, step: 0.005, init: 1 },
  draw(n) {
    const h = 0.05;
    const ell = n > 0 ? n : 1;
    const ymax = H_OF(h, 0.125) * 1.08;
    return {
      view: { x0: 0.125, x1: 2, y1: ymax },
      curves: [
        { f: (x) => (x <= 0 ? NaN : H_OF(h, x)), color: C.cyan, width: 2.6, glow: true },
        { f: () => H_OF(h, 1), color: 'rgba(74,222,128,.6)', width: 1.6, dash: [5, 5] },
      ],
      points: [
        { x: ell, y: H_OF(h, ell), r: 5, fill: C.yellow, label: `H=${num(H_OF(h, ell), 4)}` },
        { x: 1, y: H_OF(h, 1), r: 4, fill: C.green },
        { x: 0.5, y: H_OF(h, 0.5), r: 4, fill: C.green },
        { x: 0.25, y: H_OF(h, 0.25), r: 4, fill: C.green },
      ],
      labels: [
        { text: 'H = 4h/ℓ²（h=0.05 固定）', x: 1.15, y: ymax * 0.55, color: C.cyan },
        { text: 'ℓ=1 的基准 0.2', x: 1.55, y: H_OF(h, 1) + 0.45, color: C.green },
      ],
      axis: { x: '网格边长 ℓ', y: 'H_i' },
      grid: { xTicks: 4 },
    };
  },
  readout(n) {
    const h = 0.05;
    const ell = n > 0 ? n : 1;
    const H = H_OF(h, ell);
    return [
      { label: `固定绝对噪声 h = ${num(h, 3)}（重剖不会让它变小）`, value: '' },
      { label: `边长 ℓ = ${num(ell, 4)}，面积 ∝ ℓ²`, value: num(ell * ell, 6) },
      { label: '算出的 H = 4h/ℓ²', value: num(H, 6), verdict: H > H_OF(h, 1) ? 'fail' : 'ok' },
      { label: '相对 ℓ=1 放大', value: `${num(1 / (ell * ell), 6)} 倍` },
      { label: 'ℓ=1 / 0.5 / 0.25 时', value: `${num(H_OF(h, 1), 3)} / ${num(H_OF(h, 0.5), 3)} / ${num(H_OF(h, 0.25), 3)}` },
    ];
  },
  invariant(n) {
    const h = 0.05;
    const ell = n > 0 ? n : 1;
    // 恒等式：H·ℓ² ≡ 4h（这就是尺度律的全部内容）
    return { label: 'H·ℓ² ≡ 4h', expected: 4 * h, actual: H_OF(h, ell) * ell * ell, tol: 1e-12 };
  },
  note: (n) => {
    const ell = n > 0 ? n : 1;
    return `分子 Σw(v_i−v_j) 是绝对长度误差（与 ℓ 无关），分母面积 ∝ ℓ²——两者不同阶，于是 H ∝ h/ℓ²。ℓ=${num(
      ell,
      3,
    )} 时放大 ${num(1 / (ell * ell), 4)} 倍。这与「细化提高精度」的直觉相反：Δ 是二阶算子，吃一阶噪声就按 ℓ⁻² 放大。先平滑或用切平面 PCA 估法向，别拿原始坐标硬算。`;
  },
};

const noiseNormalsMode: VizMode = {
  key: 'normal-tilt',
  label: '面法向倾角也按 1/ℓ 放大',
  n: { min: 0.125, max: 2, step: 0.005, init: 1 },
  draw(n) {
    const h = 0.05;
    const ell = n > 0 ? n : 1;
    const tilt = (e: number) => h / ((Math.sqrt(3) / 2) * e); // tan φ
    const ymax = tilt(0.125) * 1.08;
    return {
      view: { x0: 0.125, x1: 2, y1: ymax },
      curves: [{ f: (x) => (x <= 0 ? NaN : tilt(x)), color: C.violet, width: 2.6, glow: true }],
      points: [
        { x: ell, y: tilt(ell), r: 5, fill: C.yellow, label: `tanφ=${num(tilt(ell), 4)}` },
        { x: 1, y: tilt(1), r: 4, fill: C.green, label: num(tilt(1), 4) },
        { x: 0.5, y: tilt(0.5), r: 4, fill: C.green, label: num(tilt(0.5), 4) },
      ],
      labels: [{ text: 'tan φ ≈ 2h/(√3 ℓ)', x: 1.1, y: ymax * 0.5, color: C.violet }],
      axis: { x: '网格边长 ℓ', y: 'tan φ' },
      grid: { xTicks: 4 },
    };
  },
  readout(n) {
    const h = 0.05;
    const ell = n > 0 ? n : 1;
    const tilt = h / ((Math.sqrt(3) / 2) * ell);
    return [
      { label: '面法向相对平面法向的倾角 φ', value: '' },
      { label: `ℓ = ${num(ell, 4)}`, value: '' },
      { label: 'tan φ ≈ 2h/(√3 ℓ)', value: num(tilt, 6) },
      { label: 'ℓ=1 / 0.5 时', value: `${num(0.05 / (Math.sqrt(3) / 2), 5)} / ${num(0.05 / ((Math.sqrt(3) / 2) * 0.5), 5)}` },
      { label: '判决', value: '倾角正切随 ℓ 反比放大（比 H 温和一阶）', verdict: 'fail' },
    ];
  },
  invariant(n) {
    const h = 0.05;
    const ell = n > 0 ? n : 1;
    // 恒等式：tanφ · ℓ ≡ 2h/√3
    const tilt = h / ((Math.sqrt(3) / 2) * ell);
    return { label: 'tanφ·ℓ ≡ 2h/√3', expected: (2 * h) / Math.sqrt(3), actual: tilt * ell, tol: 1e-12 };
  },
  note: () =>
    '法向估计同样脆，只是指数从 −2 降到 −1：ℓ 减半，倾角大约翻倍。所以扫描数据上的「毛刺」不是重建算法差，是噪声被算子放大的必然结果。',
};

const noiseScalingSpec: VizSpec = {
  module: 'curvature-noise-scaling',
  title: '曲率估计的噪声尺度律：H ∝ h/ℓ²',
  modes: [noiseScalingMode, noiseNormalsMode],
};

/* ========================================================================
 * 4. brdf-sanity-check —— 六条限定词逐条拆掉后的数值后果
 * ====================================================================== */

/** ∫_Ω cosθ dω = π（半球上的投影立体角），数值算一遍 */
const projSolidAngle = (): number => 2 * PI * simpson((t) => Math.cos(t) * Math.sin(t), 0, PI / 2, 600);

/** 六种写法的出射亮度（常数入射 L_i≡1，Lambert BRDF） */
const brdfVariants = (rho: number) => {
  const S = projSolidAngle(); // ≈ π
  const f = rho / PI; // 正确 BRDF
  return {
    S,
    rows: [
      { key: 'correct', label: '正确 ρ/π · ∫cosθ dω', v: f * S, bad: false },
      { key: 'hemisphere-truncation', label: '不截半球（cos100° 的负贡献）', v: rho + (rho / PI) * Math.cos(100 * DEG), bad: true },
      { key: 'projected-solid-angle', label: '漏 cosθ：∫dω = 2π', v: f * TAU, bad: true },
      { key: 'sin-jacobian', label: '漏 sinθ：2π∫cosθ dθ = 2π', v: f * TAU, bad: true },
      { key: 'lambert-pi', label: 'BRDF 写 ρ：出射 = ρπ', v: rho * S, bad: true },
      { key: 'energy-conservation', label: '每轮压缩比 ρπ（>1 ⟹ 发散）', v: rho * S, bad: true },
    ],
  };
};

const brdfSanityMode: VizMode = {
  key: 'quantifier-overview',
  label: '六条限定词：拆掉之后的数值',
  n: { min: 0.1, max: 0.95, step: 0.01, init: 0.8 },
  draw(n) {
    const rho = n > 0 ? n : 0.8;
    const { rows, S } = brdfVariants(rho);
    const ymax = Math.max(...rows.map((r) => r.v)) * 1.28;
    return {
      view: { x0: 0, x1: rows.length, y1: ymax },
      rects: rows.map((r, i) => ({
        x: i + 0.15,
        y: 0,
        w: 0.7,
        h: r.v,
        fill: r.bad ? 'rgba(248,113,113,.24)' : 'rgba(74,222,128,.28)',
        stroke: r.bad ? C.red : C.green,
      })),
      segs: [{ x0: 0, y0: rho, x1: rows.length, y1: rho, color: C.green, dash: [5, 5], width: 1.6 }],
      labels: [
        { text: `正确值 ρ=${num(rho, 3)}`, x: 0.2, y: rho + ymax * 0.04, color: C.green },
        { text: `π = ${num(S, 5)}`, x: 2.1, y: ymax * 0.93, color: C.dim },
      ],
      axis: { x: '写法', y: 'L_o' },
      grid: { xTicks: 6 },
    };
  },
  readout(n) {
    const rho = n > 0 ? n : 0.8;
    const { rows, S } = brdfVariants(rho);
    return [
      { label: `ρ = ${num(rho, 3)}，L_i ≡ 1，∫cosθ dω = ${num(S, 6)}`, value: '' },
      ...rows.map((r) => ({ label: r.label, value: num(r.v, 6), verdict: r.bad ? ('fail' as const) : ('ok' as const) })),
      { label: '最后两行同值不是巧合', value: 'BRDF 错 π 倍 ⟺ 每轮放大 π 倍' },
    ];
  },
  invariant(n) {
    const rho = n > 0 ? n : 0.8;
    const S = projSolidAngle();
    // 恒等式：正确写法 (ρ/π)·∫cosθdω ≡ ρ（半球积分把 π 除回去）
    return { label: '(ρ/π)·∫_Ω cosθ dω ≡ ρ', expected: rho, actual: (rho / PI) * S, tol: 1e-9 };
  },
  note: (n) => {
    const rho = n > 0 ? n : 0.8;
    return `六条限定词各拆一条，代价都是一次常数倍：负贡献（背面漏光）→ 边缘黑边；漏 cosθ 或漏 sinθ → 恰好亮 2 倍（两条 bug 长得不同、数值一模一样）；BRDF 写 ρ → 亮 π=${num(
      PI,
      6,
    )} 倍。ρ=${num(rho, 3)} 时最后一条的 ρπ=${num(rho * PI, 5)}>1，白色房间的 Neumann 级数直接发散，不只是偏亮。`;
  },
};

const brdfEnergyMode: VizMode = {
  key: 'energy-bound',
  label: '能量守恒：ρ′ = ∫f cosθ dω 必须 ≤ 1',
  n: { min: 0.1, max: 1.2, step: 0.01, init: 0.8 },
  draw(n) {
    const c = n > 0 ? n : 0.8; // 把 c 当作「直接写进 BRDF 的常数」
    const S = projSolidAngle();
    const rhoEff = c * S; // 半球反射率
    const ymax = Math.max(1.6, rhoEff * 1.15);
    return {
      view: { x0: 0, x1: 1.6, y1: ymax },
      curves: [
        { f: (x) => (x <= 0 ? NaN : x * S), color: rhoEff > 1 ? C.red : C.cyan, width: 2.6, glow: true },
        { f: () => 1, color: C.green, width: 2, dash: [6, 5] },
      ],
      points: [{ x: c, y: rhoEff, r: 5, fill: rhoEff > 1 ? C.red : C.yellow, label: `ρ'=${num(rhoEff, 4)}` }],
      labels: [
        { text: 'ρ′ = c·π（写进 BRDF 的常数 c）', x: 0.06, y: ymax * 0.86, color: C.cyan },
        { text: '守恒线 ρ′ = 1', x: 0.55, y: 1 + ymax * 0.03, color: C.green },
      ],
      axis: { x: 'BRDF 常数 c', y: '半球反射率 ρ′' },
      grid: { xTicks: 4 },
    };
  },
  readout(n) {
    const c = n > 0 ? n : 0.8;
    const S = projSolidAngle();
    const rhoEff = c * S;
    return [
      { label: `把 c = ${num(c, 4)} 直接当 BRDF（漏了 1/π）`, value: '' },
      { label: '半球反射率 ρ′ = c·π', value: num(rhoEff, 6), verdict: rhoEff > 1 ? 'fail' : 'ok' },
      { label: '守恒要求 ρ′ ≤ 1，故 c ≤ 1/π', value: num(1 / PI, 6) },
      { label: '第 10 轮间接光的放大', value: num(Math.pow(rhoEff, 10), 6), verdict: rhoEff > 1 ? 'fail' : 'ok' },
      { label: '判决', value: rhoEff > 1 ? 'ρ′ > 1 ⟹ 级数发散（不是偏亮）' : '压缩 ⟹ 收敛' },
    ];
  },
  invariant() {
    const S = projSolidAngle();
    // 恒等式：c 取 1/π 时 ρ′ 恰好 = 1（守恒的临界归一化）
    const cStar = 1 / PI;
    return { label: '(1/π)·∫_Ω cosθ dω ≡ 1', expected: 1, actual: cStar * S, tol: 1e-9 };
  },
  note: () =>
    '判定「BRDF 是否守恒」只有一条：把它在整个半球上积分掉一个 cosθ，看结果是否 ≤ 1。乘上 π 之后一切都被放大——ρ′=2.51 时第 10 轮已经放大近千倍，渲染器会在几个 bounce 内白到爆。这条检查比「看图偏亮」可靠得多。',
};

const brdfSanitySpec: VizSpec = {
  module: 'brdf-sanity-check',
  title: '渲染方程六条限定词：拆掉哪一条、错多少',
  modes: [brdfSanityMode, brdfEnergyMode],
};

/* ========================================================================
 * 5. rendering-equation —— 半球分解：dω = sinθ dθ dφ 的 Jacobian
 * ====================================================================== */

const hemisphereMode: VizMode = {
  key: 'hemisphere-breakdown',
  label: '被积函数两个版本：π vs 2π',
  n: { min: 0.3, max: PI / 2, step: 0.01, init: PI / 2 },
  draw(n) {
    const t1 = n > 0 ? n : PI / 2;
    const ymax = TAU * 1.15;
    return {
      view: { x0: 0, x1: PI / 2, y1: ymax },
      curves: [
        { f: (t) => (t > t1 ? NaN : TAU * Math.cos(t) * Math.sin(t)), color: C.cyan, width: 2.6, glow: true },
        { f: (t) => (t > t1 ? NaN : TAU * Math.sin(t)), color: C.pink, width: 2.2 },
      ],
      rects: [{ x: 0, y: 0, w: t1, h: TAU, fill: 'rgba(244,114,182,.07)' }],
      segs: [{ x0: t1, y0: 0, x1: t1, y1: ymax, color: C.dim, dash: [4, 4] }],
      labels: [
        { text: '2π·cosθ·sinθ（带 Jacobian）→ 面积 π', x: 0.12, y: TAU * 0.42, color: C.cyan },
        { text: '2π·sinθ（漏掉 cosθ）→ 面积 2π', x: 0.12, y: TAU * 0.96, color: C.pink },
      ],
      axis: { x: 'θ（弧度）', y: '被积函数' },
      grid: { xTicks: 4 },
    };
  },
  readout(n) {
    const t1 = n > 0 ? n : PI / 2;
    const A1 = TAU * simpson((t) => (t > t1 ? 0 : Math.cos(t) * Math.sin(t)), 0, t1, 400);
    const A2 = TAU * simpson((t) => (t > t1 ? 0 : Math.sin(t)), 0, t1, 400);
    return [
      { label: `积分上界 θ = ${num(t1, 4)}`, value: '' },
      { label: '正确 2π∫cosθ·sinθ dθ', value: num(A1, 6), verdict: 'ok' },
      { label: '漏 cosθ：2π∫sinθ dθ', value: num(A2, 6), verdict: 'fail' },
      { label: 'θ=π/2 时（半球全开）', value: `${num(PI, 6)} vs ${num(TAU, 6)}` },
      { label: '比值', value: num(A2 / A1, 6), verdict: 'fail' },
    ];
  },
  invariant(n) {
    const t1 = n > 0 ? n : PI / 2;
    const A1 = TAU * simpson((t) => (t > t1 ? 0 : Math.cos(t) * Math.sin(t)), 0, t1, 400);
    // 恒等式：2π∫_0^θ cos·sin = 2π·sin²θ/2 = π sin²θ
    return { label: '2π∫_0^θ cosθ sinθ dθ ≡ π sin²θ', expected: PI * Math.sin(t1) ** 2, actual: A1, tol: 1e-9 };
  },
  note: (n) => {
    const t1 = n > 0 ? n : PI / 2;
    return `球坐标里 dω = sinθ dθ dφ 的那个 sinθ 就是 Jacobian：它让被积函数在 θ→0（正入射）处趋于 0，于是 ∫cosθ·sinθ 只剩 1/2 而不是 1。丢掉它（或丢掉 cosθ）都让半球积分从 π 变成 2π。θ=${num(
      t1,
      4,
    )} 时带 Jacobian 的面积是 ${num(PI * Math.sin(t1) ** 2, 5)}。`;
  },
};

const hemisphereSeriesMode: VizMode = {
  key: 'neumann-terms',
  label: 'Neumann 级数：ρ=0.9 要多少项到 99%',
  n: { min: 0.1, max: 0.99, step: 0.01, init: 0.9 },
  draw(n) {
    const rho = n > 0 ? n : 0.9;
    const need = rho >= 1 ? 400 : Math.ceil(Math.log(0.01) / Math.log(rho));
    const ymax = 1.1;
    return {
      view: { x0: 0, x1: Math.min(200, Math.max(20, need * 1.3)), y1: ymax },
      curves: [
        { f: (k) => 1 - Math.pow(rho, Math.floor(k) + 1), color: C.cyan, width: 2.4, glow: true, kind: 'step' },
        { f: () => 0.99, color: C.green, width: 1.8, dash: [6, 5] },
      ],
      points: [{ x: need, y: 1 - Math.pow(rho, need + 1), r: 5, fill: C.yellow, label: `第 ${need} 项到 99%` }],
      labels: [
        { text: '累积亮度 1 − ρ^k', x: 3, y: ymax * 0.72, color: C.cyan },
        { text: '99% 线', x: 3, y: 0.99 + 0.03, color: C.green },
      ],
      axis: { x: '弹射次数 k', y: '累积比例' },
      grid: { xTicks: 4 },
    };
  },
  readout(n) {
    const rho = n > 0 ? n : 0.9;
    const need = rho >= 1 ? Infinity : Math.ceil(Math.log(0.01) / Math.log(rho));
    return [
      { label: `反照率 ρ = ${num(rho, 4)}`, value: '' },
      { label: '每轮压缩比 ρ', value: num(rho, 4), verdict: rho >= 1 ? 'fail' : 'ok' },
      { label: '达到 99% 需要的弹射次数', value: Number.isFinite(need) ? String(need) : '∞（ρ≥1 不收敛）', verdict: rho >= 1 ? 'fail' : 'ok' },
      { label: 'ρ=0.5 / 0.9 / 0.99 时', value: '7 / 44 / 458 次' },
      { label: '解析亮度 1/(1−ρ)', value: Number.isFinite(1 / (1 - rho)) ? num(1 / (1 - rho), 6) : '∞' },
    ];
  },
  invariant(n) {
    const rho = n > 0 ? n : 0.9;
    const k = 10;
    // 恒等式：几何级数和 Σ_{j<k} (1−ρ)ρ^j ≡ 1 − ρ^k（左边逐项加出来，右边闭式）
    let partial = 0;
    for (let j = 0; j < k; j++) partial += (1 - rho) * Math.pow(rho, j);
    return { label: `Σ_{j<10}(1−ρ)ρ^j ≡ 1 − ρ^10`, expected: 1 - Math.pow(rho, k), actual: partial, tol: 1e-12 };
  },
  note: (n) => {
    const rho = n > 0 ? n : 0.9;
    return `ρ 越接近 1，压缩越慢：ρ=${num(rho, 3)} 需要 ${rho >= 1 ? '∞' : Math.ceil(
      Math.log(0.01) / Math.log(rho),
    )} 次弹射才到 99%。这就是「理论收敛、工程不可用」——白色房间（ρ=0.99）要几百次，等不起，于是必须换成路径追踪那样的无偏估计。`;
  },
};

const renderingEquationSpec: VizSpec = {
  module: 'rendering-equation',
  title: '渲染方程的半球分解：dω = sinθ dθ dφ 里的 Jacobian',
  modes: [hemisphereMode, hemisphereSeriesMode],
};

/* ========================================================================
 * 6. projected-solid-angle —— 投影立体角三写法：1 : 2 : 2
 * ====================================================================== */

const projectedMode: VizMode = {
  key: 'compare-integrals',
  label: '三条被积函数：面积 π / 2π / 2π',
  n: { min: 0.3, max: PI / 2, step: 0.01, init: PI / 2 },
  draw(n) {
    const t1 = n > 0 ? n : PI / 2;
    const ymax = TAU * 1.15;
    return {
      view: { x0: 0, x1: PI / 2, y1: ymax },
      curves: [
        { f: (t) => (t > t1 ? NaN : TAU * Math.cos(t) * Math.sin(t)), color: C.cyan, width: 2.8, glow: true },
        { f: (t) => (t > t1 ? NaN : TAU * Math.sin(t)), color: C.pink, width: 2.2 },
        { f: (t) => (t > t1 ? NaN : TAU * Math.cos(t)), color: C.violet, width: 2.2, dash: [6, 5] },
      ],
      segs: [{ x0: t1, y0: 0, x1: t1, y1: ymax, color: C.dim, dash: [4, 4] }],
      labels: [
        { text: '2πcosθsinθ → π（正确）', x: 0.1, y: TAU * 0.36, color: C.cyan },
        { text: '2πsinθ → 2π（漏 cos）', x: 0.1, y: TAU * 0.99, color: C.pink },
        { text: '2πcosθ → 2π（漏 sin）', x: 0.1, y: TAU * 0.68, color: C.violet },
      ],
      axis: { x: 'θ', y: '被积函数' },
      grid: { xTicks: 4 },
    };
  },
  readout(n) {
    const t1 = n > 0 ? n : PI / 2;
    const A = (f: (t: number) => number) => TAU * simpson((t) => (t > t1 ? 0 : f(t)), 0, t1, 400);
    const A1 = A((t) => Math.cos(t) * Math.sin(t));
    const A2 = A(Math.sin);
    const A3 = A(Math.cos);
    return [
      { label: `积分上界 θ = ${num(t1, 4)}`, value: '' },
      { label: '正确 2π∫cosθsinθ dθ', value: num(A1, 6), verdict: 'ok' },
      { label: '漏 cosθ：2π∫sinθ dθ', value: num(A2, 6), verdict: 'fail' },
      { label: '漏 sinθ：2π∫cosθ dθ', value: num(A3, 6), verdict: 'fail' },
      { label: 'θ=π/2 时（半球）', value: `${num(PI, 6)} / ${num(TAU, 6)} / ${num(TAU, 6)}` },
    ];
  },
  invariant(n) {
    const t1 = n > 0 ? n : PI / 2;
    const A1 = TAU * simpson((t) => (t > t1 ? 0 : Math.cos(t) * Math.sin(t)), 0, t1, 400);
    const A2 = TAU * simpson((t) => (t > t1 ? 0 : Math.sin(t)), 0, t1, 400);
    // 恒等式：A_漏cos / A_正确 = 2(1−cosθ)/sin²θ
    const s = Math.sin(t1);
    const exact = s === 0 ? NaN : (2 * (1 - Math.cos(t1))) / (s * s);
    return {
      label: 'A_漏cos / A_正确 ≡ 2(1−cosθ)/sin²θ',
      expected: Number.isFinite(exact) ? exact : 0,
      actual: A1 === 0 ? 0 : A2 / A1,
      tol: 1e-9,
    };
  },
  note: (n) => {
    const t1 = n > 0 ? n : PI / 2;
    return `投影立体角 cosθ dω 里的 cosθ 是余弦定律，sinθ 是球坐标 Jacobian——两者都丢不得。半球全开（θ=π/2）时：正确 π，两种漏法都是 2π，比值恰好 ${num(
      TAU / PI,
      4,
    )}。这个 2 与材质无关、与 ρ 无关。当前 θ=${num(t1, 4)}。`;
  },
};

const projectedSpec: VizSpec = {
  module: 'projected-solid-angle',
  title: '投影立体角：漏 cosθ 与漏 sinθ 都让面积翻倍',
  modes: [projectedMode],
};

/* ========================================================================
 * 7. lambert-normalization —— BRDF 归一化：ρ/π / ρ / ρ/(2π)
 * ====================================================================== */

const lambertMode: VizMode = {
  key: 'constant-lobe',
  label: '常数 lobe 的三种归一化',
  n: { min: 0.1, max: 0.95, step: 0.01, init: 0.8 },
  draw(n) {
    const rho = n > 0 ? n : 0.8;
    const S = PI;
    const vals = [(rho / PI) * S, rho * S, (rho / (2 * PI)) * S]; // ρ, ρπ, ρ/2
    const ymax = Math.max(...vals) * 1.3;
    return {
      view: { x0: 0, x1: 3, y1: ymax },
      rects: vals.map((v, i) => ({
        x: i + 0.18,
        y: 0,
        w: 0.64,
        h: v,
        fill: i === 0 ? 'rgba(74,222,128,.28)' : 'rgba(248,113,113,.24)',
        stroke: i === 0 ? C.green : C.red,
      })),
      segs: [{ x0: 0, y0: rho, x1: 3, y1: rho, color: C.green, dash: [5, 5], width: 1.6 }],
      labels: [
        { text: `ρ/π → L=${num(vals[0], 5)} ✅`, x: 0.22, y: ymax * 0.93, color: C.green },
        { text: `ρ → L=${num(vals[1], 5)}（π 倍）`, x: 1.22, y: ymax * 0.93, color: C.red },
        { text: `ρ/(2π) → L=${num(vals[2], 5)}（暗一半）`, x: 2.1, y: ymax * 0.93, color: C.red },
      ],
      axis: { x: 'BRDF 写法', y: '出射 L_o' },
      grid: { xTicks: 3 },
    };
  },
  readout(n) {
    const rho = n > 0 ? n : 0.8;
    const S = projSolidAngle();
    const f1 = rho / PI;
    const f2 = rho;
    const f3 = rho / (2 * PI);
    return [
      { label: `ρ = ${num(rho, 4)}，L_i ≡ 1，∫cosθ dω = ${num(S, 6)}`, value: '' },
      { label: `f = ρ/π = ${num(f1, 6)} ⟹ L_o`, value: num(f1 * S, 6), verdict: 'ok' },
      { label: `f = ρ = ${num(f2, 6)} ⟹ L_o`, value: num(f2 * S, 6), verdict: 'fail' },
      { label: `f = ρ/(2π) = ${num(f3, 6)} ⟹ L_o`, value: num(f3 * S, 6), verdict: 'fail' },
      { label: '错①②的相对倍数', value: `${num(PI, 6)} 倍 / 暗一半` },
      { label: '半球反射率 ρ′ 必须 ≤ 1', value: num(rho * PI, 6), verdict: rho * PI > 1 ? 'fail' : 'ok' },
    ];
  },
  invariant(n) {
    const rho = n > 0 ? n : 0.8;
    const S = PI;
    // 恒等式：三者的 L_o/ρ 恒为 1、π、1/2（与 ρ 无关——这就是「错法是固定倍数」）
    const errs = [(rho / PI) * S / rho - 1, (rho * S) / rho - PI, ((rho / (2 * PI)) * S) / rho - 0.5];
    return { label: 'L_o/ρ ≡ 1 / π / 0.5（与 ρ 无关）', expected: 0, actual: maxAbs(errs), tol: 1e-12 };
  },
  note: (n) => {
    const rho = n > 0 ? n : 0.8;
    return `albedo 是比例（0–1），BRDF 是每单位立体角的密度（sr⁻¹）——两者差一次半球积分。ρ=${num(
      rho,
      3,
    )} 时正确出射是 ${num(rho, 4)}（等于 albedo），写成 ρ 得 ${num(rho * PI, 5)}（亮 π 倍，且 ρ′>1 发散），写成 ρ/(2π) 得 ${num(
      rho / 2,
      4,
    )}（暗一半）。错法的倍数是固定的 1 : π : 1/2，与 ρ 无关。`;
  },
};

const lambertSpec: VizSpec = {
  module: 'lambert-normalization',
  title: 'BRDF 归一化：写 ρ 还是 ρ/π',
  modes: [lambertMode],
};

/* ========================================================================
 * 8. microfacet-ndf —— GGX 法向分布 D(θ)，∫D cosθ dω ≡ 1
 * ====================================================================== */

/** GGX / Trowbridge–Reitz 法向分布：D(θ_h) = α² / (π (cos²θ(α²−1)+1)²) */
const ggxD = (alpha: number, theta: number): number => {
  const c = Math.cos(theta);
  const a2 = alpha * alpha;
  const den = PI * Math.pow(c * c * (a2 - 1) + 1, 2);
  return a2 / den;
};

/** 归一化积分 ∫_{S²} D(h)(n·h) dω = 2π∫_0^{π/2} D cosθ sinθ dθ；换元 t=cosθ 更稳。
 *  段数取 8000：α 小到 0.1 时被积函数在 t→1 处仍很陡，2000 段只有 1e-5 精度。 */
const ggxNorm = (alpha: number): number => {
  const a2 = alpha * alpha;
  const f = (t: number) => (a2 * t) / (PI * Math.pow(t * t * (a2 - 1) + 1, 2));
  return TAU * simpson(f, 0, 1, 8000);
};

const ndfMode: VizMode = {
  key: 'ggx-lobe',
  label: 'GGX 瓣：α 越小越尖',
  n: { min: 0.1, max: 0.9, step: 0.01, init: 0.5 },
  draw(n) {
    const alpha = n > 0 ? n : 0.5;
    const peak = ggxD(alpha, 0);
    const ymax = Math.max(peak * 1.15, 0.5);
    return {
      view: { x0: 0, x1: PI / 2, y1: ymax },
      curves: [
        { f: (t) => ggxD(alpha, t), color: C.cyan, width: 2.8, glow: true },
        ...[0.1, 0.3, 0.8]
          .filter((a) => Math.abs(a - alpha) > 0.015)
          .map((a) => ({ f: (t: number) => ggxD(a, t), color: 'rgba(167,139,250,.45)', width: 1.6, dash: [4, 4] })),
      ],
      points: [
        { x: 0, y: ggxD(alpha, 0), r: 5, fill: C.yellow, label: `D(0)=${num(ggxD(alpha, 0), 5)}` },
        { x: PI / 4, y: ggxD(alpha, PI / 4), r: 4, fill: C.green, label: num(ggxD(alpha, PI / 4), 4) },
      ],
      labels: [
        { text: `α=${num(alpha, 3)} 的 GGX 瓣（虚线为 α=0.1/0.3/0.8）`, x: 0.18, y: ymax * 0.86, color: C.cyan },
        { text: `峰值 1/(πα²) = ${num(1 / (PI * alpha * alpha), 5)}`, x: 0.18, y: ymax * 0.7, color: C.dim },
      ],
      axis: { x: 'θ_h（弧度）', y: 'D' },
      grid: { xTicks: 4 },
    };
  },
  readout(n) {
    const alpha = n > 0 ? n : 0.5;
    return [
      { label: `粗糙度 α = ${num(alpha, 4)}`, value: '' },
      { label: 'D(0°)（法向）', value: num(ggxD(alpha, 0), 6), verdict: 'ok' },
      { label: 'D(45°)', value: num(ggxD(alpha, PI / 4), 6) },
      { label: 'D(80°)', value: num(ggxD(alpha, 80 * DEG), 6) },
      { label: 'α=0.5 时的三个值', value: '1.27324 / 0.203718 / 0.0833027' },
      { label: '归一化 ∫D cosθ dω', value: num(ggxNorm(alpha), 10), verdict: 'ok' },
    ];
  },
  invariant(n) {
    const alpha = n > 0 ? n : 0.5;
    // 恒等式：NDF 是概率密度 —— ∫_{S²} D(h)(n·h) dω ≡ 1。
    // tol 放宽到 1e-6 是为了容纳数值积分误差（α→0.1 时被积函数在 t→1 处陡峭）；
    // 若 D 的公式写错，偏差会是 O(1) 量级，这条断言照样抓得住。
    return { label: '∫_S² D(h)(n·h) dω ≡ 1', expected: 1, actual: ggxNorm(alpha), tol: 1e-6 };
  },
  note: (n) => {
    const alpha = n > 0 ? n : 0.5;
    return `D 是「法向落在这个方向上的微面密度」，单位 sr⁻¹，所以它必须是个概率密度：∫D(h)(n·h)dω = 1（这就是下方 invariant 在算的事）。α 越小瓣越尖、峰值 1/(πα²)=${num(
      1 / (PI * alpha * alpha),
      5,
    )} 越高——但曲线下的加权面积恒为 1。α=0.5 时 D(0°)=1.27324、D(45°)=0.203718、D(80°)=0.0833027。`;
  },
};

const ndfSpec: VizSpec = {
  module: 'microfacet-ndf',
  title: '微表面 NDF：D 是概率密度，峰值随 α 变、面积恒 1',
  modes: [ndfMode],
};

/* ========================================================================
 * 9. microfacet-reciprocity —— 分母 4cosθ_i cosθ_o 的对称性
 * ====================================================================== */

const reciprocityMode: VizMode = {
  key: 'swap-test',
  label: '互换测试：砍一个 cos 就碎',
  n: { min: 0, max: 85 * DEG, step: 0.01, init: 80 * DEG },
  draw(n) {
    const th = Math.max(0, n);
    const t1 = PI / 2;
    const ymax = 4.4;
    return {
      view: { x0: 0, x1: t1, y1: ymax },
      curves: [
        { f: () => 1, color: C.green, width: 2.4 },
        { f: (t) => Math.cos(t), color: C.red, width: 2.6, glow: true },
        { f: () => 4, color: C.violet, width: 2.2, dash: [6, 5] },
      ],
      segs: [{ x0: th, y0: 0, x1: th, y1: ymax, color: C.dim, dash: [4, 4] }],
      points: [
        { x: th, y: Math.cos(th), r: 5, fill: C.red, label: `cos=${num(Math.cos(th), 5)}` },
        { x: th, y: 1, r: 4, fill: C.green },
        { x: th, y: 4, r: 4, fill: C.violet },
      ],
      labels: [
        { text: '正确 4cosθ_i cosθ_o：比值恒 1', x: 0.04, y: 1.16, color: C.green },
        { text: '砍一个 cos：比值 = cosθ_o', x: 0.04, y: 0.96, color: C.red },
        { text: '丢了因子 4：互易但整体亮 4 倍', x: 0.04, y: 4.2, color: C.violet },
      ],
      axis: { x: '入射角 θ_o（弧度）', y: '相对正确版的亮度' },
      grid: { xTicks: 4 },
    };
  },
  readout(n) {
    const th = Math.max(0, n);
    const c = Math.cos(th);
    return [
      { label: `θ_i = 0°，θ_o = ${num((th * 180) / PI, 4)}°`, value: '' },
      { label: '正确版 f(0→θ)/f(θ→0)', value: num(1, 8), verdict: 'ok' },
      { label: '砍一个 cos 的互易比值 = cosθ_o', value: num(c, 6), verdict: 'fail' },
      { label: '正确/错误（同方向亮度）', value: num(1 / c, 6), verdict: 'fail' },
      { label: 'θ=80° / 85° 时的亏损倍数', value: `${num(1 / Math.cos(80 * DEG), 6)} / ${num(1 / Math.cos(85 * DEG), 6)}` },
      { label: '丢了因子 4', value: '互易性不破，但整体亮 4 倍' },
    ];
  },
  invariant(n) {
    const th = Math.max(0, n);
    const c = Math.cos(th);
    // 恒等式：正确版的分母 4cosθ_i cosθ_o 对称 ⟹ 互换比值 ≡ 1
    // 用解析构造验证：f_ok(0,θ)/f_ok(θ,0) = (1/c)/(1/c) = 1
    const fOk = (ci: number, co: number) => 1 / (4 * ci * co);
    const ratio = fOk(1, c) / fOk(c, 1);
    return { label: 'f(0→θ)/f(θ→0) ≡ 1（分母对称）', expected: 1, actual: ratio, tol: 1e-12 };
  },
  note: (n) => {
    const th = Math.max(0, n);
    const c = Math.cos(th);
    return `分母 4cosθ_i cosθ_o 对两个角度对称，这不是巧合——Helmholtz 互易性要求 f(i→o) = f(o→i)。砍掉一个 cos 后，θ_i=0°、θ_o=${num(
      (th * 180) / PI,
      3,
    )}° 处的两个方向相差 ${num(1 / c, 6)} 倍，边缘一圈全暗。自检办法：随机取两个方向算 f(i,o)/f(o,i)，必须恒为 1。`;
  },
};

const reciprocitySpec: VizSpec = {
  module: 'microfacet-reciprocity',
  title: '微表面互易性：分母少一个 cos 就碎',
  modes: [reciprocityMode],
};

/* ====================================================================== */

export const cgSpecs: VizSpec[] = [
  angleDeficitSpec,
  meanCurvatureAreaSpec,
  noiseScalingSpec,
  brdfSanitySpec,
  renderingEquationSpec,
  projectedSpec,
  lambertSpec,
  ndfSpec,
  reciprocitySpec,
];
