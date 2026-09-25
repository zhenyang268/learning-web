/**
 * viz 工具箱：把「档1 前端直渲」模块写成**声明式规格**。
 *
 * 为什么这么做（两条硬理由）：
 * 1. 数据里已引用 27 个模块名，逐个手写 canvas 代码既慢又难保一致；
 * 2. 规格里的 view / curves / readout / invariant 全是**纯函数**，因此
 *    DOM 渲染与 Node 侧数值校验（tools/dom-harness.mjs 的模型段）能共用同一份数学 ——
 *    「图上显示的失败数值」是被算出来的，不是写死的文案，可被独立重算。
 *
 * 硬规则（TASKBOOK §8.5 / §12.5）：图上必须显示「失败的数值」或 invariant 自检
 * （偏差 > tol 即标红 + console.error），并带「前端计算·未对拍」徽标；拖滑块零请求。
 */
import { escapeHtml } from '../renderers/markdown';

/* --------------------------------------------------------------- 类型 */

export interface View {
  x0: number;
  x1: number;
  y0?: number;
  y1: number;
}

export interface Readout {
  label: string;
  value: string;
  verdict?: 'ok' | 'fail';
}

export interface Invariant {
  label: string;
  expected: number;
  actual: number;
  tol: number;
}

export interface Curve {
  /** 采样函数；返回 NaN/±Infinity 处断开 */
  f: (x: number) => number;
  color?: string;
  width?: number;
  dash?: number[];
  glow?: boolean;
  label?: string;
  /** 采样窗口（默认整个 view） */
  from?: number;
  to?: number;
  /** 采样步数（默认 1200；阶梯函数用大值才不糊） */
  steps?: number;
  /** 折线（默认）| 阶梯（左连续，用于示性函数/分布函数） */
  kind?: 'line' | 'step';
  fill?: string;
}

export interface Seg {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color?: string;
  width?: number;
  dash?: number[];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  stroke?: string;
  dash?: number[];
}

export interface Poly {
  pts: Array<[number, number]>;
  fill?: string;
  stroke?: string;
  close?: boolean;
  dash?: number[];
}

export interface PPoint {
  x: number;
  y: number;
  r?: number;
  fill?: string;
  stroke?: string;
  label?: string;
  /** label 相对点的偏移（CSS 像素） */
  dx?: number;
  dy?: number;
}

export interface Arc {
  cx: number;
  cy: number;
  r: number;
  from: number;
  to: number;
  color?: string;
  width?: number;
  dash?: number[];
  /** 画一条从圆心到 (cx+r cos θ, cy+r sin θ) 的半径线 */
  radiusAt?: number;
  radiusColor?: string;
}

/** 一次绘制的完整载荷（纯数据，可在 Node 里求值） */
export interface Payload {
  view: View;
  curves?: Curve[];
  segs?: Seg[];
  rects?: Rect[];
  polys?: Poly[];
  arcs?: Arc[];
  points?: PPoint[];
  /** 附加文字标注 */
  labels?: Array<{ text: string; x: number; y: number; color?: string; align?: 'left' | 'right' }>;
  /** 坐标轴标签 */
  axis?: { x?: string; y?: string };
  /** 网格：y 方向线数 / x 方向刻度数 */
  grid?: { rows?: number; cols?: number; xTicks?: number; yTicks?: number };
}

export interface VizMode {
  key: string;
  label: string;
  /** 滑块（省略则该模块无滑块） */
  n?: { min: number; max: number; step: number; init?: number };
  /** 构造绘制载荷（纯函数） */
  draw(n: number): Payload;
  readout(n: number): Readout[];
  invariant(n: number): Invariant;
  note(n: number): string;
}

export interface VizSpec {
  /** 与数据 viz.module 对齐 */
  module: string;
  title: string;
  modes: VizMode[];
}

/* ------------------------------------------------------------- 画布 */

