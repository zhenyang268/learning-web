import type { VizModule } from './index';
import { escapeHtml } from '../renderers/markdown';

interface Mode {
  key: string;
  label: string;
  /** f_n(x)，x ∈ ℝ */
  f(x: number, n: number): number;
  /** 极限函数 f(x) */
  limit(x: number): number;
  /** 解析积分 ∫f_n、∫f、是否可交换 */
  integrals(n: number): { intFn: number; intF: number; ok: boolean };
  /** invariant 自检：解析值与约束值的偏差 */
  invariant(n: number): { label: string; expected: number; actual: number; tol: number };
  view(n: number): { x0: number; x1: number; y1: number };
  note: string;
}

const MODES: Record<string, Mode> = {
  bump: {
    key: 'bump',
    label: '尖峰挤进零测点',
    f: (x, n) => (x > 0 && x < 1 / n ? n : 0),
    limit: () => 0,
    integrals: () => ({ intFn: 1, intF: 0, ok: false }),
    invariant: (n) => ({ label: '面积 ≡ 宽(1/n) × 高(n)', expected: 1, actual: n * (1 / n), tol: 1e-12 }),
    view: (n) => ({ x0: -0.05, x1: 1.15, y1: Math.max(2, n * 1.1) }),
    note: '∫fₙ ≡ 1 而 ∫f = 0 —— 质量挤进零测点后消失',
  },
  slide: {
    key: 'slide',
    label: '质量滑向无穷远',
    f: (x, n) => (x >= n && x < n + 1 ? 1 : 0),
    limit: () => 0,
    integrals: () => ({ intFn: 1, intF: 0, ok: false }),
    invariant: (n) => ({ label: '面积 ≡ 宽(1) × 高(1)', expected: 1, actual: (n + 1 - n) * 1, tol: 1e-12 }),
    view: (n) => ({ x0: 0, x1: n + 2, y1: 1.4 }),
    note: '∫fₙ ≡ 1 而 ∫f = 0 —— 质量整体滑向无穷远',
  },
  // 正对照：MCT 成立（fₙ ↑ 1）
  monotone: {
    key: 'monotone',
    label: '对照 · 单调升（MCT 成立）',
    f: (x, n) => (x > 0 ? Math.pow(x, 1 / n) : 0),
    limit: (x) => (x > 0 ? 1 : 0),
    integrals: (n) => ({ intFn: n / (n + 1), intF: 1, ok: true }),
    invariant: (n) => {
      // 数值积分对拍解析值 n/(n+1)（梯形，10000 步）
      const steps = 10000;
      const h = 1 / steps;
      let s = 0;
      for (let i = 0; i <= steps; i++) {
        const x = i * h;
        const y = x > 0 ? Math.pow(x, 1 / n) : 0;
        s += y * (i === 0 || i === steps ? 0.5 : 1);
      }
      return { label: '数值积分 vs 解析 n/(n+1)', expected: n / (n + 1), actual: s * h, tol: 1e-6 };
    },
    view: () => ({ x0: 0, x1: 1.05, y1: 1.15 }),
    note: 'fₙ = x^{1/n} ↑ 1：∫fₙ = n/(n+1) ↑ 1 = ∫f，极限与积分可交换',
  },
};

function modesOf(hint: Record<string, unknown>): string[] {
  const raw = hint.mode;
  const list = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? [raw] : [];
  const picked = list.filter((m) => m in MODES);
  return picked.length ? picked : ['bump', 'slide', 'monotone'];
}

