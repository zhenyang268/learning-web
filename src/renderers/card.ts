import type { Entry, EntryFile } from '../types';
import { isVizFrontend, slotOf, subjectOf } from '../types';
import { escapeHtml, renderContent, renderInline } from './markdown';
import { mountViz } from '../viz';
import { bumpMastery, masteryOf } from '../modules/state';

export interface EntryGroup {
  key: string;
  label: string;
  subject: string;
  entries: Entry[];
}

const TAB_ORDER: Array<{ type: string; label: string }> = [
  { type: 'statement', label: '陈述' },
  { type: 'intuition', label: '直觉' },
  { type: 'proof', label: '证明' },
  { type: 'application', label: '应用' },
  { type: '__more', label: '更多' },
];

const MORE_TYPES = ['comparison', 'extension', 'counterexample', 'probe', 'viz'];

/** subject 分组；`general.*` 每个词条独立成卡（否则整节会糊成一张） */
export function groupEntries(file: EntryFile): EntryGroup[] {
  const groups: EntryGroup[] = [];
  const bySubject = new Map<string, Entry[]>();
  for (const e of file.entries) {
    const subject = subjectOf(e);
    if (subject === 'general') {
      groups.push({ key: e.id, label: e.title ?? e.id, subject, entries: [e] });
      continue;
    }
    const list = bySubject.get(subject) ?? [];
    list.push(e);
    bySubject.set(subject, list);
  }
  for (const [subject, entries] of bySubject) {
    const statement = entries.find((e) => e.type === 'statement');
    groups.push({
      key: `${file.code}:${subject}`,
      label: (statement?.title ?? entries[0]?.title ?? subject).replace(/\s*定理陈述$/, ''),
      subject,
      entries,
    });
  }
  return groups;
}

/** 难度：优先读词条自带 difficulty；v2 契约未强制该字段，缺失时按结构确定性推导（并在 title 标明来源） */
export function difficultyOf(group: EntryGroup): { level: 1 | 2 | 3; source: 'data' | 'derived' } {
  const raw = (group.entries[0] as unknown as { difficulty?: unknown }).difficulty;
  if (typeof raw === 'number' && raw >= 1 && raw <= 3) {
    return { level: Math.round(raw) as 1 | 2 | 3, source: 'data' };
  }
  let score = 1;
  const has = (t: string) => group.entries.some((e) => e.type === t);
  if (has('proof')) score += 0.5;
  if (group.entries.filter((e) => e.type === 'counterexample').length >= 2) score += 0.5;
  const chars = group.entries.reduce((s, e) => s + (e.content?.length ?? 0), 0);
  if (chars > 1800) score += 1;
  const level = score >= 2.5 ? 3 : score >= 1.8 ? 2 : 1;
  return { level, source: 'derived' };
}

function difficultyColor(level: number): string {
  return level >= 3 ? 'var(--red)' : level >= 2 ? 'var(--yellow)' : 'var(--green)';
}

function texLabel(entry: Entry): string {
  const t = entry.tex_ref;
  if (!t) return '';
  const file = t.file ?? '';
  if (t.line_start == null) return file;
  return t.line_end != null && t.line_end !== t.line_start
    ? `${file}:${t.line_start}–${t.line_end}`
    : `${file}:${t.line_start}`;
}

function linkChips(entry: Entry): string {
  return (entry.links ?? [])
    .map((l) => `<button class="chip" data-goto="${escapeHtml(l)}">${escapeHtml(l)}</button>`)
    .join('');
}

function entryBlock(entry: Entry): string {
  const g = entry.generated_by;
  const gen = g ? `${g.model ?? '?'}${g.date ? ` · ${g.date}` : ''}${g.reviewed ? ' · 已审' : ''}` : '';
  const tex = texLabel(entry);
  const body =
    entry.content && entry.content.trim()
      ? renderContent(entry.content)
      : `<p class="dim">待填充提示：${escapeHtml(entry.fill_hint ?? '（词条未提供 fill_hint）')}</p>`;
  return `
    <div class="entry" data-id="${escapeHtml(entry.id)}">
      <div class="emeta">
        <span class="tag">${escapeHtml(entry.type)}</span>
        ${entry.status ? `<span class="tag${entry.status === 'reviewed' || entry.status === 'published' ? ' ok' : ''}">${escapeHtml(entry.status)}</span>` : ''}
        ${gen ? `<span class="dim mono">${escapeHtml(gen)}</span>` : ''}
        ${tex ? `<span class="dim mono">${escapeHtml(tex)}</span>` : ''}
        ${linkChips(entry)}
      </div>
      ${entry.seed ? `<blockquote class="seed">${renderInline(entry.seed)}</blockquote>` : ''}
      <div class="body">${body}</div>
    </div>`;
}

function quantifierRows(group: EntryGroup): string[] {
  const seen = new Set<string>();
  const rows: string[] = [];
  const sources = group.entries.filter(
    (e) => e.type === 'statement' || slotOf(e).includes('quantifier'),
  );
  for (const e of sources.length ? sources : group.entries) {
    for (const k of e.keywords ?? []) {
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push(k);
    }
  }
  return rows;
}

