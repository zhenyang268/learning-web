/** viz 规格共用的数值工具（纯函数，Node 侧校验与浏览器渲染共用同一份） */

export function linspace(a: number, b: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n);
  return out;
}

/** 复合梯形：f 在 [a,b] 上 n 等分 */
export function trapz(f: (x: number) => number, a: number, b: number, n = 2000): number {
  const h = (b - a) / n;
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const y = f(a + i * h);
    if (!Number.isFinite(y)) return NaN;
    s += y * (i === 0 || i === n ? 0.5 : 1);
  }
  return s * h;
}

/** 复合 Simpson（n 必须为偶数） */
export function simpson(f: (x: number) => number, a: number, b: number, n = 2000): number {
  const m = n % 2 === 0 ? n : n + 1;
  const h = (b - a) / m;
  let s = f(a) + f(b);
  for (let i = 1; i < m; i++) {
    const y = f(a + i * h);
    if (!Number.isFinite(y)) return NaN;
    s += y * (i % 2 ? 4 : 2);
  }
  return (s * h) / 3;
}

/** 整数枚举 [a, b]（含端点）。注意：这不是 linspace —— linspace 是插值，会产生非整数点。 */
export function range(a: number, b: number): number[] {
  const lo = Math.round(a);
  const hi = Math.round(b);
  const out: number[] = [];
  for (let k = lo; k <= hi; k++) out.push(k);
  return out;
}

export const sum = (xs: number[]): number => xs.reduce((s, x) => s + x, 0);

export function factorial(n: number): number {
  let r = 1;
  for (let k = 2; k <= n; k++) r *= k;
  return r;
}

/** 二项式系数 C(n,k)（乘法式，避免阶乘溢出） */
export function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

/** 相对误差；分母为 0 时返回 |a−b| */
export function relErr(actual: number, expected: number): number {
  return expected === 0 ? Math.abs(actual - expected) : Math.abs(actual - expected) / Math.abs(expected);
}

export function maxAbs(xs: number[]): number {
  return xs.reduce((m, x) => (Math.abs(x) > m ? Math.abs(x) : m), 0);
}

/** 2×2 / 3×3 矩阵（行主序） */
export type Mat = number[][];

export function matMul(a: Mat, b: Mat): Mat {
  const n = a.length;
  const m = b[0]?.length ?? 0;
  const p = b.length;
  const out: Mat = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    let s = 0;
    for (let k = 0; k < p; k++) s += a[i][k] * b[k][j];
    out[i][j] = s;
  }
  return out;
}

export function frob(a: Mat, b: Mat): number {
  let s = 0;
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < a[i].length; j++) s += (a[i][j] - b[i][j]) ** 2;
  return Math.sqrt(s);
}

export function det3(m: Mat): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

export const rotX = (t: number): Mat => [
  [1, 0, 0],
  [0, Math.cos(t), -Math.sin(t)],
  [0, Math.sin(t), Math.cos(t)],
];
export const rotY = (t: number): Mat => [
  [Math.cos(t), 0, Math.sin(t)],
  [0, 1, 0],
  [-Math.sin(t), 0, Math.cos(t)],
];
export const rotZ = (t: number): Mat => [
  [Math.cos(t), -Math.sin(t), 0],
  [Math.sin(t), Math.cos(t), 0],
  [0, 0, 1],
];

/** 数量级友好的显示：>1e4 或 <1e-3 用科学计数 */
export function num(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return v > 0 ? '+∞' : '−∞';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e5 || a < 1e-3) return v.toExponential(digits - 1).replace('-', '−');
  return String(Number(v.toFixed(digits)));
}

/** 相对/绝对两种口径的偏差（用于 invariant 自检的容差判断） */
export function dev(actual: number, expected: number): number {
  return Math.abs(actual - expected);
}