/** 档1 实现：convergence-thm（bump / slide / monotone）。全部数值本地算，拖滑块零请求。 */
export const convergenceThm: VizModule = {
  label: '收敛定理反例演示',
  mount(host, hint) {
    const modes = modesOf(hint);
    const nMin = Number(hint.n_min ?? 1) || 1;
    const nMax = Number(hint.n_max ?? 40) || 40;
    let mode = modes[0];
    let n = Math.min(Math.max(nMin, 4), nMax);

    host.innerHTML = `
      <div class="viz">
        <div class="vhead">
          <span class="badge warn">前端计算 · 未对拍</span>
          <span class="dim">convergence-thm v1 · ${escapeHtml(MODES[mode].label)}</span>
          <span class="modes">${modes
            .map(
              (m) =>
                `<button class="chip vizmode${m === mode ? ' on' : ''}" data-m="${escapeHtml(m)}">${escapeHtml(
                  MODES[m].label,
                )}</button>`,
            )
            .join('')}</span>
        </div>
        <canvas></canvas>
        <div class="slider">
          <span>n</span><input type="range" min="${nMin}" max="${nMax}" step="1" value="${n}">
          <span class="nval">${n}</span>
        </div>
        <div class="readout">
          <div class="r"><b class="v-intfn"></b><span>∫ fₙ dμ</span></div>
          <div class="r"><b class="v-intf"></b><span>∫ lim fₙ dμ</span></div>
          <div class="r"><b class="v-verdict"></b><span>判决</span></div>
        </div>
        <div class="invariant"></div>
        <p class="kv v-note"></p>
      </div>`;

    const root = host.querySelector('.viz') as HTMLElement;
    const canvas = root.querySelector('canvas') as HTMLCanvasElement;
    const slider = root.querySelector('input[type=range]') as HTMLInputElement;
    const nval = root.querySelector('.nval') as HTMLElement;
    const elIntFn = root.querySelector('.v-intfn') as HTMLElement;
    const elIntF = root.querySelector('.v-intf') as HTMLElement;
    const verdictBox = root.querySelector('.v-verdict')?.parentElement as HTMLElement;
    const elVerdict = root.querySelector('.v-verdict') as HTMLElement;
    const elInv = root.querySelector('.invariant') as HTMLElement;
    const elNote = root.querySelector('.v-note') as HTMLElement;
    const ctx = canvas.getContext('2d')!;

    function draw(): void {
      const m = MODES[mode];
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const view = m.view(n);
      const padL = 52;
      const padR = 18;
      const padT = 16;
      const padB = 30;
      const px = (x: number) => padL + ((x - view.x0) / (view.x1 - view.x0)) * (W - padL - padR);
      const py = (y: number) => H - padB - (y / view.y1) * (H - padT - padB);

      // 网格
      ctx.strokeStyle = 'rgba(148,163,255,.08)';
      ctx.lineWidth = 1;
      for (let i = 1; i <= 5; i++) {
        const y = padT + ((H - padT - padB) * i) / 6;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(W - padR, y);
        ctx.stroke();
      }
      // 坐标轴
      ctx.strokeStyle = 'rgba(148,163,255,.32)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padL, padT);
      ctx.lineTo(padL, H - padB);
      ctx.lineTo(W - padR, H - padB);
      ctx.stroke();
      ctx.fillStyle = 'rgba(139,150,196,.9)';
      ctx.font = '11px ui-monospace, Menlo, monospace';
      ctx.fillText('x', W - padR + 2, H - padB + 14);
      ctx.fillText('f', padL - 14, padT + 10);

      // fₙ（离散取样，密度足够看清尖峰/平台）
      const steps = 1400;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const x = view.x0 + ((view.x1 - view.x0) * i) / steps;
        const y = m.f(x, n);
        if (i === 0) ctx.moveTo(px(x), py(y));
        else ctx.lineTo(px(x), py(y));
      }
      ctx.strokeStyle = '#5ee6ff';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#5ee6ff';
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 极限函数 f（虚线）
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(244,114,182,.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const x = view.x0 + ((view.x1 - view.x0) * i) / steps;
        const y = m.limit(x);
        if (i === 0) ctx.moveTo(px(x), py(y));
        else ctx.lineTo(px(x), py(y));
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#f472b6';
      ctx.font = 'italic 12px Georgia, serif';
      const midX = px(view.x0 + (view.x1 - view.x0) * 0.55);
      ctx.fillText('f = lim fₙ', midX, py(m.limit(view.x0 + (view.x1 - view.x0) * 0.55)) - 8);

      // 数值 readout
      const { intFn, intF, ok } = m.integrals(n);
      elIntFn.textContent = intFn.toFixed(3);
      elIntF.textContent = intF.toFixed(3);
      elVerdict.textContent = ok ? '✓ 可交换' : '✗ 不可交换';
      verdictBox.classList.toggle('fail', !ok);
      elNote.textContent = m.note;

      // invariant 自检
      const inv = m.invariant(n);
      const dev = Math.abs(inv.actual - inv.expected);
      const bad = dev > inv.tol;
      elInv.className = `invariant${bad ? ' bad' : ''}`;
      elInv.innerHTML = bad
        ? `<span class="badge err">invariant 自检失败</span> ${escapeHtml(inv.label)}：期望 ${inv.expected}，实得 ${inv.actual}（偏差 ${dev.toExponential(
            2,
          )} > ${inv.tol}）`
        : `<span class="badge ok">invariant ✓</span> ${escapeHtml(inv.label)}：${inv.actual.toPrecision(
            10,
          )}（偏差 ${dev.toExponential(2)} ≤ ${inv.tol}）`;
      if (bad) console.error('[viz] invariant 自检失败', m.key, inv);
    }

    slider.addEventListener('input', () => {
      n = Number(slider.value);
      nval.textContent = String(n);
      draw();
    });
    root.querySelectorAll<HTMLButtonElement>('.vizmode').forEach((btn) => {
      btn.addEventListener('click', () => {
        mode = btn.dataset.m ?? mode;
        root.querySelectorAll('.vizmode').forEach((b) => b.classList.toggle('on', b === btn));
        (root.querySelector('.dim') as HTMLElement).textContent =
          `convergence-thm v1 · ${MODES[mode].label}`;
        draw();
      });
    });
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);
    draw();
    return { destroy: () => ro.disconnect() };
  },
};
