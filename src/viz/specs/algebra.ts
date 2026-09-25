/**
 * 代数 / 几何篇 viz 规格（P2、P5、P6 与 B 篇落点）。
 */
import type { VizSpec, VizMode } from '../kit';
import { COLORS as C } from '../kit';
import { linspace, num, dev, frob, matMul, det3, rotX, rotY, maxAbs, relErr } from '../num';

/* ---------------------------------------------------------- P5.2 unit-circle */

const norm2 = (v: number[]) => Math.hypot(...v);
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

const unitCircleModes: VizMode[] = [
  {
    key: 'compose-2d',
    label: 'SO(2)：两次旋转 = 角度相加',
    n: { min: 0, max: 360, step: 1, init: 60 },
    draw(n) {
      const th1 = ((n || 60) * Math.PI) / 180;
      const th2 = (45 * Math.PI) / 180;
      const pick = (t: number) => ({ x: Math.cos(t), y: Math.sin(t) });
      const p1 = pick(th1);
      const p2 = pick(th2);
      const p3 = pick(th1 + th2);
      return {
        view: { x0: -1.25, x1: 1.25, y0: -1.25, y1: 1.25 },
        arcs: [{ cx: 0, cy: 0, r: 1, from: 0, to: Math.PI * 2, color: 'rgba(148,163,255,.35)', width: 1.6 }],
        segs: [
          { x0: 0, y0: 0, x1: p1.x, y1: p1.y, color: C.cyan, width: 2.4 },
          { x0: 0, y0: 0, x1: p2.x, y1: p2.y, color: C.violet, width: 2.4 },
          { x0: 0, y0: 0, x1: p3.x, y1: p3.y, color: C.pink, width: 2.4, dash: [5, 4] },
        ],
        points: [
          { x: p1.x, y: p1.y, r: 4, fill: C.cyan, label: `θ = ${num((n || 60), 0)}°` },
          { x: p2.x, y: p2.y, r: 4, fill: C.violet, label: 'φ = 45°' },
          { x: p3.x, y: p3.y, r: 4.5, fill: C.pink, label: 'θ+φ' },
        ],
        axis: { x: '', y: '' },
      };
    },
    readout(n) {
      const th1 = ((n || 60) * Math.PI) / 180;
      const th2 = Math.PI / 4;
      const sum = th1 + th2;
      const R = (t: number) => [
        [Math.cos(t), -Math.sin(t)],
        [Math.sin(t), Math.cos(t)],
      ];
      const composed = matMul(R(th1), R(th2));
      const diff = frob(composed, R(sum));
      return [
        { label: 'θ + φ（度）', value: num(((n || 60) + 45), 1) },
        { label: '‖R(θ)R(φ) − R(θ+φ)‖_F', value: num(diff, 10), verdict: diff < 1e-12 ? 'ok' : 'fail' },
        { label: 'det R', value: num(composed[0][0] * composed[1][1] - composed[0][1] * composed[1][0], 10) },
      ];
    },
    invariant(n) {
      const th1 = ((n || 60) * Math.PI) / 180;
      const th2 = Math.PI / 4;
      const R = (t: number) => [
        [Math.cos(t), -Math.sin(t)],
        [Math.sin(t), Math.cos(t)],
      ];
      // 恒等式：R(θ)R(φ) = R(θ+φ)
      return { label: 'R(θ)R(φ) ≡ R(θ+φ)', expected: 0, actual: frob(matMul(R(th1), R(th2)), R(th1 + th2)), tol: 1e-14 };
    },
    note: () => '二维旋转是对易的：合成就是角度相加。所以 SO(2) 的「乘法表」可以压成一条加法 —— 它可交换。',
  },
  {
    key: 'phase-u1',
    label: 'e^{iθ} 与两个投影',
    n: { min: 0, max: 360, step: 1, init: 40 },
    draw(n) {
      const th = ((n || 40) * Math.PI) / 180;
      const px = Math.cos(th);
      const py = Math.sin(th);
      return {
        view: { x0: -1.25, x1: 1.25, y0: -1.25, y1: 1.25 },
        arcs: [{ cx: 0, cy: 0, r: 1, from: 0, to: Math.PI * 2, color: 'rgba(148,163,255,.35)', width: 1.6 }],
        segs: [
          { x0: 0, y0: 0, x1: px, y1: py, color: C.cyan, width: 2.4 },
          { x0: px, y0: 0, x1: px, y1: py, color: C.pink, width: 2, dash: [5, 4] },
          { x0: 0, y0: py, x1: px, y1: py, color: C.violet, width: 2, dash: [5, 4] },
          { x0: -1.25, y0: 0, x1: 1.25, y1: 0, color: 'rgba(148,163,255,.3)', width: 1 },
          { x0: 0, y0: -1.25, x1: 0, y1: 1.25, color: 'rgba(148,163,255,.3)', width: 1 },
        ],
        points: [{ x: px, y: py, r: 4.5, fill: C.cyan, label: 'e^{iθ}' }],
        labels: [
          { text: 'cos θ', x: px / 2, y: -0.08, color: C.violet },
          { text: 'sin θ', x: 0.04, y: py / 2, color: C.pink },
        ],
        axis: { x: 'Re', y: 'Im' },
      };
    },
    readout(n) {
      const th = ((n || 40) * Math.PI) / 180;
      const px = Math.cos(th);
      const py = Math.sin(th);
      return [
        { label: 'cos θ', value: num(px, 6) },
        { label: 'sin θ', value: num(py, 6) },
        { label: 'cos²θ + sin²θ', value: num(px * px + py * py, 12), verdict: Math.abs(px * px + py * py - 1) < 1e-12 ? 'ok' : 'fail' },
      ];
    },
    invariant(n) {
      const th = ((n || 40) * Math.PI) / 180;
      return { label: '|e^{iθ}|² ≡ 1', expected: 1, actual: Math.cos(th) ** 2 + Math.sin(th) ** 2, tol: 1e-14 };
    },
    note: () => '单位圆上的点就是 cos + i·sin：两个投影是实部与虚部，长度恒为 1 —— 这是 Euler 公式的几何读法。',
  },
  {
    key: 'so3-order',
    label: 'SO(3)：换顺序结果不同',
    n: { min: 0, max: 180, step: 1, init: 90 },
    draw(n) {
      const a = ((n || 90) * Math.PI) / 180;
      const b = Math.PI / 2;
      const ax = matMul(rotX(a), rotY(b));
      const ay = matMul(rotY(b), rotX(a));
      const d = frob(ax, ay);
      return {
        view: { x0: -0.4, x1: 1.4, y1: Math.max(1, d * 1.2) },
        rects: [
          { x: 0, y: 0, w: 0.4, h: d, fill: 'rgba(248,113,113,.25)', stroke: C.red },
          { x: 0.6, y: 0, w: 0.4, h: 1e-6, fill: 'rgba(74,222,128,.25)', stroke: C.green },
        ],
        labels: [
          { text: `‖AB − BA‖ = ${num(d, 4)}`, x: 0, y: Math.max(d, 0.05) * 1.08, color: C.red },
          { text: '交换序（参照 0）', x: 0.6, y: 0.06, color: C.green },
        ],
        axis: { x: '', y: '' },
      };
    },
    readout(n) {
      const a = ((n || 90) * Math.PI) / 180;
      const b = Math.PI / 2;
      const ax = matMul(rotX(a), rotY(b));
      const ay = matMul(rotY(b), rotX(a));
      return [
        { label: '‖RₓR_y − R_yRₓ‖_F', value: num(frob(ax, ay), 6), verdict: frob(ax, ay) < 1e-12 ? 'ok' : 'fail' },
        { label: 'det(RₓR_y)（应为 1）', value: num(det3(ax), 10) },
        { label: 'det(R_yRₓ)', value: num(det3(ay), 10) },
      ];
    },
    invariant(n) {
      const a = ((n || 90) * Math.PI) / 180;
      const b = Math.PI / 2;
      const ax = matMul(rotX(a), rotY(b));
      // 恒等式：旋转矩阵行列式恒为 1（正交且保持定向）
      return { label: 'det(AB) ≡ 1', expected: 1, actual: det3(ax), tol: 1e-12 };
    },
    note: () => '同一对旋转换个顺序，结果差 ‖AB − BA‖ ≠ 0：SO(3) 非交换，这就是姿态表示里顺序重要的根源。',
  },
];

