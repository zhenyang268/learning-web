import type { UnitMeta } from '../types';
import { escapeHtml } from '../renderers/markdown';
import { codeKey } from '../modules/graph';
import { displayCode } from '../modules/codes';
import { attrEscape } from '../modules/attr';
import {
  chapterOf,
  domainLabel,
  domainOf,
  domainRank,
  GROUPS,
  groupLabel,
  groupOf,
  groupRank,
  LINES,
  lineOfChapter,
  sectionKeyOf,
  type ContentLine,
  type GroupId,
} from '../modules/taxonomy';

export interface SidebarModel {
  units: UnitMeta[];
  current: string;
  masteryOf: (code: string) => number;
  /** 搜索词（空则不筛） */
  query?: string;
  /**
   * 是否显示进度（单元 `L0`、章/域进度条、done 高亮）。
   * 缺省 true；工程线显式 false —— 进度不在这套静态站里控制。
   */
  showProgress?: boolean;
  /**
   * 章序（`subjects.ts` 的 `Subject.chapterOrder`，代号前缀 → 名次）。
   *
   * 为什么是 `(chap) => number` 而不是 `subject`：sidebar 是纯渲染层，
   * 只认「这个章排第几」，不认识学科 id。英语一那套
   * 导览 → 阅读 → 大作文 → 翻译 → 小作文 → 新题型 → 完形 → 词汇 的次序
   * 由学科配置给出；其余四站不传，`Infinity` 让排序完全回落到原来的
   * 「组 → 域 → 线 → 章号」。
   */
  chapterRank?: (chap: string) => number;
  /**
   * 同一前缀下**章内**名次（`WR01` 与 `WR02` 之间谁在前）。
   * 缺省按章号；英语一的 `WR` 要让 `WR02`（大作文）排在 `WR01`（小作文）前面，
   * 由 `Subject.chapterOrder` 的细粒度形式给出 —— 见 `app.ts` 的 `chapterRankOf`。
   */
  unitRank?: (code: string) => number;
}

/**
 * 纯索引 / 分组单元的判定 —— **侧栏「索引与导航」区的唯一入口**。
 *
 * 这些单元不是可学项目：`SO00` / `EG00` / `GX00` / `AL00` / `CP00` / `LG00` 是各域的
 * 分组大纲（`project-group`），`PX01` 是面试索引页（`project-index`），408 的 `EX00`
 * 是缺图清单（`exam-missing`）。它们各自把**别的单元**串起来，本身没有可交付物，
 * 也不参与「今天该学」的推荐（见 `isLearnableUnit`）。
 *
 * 为什么以前它们和学习项目混排：侧栏只按「组 → 线 → 章」铺开，`SO00` 与 `SO01`
 * 在同一个域下按章号相邻，读者分不清哪一行是「一份要动手做的大纲」、哪一行是
 * 「一个索引页」。归到末尾并弱化后，学习主线不再被导航页打断；**链接一个不删**。
 */
export function isIndexUnit(u: UnitMeta): boolean {
  const kind = u.kind ?? '';
  if (kind === 'project-group' || kind === 'project-index' || kind === 'exam-missing') return true;
  return INDEX_ONLY_CHAPTERS.has(u.code.split('.')[0] ?? '');
}

/**
 * **整章都是索引**的章（数据侧没有单元级 `kind`，只能按章识别）。
 *
 * `SY01` 是应试分层表（`tiers`）：一张查表，不是要顺着学的一节。
 *
 * `MP*`（路线图 / 承重墙清单 / 教材对照）本来就在 `meta` 组，那里的组名就叫「索引」；
 * 但它们和学习主线**并排在同一层**，读起来仍像「下一批要学的东西」。
 * 2026-11 起 `meta` 组的章也进末尾索引区：这些内容的作用是「查」而不是「学」，
 * 归到一处之后，`索引与导航` 就是全站唯一的导航/查表入口，主线不再被它们分走注意力。
 * **链接与数据一个不动**，只是位置与视觉权重变了。
 */
