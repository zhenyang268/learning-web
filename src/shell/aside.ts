import type { EntryFile } from '../types';
import type { Graph } from '../modules/graph';
import { escapeHtml, renderInline } from '../renderers/markdown';
import { isProbeDone, toggleProbe } from '../modules/state';

export interface AsideModel {
  file: EntryFile;
  graph: Graph;
  masteryOf: (code: string) => number;
  difficulty: number;
  /**
   * prereq 为空时的说明文案（调用方按数据情况给）。
   * 默认「无前序（拓扑序起点）」；若该单元其实有跨章 links、只是 yaml 还没标注依赖，
   * 必须换成如实说明 —— 否则「拓扑序起点」是**误导**（A2.1 明明要先学 A1.5）。
   */
  prereqEmptyNote?: string;
}

const RING = 163;

function chips(codes: string[], cls: string, empty: string): string {
  if (!codes.length) return `<p class="dim">${escapeHtml(empty)}</p>`;
  return codes
    .map(
      (c) =>
        `<button class="chip ${cls}" data-goto="${escapeHtml(c)}">${escapeHtml(c)}</button>`,
    )
    .join('');
}

export function renderAside(host: HTMLElement, model: AsideModel): void {
  const { file, graph, masteryOf, difficulty } = model;
  const code = file.code ?? '';
  const mastery = masteryOf(code);
  const src = file.src;
  const srcText = src?.file
    ? `${src.file}${src.line_start != null ? `:${src.line_start}${src.line_end != null && src.line_end !== src.line_start ? `–${src.line_end}` : ''}` : ''}`
    : '';
  const probes = file.entries.filter((e) => e.type === 'probe');

  host.innerHTML = `
    <div class="box">
      <h4>掌握度 · 难度</h4>
      <div class="ring">
        <svg width="64" height="64">
          <circle cx="32" cy="32" r="26" fill="none" style="stroke:var(--line)" stroke-width="6" />
          <circle cx="32" cy="32" r="26" fill="none" stroke="url(#g)" stroke-width="6" stroke-linecap="round"
            stroke-dasharray="${RING}" stroke-dashoffset="${(RING * (1 - mastery / 5)).toFixed(1)}" />
          <defs>
            <linearGradient id="g"><stop offset="0" style="stop-color:var(--cyan)" /><stop offset="1" style="stop-color:var(--violet)" /></linearGradient>
          </defs>
        </svg>
        <div>
          <div class="num">L${mastery}</div>
          <div class="lbl">难度 ${difficulty}/3</div>
        </div>
      </div>

      <h4 style="margin-top:20px">依赖 ◂</h4>
      ${chips(graph.prereq.get(code) ?? [], 'dep', model.prereqEmptyNote ?? '无前序（拓扑序起点）')}

      <h4 style="margin-top:14px">被用于 ▸</h4>
      ${chips(graph.usedBy.get(code) ?? [], '', '暂无反向引用')}

      <h4 style="margin-top:14px">检验题 · ${probes.length}</h4>
      ${
        probes.length
          ? probes
              .map(
                (p) => `<div class="probe${isProbeDone(p.id) ? ' done' : ''}" data-probe="${escapeHtml(p.id)}">
                  <span class="cb"></span><span class="txt">${renderInline(p.title ?? p.id)}</span>
                </div>`,
              )
              .join('')
          : '<p class="dim">本节暂无检验题</p>'
      }

      <h4 style="margin-top:18px">本节元信息</h4>
      <p class="kv mono">${escapeHtml(file.schema ?? '—')} · ${escapeHtml(code)}</p>
      ${srcText ? `<p class="kv mono">src ${escapeHtml(srcText)}</p>` : ''}
      ${file.notebook_commit ? `<p class="kv mono">commit ${escapeHtml(file.notebook_commit)}</p>` : ''}
      ${file.updated ? `<p class="kv mono">updated ${escapeHtml(file.updated)}</p>` : ''}
    </div>`;

  host.querySelectorAll<HTMLElement>('[data-probe]').forEach((el) => {
    el.addEventListener('click', () => {
      const done = toggleProbe(el.dataset.probe ?? '');
      el.classList.toggle('done', done);
    });
  });
}