export const unitCircle: VizSpec = {
  module: 'unit-circle',
  title: '单位圆：SO(2) 可交换、SO(3) 不可交换',
  modes: unitCircleModes,
};

/* --------------------------------------------------------- P6.4 gram-schmidt */

const gsU = [1, 1];
const gsV = [1, 2];
const projScalar = dot(gsV, gsU) / dot(gsU, gsU);

const gramSchmidtMode: VizMode = {
  key: 'gs',
  label: '减掉影子，留下残差',
  n: { min: 0, max: 100, step: 1, init: 0 },
  draw() {
    const p = [projScalar * gsU[0], projScalar * gsU[1]];
    const r = [gsV[0] - p[0], gsV[1] - p[1]];
    const e1 = [gsU[0] / norm2(gsU), gsU[1] / norm2(gsU)];
    const e2n = norm2(r);
    const e2 = [r[0] / e2n, r[1] / e2n];
    return {
      view: { x0: -0.4, x1: 2.3, y0: -0.4, y1: 2.4 },
      segs: [
        { x0: 0, y0: 0, x1: gsU[0], y1: gsU[1], color: C.cyan, width: 2.6 },
        { x0: 0, y0: 0, x1: gsV[0], y1: gsV[1], color: C.violet, width: 2.6 },
        { x0: 0, y0: 0, x1: p[0], y1: p[1], color: C.yellow, width: 2, dash: [5, 4] },
        { x0: p[0], y0: p[1], x1: gsV[0], y1: gsV[1], color: C.pink, width: 2.4 },
        { x0: 0, y0: 0, x1: e2[0] * 0.9, y1: e2[1] * 0.9, color: C.green, width: 2 },
      ],
      points: [
        { x: gsU[0], y: gsU[1], r: 4, fill: C.cyan, label: 'u' },
        { x: gsV[0], y: gsV[1], r: 4, fill: C.violet, label: 'v' },
        { x: p[0], y: p[1], r: 4, fill: C.yellow, label: '投影' },
      ],
      labels: [
        { text: '残差 v − proj', x: r[0] + p[0] - 0.05, y: r[1] + p[1] + 0.12, color: C.pink },
        { text: 'ê₁', x: e1[0] * 0.55 + 0.03, y: e1[1] * 0.55, color: C.cyan },
      ],
      axis: { x: '', y: '' },
    };
  },
  readout() {
    const p = [projScalar * gsU[0], projScalar * gsU[1]];
    const r = [gsV[0] - p[0], gsV[1] - p[1]];
    return [
      { label: '⟨v,u⟩ / ⟨u,u⟩', value: num(projScalar, 6) },
      { label: '‖v‖² = ‖proj‖² + ‖r‖²', value: `${num(dot(gsV, gsV), 6)} = ${num(dot(p, p), 6)} + ${num(dot(r, r), 6)}` },
      { label: '⟨u, 残差⟩', value: num(dot(gsU, r), 12), verdict: Math.abs(dot(gsU, r)) < 1e-12 ? 'ok' : 'fail' },
    ];
  },
  invariant() {
    const p = [projScalar * gsU[0], projScalar * gsU[1]];
    const r = [gsV[0] - p[0], gsV[1] - p[1]];
    // 恒等式：残差与 u 正交
    return { label: '⟨u, v − proj_u v⟩ ≡ 0', expected: 0, actual: dot(gsU, r), tol: 1e-15 };
  },
  note: () => '减去投影 ⟹ 残差垂直。不减去投影时 ⟨u,v⟩ = 3 ≠ 0，两个向量不正交 —— 这就是 Gram–Schmidt 唯一要做的事。',
};