/** 暗色主题的回退值（Node 侧校验 / jsdom 无 CSS 变量时用；浏览器里以 CSS 变量为准）。 */
const FALLBACK = {
  cyan: '#5ee6ff',
  violet: '#a78bfa',
  pink: '#f472b6',
  green: '#4ade80',
  yellow: '#facc15',
  red: '#f87171',
  grid: 'rgba(148,163,255,.08)',
  axis: 'rgba(148,163,255,.32)',
  dim: 'rgba(139,150,196,.9)',
  fill: 'rgba(94,230,255,.12)',
  bg: '#070b16',
  fg: '#ffffff',
};

function cssColor(varName: string, fallback: string): string {
  if (typeof document !== 'undefined' && typeof getComputedStyle === 'function') {
    const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (v) return v;
  }
  return fallback;
}

/**
 * 画布调色板：浏览器里每次取色都实时读 CSS 变量（跟随系统亮暗，红线「不写死色值」）；
 * Node（viz-model-check / dom-harness）无 document → 落回暗色常量，规格纯函数照常求值。
 */
const C = {
  get cyan(): string { return cssColor('--cyan', FALLBACK.cyan); },
  get violet(): string { return cssColor('--violet', FALLBACK.violet); },
  get pink(): string { return cssColor('--pink', FALLBACK.pink); },
  get green(): string { return cssColor('--green', FALLBACK.green); },
  get yellow(): string { return cssColor('--yellow', FALLBACK.yellow); },
  get red(): string { return cssColor('--red', FALLBACK.red); },
  get grid(): string { return cssColor('--viz-grid', FALLBACK.grid); },
  get axis(): string { return cssColor('--viz-axis', FALLBACK.axis); },
  get dim(): string { return cssColor('--viz-dim', FALLBACK.dim); },
  /** 默认矩形填充 */
  get fill(): string { return cssColor('--viz-fill', FALLBACK.fill); },
  /** 画布底色（挖空点用） */
  get bg(): string { return cssColor('--viz-bg', FALLBACK.bg); },
  /** 画布前景色（高亮点的实心填充） */
  get fg(): string { return cssColor('--viz-fg', FALLBACK.fg); },
};

export interface Frame {
  W: number;
  H: number;
  px(x: number): number;
  py(y: number): number;
}

const PAD = { l: 54, r: 20, t: 16, b: 30 };

function makeFrame(canvas: HTMLCanvasElement): (view: View) => Frame {
  const ctx = canvas.getContext('2d');
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const W = canvas.clientWidth || 640;
  const H = canvas.clientHeight || 230;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
  }
  return (view: View): Frame => {
    const y0 = view.y0 ?? 0;
    const px = (x: number) => PAD.l + ((x - view.x0) / (view.x1 - view.x0)) * (W - PAD.l - PAD.r);
    const py = (y: number) =>
      H - PAD.b - ((y - y0) / (view.y1 - y0)) * (H - PAD.t - PAD.b);
    return { W, H, px, py };
  };
}