const INDEX_ONLY_CHAPTERS = new Set(['SY01']);

/** 侧栏「索引与导航」区的组 id 哨兵（不与 taxonomy 的 GroupId 冲突） */
const INDEX_SECTION = '__index';

/**
 * 「这一章该不该进末尾索引区」的判据。两条并列，任一成立即可：
 *
 *   1. **章里所有单元都是索引单元**（`isIndexUnit`：`project-group` / `project-index` /
 *      `exam-missing` / 纯索引章）。用「全部」而不是「有任意一个」：`NL01` 里既有
 *      `library-section` 小节页也有正常知识点，`SO01` 每一章都是真项目 ——
 *      只要还有一个可学单元，这一章就属于学习主线。
 *   2. **章属于 `meta` 组**（`MP*`：路线图、承重墙清单、教材对照）。这一组的组名
 *      本来就叫「索引」，内容是查表而不是学习序列；不并进来就会在末尾出现
 *      「索引」与「索引与导航」两个并排的索引组，读者要在两处找同一类东西。
 *
 * 判定按**整章**算（不是逐单元挪），因为「章 → 单元」是侧栏的懒渲染单位：
 * 把同一章的单元拆到两个区会让懒渲染的 `data-chap` 撞车。
 *
 * 教学线顺序不受影响：这里只决定「这一章放在哪个区」，不重排任何教学序列。
 */
function indexChaptersOf(byChapter: Map<string, UnitMeta[]>): Set<string> {
  const out = new Set<string>();
  for (const [chap, list] of byChapter) {
    if (list.length && list.every((u) => isIndexUnit(u))) out.add(chap);
    else if (groupOf(domainOf(chap) || 'ZZ') === 'meta') out.add(chap);
  }
  return out;
}

/**
 * 索引区的**内部**顺序：先接回原来的组 → 域顺序，域内再按
 * **线在 `LINES` 里的次序 → 线内教学序 → 章号**。
 *
 * 为什么不是纯字典序：`AL00`（算法分组大纲）属于算法、`SO00` 属于操作系统项目 ——
 * 读者找它时想的是「算法那条线的索引」，不是「A 开头的第 0 章」。
 *
 * 为什么线内下标之前还要比一次「线序」：`MP01` 属于 `mp-road`、`MP11` 属于
 * `mp-index`，两条线里它们都是第 0 个 —— 只比线内下标会让 MP11 与 MP01 平手，
 * 再回落到章号就排成 `MP01, MP11, MP02…`（实测）。先比线序才是读者预期：
 * 路线图那一串走完，才是承重墙与索引。
 *
 * 不在任何线上的章（`EX00` / `SY01`）没有教学序列，回落到章号。
 */