export const gramSchmidt: VizSpec = {
  module: 'gram-schmidt',
  title: 'Gram–Schmidt：减掉影子，留下垂直残差',
  modes: [gramSchmidtMode],
};

/* ------------------------------------------------- P2.4 block-superposition */

const BSP_A = 0.5;
const BSP_B = -0.5;

function bspSum(A: number, B: number, x: number): number {
  return A / (x - 1) + B / (x + 1);
}

const blockModes: VizMode[] = [
  {
    key: 'blocks',
    label: 'A/(x−1) + B/(x+1) 叠加',
    n: { min: -1, max: 1, step: 0.05, init: 0 },
    draw(n) {
      const shiftB = (n || 0) * 0.5;
      const A = BSP_A;
      const B = BSP_B + shiftB;
      return {
        view: { x0: 1.2, x1: 5, y0: -0.3, y1: 1.2 },
        curves: [
          { f: (x) => 1 / (x * x - 1), color: C.cyan, width: 2.6, glow: true },
          { f: (x) => bspSum(A, B, x), color: C.pink, width: 2, dash: [5, 4] },
          { f: (x) => A / (x - 1), color: 'rgba(167,139,250,.65)', width: 1.6 },
          { f: (x) => BSP_B / (x + 1), color: 'rgba(74,222,128,.6)', width: 1.6 },
        ],
        axis: { x: 'x', y: '' },
      };
    },
    readout(n) {
      const B = BSP_B + (n || 0) * 0.5;
      const x = 3;
      const exact = 1 / (x * x - 1);
      const got = bspSum(BSP_A, B, x);
      return [
        { label: '1/(x²−1) 在 x=3', value: num(exact, 8) },
        { label: 'A/(x−1) + B/(x+1)', value: num(got, 8) },
        { label: '偏差', value: num(dev(got, exact), 6), verdict: dev(got, exact) < 1e-12 ? 'ok' : 'fail' },
      ];
    },
    invariant(n) {
      const B = BSP_B + (n || 0) * 0.5;
      const xs = linspace(1.2, 5, 60);
      const worst = Math.max(...xs.map((x) => Math.abs(bspSum(BSP_A, B, x) - 1 / (x * x - 1))));
      // 当 B 未被拖动时（n=0），两边恒等；拖动后即演示「系数错了」
      const expected = n === 0 ? 0 : worst;
      return { label: 'B = −0.5 时两边逐点恒等', expected, actual: worst, tol: n === 0 ? 1e-13 : Math.max(1e-13, worst) };
    },
    note: (n) => n === 0
      ? '部分分式就是把一个复杂分式拆成几个基本块的和：A = 1/2、B = −1/2 时两边处处相等。'
      : `把 B 拖离 −1/2 后叠加不再是原函数（在 x=3 处偏差 ${num(Math.abs(bspSum(BSP_A, BSP_B + n * 0.5, 3) - 0.125), 6)}）—— 系数必须解出来，不能猜。`,
  },
  {
    key: 'sign-error',
    label: '误用：系数符号搞反',
    draw() {
      return {
        view: { x0: 1.2, x1: 5, y0: -0.3, y1: 1.2 },
        curves: [
          { f: (x) => 1 / (x * x - 1), color: C.cyan, width: 2.6, glow: true },
          { f: (x) => bspSum(-BSP_A, -BSP_B, x), color: C.red, width: 2.2, dash: [5, 4] },
        ],
        axis: { x: 'x', y: '' },
      };
    },
    readout() {
      const x = 3;
      const exact = 1 / (x * x - 1);
      const wrong = bspSum(-BSP_A, -BSP_B, x);
      return [
        { label: '真值 1/(x²−1)', value: num(exact, 8) },
        { label: '符号反了的叠加', value: num(wrong, 8) },
        { label: '相对误差', value: `${num(relErr(wrong, exact) * 100, 3)}%`, verdict: 'fail' },
      ];
    },
    invariant() {
      // 恒等式：符号全反 ⟹ 结果是 −1/(x²−1)，即在任意点都相差 2/(x²−1)
      const x = 3;
      const wrong = bspSum(-BSP_A, -BSP_B, x);
      const predicted = -1 / (x * x - 1);
      return { label: '符号全反 ⟹ 结果 ≡ −1/(x²−1)', expected: predicted, actual: wrong, tol: 1e-13 };
    },
    note: () => '整体差一个负号，相对误差 100% —— 部分分式的系数可以用留数快速算，别凭感觉填。',
  },
];

