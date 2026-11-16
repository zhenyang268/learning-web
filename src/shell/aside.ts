import type { EntryFile } from '../types';
import type { Graph } from '../modules/graph';
import { escapeHtml, renderInline } from '../renderers/markdown';
import { isProbeDone, toggleProbe } from '../modules/state';
import { displayCode } from '../modules/codes';

export interface AsideModel {
  file: EntryFile;
  graph: Graph;
  masteryOf: (code: string) => number;
  difficulty: number;
  /**
   * 掌握度是否由自测派生（该单元有自测题）。true 时环上标「自测推出」，
   * 并说明徽标不可手动抬高 —— 与 renderCard 的只读徽标同一口径。
   */
  derived?: boolean;
  /** 自测进度：当前级别 + 下一级还差几题（有自测时给） */
  selftest?: { level: number; next: number | null; remaining: number; total: number } | null;
  /**
   * 本单元在路线里的位置（仅工程线）：动机（哪条路线第几步）、交付物、验收口径。
   * 全部复用 route 已有字段，不复制正文。
   *
   * `role` / `why` / `job` / `exam` 是 2026-11 追加的字段：
   * 目标岗位收窄成「测开 + 仿真」后，一个单元**值不值得现在做**要能一眼看出，
   * 所以右栏除了「哪条路线第几步」，还要给出路线定位、为什么排这儿、求职/考研两档价值。
   */
  route?: {
    routeLabel: string;
    routeRole: '核心' | '协同' | '对照';
    stage: string;
    index: number;
    total: number;
    outcome: string;
    why: string;
    job: string;
    exam: string;
  } | null;
  /** 「今天该学」的代号（当前位置）；null = 无可推荐 */
  frontier?: string | null;
  /**
   * prereq 为空时的说明文案（调用方按数据情况给）。
   * 默认「无前序（拓扑序起点）」；若该单元其实有跨章 links、只是 yaml 还没标注依赖，
   * 必须换成如实说明 —— 否则「拓扑序起点」是**误导**（A2.1 明明要先学 A1.5）。
   */
  prereqEmptyNote?: string;
}

const RING = 163;

/** 掌握度点击后的轻量同步：不重渲染依赖与正文，只更新环和级别文字。 */
export function patchAsideMastery(host: HTMLElement, mastery: number): void {
  const ring = host.querySelector<SVGCircleElement>('.ring circle[stroke-dasharray]');
  ring?.setAttribute('stroke-dashoffset', (RING * (1 - mastery / 5)).toFixed(1));
  const num = host.querySelector<HTMLElement>('.ring .num');
  if (num) num.textContent = `L${mastery}`;
}

function chips(codes: string[], cls: string, empty: string): string {
  if (!codes.length) return `<p class="dim">${escapeHtml(empty)}</p>`;
  return codes
    .map(
      (c) =>
        // data-goto 用内部码（路由/取数），按钮文本用显示码（单单元章补 .1）
        `<button class="chip ${cls}" data-goto="${escapeHtml(c)}">${escapeHtml(displayCode(c))}</button>`,
    )
    .join('');
}

/**
 * 「为什么做 / 交付什么 / 怎么算过」三行 —— 只做指针，不复述正文：
 *   · 动机与交付物取自路线步骤（`step.stage` / `step.outcome`），
 *   · 验收口径就是该单元的自测（L1–L5，L3 起才算「已达标」），
 *     这里只报「现在 L 几、下一级还差几题」，不抄题目。
 */
