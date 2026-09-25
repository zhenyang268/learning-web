/**
 * 图谱渲染器（TASKBOOK §8 第7条）：SVG 手写，不引 d3。
 *
 * 三层缩放：
 *   L1 全局     —— 字母块聚合节点（A/B/C/DE/LIE…），块间边 = 块内有向边聚合计数；
 *   L2 章节     —— 某字母块内的章节组（A1/A2…），组间边同样聚合；
 *   L3 节点     —— 某组内单元，prereq 按拓扑深度分列布局（无环一眼可验：
 *                  所有 prereq 箭头一律从左指向右；有环 → 环上节点标红 + 告警条）。
 *
 * 四类边颜色 + 线型双区分，图例内 checkbox 可分别开关。
 * 交互：滚轮缩放、拖拽平移、点节点下钻 / L3 点节点跳阅读区（hash 路由）。
 * 掌握度 = 节点下方进度条（与右栏同一数据源 groupMasteryMean），难度不画
 * （难度在词条正文里，索引没有 —— 图谱不为它拉全库，宁缺毋假）。
 */
import { escapeHtml } from './markdown';
import {
  aggregateLetters,
  groupsOf,
  prereqDepths,
  type EdgeKind,
  type MergedGraph,
} from '../modules/graph-model';

export interface GraphViewModel {
  merged: MergedGraph;
  /** code → 掌握度 0–5（与阅读区同源） */
  masteryOf: (code: string) => number;
}

type Level = 1 | 2 | 3;

interface View {
  level: Level;
  letter: string; // L2/L3 用
  group: string; // L3 用
}

const KIND_STYLE: Record<EdgeKind, { label: string; css: string; dash: string }> = {
  prereq: { label: 'prereq 学习顺序', css: '--cyan', dash: '' },
  tension: { label: 'tension 反例冲突', css: '--pink', dash: '6 4' },
  dual: { label: 'dual 对偶路径', css: '--violet', dash: '2 4' },
  applies: { label: 'applies 下游应用', css: '--green', dash: '10 4' },
};

/** 渲染器实例状态挂在 host 元素上，重复 mount 时复用（保留缩放层级） */
const STATE = new WeakMap<HTMLElement, { view: View; on: Set<EdgeKind>; scale: number; tx: number; ty: number }>();

