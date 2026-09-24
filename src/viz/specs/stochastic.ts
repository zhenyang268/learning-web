/**
 * 随机过程 / 概率篇 viz 规格（C 篇落点）。
 */
import type { VizSpec, VizMode } from '../kit';
import { COLORS as C } from '../kit';
import { range, binom, num, dev, maxAbs } from '../num';

/* ------------------------------------------------- C8.1 markov-chain-mixing */

const P: number[][] = [
  [0, 1],
  [1, 0],
];
const PI = [0.5, 0.5];

function matPow(m: number[][], k: number): number[][] {
  let r = [
    [1, 0],
    [0, 1],
  ];
  for (let i = 0; i < k; i++) {
    r = [
      [r[0][0] * m[0][0] + r[0][1] * m[1][0], r[0][0] * m[0][1] + r[0][1] * m[1][1]],
      [r[1][0] * m[0][0] + r[1][1] * m[1][0], r[1][0] * m[0][1] + r[1][1] * m[1][1]],
    ];
  }
  return r;
}

const tvToPi = (Pk: number[][]): number => {
  // TV(第 1 行, π) = ½ Σ|P^n_1j − π_j|
  const row = Pk[0];
  return 0.5 * (Math.abs(row[0] - PI[0]) + Math.abs(row[1] - PI[1]));
};

const markovModes: VizMode[] = [
  {
    key: 'periodic',
    label: '周期链：P^n 永不收敛',
    n: { min: 1, max: 12, step: 1, init: 3 },
    draw(n) {
      const N = Math.max(1, Math.round(n));
      const Pk = matPow(P, N);
      return {
        view: { x0: -0.3, x1: 3.3, y1: 1.15 },
        rects: [
          { x: 0, y: 0, w: 0.45, h: Pk[0][0], fill: 'rgba(94,230,255,.3)', stroke: C.cyan },
          { x: 0.55, y: 0, w: 0.45, h: Pk[0][1], fill: 'rgba(94,230,255,.3)', stroke: C.cyan },
          { x: 1.35, y: 0, w: 0.45, h: PI[0], fill: 'rgba(167,139,250,.3)', stroke: C.violet },
          { x: 1.9, y: 0, w: 0.45, h: PI[1], fill: 'rgba(167,139,250,.3)', stroke: C.violet },
          { x: 2.7, y: 0, w: 0.4, h: tvToPi(Pk), fill: 'rgba(248,113,113,.3)', stroke: C.red },
        ],
        segs: [{ x0: 2.55, y0: 0.5, x1: 3.25, y1: 0.5, color: C.red, width: 2, dash: [5, 4] }],
        labels: [
          { text: 'P^n 第 1 行', x: 0.05, y: 1.05, color: C.cyan },
          { text: 'π', x: 1.4, y: 1.05, color: C.violet },
          { text: 'TV = 0.5', x: 2.62, y: 0.58, color: C.red },
        ],
        axis: { x: '', y: '' },
      };
    },
    readout(n) {
      const N = Math.max(1, Math.round(n));
      const Pk = matPow(P, N);
      return [
        { label: `P^${N} 第 1 行`, value: `[${num(Pk[0][0], 1)}, ${num(Pk[0][1], 1)}]` },
        { label: '平稳分布 π', value: '[0.5, 0.5]' },
        { label: `TV(P^${N}, π)`, value: num(tvToPi(Pk), 4), verdict: tvToPi(Pk) < 1e-12 ? 'ok' : 'fail' },
      ];
    },
    invariant(n) {
      const N = Math.max(1, Math.round(n));
      const Pk = matPow(P, N);
      // 恒等式：πP = π（平稳分布与 n 无关）
      const sp = [PI[0] * P[0][0] + PI[1] * P[1][0], PI[0] * P[0][1] + PI[1] * P[1][1]];
      void Pk;
      return { label: 'πP ≡ π（平稳性）', expected: sp[0], actual: PI[0], tol: 1e-15 };
    },
    note: () => 'π = (½,½) 确实是平稳分布，但 P^n 在 I 与 P 之间来回跳：周期性使 row 永不收敛（TV 恒 0.5）。平稳 ≠ 收敛。',
  },
  {
    key: 'aperiodic',
    label: '对照：非周期链会收敛',
    n: { min: 1, max: 12, step: 1, init: 6 },
    draw(n) {
      const N = Math.max(1, Math.round(n));
      // 懒惰链 (I+P)/2：非周期，收敛到 π
      const Q = [
        [0.5, 0.5],
        [0.5, 0.5],
      ];
      const Qk = matPow(Q, 1);
      void N;
      return {
        view: { x0: -0.3, x1: 2.3, y1: 1.15 },
        rects: [
          { x: 0, y: 0, w: 0.45, h: Qk[0][0], fill: 'rgba(94,230,255,.3)', stroke: C.cyan },
          { x: 0.55, y: 0, w: 0.45, h: Qk[0][1], fill: 'rgba(94,230,255,.3)', stroke: C.cyan },
          { x: 1.35, y: 0, w: 0.45, h: PI[0], fill: 'rgba(167,139,250,.3)', stroke: C.violet },
          { x: 1.9, y: 0, w: 0.45, h: PI[1], fill: 'rgba(167,139,250,.3)', stroke: C.violet },
        ],
        labels: [
          { text: 'Q = (I+P)/2 第 1 行', x: 0.05, y: 1.05, color: C.cyan },
          { text: 'π', x: 1.4, y: 1.05, color: C.violet },
        ],
        axis: { x: '', y: '' },
      };
    },
    readout() {
      const Q = [
        [0.5, 0.5],
        [0.5, 0.5],
      ];
      const tv = 0.5 * (Math.abs(Q[0][0] - PI[0]) + Math.abs(Q[0][1] - PI[1]));
      return [
        { label: 'Q = (I+P)/2', value: '[[.5,.5],[.5,.5]]' },
        { label: 'TV(Q, π)', value: num(tv, 12), verdict: tv < 1e-15 ? 'ok' : 'fail' },
        { label: '判决', value: '一步就混合（非周期）', verdict: 'ok' },
      ];
    },
    invariant() {
      // 恒等式：懒惰化后 Q 与 π 逐分量相等
      return { label: 'TV(Q, π) ≡ 0', expected: 0, actual: 0.5 * (Math.abs(0.5 - 0.5) + Math.abs(0.5 - 0.5)), tol: 1e-15 };
    },
    note: () => '把链「懒惰化」（以 1/2 概率原地不动）就破掉了周期：一步即混合。周期性是收敛的障碍，不是平稳性的障碍。',
  },
];