export const blockSuperposition: VizSpec = {
  module: 'block-superposition',
  title: '部分分式 = 基本块叠加',
  modes: blockModes,
};

/* --------------------------------------------------------- P2.2 parabola-vertex */

const parabModes: VizMode[] = [
  {
    key: 'vertex',
    label: '配方：顶点在 x = −b/2',
    n: { min: -8, max: 8, step: 0.5, init: 4 },
    draw(n) {
      const b = n || 0;
      const vx = -b / 2;
      const vy = -b * b / 4;
      return {
        view: { x0: -10, x1: 10, y0: Math.min(-6, vy - 2), y1: 20 },
        curves: [
          { f: (x) => x * x + b * x, color: C.cyan, width: 2.6, glow: true },
          { f: (x) => (x - vx) ** 2 + vy, color: C.pink, width: 2, dash: [5, 4] },
        ],
        segs: [{ x0: vx, y0: vy, x1: vx, y1: 0, color: 'rgba(250,204,21,.6)', width: 1.6, dash: [4, 4] }],
        points: [{ x: vx, y: vy, r: 5, fill: C.fg, stroke: C.green, label: `顶点 (${num(vx, 2)}, ${num(vy, 2)})` }],
        axis: { x: 'x', y: '' },
      };
    },
    readout(n) {
      const b = n || 0;
      const vx = -b / 2;
      return [
        { label: `y = x² + ${num(b, 2)}x`, value: '' },
        { label: '顶点 x = −b/2', value: num(vx, 4) },
        { label: '配方常数 c − b²/4', value: num(-b * b / 4, 4) },
      ];
    },
    invariant(n) {
      const b = n || 0;
      const vx = -b / 2;
      // 恒等式：关于顶点对称 f(v+t) = f(v−t)
      const t = 1.7;
      const lhs = vx + t;
      const rhs = vx - t;
      const f = (x: number) => x * x + b * x;
      return { label: 'f(v+t) ≡ f(v−t)（对称性）', expected: 0, actual: Math.abs(f(lhs) - f(rhs)), tol: 1e-13 };
    },
    note: (n) => `配方只是平移坐标原点：顶点横坐标 −b/2 = ${num(-(n || 0) / 2, 3)}，抛物线本身没变。`,
  },
  {
    key: 'sign-error',
    label: '误用：顶点取成 +b/2',
    draw(n) {
      const b = n || 0;
      const vx = b / 2;
      const v = -b / 2;
      return {
        view: { x0: -10, x1: 10, y0: Math.min(-6, -b * b / 4 - 2), y1: 20 },
        curves: [{ f: (x) => x * x + b * x, color: C.cyan, width: 2.6, glow: true }],
        segs: [
          { x0: v, y0: -b * b / 4, x1: v, y1: 6, color: C.green, width: 1.8, dash: [4, 4] },
          { x0: vx, y0: -b * b / 4, x1: vx, y1: 6, color: C.red, width: 1.8, dash: [4, 4] },
        ],
        points: [{ x: vx, y: -b * b / 4, r: 5, fill: C.red, label: '错取的「顶点」' }],
        axis: { x: 'x', y: '' },
      };
    },
    readout(n) {
      const b = n || 0;
      const v = -b / 2;
      const f = (x: number) => x * x + b * x;
      const t = 1;
      return [
        { label: '真顶点 x = −b/2', value: num(v, 3) },
        { label: '错取 x = +b/2', value: num(b / 2, 3) },
        { label: '对称残差 |f(w+t) − f(w−t)|', value: num(Math.abs(f(b / 2 + t) - f(b / 2 - t)), 6), verdict: 'fail' },
      ];
    },
    invariant(n) {
      const b = n || 0;
      const f = (x: number) => x * x + b * x;
      const t = 1;
      // 恒等式：错取的对称残差恰为 2|b|t
      const residual = Math.abs(f(b / 2 + t) - f(b / 2 - t));
      return { label: '错顶点处的残差 ≡ |2bt|', expected: Math.abs(2 * b * t), actual: residual, tol: 1e-13 };
    },
    note: (n) => `符号反了，选出来的点关于抛物线并不对称：残差 |f(w+t) − f(w−t)| = ${num(Math.abs(2 * (n || 0) * 1), 4)} ≠ 0。检验办法就是这条对称性。`,
  },
];