export function mountGraph(host: HTMLElement, model: GraphViewModel): void {
  const prev = STATE.get(host);
  const st = prev ?? {
    view: { level: 1 as Level, letter: '', group: '' },
    on: new Set<EdgeKind>(['prereq', 'tension', 'dual', 'applies']),
    scale: 1,
    tx: 0,
    ty: 0,
  };
  STATE.set(host, st);

  host.innerHTML = `
    <div class="graphwrap">
      <div class="graphbar">
        <span class="gtitle mono" data-role="crumb"></span>
        <span class="grow"></span>
        <label class="gsw"><input type="checkbox" data-kind="prereq" checked><i style="--k:var(--cyan)"></i>prereq</label>
        <label class="gsw"><input type="checkbox" data-kind="tension" checked><i style="--k:var(--pink)"></i>tension</label>
        <label class="gsw"><input type="checkbox" data-kind="dual" checked><i style="--k:var(--violet)"></i>dual</label>
        <label class="gsw"><input type="checkbox" data-kind="applies" checked><i style="--k:var(--green)"></i>applies</label>
        <button class="chip" data-role="zoomout" title="缩小">−</button>
        <button class="chip" data-role="zoomin" title="放大">＋</button>
        <button class="chip" data-role="reset" title="回到全局">⌂ 全局</button>
      </div>
      <div class="graphnote" data-role="note" hidden></div>
      <div class="graphcanvas" data-role="canvas">
        <svg data-role="svg" width="100%" height="100%"></svg>
      </div>
      <div class="graphhint dim" data-role="hint"></div>
    </div>`;

  const svg = host.querySelector<SVGSVGElement>('[data-role=svg]')!;
  const crumb = host.querySelector<HTMLElement>('[data-role=crumb]')!;
  const note = host.querySelector<HTMLElement>('[data-role=note]')!;
  const hint = host.querySelector<HTMLElement>('[data-role=hint]')!;

  /* ------------------------------------------------------------ 开关 */
  host.querySelectorAll<HTMLInputElement>('input[data-kind]').forEach((cb) => {
    cb.checked = st.on.has(cb.dataset.kind as EdgeKind);
    cb.addEventListener('change', () => {
      const k = cb.dataset.kind as EdgeKind;
      if (cb.checked) st.on.add(k);
      else st.on.delete(k);
      draw();
    });
  });
  host.querySelector('[data-role=zoomin]')!.addEventListener('click', () => {
    st.scale = Math.min(4, st.scale * 1.25);
    draw();
  });
  host.querySelector('[data-role=zoomout]')!.addEventListener('click', () => {
    st.scale = Math.max(0.3, st.scale / 1.25);
    draw();
  });
  host.querySelector('[data-role=reset]')!.addEventListener('click', () => {
    st.view = { level: 1, letter: '', group: '' };
    st.scale = 1;
    st.tx = 0;
    st.ty = 0;
    draw();
  });

  /* ------------------------------------------------------------ 平移/缩放 */
  let drag: { x: number; y: number; tx: number; ty: number } | null = null;
  svg.addEventListener('pointerdown', (ev) => {
    drag = { x: ev.clientX, y: ev.clientY, tx: st.tx, ty: st.ty };
    svg.setPointerCapture(ev.pointerId);
  });
  svg.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    st.tx = drag.tx + (ev.clientX - drag.x);
    st.ty = drag.ty + (ev.clientY - drag.y);
    applyTransform();
  });
  svg.addEventListener('pointerup', () => (drag = null));
  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    st.scale = Math.min(4, Math.max(0.3, st.scale * (ev.deltaY < 0 ? 1.12 : 1 / 1.12)));
    applyTransform();
  }, { passive: false });

  let viewport: { w: number; h: number } = { w: 800, h: 520 };
  function applyTransform(): void {
    const g = svg.querySelector<SVGGElement>('g.root');
    if (g) g.setAttribute('transform', `translate(${st.tx},${st.ty}) scale(${st.scale})`);
  }

  /* ------------------------------------------------------------ 绘制 */
  function draw(): void {
    const rect = svg.getBoundingClientRect();
    viewport = { w: Math.max(rect.width, 300), h: Math.max(rect.height, 300) };
    svg.setAttribute('viewBox', `0 0 ${viewport.w} ${viewport.h}`);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'root');
    svg.innerHTML = '';
    svg.appendChild(g);
    // 箭头 marker（prereq 蓝 / applies 绿）
    svg.insertAdjacentHTML(
      'afterbegin',
      `<defs>
        <marker id="arw-prereq" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--cyan)"/></marker>
        <marker id="arw-applies" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--green)"/></marker>
      </defs>`,
    );

    const bad = model.merged.yamlStatus.filter((s) => !s.ok);
    const noYaml = model.merged.yamlStatus.length === 0;
    if (noYaml) {
      note.hidden = false;
      note.textContent = '语义边真源（graph/*.yaml）尚未建立 —— 当前仅显示 links 派生边（prereq 启发式）。';
    } else if (bad.length) {
      note.hidden = false;
      note.textContent = `语义边部分降级：${bad.map((b) => `${b.letter}（${b.note}）`).join('；')}`;
    } else {
      note.hidden = true;
    }

    if (st.view.level === 1) drawLetters(g);
    else if (st.view.level === 2) drawGroups(g);
    else drawNodes(g);
    applyTransform();
    drawCrumb();
  }

  function drawCrumb(): void {
    const parts = ['全局'];
    if (st.view.level >= 2) parts.push(st.view.letter);
    if (st.view.level >= 3) parts.push(st.view.group);
    crumb.textContent = parts.join(' / ');
    hint.textContent =
      st.view.level === 1
        ? '点字母块进入章节层 · 滚轮缩放 · 拖拽平移'
        : st.view.level === 2
          ? '点章节组进入节点层 · ⌂ 回全局'
          : 'prereq 箭头一律从左（上游）指向右（下游）——有环即红 · 点节点去阅读';
  }

  function edgeStroke(kind: EdgeKind): string {
    const s = KIND_STYLE[kind];
    return `stroke:var(${s.css});stroke-width:${kind === 'prereq' ? 1.6 : 1.3};${s.dash ? `stroke-dasharray:${s.dash};` : ''}fill:none;opacity:.75`;
  }

  function line(
    g: SVGGElement,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    kind: EdgeKind,
    weight = 1,
    cycle = false,
  ): void {
    if (!st.on.has(kind)) return;
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('x1', String(x1));
    l.setAttribute('y1', String(y1));
    l.setAttribute('x2', String(x2));
    l.setAttribute('y2', String(y2));
    l.setAttribute('style', edgeStroke(kind) + (cycle ? ';stroke:var(--red);stroke-width:2.4' : ''));
    if (!cycle && (kind === 'prereq' || kind === 'applies')) {
      l.setAttribute('marker-end', `url(#arw-${kind})`);
      if (weight > 1) l.setAttribute('stroke-width', String(Math.min(1.2 + weight * 0.5, 5)));
    }
    g.appendChild(l);
  }

  function nodeCircle(
    g: SVGGElement,
    x: number,
    y: number,
    r: number,
    label: string,
    sub: string,
    mastery: number | null,
    onClick: () => void,
    danger = false,
  ): void {
    const grp = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    grp.setAttribute('class', 'gnode');
    grp.setAttribute('transform', `translate(${x},${y})`);
    grp.innerHTML = `
      <circle r="${r}" class="halo${danger ? ' danger' : ''}"></circle>
      <circle r="${r * 0.72}" class="core"></circle>
      ${mastery != null ? `<path class="mring" d="${masteryArc(r + 4, mastery / 5)}"></path>` : ''}
      <text y="${r + 16}" class="lbl">${escapeHtml(label)}</text>
      ${sub ? `<text y="${r + 30}" class="sub">${escapeHtml(sub)}</text>` : ''}`;
    grp.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onClick();
    });
    g.appendChild(grp);
  }

  function masteryArc(r: number, frac: number): string {
    if (frac <= 0) return '';
    const a0 = -Math.PI / 2;
    const a1 = a0 + 2 * Math.PI * Math.min(frac, 0.9999);
    const x0 = r * Math.cos(a0), y0 = r * Math.sin(a0);
    const x1 = r * Math.cos(a1), y1 = r * Math.sin(a1);
    const large = frac > 0.5 ? 1 : 0;
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }

  /* ------------------------------------------------ L1 字母块（网格布局） */
  function drawLetters(g: SVGGElement): void {
    const agg = aggregateLetters(model.merged);
    const nodes = agg.nodes;
    const cols = Math.max(2, Math.ceil(Math.sqrt(nodes.length * 1.6)));
    const cw = viewport.w / cols;
    const rows = Math.ceil(nodes.length / cols);
    const ch = Math.max(90, viewport.h / Math.max(rows, 1));
    const pos = new Map<string, { x: number; y: number }>();
    nodes.forEach((n, i) => {
      const x = (i % cols) * cw + cw / 2;
      const y = Math.floor(i / cols) * ch + ch / 2;
      pos.set(n.letter, { x, y });
    });
    const filtered = agg.edges.filter((e) => st.on.has(e.kind));
    for (const e of filtered) {
      const a = pos.get(e.from), b = pos.get(e.to);
      if (!a || !b) continue;
      line(g, a.x, a.y, b.x, b.y, e.kind, e.weight);
    }
    for (const n of nodes) {
      const p = pos.get(n.letter)!;
      const groups = groupsOf(model.merged).filter((gr) => gr.letter === n.letter);
      const doneGroups = groups.filter((gr) =>
        gr.codes.every((c) => model.masteryOf(c) >= 3),
      ).length;
      nodeCircle(
        g, p.x, p.y, Math.min(20 + n.count * 1.2, 40),
        n.letter, `${n.count} 单元 · ${doneGroups}/${groups.length} 组达标`,
        null,
        () => {
          st.view = { level: 2, letter: n.letter, group: '' };
          st.scale = 1; st.tx = 0; st.ty = 0;
          draw();
        },
      );
    }
  }

  /* ------------------------------------------------ L2 章节组 */
  function drawGroups(g: SVGGElement): void {
    const all = groupsOf(model.merged);
    const nodes = all.filter((n) => n.letter === st.view.letter);
    if (!nodes.length) {
      st.view = { level: 1, letter: '', group: '' };
      drawLetters(g);
      return;
    }
    const cols = Math.max(2, Math.ceil(Math.sqrt(nodes.length * 1.6)));
    const cw = viewport.w / cols;
    const rows = Math.ceil(nodes.length / cols);
    const ch = Math.max(90, viewport.h / Math.max(rows, 1));
    const pos = new Map<string, { x: number; y: number }>();
    nodes.forEach((n, i) => {
      pos.set(n.group, {
        x: (i % cols) * cw + cw / 2,
        y: Math.floor(i / cols) * ch + ch / 2,
      });
    });
    const inSet = new Set(nodes.map((n) => n.group));
    const codeToGroup = new Map<string, string>();
    for (const n of nodes) for (const c of n.codes) codeToGroup.set(c, n.group);
    const w = new Map<string, { kind: EdgeKind; weight: number }>();
    for (const e of model.merged.directed) {
      const a = codeToGroup.get(e.from), b = codeToGroup.get(e.to);
      if (!a || !b || a === b || !inSet.has(a) || !inSet.has(b)) continue;
      if (!st.on.has(e.kind)) continue;
      const key = `${e.kind}:${a}>${b}`;
      const cur = w.get(key);
      w.set(key, { kind: e.kind, weight: (cur?.weight ?? 0) + 1 });
    }
    for (const [key, e] of w) {
      const [, rest] = key.split(':');
      const [a, b] = rest.split('>');
      const pa = pos.get(a), pb = pos.get(b);
      if (pa && pb) line(g, pa.x, pa.y, pb.x, pb.y, e.kind, e.weight);
    }
    for (const n of nodes) {
      const p = pos.get(n.group)!;
      const done = n.codes.filter((c) => model.masteryOf(c) >= 3).length;
      nodeCircle(
        g, p.x, p.y, Math.min(18 + n.codes.length * 2.5, 36),
        n.group, `${n.codes.length} 单元 · ${done} 达标`,
        null,
        () => {
          st.view = { level: 3, letter: n.letter, group: n.group };
          st.scale = 1; st.tx = 0; st.ty = 0;
          draw();
        },
      );
    }
  }

  /* ------------------------------------------------ L3 节点（拓扑分列） */
  function drawNodes(g: SVGGElement): void {
    const grp = groupsOf(model.merged).find((n) => n.group === st.view.group);
    if (!grp) {
      st.view = { level: 2, letter: st.view.letter, group: '' };
      drawGroups(g);
      return;
    }
    const codes = grp.codes;
    const depthAll = prereqDepths(model.merged);
    // 列 = 组内相对深度（组内最小深度归零）
    const depths = codes.map((c) => depthAll.get(c) ?? 0);
    const minD = Math.min(...depths, 0);
    const colOf = new Map<string, number>();
    codes.forEach((c, i) => colOf.set(c, depths[i] - minD));
    const maxCol = Math.max(...[...colOf.values()], 0);
    const byCol = new Map<number, string[]>();
    for (const c of codes) {
      const col = colOf.get(c) ?? 0;
      const list = byCol.get(col) ?? [];
      list.push(c);
      byCol.set(col, list);
    }
    const colW = viewport.w / (maxCol + 1);
    const pos = new Map<string, { x: number; y: number }>();
    for (const [col, list] of byCol) {
      const rowH = viewport.h / (list.length + 1);
      list.forEach((c, i) => {
        pos.set(c, { x: col * colW + colW / 2, y: (i + 1) * rowH });
      });
    }
    const inSet = new Set(codes);
    // 边：组内有向边 + 组内无向边；跨组 prereq 只画到组边缘的提示（略，避免误导）
    for (const e of model.merged.directed) {
      if (!inSet.has(e.from) || !inSet.has(e.to)) continue;
      if (!st.on.has(e.kind)) continue;
      const a = pos.get(e.from)!, b = pos.get(e.to)!;
      const cycle = model.merged.cycleNodes.has(e.from) || model.merged.cycleNodes.has(e.to);
      line(g, a.x, a.y, b.x, b.y, e.kind, 1, cycle && e.kind === 'prereq');
    }
    for (const e of model.merged.undirected) {
      if (!inSet.has(e.a) || !inSet.has(e.b)) continue;
      if (!st.on.has(e.kind)) continue;
      const a = pos.get(e.a), b = pos.get(e.b);
      if (a && b) line(g, a.x, a.y, b.x, b.y, e.kind);
    }
    for (const c of codes) {
      const p = pos.get(c)!;
      const m = model.masteryOf(c);
      nodeCircle(
        g, p.x, p.y, 16,
        c, model.merged.titleOf.get(c) ?? '',
        m,
        () => {
          location.hash = `#/${c}`;
        },
        model.merged.cycleNodes.has(c),
      );
    }
    if (model.merged.cycleNodes.size) {
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', '12');
      t.setAttribute('y', '22');
      t.setAttribute('class', 'cycwarn');
      t.textContent = `⚠ prereq 有环：${[...model.merged.cycleNodes].join(' ')}（红色）—— 数据需修复`;
      g.appendChild(t);
    }
  }

  draw();
  // 容器尺寸变化（窗口 resize）时重画
  const ro = new ResizeObserver(() => draw());
  ro.observe(host);
}
