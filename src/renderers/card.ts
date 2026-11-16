import type { Entry, EntryFile } from '../types';
import { isVizFrontend, slotOf, subjectOf } from '../types';
import { escapeHtml, renderContent, renderInline, type RenderCtx } from './markdown';
import { mountViz, type VizHandle } from '../viz';
import { masteryOf, setMastery } from '../modules/state';
import { attrEscape } from '../modules/attr';

export interface EntryGroup {
  key: string;
  label: string;
  subject: string;
  entries: Entry[];
}

/** 卡片渲染结果：元素 + 它挂的 viz 句柄（句柄必须由调用方在重渲染前 destroy） */
export interface RenderedCard {
  el: HTMLElement;
  viz: VizHandle[];
}

/** 全库上下文：判断跨代号引用是否落在已生成的数据里 */
export interface KbIndex {
  codes: Set<string>;
}

/**
 * 稳定阅读顺序（2026-11 重排）。
 *
 * 现场（NM07.1）：DOM 里是 comparison → counterexample → statement → intuition → probe → viz，
 * 于是读者**先读反例、后读陈述** —— 不知道陈述是什么，反例就只是噪音。
 *
 * 这里是**一条**顺序表，不是「按 type 排序再分 tab」，它只用在两处：
 *   · `groupReadingRank` —— 卡片与卡片之间谁先谁后（`groupEntries` 末尾的稳定排序）；
 *   · `readingOrder` —— 「更多」面板内并列词条的行序（`renderCard` 的 `more`）。
 * tab 归属、组内成员、数据一条都没动。
 * 未登记的类型（将来数据侧新增）一律排在 `MORE_TYPES` 之后，按原 entries 顺序 —— 不静默丢失。
 *
 * **只作用于 entry-card**：doc-card 走 `renderDocHtml`，作者的分章顺序原样保留
 * （那些小节是连续文档，机械按 type 重排会把「考法 → 题」的上下文切断）。
 */
const READ_ORDER: string[] = [
  'comparison', // 限定词：先给边界，再谈主张
  'statement', // 陈述：主张本身
  'intuition', // 直觉：为什么可信
  'proof', // 证明 / 推导
  'application', // 应用 / 扩展
  'extension',
  'example', // 例题
  'viz', // 演示
  'counterexample', // 反例：知道主张之后才有意义
  'probe', // 检验题：最后自测
];

const READ_RANK = new Map(READ_ORDER.map((t, i) => [t, i]));

/** 阅读序：登记过的按 READ_ORDER，未登记的排在最后（保原序，`a` 的次序靠数组稳定性） */
function readingOrder(a: Entry, b: Entry): number {
  const ra = READ_RANK.get(a.type) ?? READ_ORDER.length;
  const rb = READ_RANK.get(b.type) ?? READ_ORDER.length;
  return ra - rb;
}

const TAB_ORDER: Array<{ type: string; label: string }> = [
  { type: 'statement', label: '陈述' },
  { type: 'intuition', label: '直觉' },
  { type: 'proof', label: '证明' },
  { type: 'application', label: '应用' },
  { type: '__more', label: '更多' },
];

// introduction 当前只出现在 doc-card/v1（走 renderDocHtml），entry-card 线暂无；
// 列入兜底，防止将来数据侧引入该类型时词条静默丢失（不在任何 tab 就不渲染）。
//
// `example`（2026-11-16 补）同理，但它**已经不只是兜底**：`READ_ORDER` 早已把它登记在
// 「application / extension 之后、viz 之前」（例题要在主张讲完之后、演示之前读到），
// 而这张表若漏了它，`byType.get('example')` 就在 `more` 里取不到 —— 该类型词条
// 不进任何 tab、也不进 vizslot，渲染时**无声消失**（不报错、不占位）。
// 数据侧目前 75 条 example 全在 doc-card/v1（走 renderDocHtml，不受此表影响），
// entry-card 线一旦引入该类型就会撞上这个缺口，所以在此补齐。
const MORE_TYPES = [
  'comparison',
  'extension',
  'example',
  'counterexample',
  'probe',
  'viz',
  'introduction',
];

/** 「限定词拆解」= 灵魂词条，单独成块默认展开（TASKBOOK §8.4），不进 tab */
const isQuantifiers = (e: Entry): boolean => slotOf(e) === 'quantifiers';