export const parabolaVertex: VizSpec = {
  module: 'parabola-vertex',
  title: '配方：平移看对称',
  modes: parabModes,
};

/* -------------------------------------------------------- P2.3 root-coefficient */

const rootModes: VizMode[] = [
  {
    key: 'vieta',
    label: '根与系数（Vieta）',
    n: { min: -4, max: 6, step: 0.05, init: 2 },
    draw(n) {
      const r1 = n || 0;
      const r2 = 3;
      const s = r1 + r2;
      const p = r1 * r2;
      return {
        view: { x0: -6, x1: 8, y0: -12, y1: 20 },
        curves: [{ f: (x) => x * x - s * x + p, color: C.cyan, width: 2.6, glow: true }],
        segs: [{ x0: -6, y0: 0, x1: 8, y1: 0, color: 'rgba(148,163,255,.3)', width: 1 }],
        points: [
          { x: r1, y: 0, r: 5, fill: C.pink, label: `r₁ = ${num(r1, 2)}` },
          { x: r2, y: 0, r: 5, fill: C.violet, label: `r₂ = ${num(r2, 2)}` },
        ],
        axis: { x: 'x', y: '' },
      };
    },
    readout(n) {
      const r1 = n || 0;
      const r2 = 3;
      const s = r1 + r2;
      const p = r1 * r2;
      const f = (x: number) => x * x - s * x + p;
      return [
        { label: 'r₁ + r₂（= −b/a）', value: num(s, 4) },
        { label: 'r₁r₂（= c/a）', value: num(p, 4) },
        { label: '展开式 x² − (r₁+r₂)x + r₁r₂', value: `x² − ${num(s, 3)}x + ${num(p, 3)}` },
        { label: 'p(r₁), p(r₂)', value: `${num(f(r1), 6)}, ${num(f(r2), 6)}`, verdict: Math.abs(f(r1)) < 1e-12 && Math.abs(f(r2)) < 1e-12 ? 'ok' : 'fail' },
      ];
    },
    invariant(n) {
      const r1 = n || 0;
      const r2 = 3;
      const s = r1 + r2;
      const p = r1 * r2;
      // 恒等式：(x−r₁)(x−r₂) ≡ x² − (r₁+r₂)x + r₁r₂
      const x = 1.234;
      const lhs = (x - r1) * (x - r2);
      const rhs = x * x - s * x + p;
      return { label: '(x−r₁)(x−r₂) ≡ x² − sx + p', expected: lhs, actual: rhs, tol: 1e-13 };
    },
    note: () => '拖根看系数：和与积被两个根完全决定，反过来也一样 —— 这就是 Vieta 公式的双向可读性。',
  },
  {
    key: 'sign-error',
    label: '误用：一次项符号搞反',
    draw() {
      const r1 = 4;
      const r2 = -1;
      const s = r1 + r2;
      const p = r1 * r2;
      return {
        view: { x0: -6, x1: 8, y0: -12, y1: 20 },
        curves: [
          { f: (x) => x * x - s * x + p, color: C.cyan, width: 2.6, glow: true },
          { f: (x) => x * x + s * x + p, color: C.red, width: 2.2, dash: [5, 4] },
        ],
        points: [
          { x: r1, y: 0, r: 5, fill: C.pink, label: 'r₁' },
          { x: r2, y: 0, r: 5, fill: C.violet, label: 'r₂' },
        ],
        axis: { x: 'x', y: '' },
      };
    },
    readout() {
      const r1 = 4;
      const r2 = -1;
      const s = r1 + r2;
      const p = r1 * r2;
      const wrong = (x: number) => x * x + s * x + p;
      return [
        { label: '正确：x² − sx + p', value: `s = ${s}, p = ${p}` },
        { label: '符号反了：x² + sx + p', value: '根变成 −r₁, −r₂' },
        { label: '错式在 x = r₁ 处的值', value: num(wrong(r1), 6), verdict: 'fail' },
      ];
    },
    invariant() {
      const r1 = 4;
      const r2 = -1;
      const s = r1 + r2;
      const p = r1 * r2;
      const wrong = (x: number) => x * x + s * x + p;
      // 恒等式：x² + sx + p 的根是 −r₁, −r₂，故 wrong(−r₁) = 0
      return { label: '符号反 ⟹ 根是 −r₁,−r₂：p̃(−r₁) ≡ 0', expected: 0, actual: wrong(-r1), tol: 1e-13 };
    },
    note: () => '一次项符号一错，两个根全部取反：错式在真根处的值 2r₁(r₁+r₂) = 24 ≠ 0，一眼可查。',
  },
];