export function renderCard(group: EntryGroup): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.group = group.key;

  const byType = new Map<string, Entry[]>();
  for (const e of group.entries) {
    const list = byType.get(e.type) ?? [];
    list.push(e);
    byType.set(e.type, list);
  }
  const more = MORE_TYPES.flatMap((t) => byType.get(t) ?? []);
  const tabs = TAB_ORDER.filter(({ type }) =>
    type === '__more' ? more.length > 0 : (byType.get(type)?.length ?? 0) > 0,
  );
  const counterexamples = byType.get('counterexample') ?? [];
  const vizEntries = group.entries.filter((e) => e.viz || e.type === 'viz');
  const qrows = quantifierRows(group);

  const mastery = masteryOf(group.key);
  const diff = difficultyOf(group);

  card.innerHTML = `
    <div class="thead">
      <span class="dot" style="background:${difficultyColor(diff.level)};box-shadow:0 0 8px ${difficultyColor(
        diff.level,
      )}" title="难度 ${diff.level}/3（${
        diff.source === 'data' ? '词条字段' : '由结构推导 · 词条未提供 difficulty'
      }）"></span>
      <h2>${renderInline(group.label)}${group.subject !== 'general' ? ` <span class="dim mono">${escapeHtml(group.subject)}</span>` : ''}</h2>
      <div class="mastery" data-mastery="${escapeHtml(group.key)}" title="点击 +1（0–5 循环）；数据契约无 mastery 字段，初值 0">
        L${mastery} <span class="bar"><i style="width:${(mastery / 5) * 100}%"></i></span>
      </div>
    </div>
    <div class="tabs">
      ${tabs
        .map(
          ({ label }, i) =>
            `<button data-tab="${i}" class="${i === 0 ? 'on' : ''}">${escapeHtml(label)}</button>`,
        )
        .join('')}
    </div>
    ${tabs
      .map(({ type }, i) => {
        const entries = type === '__more' ? more : byType.get(type) ?? [];
        return `<div class="pane${i === 0 ? ' on' : ''}" data-pane="${i}">${
          entries.map(entryBlock).join('') || '<p class="dim">该类型暂无词条</p>'
        }</div>`;
      })
      .join('')}
    ${
      qrows.length
        ? `<div class="qhead"><h3>限定词拆解 · ${qrows.length} 条</h3><span>默认展开 · 点行就地展开对应反例（不跳页）</span></div>
    <table class="q">
      <tr><th>限定词</th><th>去掉后的具体反例</th><th>能否放宽</th></tr>
      ${qrows
        .map((k, i) => {
          const cx = counterexamples[i];
          return `<tr class="qrow" data-cx="${cx ? escapeHtml(cx.id) : ''}">
            <td>${renderInline(k)}</td>
            <td>${
              cx
                ? `<span class="fn">${escapeHtml(cx.title ?? cx.id)}</span><span class="caret">▸</span>`
                : '<span class="dim">—（该行未挂定点反例）</span>'
            }</td>
            <td class="dim">—（词条未给判据）</td>
          </tr>`;
        })
        .join('')}
    </table>`
        : ''
    }
    <div class="vizslot"></div>`;

  // tab 切换
  const tabBar = card.querySelector('.tabs') as HTMLElement;
  const panes = [...card.querySelectorAll<HTMLElement>('.pane')];
  tabBar.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.tab);
      tabBar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
      panes.forEach((p) => p.classList.toggle('on', Number(p.dataset.pane) === idx));
    });
  });

  // 限定词行 → 就地展开对应反例
  card.querySelectorAll<HTMLTableRowElement>('tr.qrow').forEach((row) => {
    row.addEventListener('click', () => {
      const id = row.dataset.cx;
      if (!id) return;
      const entry = group.entries.find((e) => e.id === id);
      if (!entry) return;
      const existing = row.nextElementSibling as HTMLElement | null;
      if (existing?.classList.contains('detail')) {
        row.classList.remove('open');
        existing.remove();
        return;
      }
      row.classList.add('open');
      const tr = document.createElement('tr');
      tr.className = 'detail';
      tr.innerHTML = `<td colspan="3"><div class="in">${entryBlock(entry)}</div></td>`;
      row.after(tr);
    });
  });

  // 掌握度进度条（点击 +1，0–5 循环）
  const mEl = card.querySelector('[data-mastery]') as HTMLElement;
  mEl.addEventListener('click', () => {
    bumpMastery(group.key, 1);
    const next = masteryOf(group.key);
    mEl.innerHTML = `L${next} <span class="bar"><i style="width:${(next / 5) * 100}%"></i></span>`;
    document.dispatchEvent(new CustomEvent('kb:mastery'));
  });

  // viz 槽：档1 前端直渲 / 档2 占位
  const slot = card.querySelector('.vizslot') as HTMLElement;
  for (const e of vizEntries) {
    const holder = document.createElement('div');
    holder.innerHTML = `<div class="vhead" style="margin-top:16px">
        <span class="dim">${escapeHtml(e.title ?? e.id)}</span>
        ${
          e.viz && isVizFrontend(e.viz)
            ? `<span class="tag">viz · ${escapeHtml(e.viz.module)}</span>`
            : '<span class="tag">viz · planned</span>'
        }
      </div>`;
    slot.append(holder);
    if (e.viz) mountViz(slot, e.viz);
  }

  return card;
}