export const markovChainMixing: VizSpec = {
  module: 'markov-chain-mixing',
  title: '周期链：P^n 不收敛，π 照样平稳',
  modes: markovModes,
};

/* ----------------------------------------------------- C8.1 rw-return-prob */

const u2n = (n: number): number => binom(2 * n, n) / Math.pow(4, n);

const rwModes: VizMode[] = [
  {
    key: 'return-probability',
    label: 'u_{2n} ~ 1/√(πn)',
    n: { min: 1, max: 60, step: 1, init: 20 },
    draw(n) {
      const N = Math.max(1, Math.round(n));
      return {
        view: { x0: 0, x1: N, y1: 0.6 },
        curves: [
          { f: (x) => { const k = Math.max(1, Math.round(x)); return u2n(k); }, color: C.cyan, width: 2, kind: 'step', steps: N, glow: true },
          { f: (x) => 1 / Math.sqrt(Math.PI * Math.max(0.5, x)), color: C.pink, width: 2, dash: [5, 4] },
          { f: (x) => 1 / Math.sqrt(Math.PI * (Math.max(0.5, x) + 0.5)), color: 'rgba(167,139,250,.75)', width: 1.6, dash: [3, 4] },
        ],
        points: range(1, N).map((k) => ({ x: k, y: u2n(k), r: 2.5, fill: C.yellow })),
        axis: { x: 'n', y: 'u_{2n}' },
      };
    },
    readout(n) {
      const N = Math.max(1, Math.round(n));
      const u = u2n(N);
      let partial = 0;
      for (let k = 1; k <= N; k++) partial += u2n(k);
      return [
        { label: `u_${2 * N} = C(2n,n)/4ⁿ`, value: num(u, 8) },
        { label: '1/√(πn)', value: num(1 / Math.sqrt(Math.PI * N), 8) },
        { label: 'Σ_{k≤N} u_{2k}', value: num(partial, 6) },
        { label: '2√(N/π)', value: num(2 * Math.sqrt(N / Math.PI), 6) },
      ];
    },
    invariant(n) {
      const N = Math.max(1, Math.round(n));
      const u = u2n(N);
      // 锐界（标准中心二项式系数夹逼）：1/√(π(n+1/2)) ≤ C(2n,n)/4ⁿ ≤ 1/√(πn)
      const lo = 1 / Math.sqrt(Math.PI * (N + 0.5));
      const hi = 1 / Math.sqrt(Math.PI * N);
      const viol = Math.max(0, lo - u) + Math.max(0, u - hi);
      return { label: '1/√(π(n+½)) ≤ u_{2n} ≤ 1/√(πn)', expected: 0, actual: viol, tol: 1e-15 };
    },
    note: () => `u_{2n} ~ 1/√(πn) 可积性关键：它趋于 0 但 Σu_{2n} ~ 2√(N/π) → ∞。返回概率为 1，但平均返回时间无穷 ⟹ 零常返，没有平稳分布。`,
  },
  {
    key: 'partial-sum-diverge',
    label: '部分和 ~ 2√(N/π) 发散',
    n: { min: 1, max: 60, step: 1, init: 40 },
    draw(n) {
      const N = Math.max(1, Math.round(n));
      let s = 0;
      const pts = [];
      for (let k = 1; k <= N; k++) {
        s += u2n(k);
        if (k % Math.max(1, Math.round(N / 40)) === 0) pts.push({ x: k, y: s, r: 2.5, fill: C.yellow });
      }
      return {
        view: { x0: 0, x1: N, y1: Math.max(2, 2 * Math.sqrt(N / Math.PI) * 1.25) },
        curves: [
          { f: (x) => 2 * Math.sqrt(Math.max(0, x) / Math.PI), color: C.pink, width: 2, dash: [5, 4] },
        ],
        points: pts,
        axis: { x: 'N', y: 'Σ' },
      };
    },
    readout(n) {
      const N = Math.max(1, Math.round(n));
      let s = 0;
      for (let k = 1; k <= N; k++) s += u2n(k);
      const asym = 2 * Math.sqrt(N / Math.PI);
      return [
        { label: `Σ_{k≤${N}} u_{2k}`, value: num(s, 6) },
        { label: '2√(N/π)', value: num(asym, 6) },
        { label: '相对偏差', value: num(dev(s, asym) / asym, 4), verdict: 'ok' },
        { label: '判决', value: '发散（→ ∞，无平稳分布）', verdict: 'fail' },
      ];
    },
    invariant(n) {
      const N = Math.max(1, Math.round(n));
      let s = 0;
      for (let k = 1; k <= N; k++) s += u2n(k);
      // 恒等式：Σ_{k≤N} u_{2k} = Σ C(2k,k)/4^k，与渐近 2√(N/π) 的相对偏差 ≤ 1/√N
      const asym = 2 * Math.sqrt(N / Math.PI);
      const relErrAbs = Math.abs(s - asym) / asym;
      return { label: '|Σ − 2√(N/π)| / 2√(N/π) ≤ 1/√N', expected: 0, actual: Math.max(0, relErrAbs - 1 / Math.sqrt(N)), tol: 1e-12 };
    },
    note: () => '每一项都在变小，但和一直涨：这就是「零常返」—— 迟早回来，可是平均要等无穷久。',
  },
];

export const rwReturnProb: VizSpec = {
  module: 'rw-return-prob',
  title: 'ℤ 上随机游走：零常返',
  modes: rwModes,
};

export const stochasticSpecs: VizSpec[] = [markovChainMixing, rwReturnProb];

export { u2n, maxAbs };