function routeBlock(model: AsideModel): string {
  const route = model.route;
  const st = model.selftest;
  const rows: string[] = [];
  if (route) {
    rows.push(
      `<p class="kv"><b>动机</b>：${escapeHtml(route.routeLabel)}（${escapeHtml(route.routeRole)}）· 第 ${
        route.index
      }/${route.total} 步（${escapeHtml(route.stage)}）</p>`,
    );
    // 两档价值放在同一行（用 · 分隔）：右栏窄，两条 <p> 会把「交付物」挤到折行以下
    rows.push(
      `<p class="kv"><b>价值</b>：求职 ${escapeHtml(route.job)} · 考研 ${escapeHtml(route.exam)}</p>`,
    );
    if (route.why) rows.push(`<p class="kv"><b>为什么</b>：${escapeHtml(route.why)}</p>`);
    rows.push(`<p class="kv"><b>交付物</b>：${escapeHtml(route.outcome)}</p>`);
  }
  if (st) {
    const left =
      st.next == null
        ? '五级全部达标（L5 上限）'
        : `下一级 L${st.next} 还差 ${st.remaining}/${st.total} 题`;
    rows.push(
      `<p class="kv"><b>验收</b>：自测 ${st.next == null ? 'L5' : `L1–L${st.next}`} 逐级达标；当前 L${st.level} · ${escapeHtml(
        left,
      )}</p>`,
    );
  }
  if (!rows.length) return '';
  const isNow = model.frontier != null && model.frontier === (model.file.code ?? '');
  return `<h4 style="margin-top:18px">动机 · 交付 · 验收</h4>
      ${isNow ? '<p class="kv nowhere">当前推荐位置：「今天该学」就是本单元。</p>' : ''}
      ${rows.join('\n')}`;
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
          ${model.derived ? '<div class="lbl derived">由自测推出</div>' : ''}
        </div>
      </div>
      ${routeBlock(model)}

      <h4 style="margin-top:20px">依赖 ◂</h4>
      ${chips(graph.prereq.get(code) ?? [], 'dep', model.prereqEmptyNote ?? '无前序（拓扑序起点）')}

      <h4 style="margin-top:14px">被用于 ▸</h4>
      ${chips(graph.usedBy.get(code) ?? [], '', '暂无反向引用')}

      ${
        // 没有检验题就**整块不渲染**：原先固定输出「检验题 · 0」+「本节暂无检验题」，
        // 右栏凭空多出一节零信息内容，还把「本节元信息」往下推（CS01.1 / QK06.1 都是 0）。
        probes.length
          ? `<h4 style="margin-top:14px">检验题 · ${probes.length}</h4>
      ${probes
        .map(
          (p) => `<div class="probe${isProbeDone(p.id) ? ' done' : ''}" data-probe="${escapeHtml(p.id)}">
                  <span class="cb"></span><span class="txt">${renderInline(p.title ?? p.id)}</span>
                </div>`,
        )
        .join('')}`
          : ''
      }

      <h4 style="margin-top:18px">本节元信息</h4>
      <p class="kv mono">${escapeHtml(file.schema ?? '—')} · ${escapeHtml(displayCode(code))}${
        file.updated ? ` · updated ${escapeHtml(file.updated)}` : ''
      }</p>
      ${
        // 溯源（笔记文件:行区间 + commit）收成一行悬停线索（DESIGN D26）：
        // json 已是唯一真源，这两项只在「要回原文核对」时才需要，不该常驻右栏。
        // `title` 是 **HTML 属性**语境 → escapeHtml（attrEscape 只防 CSS 选择器的引号/反斜杠，
        // 在 HTML 里 `\"` 不转义引号；src.file 来自数据，含引号就会跳出属性）。
        srcText || file.notebook_commit
          ? `<p class="kv mono dim trace" title="${escapeHtml(
              [srcText ? `笔记 ${srcText}` : '', file.notebook_commit ? `commit ${file.notebook_commit}` : '']
                .filter(Boolean)
                .join(' · '),
            )}">⌾ 溯源</p>`
          : ''
      }
    </div>`;

  host.querySelectorAll<HTMLElement>('[data-probe]').forEach((el) => {
    el.addEventListener('click', () => {
      const done = toggleProbe(el.dataset.probe ?? '');
      el.classList.toggle('done', done);
    });
  });
}