function indexChapsInOrder(indexChapters: Set<string>): string[] {
  /** [线序, 线内下标]；不在线上给 [∞, ∞] */
  const keyOf = (chap: string): [number, number] => {
    const line = lineOfChapter(chap);
    if (!line) return [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
    const li = LINES.findIndex((l) => l.id === line.id);
    const ci = line.chapters.indexOf(chap);
    return [li < 0 ? Number.MAX_SAFE_INTEGER : li, ci < 0 ? Number.MAX_SAFE_INTEGER : ci];
  };
  return [...indexChapters].sort((a, b) => {
    const ga = groupRank(groupOf(domainOf(a) || 'ZZ'));
    const gb = groupRank(groupOf(domainOf(b) || 'ZZ'));
    if (ga !== gb) return ga - gb;
    const da = domainRank(domainOf(a) || 'ZZ');
    const db = domainRank(domainOf(b) || 'ZZ');
    if (da !== db) return da - db;
    const [la, ca] = keyOf(a);
    const [lb, cb] = keyOf(b);
    if (la !== lb) return la - lb;
    if (ca !== cb) return ca - cb;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/**
 * 三层目录：**域 → 章 → 单元**（2026-10-30）。
 *
 * 为什么改：旧版把 132 章 / 318 单元一次性平铺，目录长到无法导航，
 * 而且每个单元一行 DOM（318 行）+ 每次重建都强制 reflow —— 内存与主线程都被吃掉。
 *
 * 现在：
 *   - 层级是**从代号本身推出来的**（`AN03.2` → 域 AN / 章 AN03 / 单元 .2），不靠附加字段；
 *   - 域永远展开（只有 9 个），章是 `<details>`；
 *   - **单元节点懒渲染**：章第一次展开时才插 DOM，默认只插当前单元所在的那一章 ——
 *     首屏侧栏 DOM 从 318 行降到「一章的行数」（通常 1–5 行）。
 *
 * 搜索时退回**平铺列表**：跨域找单元时层级反而是障碍。
 */
let lastQuery = '';

/** 每个宿主的当前模型（懒渲染要在 toggle 回调里取） */
const models = new WeakMap<HTMLElement, { model: SidebarModel; byChapter: Map<string, UnitMeta[]> }>();

const sortUnits = (list: UnitMeta[], model?: SidebarModel): UnitMeta[] =>
  list.slice().sort((a, b) => {
    // 章序优先：英语一的「词汇」必须整章排在题型章之后，搜索平铺时同样成立
    const ra = model?.chapterRank?.(chapterOf(a.code)) ?? Number.POSITIVE_INFINITY;
    const rb = model?.chapterRank?.(chapterOf(b.code)) ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra < rb ? -1 : 1;
    const ka = codeKey(a.code);
    const kb = codeKey(b.code);
    return ka[0] === kb[0] ? ka[1] - kb[1] || ka[2] - kb[2] : ka[0] < kb[0] ? -1 : 1;
  });

const progressOfList = (units: UnitMeta[], masteryOf: (c: string) => number): number =>
  units.length ? units.reduce((s, u) => s + masteryOf(u.code), 0) / (units.length * 5) : 0;

function nodeHtml(
  u: UnitMeta,
  current: string,
  masteryOf: (c: string) => number,
  showProgress = true,
): string {
  const m = masteryOf(u.code);
  const done = showProgress && m >= 3 ? ' done' : '';
  return `<div class="node${u.code === current ? ' on' : ''}${done}"
    data-goto="${escapeHtml(u.code)}" role="button" tabindex="0" title="${escapeHtml(u.title)}">
    <span class="code">${escapeHtml(displayCode(u.code))}</span>
    <span class="ttl">${escapeHtml(u.title)}</span>
    ${showProgress ? `<span class="m">L${m}</span>` : ''}
  </div>`;
}

/** 章标题：代号 + 该章第一个单元的标题（章本身没有 title 字段） */
function chapterHint(units: UnitMeta[]): string {
  return units[0]?.title ?? '';
}

/**
 * 一个章节点。
 *
 * `muted` = 属于末尾「索引与导航」区：视觉弱化（`.chap.indexed`），但仍是同一个
 * `<details>` 结构、同样的 `data-chap` 懒渲染与 `data-goto` 跳转 —— 弱化只改外观，
 * 不改可达性，也不动数据。
 */
function renderChapter(
  chap: string,
  units: UnitMeta[],
  model: SidebarModel,
  open: boolean,
  muted = false,
): string {
  const show = model.showProgress !== false;
  const avg = show ? progressOfList(units, model.masteryOf) : 0;
  const items = open
    ? units.map((u) => nodeHtml(u, model.current, model.masteryOf, show)).join('')
    : '';
  return `<details class="chap${muted ? ' indexed' : ''}" data-chap="${escapeHtml(chap)}"${open ? ' open' : ''}>
      <summary title="${escapeHtml(chapterHint(units))}">
        <span class="chcode">${escapeHtml(chap)}</span>
        <span class="chtitle">${escapeHtml(chapterHint(units))}</span>
        ${show ? `<i class="cbar" style="transform:scaleX(${avg.toFixed(3)})"></i>` : ''}
      </summary>
      <div class="units"${open ? '' : ' data-lazy="1"'}>${items}</div>
    </details>`;
}

export function renderSidebar(host: HTMLElement, model: SidebarModel): void {
  const q = (model.query ?? '').trim().toLowerCase();
  const matched = q
    ? model.units.filter((u) => `${u.code} ${displayCode(u.code)} ${u.title}`.toLowerCase().includes(q))
    : model.units;

  const curChapter = model.current ? chapterOf(model.current) : '';

  // 章 → 单元（全量，章进度按全量算，不受搜索过滤影响）
  const byChapter = new Map<string, UnitMeta[]>();
  for (const u of model.units) {
    const chap = chapterOf(u.code);
    const list = byChapter.get(chap) ?? [];
    list.push(u);
    byChapter.set(chap, list);
  }
  // 章内单元序：英语一的 `WR01`（小作文）与 `WR02`（大作文）各自只有一个单元，
  // 但章序要求「大作文在翻译前、小作文在翻译后」，所以章内也要吃 `unitRank`
  // （缺省退回代号序号，四个老站行为不变）。
  for (const list of byChapter.values()) {
    list.sort((a, b) => {
      const ua = model.unitRank?.(a.code) ?? Number.POSITIVE_INFINITY;
      const ub = model.unitRank?.(b.code) ?? Number.POSITIVE_INFINITY;
      if (ua !== ub) return ua < ub ? -1 : 1;
      return codeKey(a.code)[2] - codeKey(b.code)[2];
    });
  }
  models.set(host, { model, byChapter });

  const indexChapters = indexChaptersOf(byChapter);

  const scroller = host.querySelector<HTMLElement>('.box');
  const keptScroll = scroller ? scroller.scrollTop : 0;

  if (!matched.length) {
    host.innerHTML = `<div class="box"><p class="dim">${
      q ? `没有匹配「${escapeHtml(model.query ?? '')}」的单元` : '暂无数据'
    }</p></div>`;
    lastQuery = q;
    return;
  }

  // 搜索：平铺（跨域找单元时层级是障碍）
  if (q) {
    host.innerHTML = `<div class="box"><h4 data-chapter="__search">搜索 · ${matched.length} 个单元</h4>${sortUnits(
      matched,
      model,
    )
      .map((u) => nodeHtml(u, model.current, model.masteryOf, model.showProgress !== false))
      .join('')}</div>`;
    const box = host.querySelector<HTMLElement>('.box');
    if (box) box.scrollTop = q !== lastQuery ? 0 : keptScroll;
    lastQuery = q;
    return;
  }

  // 线 → 章（2026-11-14）：域层过重（PH 32 章、CG 26 章），中间插「线」。
  // 线只做分组与排序、不进代号：`lineOfChapter` 查 `content-map.json`；
  // 没登记的章（考研 / 工程线）退回「域」当第二级，`.dom` 容器保持不变。
  interface Sec {
    key: string;
    label: string;
    domain: string;
    rank: number;
    chaps: string[];
  }
  /**
   * section 的键：**章序连续的同域章归一节**。
   *
   * 平常就是 `dom:WR`（一个域一节，与改造前一致）。只有当学科给了
   * `chapterRank` 且同一个域内的章**名次不连续**时才拆开：
   * 英语一的 `WR02`（大作文，名次 2）与 `WR01`（小作文，名次 4）中间隔着
   * `TR01`（翻译，3.5），于是拆成两节 `dom:WR@WR02` 与 `dom:WR@WR01`，
   * 侧栏读起来才是「…阅读 → 大作文 → 翻译 → 小作文 → 新题型…」。
   *
   * 判据完全由名次决定，不看学科 id —— 老站 `rank` 恒为 Infinity，
   * `@` 后缀永远不会出现，DOM 结构与增量刷新的 `data-sec` 值逐字节不变。
   */
  const secKeyOf = (chap: string, dom: string, line: ContentLine | undefined): string => {
    const base = line ? `line:${line.id}` : `dom:${dom}`;
    const r = model.chapterRank?.(chap) ?? Number.POSITIVE_INFINITY;
    if (!Number.isFinite(r)) return base;
    /**
     * 同域内按名次**分组**：名次相同的章是一组（如 `VO00…VO97` 全是 7.5），
     * 名次不同的章各自成组（`WR02` = 2 与 `WR01` = 4 分列翻译两侧）。
     *
     * 只在「本域确实含有多个不同名次」时才加 `@章号` 后缀 —— 单个名次
     * （词汇 33 章全体 7.5）保持原来的 `dom:VO` 一节，不把 33 章拆成 33 个域头
     * （第一版就踩了这个坑：每章一个 `.domhead`）。
     */
    const sameDom = [...byChapter.keys()].filter((c) => (domainOf(c) || 'ZZ') === dom);
    const ranks = new Set(
      sameDom.map((c) => model.chapterRank?.(c) ?? Number.POSITIVE_INFINITY).filter((x) => Number.isFinite(x)),
    );
    if (ranks.size <= 1) return base;
    return `${base}@${r}`;
  };

  const secs = new Map<string, Sec>();
  for (const chap of byChapter.keys()) {
    // 纯索引章不进「组 → 线」主干：它们统一去末尾的「索引与导航」区
    if (indexChapters.has(chap)) continue;
    const dom = domainOf(chap) || 'ZZ';
    const line = lineOfChapter(chap);
    const key = secKeyOf(chap, dom, line);
    const sec = secs.get(key) ?? {
      key,
      label: line ? line.label : domainLabel(dom),
      domain: dom,
      rank: line ? LINES.findIndex((l) => l.id === line.id) : domainRank(dom),
      chaps: [],
    };
    sec.chaps.push(chap);
    secs.set(key, sec);
  }
  const sections = [...secs.values()];
  /**
   * 章序：**学科配置优先，线表次之**。
   *
   * 英语一的 `chapterOrder` 会给出有限名次（导览 0 → 阅读 1 → … → 词汇 6），
   * 于是章按题型学习顺序排；四个老站 `chapterOrder` 缺省 → 全是 `Infinity`，
   * 比较落到 `Infinity - Infinity = NaN` 会被 `||` 短路掉，**行为与改造前完全一致**
   * （线内教学序 → 章号）。这一句是「不硬编码 if 英语」的全部实现。
   */
  const rank = (chap: string): number => model.chapterRank?.(chap) ?? Number.POSITIVE_INFINITY;
  for (const s of sections) {
    s.chaps.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      // 两边都未登记（无穷）时不比 —— 直接落到线内教学序 / 章号
      if (ra !== rb) return ra < rb ? -1 : 1;
      const line = lineOfChapter(a);
      if (line) {
        const ia = line.chapters.indexOf(a);
        const ib = line.chapters.indexOf(b);
        if (ia !== ib) return ia - ib;
      }
      return a < b ? -1 : 1;
    });
  }
  /**
   * 域/线之间的次序：**章序优先，域序兜底**。
   *
   * 为什么章序要压过域序：英语一的侧栏要求「导览 → 阅读 → 大作文 → 翻译 →
   * 小作文 → 新题型 → 完形 → 词汇」—— 大作文与小作文是两个**章**却分列翻译两侧。
   * 若只按域序排，`WR` 域下的 WR01/WR02 必然相邻，这条要求就无法成立。
   * 取该 section 内**最小的章名次**作 section 名次：英语一因此得到
   * GE(0.5) < RC(1.5) < WR02(2) < TR(3.5) < WR01(4) < NT(5.5) …
   *
   * 四个老站 `chapterRank` 恒为 Infinity → 两者都是 Infinity，比较失效，
   * 自动落到 `domainRank`（原逻辑），一行行为都不变。
   */
  const secRank = (s: Sec): number => Math.min(...s.chaps.map((c) => rank(c)));
  sections.sort((a, b) => {
    const ra = secRank(a);
    const rb = secRank(b);
    if (ra !== rb) return ra < rb ? -1 : 1;
    return domainRank(a.domain) - domainRank(b.domain) || a.rank - b.rank;
  });

  // 线/域 → 组（侧栏第一级）；组保持 GROUPS 定义顺序
  const byGroup = new Map<GroupId, Sec[]>();
  for (const sec of sections) {
    const g = groupOf(sec.domain);
    const list = byGroup.get(g) ?? [];
    list.push(sec);
    byGroup.set(g, list);
  }
  const groups = [...byGroup.entries()].sort((a, b) => groupRank(a[0]) - groupRank(b[0]));

  /**
   * 末尾「索引与导航」区：**导航页不占学习主线**（2026-11）。
   *
   * 排序刻意**不按编号字典序**，而是「先接回原来的组顺序」：`AL00` 属于算法、
   * `SO00` 属于操作系统项目 —— 读者找它时想的是「算法那条线的索引」，
   * 不是「A 开头的第 0 章」。组内再按章号，保证同一域的索引页相邻。
   *
   * 教学线顺序（`content-map.json` 的 `lines[].chapters`）在这里一律不参与：
   * 索引页本来就不在教学内容序列里，机械重排会把 `TL06` 这类章推出教学线。
   */
  const indexChaps = indexChapsInOrder(indexChapters);
  const indexSection = indexChaps.length
    ? `<div class="grp indexed" data-grp="${escapeHtml(INDEX_SECTION)}">
        <div class="grphead" title="索引 / 分组页与题型分层表：不是可学的实际项目，但链接全部保留">
          <span class="grplabel">索引与导航</span>
          <span class="dim grpmeta">${indexChaps.length} 章 · ${indexChaps.reduce(
            (n, c) => n + (byChapter.get(c)?.length ?? 0),
            0,
          )} 单元</span>
        </div>
        ${indexChaps
          .map((c) => renderChapter(c, byChapter.get(c) ?? [], model, c === curChapter, true))
          .join('')}
      </div>`
    : '';

  host.innerHTML = `<div class="box">${groups
    .map(([g, doms]) => {
      const chapCount = doms.reduce((n, s) => n + s.chaps.length, 0);
      const unitCount = doms.reduce(
        (n, s) => n + s.chaps.reduce((m, c) => m + (byChapter.get(c)?.length ?? 0), 0),
        0,
      );
      const blurb = GROUPS.find((x) => x.id === g)?.blurb ?? '';
      const inner = doms
        .map((sec) => {
          const all = sec.chaps.flatMap((c) => byChapter.get(c) ?? []);
          const show = model.showProgress !== false;
          const avg = show ? progressOfList(all, model.masteryOf) : 0;
          const label = sec.label;
          return `<div class="dom" data-dom="${escapeHtml(sec.domain)}" data-sec="${escapeHtml(sec.key)}">
            <div class="domhead" title="${escapeHtml(label)}">
              <span class="domlabel">${escapeHtml(label)}</span>
              <span class="dim dommeta">${sec.chaps.length} 章 · ${all.length} 单元</span>
              ${show ? `<i class="dbar" style="transform:scaleX(${avg.toFixed(3)})"></i>` : ''}
            </div>
            ${sec.chaps
              .map((c) => renderChapter(c, byChapter.get(c) ?? [], model, c === curChapter))
              .join('')}
          </div>`;
        })
        .join('');
      return `<div class="grp" data-grp="${escapeHtml(g)}">
        <div class="grphead" title="${escapeHtml(blurb)}">
          <span class="grplabel">${escapeHtml(groupLabel(g))}</span>
          <span class="dim grpmeta">${doms.length} 域 · ${chapCount} 章 · ${unitCount} 单元</span>
        </div>
        ${inner}
      </div>`;
    })
    .join('')}${indexSection}</div>`;

  wireLazy(host);

  const box = host.querySelector<HTMLElement>('.box');
  if (!box) return;
  const scrollable = box.scrollHeight > box.clientHeight + 1;
  box.scrollTop = keptScroll;
  lastQuery = q;

  // 当前单元所在章已展开（见 renderChapter 的 open），把它滚进可视区
  if (scrollable) {
    const cur = box.querySelector<HTMLElement>('.node.on');
    if (cur) {
      const cTop = cur.offsetTop;
      const cBot = cTop + cur.offsetHeight;
      if (cTop < box.scrollTop) box.scrollTop = cTop - 8;
      else if (cBot > box.scrollTop + box.clientHeight) box.scrollTop = cBot - box.clientHeight + 8;
    }
  }
}

/** 章第一次展开时补单元节点（toggle 不冒泡，用捕获阶段挂一次） */
function wireLazy(host: HTMLElement): void {
  if (host.dataset.lazyWired === '1') return;
  host.dataset.lazyWired = '1';
  host.addEventListener(
    'toggle',
    (ev) => {
      const el = ev.target as HTMLElement;
      if (!el.classList?.contains('chap') || !(el as HTMLDetailsElement).open) return;
      const box = el.querySelector<HTMLElement>('.units');
      if (!box || box.dataset.lazy !== '1') return;
      const info = models.get(host);
      const chap = el.dataset.chap ?? '';
      const units = info?.byChapter.get(chap) ?? [];
      box.innerHTML = units
        .map((u) =>
          nodeHtml(
            u,
            info?.model.current ?? '',
            info?.model.masteryOf ?? (() => 0),
            info?.model.showProgress !== false,
          ),
        )
        .join('');
      delete box.dataset.lazy;
    },
    true,
  );
}

/**
 * 掌握度变动后的**增量刷新**：
 * 只改该单元那一行的 `L` 与 `done`、所属章的进度条、所属域的总进度条。
 *
 * @returns 是否找到了该行（章没展开 / 搜索过滤掉了就是 false，调用方据此决定是否整树重建）
 */
export function patchSidebarMastery(host: HTMLElement, model: SidebarModel, code: string): boolean {
  const node = host.querySelector<HTMLElement>(`.node[data-goto="${attrEscape(code)}"]`);
  if (!node) return false;
  const m = model.masteryOf(code);
  const mEl = node.querySelector<HTMLElement>('.m');
  if (mEl) mEl.textContent = `L${m}`;
  node.classList.toggle('done', m >= 3);

  if (model.showProgress === false) return false;
  const chap = chapterOf(code);
  const units = model.units.filter((u) => chapterOf(u.code) === chap);
  const bar = host.querySelector<HTMLElement>(`.chap[data-chap="${attrEscape(chap)}"] .cbar`);
  if (bar) bar.style.transform = `scaleX(${progressOfList(units, model.masteryOf).toFixed(3)})`;

  // 第二级可能是「线」也可能是「域」（同一个 AN 域被拆成两条线就是两个 .dom），
  // 所以按 `data-sec` 定位，不能按 `data-dom` —— 否则只刷到第一条线。
  const sec = sectionKeyOf(code);
  const secUnits = model.units.filter((u) => sectionKeyOf(u.code) === sec);
  const dbar = host.querySelector<HTMLElement>(`.dom[data-sec="${attrEscape(sec)}"] .dbar`);
  if (dbar) dbar.style.transform = `scaleX(${progressOfList(secUnits, model.masteryOf).toFixed(3)})`;
  return true;
}