/** 画一个载荷。无 2d context（jsdom）时静默跳过 —— 数值部分另有 DOM 出口，不许崩。 */
function paint(canvas: HTMLCanvasElement, p: Payload): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const fr = makeFrame(canvas)(p.view);
  const { W, H } = fr;
  const y0 = p.view.y0 ?? 0;

  const grid = p.grid ?? {};
  ctx.lineWidth = 1;
  ctx.strokeStyle = C.grid;
  const rows = grid.rows ?? 5;
  for (let i = 1; i <= rows; i++) {
    const y = PAD.t + ((H - PAD.t - PAD.b) * i) / (rows + 1);
    ctx.beginPath();
    ctx.moveTo(PAD.l, y);
    ctx.lineTo(W - PAD.r, y);
    ctx.stroke();
  }

  ctx.strokeStyle = C.axis;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD.l, PAD.t);
  ctx.lineTo(PAD.l, H - PAD.b);
  ctx.lineTo(W - PAD.r, H - PAD.b);
  ctx.stroke();

  // 坐标刻度
  ctx.fillStyle = C.dim;
  ctx.font = '10px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  const xTicks = grid.xTicks ?? 5;
  for (let i = 0; i <= xTicks; i++) {
    const xv = p.view.x0 + ((p.view.x1 - p.view.x0) * i) / xTicks;
    ctx.fillText(fmt(xv), fr.px(xv), H - PAD.b + 14);
  }
  ctx.textAlign = 'right';
  const yTicks = grid.yTicks ?? 4;
  for (let i = 0; i <= yTicks; i++) {
    const yv = y0 + ((p.view.y1 - y0) * i) / yTicks;
    ctx.fillText(fmt(yv), PAD.l - 6, fr.py(yv) + 3);
  }
  ctx.textAlign = 'left';

  for (const r of p.rects ?? []) {
    ctx.fillStyle = r.fill ?? C.fill;
    const x = fr.px(Math.min(r.x, r.x + r.w));
    const y = fr.py(Math.max(r.y, r.y + r.h));
    ctx.fillRect(x, y, Math.abs(fr.px(r.x + r.w) - fr.px(r.x)), Math.abs(fr.py(r.y) - fr.py(r.y + r.h)));
    if (r.stroke) {
      ctx.strokeStyle = r.stroke;
      ctx.lineWidth = 1.5;
      if (r.dash) ctx.setLineDash(r.dash);
      ctx.strokeRect(x, y, Math.abs(fr.px(r.x + r.w) - fr.px(r.x)), Math.abs(fr.py(r.y) - fr.py(r.y + r.h)));
      ctx.setLineDash([]);
    }
  }

  for (const a of p.arcs ?? []) {
    ctx.strokeStyle = a.color ?? C.violet;
    ctx.lineWidth = a.width ?? 2;
    if (a.dash) ctx.setLineDash(a.dash);
    ctx.beginPath();
    ctx.arc(fr.px(a.cx), fr.py(a.cy), (Math.abs(fr.px(a.cx + a.r) - fr.px(a.cx))), a.from, a.to);
    ctx.stroke();
    ctx.setLineDash([]);
    if (a.radiusAt != null) {
      ctx.strokeStyle = a.radiusColor ?? C.cyan;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fr.px(a.cx), fr.py(a.cy));
      ctx.lineTo(fr.px(a.cx + a.r * Math.cos(a.radiusAt)), fr.py(a.cy + a.r * Math.sin(a.radiusAt)));
      ctx.stroke();
    }
  }

  for (const poly of p.polys ?? []) {
    if (!poly.pts.length) continue;
    ctx.beginPath();
    poly.pts.forEach(([x, y], i) => (i ? ctx.lineTo(fr.px(x), fr.py(y)) : ctx.moveTo(fr.px(x), fr.py(y))));
    if (poly.close !== false) ctx.closePath();
    if (poly.fill) {
      ctx.fillStyle = poly.fill;
      ctx.fill();
    }
    if (poly.stroke) {
      ctx.strokeStyle = poly.stroke;
      ctx.lineWidth = 2;
      if (poly.dash) ctx.setLineDash(poly.dash);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  for (const c of p.curves ?? []) {
    const steps = c.steps ?? 1200;
    const from = c.from ?? p.view.x0;
    const to = c.to ?? p.view.x1;
    ctx.beginPath();
    let pen = false;
    let prevY = 0;
    for (let i = 0; i <= steps; i++) {
      const x = from + ((to - from) * i) / steps;
      const y = c.f(x);
      if (!Number.isFinite(y)) {
        pen = false;
        continue;
      }
      if (c.kind === 'step') {
        if (pen) {
          ctx.lineTo(fr.px(x), fr.py(prevY));
          ctx.lineTo(fr.px(x), fr.py(y));
        } else {
          ctx.moveTo(fr.px(x), fr.py(y));
          pen = true;
        }
        prevY = y;
        continue;
      }
      if (!pen) {
        ctx.moveTo(fr.px(x), fr.py(y));
        pen = true;
      } else ctx.lineTo(fr.px(x), fr.py(y));
    }
    ctx.strokeStyle = c.color ?? C.cyan;
    ctx.lineWidth = c.width ?? 2.5;
    if (c.dash) ctx.setLineDash(c.dash);
    if (c.glow) {
      ctx.shadowColor = c.color ?? C.cyan;
      ctx.shadowBlur = 10;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
  }

  for (const s of p.segs ?? []) {
    ctx.strokeStyle = s.color ?? C.dim;
    ctx.lineWidth = s.width ?? 1.5;
    if (s.dash) ctx.setLineDash(s.dash);
    ctx.beginPath();
    ctx.moveTo(fr.px(s.x0), fr.py(s.y0));
    ctx.lineTo(fr.px(s.x1), fr.py(s.y1));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (const pt of p.points ?? []) {
    ctx.beginPath();
    ctx.arc(fr.px(pt.x), fr.py(pt.y), pt.r ?? 5, 0, Math.PI * 2);
    ctx.fillStyle = pt.fill ?? C.cyan;
    ctx.fill();
    if (pt.stroke) {
      ctx.strokeStyle = pt.stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (pt.label) {
      ctx.fillStyle = pt.fill ?? C.cyan;
      ctx.font = 'italic 12px Georgia, serif';
      ctx.fillText(pt.label, fr.px(pt.x) + (pt.dx ?? 8), fr.py(pt.y) + (pt.dy ?? -8));
    }
  }

  for (const l of p.labels ?? []) {
    ctx.fillStyle = l.color ?? C.dim;
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.textAlign = l.align ?? 'left';
    ctx.fillText(l.text, fr.px(l.x), fr.py(l.y));
    ctx.textAlign = 'left';
  }

  if (p.axis) {
    ctx.fillStyle = C.dim;
    ctx.font = '11px ui-monospace, Menlo, monospace';
    if (p.axis.x) ctx.fillText(p.axis.x, W - PAD.r + 2, H - PAD.b + 14);
    if (p.axis.y) ctx.fillText(p.axis.y, PAD.l - 16, PAD.t + 10);
  }
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return '∞';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e4 || a < 1e-3) return v.toExponential(1).replace('e', 'e');
  return String(Math.round(v * 1e3) / 1e3);
}

/* ------------------------------------------------- 滑块 + 读数 + 自检 */

export interface VizHandle {
  destroy?(): void;
}

/** 档1 模块的统一接口（注册表里存的类型） */
export interface VizModule {
  label: string;
  mount(host: HTMLElement, hint: Record<string, unknown>): VizHandle | void;
}

const badge = (cls: string, text: string) => `<span class="badge ${cls}">${escapeHtml(text)}</span>`;

/** 单个规格 → VizModule。带「前端计算·未对拍」徽标、滑块、数值读数、invariant 自检。 */
export function vizFromSpec(spec: VizSpec) {
  return {
    label: spec.title,
    mount(host: HTMLElement, hint: Record<string, unknown>): VizHandle | void {
      const keys = hint.mode == null ? null : Array.isArray(hint.mode) ? hint.mode.map(String) : [String(hint.mode)];
      const picked = keys ? spec.modes.filter((m) => keys.includes(m.key)) : [];
      const modes = picked.length ? picked : spec.modes;
      let idx = 0;
      // params_hint 可以覆盖滑块的初值（数据侧给的推荐值）
      let n = Number(hint.n ?? NaN);

      host.innerHTML = `
        <div class="viz">
          <div class="vhead">
            ${badge('warn', '前端计算 · 未对拍')}
            <span class="dim v-sub"></span>
            <span class="modes">${modes
              .map(
                (m, i) =>
                  `<button class="chip vizmode${i === 0 ? ' on' : ''}" data-m="${i}">${escapeHtml(m.label)}</button>`,
              )
              .join('')}</span>
          </div>
          <canvas></canvas>
          <div class="slider">
            <span class="s-label"></span><input type="range"><span class="nval"></span>
          </div>
          <div class="readout"></div>
          <div class="invariant"></div>
          <p class="kv v-note"></p>
        </div>`;

      const root = host.querySelector('.viz') as HTMLElement;
      const canvas = root.querySelector('canvas') as HTMLCanvasElement;
      const sliderBox = root.querySelector('.slider') as HTMLElement;
      const slider = sliderBox.querySelector('input') as HTMLInputElement;
      const sLabel = sliderBox.querySelector('.s-label') as HTMLElement;
      const nval = sliderBox.querySelector('.nval') as HTMLElement;
      const readoutBox = root.querySelector('.readout') as HTMLElement;
      const invBox = root.querySelector('.invariant') as HTMLElement;
      const noteBox = root.querySelector('.v-note') as HTMLElement;
      const sub = root.querySelector('.v-sub') as HTMLElement;

      function mode(): VizMode {
        return modes[idx];
      }

      function clampN(m: VizMode, v: number): number {
        if (!m.n) return 0;
        return Math.min(m.n.max, Math.max(m.n.min, v));
      }

      function syncSlider(): void {
        const m = mode();
        if (!m.n) {
          sliderBox.style.display = 'none';
          return;
        }
        sliderBox.style.display = '';
        sLabel.textContent = hint.n_label ? String(hint.n_label) : 'n';
        slider.min = String(m.n.min);
        slider.max = String(m.n.max);
        slider.step = String(m.n.step);
        n = clampN(m, Number.isFinite(n) ? n : (m.n.init ?? m.n.min));
        slider.value = String(n);
        nval.textContent = fmt(n);
      }

      function render(): void {
        const m = mode();
        sub.textContent = `${spec.module} v1 · ${m.label}`;
        paint(canvas, m.draw(n));

        const rows = m.readout(n);
        readoutBox.innerHTML = rows
          .map(
            (r) =>
              `<div class="r${r.verdict === 'fail' ? ' fail' : ''}"><b>${
                r.verdict === 'fail' ? '✗ ' : r.verdict === 'ok' ? '✓ ' : ''
              }${escapeHtml(r.value)}</b><span>${escapeHtml(r.label)}</span></div>`,
          )
          .join('');

        const inv = m.invariant(n);
        const dev = Math.abs(inv.actual - inv.expected);
        const bad = !(dev <= inv.tol);
        invBox.className = `invariant${bad ? ' bad' : ''}`;
        invBox.innerHTML = bad
          ? `${badge('err', 'invariant 自检失败')} ${escapeHtml(inv.label)}：期望 ${
              inv.expected
            }，实得 ${inv.actual}（偏差 ${dev.toExponential(2)} > ${inv.tol}）`
          : `${badge('ok', 'invariant ✓')} ${escapeHtml(inv.label)}：${inv.actual.toPrecision(
              10,
            )}（偏差 ${dev.toExponential(2)} ≤ ${inv.tol}）`;
        if (bad) console.error('[viz] invariant 自检失败', spec.module, m.key, inv);

        noteBox.textContent = m.note(n);
      }

      slider.addEventListener('input', () => {
        n = Number(slider.value);
        nval.textContent = fmt(n);
        render();
      });
      root.querySelectorAll<HTMLButtonElement>('.vizmode').forEach((b) => {
        b.addEventListener('click', () => {
          idx = Number(b.dataset.m);
          root.querySelectorAll('.vizmode').forEach((x) => x.classList.toggle('on', x === b));
          syncSlider();
          render();
        });
      });

      const ro =
        typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => paint(canvas, mode().draw(n))) : null;
      ro?.observe(canvas);
      syncSlider();
      render();
      return { destroy: () => ro?.disconnect() };
    },
  };
}

/** 供 Node 侧校验用：某个模块某个模式在 n 处的完整纯函数输出 */
export function evaluateMode(m: VizMode, n: number): Payload & { readout: Readout[]; invariant: Invariant; note: string } {
  return { ...m.draw(n), readout: m.readout(n), invariant: m.invariant(n), note: m.note(n) };
}

export { C as COLORS, PAD };