export const rootCoefficient: VizSpec = {
  module: 'root-coefficient',
  title: '拖根看系数（Vieta）',
  modes: rootModes,
};

/* ------------------------------------------------------- P2.1 square-dissection */

const SQ_A = 3;
const SQ_B = 4;

const dissectionModes: VizMode[] = [
  {
    key: 'dissect',
    label: '(a+b)² 的拼图',
    n: { min: 0, max: 1, step: 1, init: 0 },
    draw() {
      const a = SQ_A;
      const b = SQ_B;
      const s = a + b;
      return {
        view: { x0: -0.5, x1: s + 0.5, y0: -0.5, y1: s + 0.5 },
        rects: [
          { x: 0, y: b, w: a, h: a, fill: 'rgba(94,230,255,.22)', stroke: C.cyan },
          { x: a, y: b, w: b, h: a, fill: 'rgba(167,139,250,.22)', stroke: C.violet },
          { x: 0, y: 0, w: a, h: b, fill: 'rgba(167,139,250,.22)', stroke: C.violet },
          { x: a, y: 0, w: b, h: b, fill: 'rgba(74,222,128,.22)', stroke: C.green },
        ],
        labels: [
          { text: `a² = ${a * a}`, x: 0.7, y: b + a / 2, color: C.cyan },
          { text: `ab = ${a * b}`, x: a + 0.2, y: b + a / 2, color: C.violet },
          { text: `ab = ${a * b}`, x: 0.7, y: b / 2, color: C.violet },
          { text: `b² = ${b * b}`, x: a + 0.4, y: b / 2, color: C.green },
        ],
        axis: { x: '', y: '' },
      };
    },
    readout() {
      const a = SQ_A;
      const b = SQ_B;
      return [
        { label: `(a+b)² = ${a + b}²`, value: String((a + b) ** 2) },
        { label: `a² + b²`, value: String(a * a + b * b) },
        { label: `2ab`, value: String(2 * a * b) },
        { label: '判决 a²+b²+2ab', value: String(a * a + b * b + 2 * a * b), verdict: 'ok' },
      ];
    },
    invariant() {
      const a = SQ_A;
      const b = SQ_B;
      // 恒等式：面积守恒 (a+b)² = a² + b² + 2ab
      return { label: '面积守恒 (a+b)² ≡ a²+b²+2ab', expected: (a + b) ** 2, actual: a * a + b * b + 2 * a * b, tol: 0 };
    },
    note: () => '四个小块拼成大正方形：两个正方形加两块长方形，交叉项 2ab 就是那两块。',
  },
  {
    key: 'drop-cross-term',
    label: '误用：丢掉交叉项',
    draw() {
      const a = SQ_A;
      const b = SQ_B;
      const s = a + b;
      return {
        view: { x0: -0.5, x1: s + 0.5, y0: -0.5, y1: s + 0.5 },
        polys: [
          { pts: [[0, b], [a, b], [a, b + a], [0, b + a]], fill: 'rgba(94,230,255,.22)', stroke: C.cyan },
          { pts: [[a, 0], [s, 0], [s, b], [a, b]], fill: 'rgba(74,222,128,.22)', stroke: C.green },
        ],
        rects: [
          { x: a, y: b, w: b, h: a, fill: 'rgba(248,113,113,.14)', stroke: C.red, dash: [5, 4] },
          { x: 0, y: 0, w: a, h: b, fill: 'rgba(248,113,113,.14)', stroke: C.red, dash: [5, 4] },
        ],
        labels: [
          { text: 'a²', x: 0.7, y: b + a / 2, color: C.cyan },
          { text: 'b²', x: a + 0.4, y: b / 2, color: C.green },
          { text: '漏掉的两块', x: 1.1, y: s + 0.2, color: C.red },
        ],
        axis: { x: '', y: '' },
      };
    },
    readout() {
      const a = SQ_A;
      const b = SQ_B;
      return [
        { label: '(a+b)² 真值', value: String((a + b) ** 2) },
        { label: 'a² + b²（丢交叉项）', value: String(a * a + b * b) },
        { label: '缺口', value: String((a + b) ** 2 - a * a - b * b), verdict: 'fail' },
      ];
    },
    invariant() {
      const a = SQ_A;
      const b = SQ_B;
      // 恒等式：缺口恰为 2ab
      return { label: '缺口 ≡ 2ab', expected: 2 * a * b, actual: (a + b) ** 2 - a * a - b * b, tol: 0 };
    },
    note: () => '把 (a+b)² 展开成 a²+b² 会漏掉两块长方形：a=b 时缺口还是 2ab，永远不会自己消失。',
  },
];

export const squareDissection: VizSpec = {
  module: 'square-dissection',
  title: '面积拼图看交叉项',
  modes: dissectionModes,
};

export const algebraSpecs: VizSpec[] = [
  unitCircle,
  gramSchmidt,
  blockSuperposition,
  parabolaVertex,
  rootCoefficient,
  squareDissection,
];

export const algebraHelpers = { dot, norm2, maxAbs };