/**
 * 卡片组的阅读序：一个组由它的**最强主张**定位。
 *
 * 现场（NM07.1）：6 条词条分成 4 张卡（general.viz / variational-integrator /
 * wrong-order / probe1）。`general.*` 是**按 id 顺序**先被 push 进数组的，于是
 * 「演示槽位」排第一、「反例」排第二、真正的陈述排第三 —— 读者先看到反例。
 *
 * 修法不是按 type 把长文重排（那会毁掉作者章节序），而是给**每张卡**算一个
 * 阅读档位 = 组内最强（rank 最小）的词条档位，再按它稳定排序：
 *   限定词 → 陈述 → 直觉 → 证明 → 应用 → 例题 → viz → 反例 → 检验题
 * 组内成员顺序与 tab 归属完全不动；只有「卡与卡之间」谁先谁后变了。
 * 同档位保持原 entries 出现顺序（Array.prototype.sort 在现代引擎里稳定）。
 */
function groupReadingRank(group: EntryGroup): number {
  const ranks = group.entries.map((e) => READ_RANK.get(e.type) ?? READ_ORDER.length);
  return ranks.length ? Math.min(...ranks) : READ_ORDER.length;
}

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
  // 稳定排序：只决定卡与卡的先后，不动组内顺序（见 groupReadingRank 的说明）
  return groups
    .map((g, i) => ({ g, i, rank: groupReadingRank(g) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map(({ g }) => g);
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

/** links → chip。目标单元**尚未生成**时标 pending（不静默跳到一个不存在的位置）。 */
function linkChips(entry: Entry, codes: Set<string>): string {
  return (entry.links ?? [])
    .map((l) =>
      codes.has(l)
        ? `<button class="chip" data-goto="${escapeHtml(l)}">${escapeHtml(l)}</button>`
        : `<button class="chip pending" data-goto="${escapeHtml(l)}" title="该单元尚未生成（json 里还没有 ${escapeHtml(l)}）">${escapeHtml(l)} ·待生成</button>`,
    )
    .join('');
}

/* ------------------------------------------------------- 词条引用（跨链接） */

/**
 * 数据里对别的词条的文字引用没有专用字段，写成正文里的文字：
 * 「（见 mct.nonneg）」（同文件，subject.slot）｜「（general.bump）」｜「（A1.4）」（跨代号）｜
 * 也可能写全 id「A1.3:mct.nonneg」。这里把它们变成可点元素：
 *   · 同文件词条 → data-ref，点击在卡内定位 / 在限定词表里就地展开
 *   · 跨代号     → data-goto，交给全局点击委托跳转
 *
 * **只有解析得到真实词条的才包**，且三种形式各自的失败处理不同：
 *   · 全 id 形式：本文件没有 → 退化为跳转到它所属代号（文件存在的话）
 *   · 裸 subject.slot：本文件没有 → **不链接**（否则「a.e.」会被解析成当前文件的 a/e，
 *     再退化成指向自己的空跳转）
 *   · 裸代号：等于当前代号 → 不链接（已经在这里了）
 */
/**
 * 词条引用 token。三段 alternation：
 *   1. 全 id `A1.3:mct.nonneg`（前缀可多字母：de1.10:xxx 也算）
 *   2. 裸 `subject.slot`（小写开头 + 点 + 小写开头；de1.10 不会误中——`10` 非字母开头）
 *   3. 裸代号 `A1.3` / `de1.10` / `lie3.17`（**前缀必须多字母**：原来写 `[A-Za-z]\d+`
 *      单字母，会把 `de1.10` 截成 `e1.10`、`lie3.17` 截成 `e3.17`——查无此代号，
 *      跨章引用永远不可点；实测 B1/H5/H8/P3 等单元的 content 里大量存在）
 * 匹配后仍有 isEntry/isCode 守门，误配的普通词（如 x2）不会成链。
 */
const REF_TOKEN =
  /([A-Za-z]+\d+(?:\.\d+)?):([A-Za-z][A-Za-z0-9-]*)|([a-z][A-Za-z0-9-]*)\.([a-z][A-Za-z0-9-]*)|([A-Za-z]+\d+(?:\.\d+)?)/g;

export interface RefTools {
  ctx: RenderCtx;
  /** 在一段**原始文字**（未转义）里找出可解析的词条引用 */
  refsIn(text: string): Array<{ id: string; inFile: boolean }>;
}

function refChip(id: string, label: string): string {
  return `<button class="ref" data-ref="${escapeHtml(id)}" title="就地展开词条 ${escapeHtml(id)}">${label}</button>`;
}

function gotoChip(code: string, label: string): string {
  return `<button class="ref cross" data-goto="${escapeHtml(code)}" title="跳转到 ${escapeHtml(code)}">${label}</button>`;
}

function makeRefTools(file: EntryFile, index: KbIndex): RefTools {
  const code = file.code ?? '';
  const byId = new Map(file.entries.map((e) => [e.id, e]));
  const isEntry = (id: string) => byId.has(id);
  const isCode = (c: string) => index.codes.has(c);

  const refsIn = (text: string): Array<{ id: string; inFile: boolean }> => {
    const out: Array<{ id: string; inFile: boolean }> = [];
    for (const m of text.matchAll(REF_TOKEN)) {
      const [, p1, p2, p3, p4, p5] = m;
      if (p1 && p2) {
        const id = `${p1}:${p2}`;
        if (isEntry(id)) out.push({ id, inFile: true });
        else if (p1 !== code && isCode(p1)) out.push({ id, inFile: false });
      } else if (p3 && p4) {
        const id = `${code}:${p3}.${p4}`;
        if (isEntry(id)) out.push({ id, inFile: true });
      } else if (p5 && p5 !== code && isCode(p5)) {
        out.push({ id: p5, inFile: false });
      }
    }
    return out;
  };

  const text = (escaped: string): string =>
    escaped.replace(REF_TOKEN, (whole, p1, p2, p3, p4, p5) => {
      if (p1 && p2) {
        const id = `${p1}:${p2}`;
        if (isEntry(id)) return refChip(id, whole);
        if (p1 !== code && isCode(p1)) return gotoChip(p1, whole);
        return whole;
      }
      if (p3 && p4) {
        const id = `${code}:${p3}.${p4}`;
        return isEntry(id) ? refChip(id, whole) : whole;
      }
      if (p5) {
        return p5 !== code && isCode(p5) ? gotoChip(p5, whole) : whole;
      }
      return whole;
    });

  return { ctx: { text, tableClass: 'q' }, refsIn };
}

/* ------------------------------------------------------------------ 卡片 */

function entryBlock(entry: Entry, ctx: RenderCtx, codes: Set<string>): string {
  const g = entry.generated_by;
  const gen = g ? `${g.model ?? '?'}${g.date ? ` · ${g.date}` : ''}${g.reviewed ? ' · 已审' : ''}` : '';
  const tex = texLabel(entry);
  const body =
    entry.content && entry.content.trim()
      ? renderContent(entry.content, ctx)
      : `<p class="dim">待填充提示：${escapeHtml(entry.fill_hint ?? '（词条未提供 fill_hint）')}</p>`;
  return `
    <div class="entry" data-id="${escapeHtml(entry.id)}">
      <div class="emeta">
        <span class="tag">${escapeHtml(entry.type)}</span>
        ${entry.status ? `<span class="tag${entry.status === 'reviewed' || entry.status === 'published' ? ' ok' : ''}">${escapeHtml(entry.status)}</span>` : ''}
        ${gen ? `<span class="dim mono">${escapeHtml(gen)}</span>` : ''}
        ${
          // tex_ref 降级为悬停线索（DESIGN D26）：本站已与 .tex 解耦，
          // 「A_analysis.tex:147–147」不该占每条词条的会标位置。
          // 这里是 **HTML 属性语境**，必须用 escapeHtml：attrEscape 只防 CSS 选择器里的
          // 引号/反斜杠，会把 `"` 转成 `\"` —— 在 HTML 属性里 `\` 不转义，引号照旧收尾，
          // 后面跟 ` onmouseover=...` 就能跳出属性（tex_ref.file 是数据字段，不可信）。
          tex ? `<span class="dim mono trace" title="${escapeHtml(tex)}">⌾</span>` : ''
        }
        ${linkChips(entry, codes)}
      </div>
      ${entry.seed ? `<blockquote class="seed">${renderInline(entry.seed, ctx)}</blockquote>` : ''}
      <div class="body">${body}</div>
    </div>`;
}

/** 「能否放宽」列的语气 → mockup 的 .yes/.no 配色（纯前缀判定，不改写数据文字） */
function verdictClass(text: string): string {
  const t = text.trim();
  if (/^(不可|不能|必须|禁止|无|没有)/.test(t)) return 'no';
  if (/^(可放宽|可|允许|不要求|放宽)/.test(t)) return 'yes';
  return '';
}

function renderQuantifiers(group: EntryGroup, ctx: RenderCtx): string {
  const q = group.entries.find(isQuantifiers);
  if (!q || !q.content?.trim()) return '';
  return `
    <div class="qhead">
      <h3>${renderInline(q.title ?? '限定词拆解', ctx)}</h3>
      <span>默认展开 · 点反例就地展开对应词条，不跳页</span>
    </div>
    <div class="qbody" data-q="${escapeHtml(q.id)}">${renderContent(q.content, ctx)}</div>`;
}

/** 面板填充器（按卡）：switchTab 首次进入某个 pane 时用它补内容 */
const paneFillers = new WeakMap<HTMLElement, (idx: number) => void>();
/** 词条 id → 所在 pane 序号（按卡）：openRef 要先把目标面板切出来再定位 */
const entryPanes = new WeakMap<HTMLElement, Map<string, number>>();

/**
 * Tab 懒渲染（2026-10-30）：
 * 首屏只拼 `.pane.on` 的内容，其余面板留空占位（`data-lazy="1"`），首次切过去时才渲染。
 * 111KB 单元有 7 个 tab、几十条词条，原本全量拼进 DOM 并同步跑 KaTeX —— 其中大半根本不可见。
 * 代价：切 tab 的那一下有一次极短同步填充（单 pane 通常 3–8 条）。数据没变，只是推迟排版。
 */
export function renderCard(
  file: EntryFile,
  group: EntryGroup,
  index: KbIndex,
  /** 难度由调用方算一次传进来（apply 里已经整组算过，避免每卡重复 difficultyOf） */
  diff?: { level: 1 | 2 | 3; source: 'data' | 'derived' },
  /**
   * 掌握度显示口径（2026-11-15 独立复核修复）：
   *
   *   · `derivedMastery: true` —— 掌握度**只读**（由自测派生），点击不写 mastery。
   *     纯 entry-card 词条保持原行为（传 false / 不传）。
   *   · `derivedLevel: 0–5` —— 派生徽标**显示用的级别**（自测级别）。
   *     原先这里仍调 `masteryOf(group.key)` 读**旧手动值**：用户以前点过徽标留下的
   *     `mastery[cardKey]` 会让卡片徽标显示 L3、而侧栏/右栏按自测显示 L0 —— 同一单元两个数。
   *     现在由 app 传派生级别进来（与 `masteryByCode` 同一口径），正文与侧栏一致。
   *   · 未载入正文的 `kaoyan-kp` / `project` 单元也传 `derivedMastery: true` 且**不传**
   *     `derivedLevel`：自测未提供证据 → 显示 L0，不回落旧手动值（与现有设计一致）。
   */
  opts?: {
    derivedMastery?: boolean;
    /** 派生掌握度级别（0–5）；只在 `derivedMastery` 为真时有意义 */
    derivedLevel?: number;
    /**
     * 派生徽标就地刷新时「按哪个单元的自测级别算」（默认 `file.code`）。
     * 单独成卡的 `general.*` 词条虽然卡 key 是词条 id，级别仍属于整个单元。
     */
    unitCode?: string;
  },
): RenderedCard {
  const derived = opts?.derivedMastery === true;
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.group = group.key;

  const tools = makeRefTools(file, index);
  const ctx = tools.ctx;

  const byType = new Map<string, Entry[]>();
  for (const e of group.entries) {
    if (isQuantifiers(e)) continue; // 单独成块，见 renderQuantifiers
    const list = byType.get(e.type) ?? [];
    list.push(e);
    byType.set(e.type, list);
  }
  /**
   * 「更多」面板里的词条按**阅读序**排，而不是按 MORE_TYPES 的声明序。
   *
   * 现场（NM07.1）：MORE_TYPES 把 counterexample 写在 statement 之前，于是 6 条词条
   * 分成 4 张卡时，读者先看到「反例：先变分再离散」，再看到陈述 —— 顺序是反的。
   * 这里只改**读序**：数据一条没动，tab 归属也没变（comparison/counterexample/probe/viz
   * 仍在「更多」里），只是同一面板内的行序按 READ_ORDER 走。
   */
  const more = MORE_TYPES.flatMap((t) => byType.get(t) ?? []).sort(readingOrder);
  const tabs = TAB_ORDER.filter(({ type }) =>
    type === '__more' ? more.length > 0 : (byType.get(type)?.length ?? 0) > 0,
  );
  const vizEntries = group.entries.filter((e) => e.viz || e.type === 'viz');

  // 派生口径下**不读** `masteryOf(group.key)`：那是旧手动值，会让正文与侧栏/右栏
  // 显示两个不同的数（独立复核发现）。app 传进来的 `derivedLevel` 才是自测级别；
  // 未载入正文的自测型单元不传它 → 0（自测未提供证据）。
  const mastery = derived ? clampLevel(opts?.derivedLevel ?? 0) : masteryOf(group.key);
  const diffInfo = diff ?? difficultyOf(group);

  card.innerHTML = `
    <div class="thead">
      <span class="dot" style="background:${difficultyColor(diffInfo.level)};box-shadow:0 0 8px ${difficultyColor(
        diffInfo.level,
      )}" title="难度 ${diffInfo.level}/3（${
        diffInfo.source === 'data' ? '词条字段' : '由结构推导 · 词条未提供 difficulty'
      }）"></span>
      <h2>${renderInline(group.label, ctx)}${group.subject !== 'general' ? ` <span class="dim mono">${escapeHtml(group.subject)}</span>` : ''}</h2>
      <div class="mastery${derived ? ' derived' : ''}" data-mastery="${escapeHtml(group.key)}"
        title="${
          derived
            ? '掌握度由自测推出（L1–L5 逐级达标）；手动 +1 已停用，去自测区作答'
            : '点击 +1（0–5 循环）；数据契约无 mastery 字段，初值 0'
        }">
        ${masteryHtml(mastery)}
      </div>
    </div>
    ${/* 限定词块**先于**陈述正文：阅读顺序「限定词 → 陈述 → 直觉 → …」的第一段。
         原先它排在 tabs/pane 之后，读者读完备主张才看到「五个限定词怎么翻车」，
         而限定词表的第一列恰恰是「去掉它会怎样」，属于前置条件。
         它仍在同一张卡内（不拆卡），Anchors/点击行为不变。*/ ''}
    ${renderQuantifiers(group, ctx)}
    ${
      tabs.length
        ? `<div class="tabs">
      ${tabs
        .map(
          ({ label }, i) =>
            `<button data-tab="${i}" class="${i === 0 ? 'on' : ''}">${escapeHtml(label)}</button>`,
        )
        .join('')}
    </div>
    ${tabs
      .map(
        ({ type }, i) =>
          `<div class="pane${i === 0 ? ' on' : ''}" data-pane="${i}"${
            i === 0 ? '' : ' data-lazy="1"'
          }>${i === 0 ? paneBody(type === '__more' ? more : byType.get(type) ?? []) : ''}</div>`,
      )
      .join('')}`
        : ''
    }
    <div class="vizslot"></div>`;

  function paneBody(entries: Entry[]): string {
    return (
      entries.map((e) => entryBlock(e, ctx, index.codes)).join('') ||
      '<p class="dim">该类型暂无词条</p>'
    );
  }

  /** 首次切到某个 pane 时补渲染；已填过的直接跳过（`data-lazy` 被删掉即是标记） */
  const filler = (idx: number): void => {
    const pane = card.querySelector<HTMLElement>(`.pane[data-pane="${idx}"]`);
    if (!pane || pane.dataset.lazy !== '1') return;
    const type = tabs[idx]?.type;
    pane.innerHTML = paneBody(type === '__more' ? more : byType.get(type ?? '') ?? []);
    delete pane.dataset.lazy;
  };
  paneFillers.set(card, filler);

  const paneOf = new Map<string, number>();
  tabs.forEach(({ type }, i) => {
    for (const e of type === '__more' ? more : byType.get(type) ?? []) paneOf.set(e.id, i);
  });
  entryPanes.set(card, paneOf);

  enhanceQuantTable(card, group.entries.find(isQuantifiers), tools);
  wireTabs(card);
  wireRefs(card, file, ctx, index.codes);
  wireMastery(card, group, derived);
  // 记录「这张卡属于哪个单元」：自测作答后 `patchCardMastery` 靠它重算派生徽标
  if (derived) derivedCards.set(card, opts?.unitCode ?? file.code ?? '');
  const viz = mountVizSlots(card, vizEntries);

  return { el: card, viz };
}

/* -------------------------------------------------------- 限定词表行增强 */

/**
 * 真数据是一张 4 列 Markdown 表（限定词｜去掉后的具体反例｜结论如何失效｜能否放宽）。
 * 渲染之后按行增强：能给到同文件反例词条的行 → 变可点行（.qrow + data-cx + caret），
 * 末列按语气上 .yes/.no 配色。
 *
 * 行的锚点有两个来源，优先级从高到低：
 *   1. 单元格里内联写的词条引用（`（见 mct.nonneg）`）—— 生成质量高的单元这么写；
 *   2. 回查 quantifiers 词条自己的 `keywords`：那里用 ①②③ 标号逐条记着「去掉它会怎样」，
 *      多数单元把反例写在 keywords 里而不是表格单元格里。按**标号**匹配（不是按行序），
 *      标号对不上就不给锚点，宁缺勿错。
 */
const MARKERS = '①②③④⑤⑥⑦⑧⑨⑩'.split('');

function enhanceQuantTable(card: HTMLElement, quant: Entry | undefined, tools: RefTools): void {
  const table = card.querySelector('.qbody table');
  if (!table) return;
  table.classList.add('q');
  const keywords = quant?.keywords ?? [];
  table.querySelectorAll('tbody tr').forEach((tr, i) => {
    const cells = [...tr.querySelectorAll('td')];
    const inline = tr.querySelector<HTMLElement>('[data-ref]')?.dataset.ref;

    let id = inline ?? null;
    if (!id && cells.length) {
      const marker = (textOfRow(cells[0]) + textOfRow(cells[1] ?? cells[0])).match(
        /[①②③④⑤⑥⑦⑧⑨⑩]/,
      )?.[0];
      const key = marker ?? MARKERS[i];
      if (key) {
        const hit = keywords.find((k) => k.includes(key));
        const ref = hit ? tools.refsIn(hit).find((r) => r.inFile) : undefined;
        if (ref) id = ref.id;
      }
    }

    if (id) {
      tr.classList.add('qrow');
      tr.setAttribute('data-cx', id);
      tr.setAttribute('role', 'button');
      tr.setAttribute('tabindex', '0');
      tr.setAttribute('aria-expanded', 'false');
      (cells[1] ?? cells[0])?.insertAdjacentHTML(
        'beforeend',
        '<span class="caret" aria-hidden="true">▸</span>',
      );
    }
    const last = cells[cells.length - 1];
    if (last) {
      const cls = verdictClass(textOfRow(last));
      if (cls) last.classList.add(cls);
    }
  });
}

function textOfRow(el: HTMLElement): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ');
}

/* --------------------------------------------------------------- 交互 */

function switchTab(card: HTMLElement, idx: number): void {
  const tabBar = card.querySelector('.tabs');
  if (!tabBar) return;
  // 懒面板：先补内容再切（顺序反了会看到一闪而过的空白）
  paneFillers.get(card)?.(idx);
  tabBar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.tab) === idx));
  card.querySelectorAll<HTMLElement>('.pane').forEach((p) =>
    p.classList.toggle('on', Number(p.dataset.pane) === idx),
  );
}

function wireTabs(card: HTMLElement): void {
  card.querySelector('.tabs')?.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(card, Number(btn.dataset.tab)));
  });
}

/** 同文件词条引用 → 卡内定位；若引用出现在限定词表某行，则在该行下**就地展开**词条 */
function wireRefs(card: HTMLElement, file: EntryFile, ctx: RenderCtx, codes: Set<string>): void {
  const activate = (target: HTMLElement) => {
    const node = target.closest<HTMLElement>('[data-ref]');
    if (node?.dataset.ref) {
      openRef(card, file, ctx, codes, node);
      return;
    }
    const row = target.closest<HTMLTableRowElement>('tr.qrow');
    if (row?.dataset.cx) expandRow(file, ctx, codes, row);
  };
  card.addEventListener('click', (ev) => activate(ev.target as HTMLElement));
  card.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const row = (ev.target as HTMLElement).closest<HTMLTableRowElement>('tr.qrow');
    if (!row) return;
    ev.preventDefault();
    activate(row);
  });
}

/** 展开体（反例词条）用与卡片同一套 ctx 渲染，它内部的引用同样可点 */
function entryHtml(entry: Entry, ctx: RenderCtx, codes: Set<string>): string {
  return `
    <div class="entry" data-id="${escapeHtml(entry.id)}">
      <div class="emeta">
        <span class="tag">${escapeHtml(entry.type)}</span>
        ${entry.status ? `<span class="tag">${escapeHtml(entry.status)}</span>` : ''}
        ${
          entry.viz && isVizFrontend(entry.viz)
            ? `<span class="tag">viz · ${escapeHtml(entry.viz.module)}</span>`
            : ''
        }
        ${linkChips(entry, codes)}
      </div>
      <div class="body">${
        entry.content?.trim()
          ? renderContent(entry.content, ctx)
          : `<p class="dim">待填充提示：${escapeHtml(entry.fill_hint ?? '（无）')}</p>`
      }</div>
    </div>`;
}

function expandRow(
  file: EntryFile,
  ctx: RenderCtx,
  codes: Set<string>,
  row: HTMLTableRowElement,
): void {
  const next = row.nextElementSibling as HTMLElement | null;
  if (next?.classList.contains('detail')) {
    row.classList.remove('open');
    row.setAttribute('aria-expanded', 'false');
    next.remove();
    return;
  }
  // 按**整个文件**查词条，不限于本卡分组：限定词表引用的反例常常是 `general.*`，
  // 而 `general.*` 每个词条自成一张卡，不在同一个 group 里。
  const entry = file.entries.find((e) => e.id === row.dataset.cx);
  if (!entry) return;
  row.classList.add('open');
  row.setAttribute('aria-expanded', 'true');
  const tr = document.createElement('tr');
  tr.className = 'detail';
  const cols = row.querySelectorAll('td').length || 4;
  tr.innerHTML = `<td colspan="${cols}"><div class="in">${entryHtml(entry, ctx, codes)}</div></td>`;
  row.after(tr);
}

/** flash 高亮的定时器按元素记账：同一元素连点时清掉上一个，避免裸 setTimeout 叠在脱离文档的节点上 */
const flashTimers = new WeakMap<HTMLElement, number>();

function flashEntry(el: HTMLElement): void {
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash');
  const prev = flashTimers.get(el);
  if (prev !== undefined) window.clearTimeout(prev);
  flashTimers.set(
    el,
    window.setTimeout(() => {
      el.classList.remove('flash');
      flashTimers.delete(el);
    }, 1200),
  );
}

function openRef(
  card: HTMLElement,
  file: EntryFile,
  ctx: RenderCtx,
  codes: Set<string>,
  node: HTMLElement,
): void {
  const id = node.dataset.ref ?? '';
  const row = node.closest<HTMLTableRowElement>('tr.qrow');
  if (row) {
    expandRow(file, ctx, codes, row);
    return;
  }
  // 目标可能躺在别的 tab 里，而且那个面板可能还没渲染（懒加载）：
  // 先按「词条 → pane 序号」把它切出来，再定位。
  const paneIdx = entryPanes.get(card)?.get(id);
  if (paneIdx != null) switchTab(card, paneIdx);
  const target = card.querySelector<HTMLElement>(`.entry[data-id="${attrEscape(id)}"]`);
  if (target) {
    flashEntry(target);
    return;
  }
  // 目标不在本卡（如 general.* 自成卡）→ 在阅读区里全局找
  const global = document.querySelector<HTMLElement>(`.entry[data-id="${attrEscape(id)}"]`);
  if (global) {
    flashEntry(global);
    return;
  }
  // 目标没渲染出来 → 退化到全局跳转
  const code = id.split(':')[0];
  if (code && code !== (file.code ?? '')) location.hash = `#/${code}`;
}

/**
 * 当前卡使用**派生**掌握度（自测推出）：就地刷新徽标时要按自测算，不能读旧手动值。
 *
 * 值是「这张卡代表哪个**单元**」（比 group.key 更稳：`general.*` 卡的 key 是词条 id，
 * 但派生级别来自单元自测，按单元代号算才对）。
 */
const derivedCards = new WeakMap<HTMLElement, string>();

/**
 * 自测作答后，就地重写本页所有派生卡片的掌握度徽标（不重建卡片、不重跑 KaTeX）。
 *
 * 为什么必须有：用户点「能答」→ 自测级别变了，但正文卡片徽标原先只在渲染时算一次，
 * 于是「侧栏 L2、正文还写着 L1」。`levelOf` 由调用方给（与 `masteryByCode` 同一口径），
 * 外面那层 @param 说明保持与 app 的约定一致。
 */
export function patchCardMastery(host: ParentNode, levelOf: (code: string) => number): void {
  host.querySelectorAll<HTMLElement>('.card').forEach((card) => {
    const unit = derivedCards.get(card);
    if (unit === undefined) return;
    const el = card.querySelector<HTMLElement>('.mastery[data-mastery]');
    if (!el) return;
    el.innerHTML = masteryHtml(clampLevel(levelOf(unit)));
  });
}

/** 派生级别一律钳到 0–5 整数：越界值（NaN / 2.5 / 9）不该写进徽标 */
function clampLevel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(5, Math.round(value)));
}

/** 徽标与环的 HTML：渲染与就地更新共用一份，避免两处格式漂移 */
function masteryHtml(level: number): string {
  return `L${level} <span class="bar"><i style="width:${(level / 5) * 100}%"></i></span>`;
}

function wireMastery(card: HTMLElement, group: EntryGroup, readOnly = false): void {
  const mEl = card.querySelector('[data-mastery]') as HTMLElement;
  if (readOnly) {
    // 自测型单元（数一 KP / 工程线项目）：**自测是掌握度的唯一写入口**。
    // 这里不发任何 mastery 写事件，也不 dispatch kb:mastery —— 否则点一下徽标
    // 就能绕过作答把 frontier 抬上去，与自测记录互相打架。
    //
    // 注意**不要**删 `data-mastery`：`patchCardMastery` 靠它定位徽标元素做就地刷新
    // （原先删掉之后，点「能答」正文徽标就再也刷不动了）。只读性由「不挂 click」
    // 保证，与属性无关；`data-derived="1"` 让外部断言与样式能区分派生徽标。
    mEl.classList.add('derived');
    mEl.dataset.derived = '1';
    mEl.title = '本项目/考点的掌握度由下方自测推出（L1–L5 逐级达标）；手动 +1 已停用，去自测区作答';
    return;
  }
  mEl.addEventListener('click', () => {
    // 0–5 循环（title 承诺的语义）：+1 后对 6 取模，L5 再点回 L0。
    // 不走 bumpMastery（它内部钳位在 5，会把用户永久卡死在最高档）。
    const next = (masteryOf(group.key) + 1) % 6;
    setMastery(group.key, next);
    mEl.innerHTML = masteryHtml(next);
    document.dispatchEvent(new CustomEvent('kb:mastery'));
  });
}

/** 挂载本卡的全部 viz，**返回句柄**交给上层在重渲染前 destroy */
function mountVizSlots(card: HTMLElement, vizEntries: Entry[]): VizHandle[] {
  const slot = card.querySelector('.vizslot') as HTMLElement | null;
  if (!slot) return [];
  const handles: VizHandle[] = [];
  for (const e of vizEntries) {
    // 每个 viz 独占一个容器：mountViz 内部会用 innerHTML 覆写宿主，
    // 若把整个 .vizslot 交给它，同一张卡里的第二个 viz 会把第一个冲掉。
    const holder = document.createElement('div');
    holder.className = 'vizitem';
    holder.innerHTML = `<div class="vhead" style="margin-top:16px">
        <span class="dim">${escapeHtml(e.title ?? e.id)}</span>
        ${
          e.viz && isVizFrontend(e.viz)
            ? `<span class="tag">viz · ${escapeHtml(e.viz.module)}</span>`
            : '<span class="tag">viz · planned</span>'
        }
      </div>`;
    slot.append(holder);
    if (!e.viz) continue;
    const h = mountViz(holder, e.viz);
    if (h) handles.push(h);
  }
  return handles;
}
