import { escapeHtml } from '../renderers/markdown';
import { attrEscape } from '../modules/attr';
import type { SiteLink } from '../subjects';

/**
 * 顶栏的一个入口块。
 *
 * 2026-11 第二次改结构（第一次是把 `#graph` 拆成「总纲 / 路线」两页）。
 * 这次的起因：全部入口（一个域一块，projects 站 12 块）塞进 `.chapters` 横滚条，
 * 390 视口只能看到最左 3–4 块，其余**没有任何提示**地藏在横滚里 ——
 * 「手机端域入口不可达」的根因不是挤，而是入口没有可发现性。
 * 现在横滚条只服务桌面（≥701px），窄屏由一个原生 `<select>` 承载同样的目的地。
 */
export interface NavBlock {
  /** 块标签：域块是域代号（`AN`/`SO`），索引块是章代号（`SO00`/`PX01`） */
  letter: string;
  /** 人类可读名（域：`分析`；索引章：该章首单元标题） */
  label: string;
  /** 平均掌握度 0–1 */
  progress: number;
  /** 该块指向的第一个单元 */
  first: string;
  /** `domain` = 域级入口（默认）；`chapter` = 纯索引区里的章级入口 */
  group?: 'domain' | 'chapter';
}

export interface HeaderModel {
  blocks: NavBlock[];
  /** 当前域代号（用于高亮）；不落在任何域上时为空串 */
  current: string;
  errorCount: number;
  /** 当前搜索词（受控） */
  query: string;
  /**
   * 五站互链（`subjects.ts` 的 `siteLinksOf` 派生）。
   *
   * 取代旧的单条 `crossLink`：旧版每个站只认识一个邻居，
   * 从工程线要到英语一得先回数学 —— 「任意页面可达」这个要求它做不到。
   * 不传则不渲染（standalone 索引页之类的纯链接页）。
   */
  sites?: SiteLink[];
  /** 章序（顶栏块与侧栏同一口径）；缺省按 DOMAINS 顺序 */
  chapterRank?: (chap: string) => number;
  /**
   * 总纲入口。**`null` = 该学科没有总纲（`subject.syllabus === null`）→ 不渲染按钮。**
   *
   * 2026-11 修：此前按钮无条件渲染，于是 `math1` / `projects` 顶栏常驻一个
   * 按下去只能看到「该学科暂未提供这一页」的空按钮。现在按钮与数据同源。
   */
  syllabus?: { label: string; title: string } | null;
  /** 路线（`#angles`）入口；同样以「数据存在」为渲染条件 */
  angles?: { label: string; title: string } | null;
  /**
   * 是否显示平均掌握度（块上的进度条 / 下拉里的百分比）。
   * 缺省 true；工程线显式 false —— 进度不在这套静态站里控制。
   */
  showProgress?: boolean;
  onSearch(query: string): void;
  /** 顶栏导航选中某一项（窄屏 select 用；桌面块走 document 上的 data-goto 委托） */
  onGoto(code: string): void;
}

let searchEl: HTMLInputElement | null = null;
/** 窄屏 `<select>` 与其宿主：监听只绑一次，重渲染只换选项 */
let navSelect: HTMLSelectElement | null = null;

const pct = (n: number): string => (n * 100).toFixed(0);

/** 桌面横滚条里的一个块 */
function blockHtml(b: NavBlock, current: string, index: number, showProgress = true): string {
  const n = index + 1;
  const tip = showProgress
    ? (b.group ?? 'domain') === 'chapter'
      ? `${b.label} · 索引章 · 平均掌握度 ${pct(b.progress)}%`
      : `${b.label} · 平均掌握度 ${pct(b.progress)}%`
    : b.label;
  return `<b class="${b.letter === current ? 'on' : ''}" data-letter="${escapeHtml(b.letter)}" data-goto="${escapeHtml(
    b.first,
  )}"
      data-nav="${n}" role="button" tabindex="0" aria-label="前往 ${escapeHtml(b.label)}"
      title="${escapeHtml(b.letter)} ${escapeHtml(tip)}">${escapeHtml(b.letter)}${
        showProgress
          ? `<i style="transform:scaleX(${b.progress.toFixed(3)})"></i>`
          : ''
      }</b>`;
}

/**
 * 窄屏 `<select>` 的选项。
 *
 * 为什么用原生 select 而不是自绘 details 菜单：它自带键盘操作（Tab 聚焦、
 * ↑↓ 切换、Enter 提交）、自带「全部入口都在这里」的可发现性，也没有需要自己维护的
 * 开合状态与焦点陷阱。代价是不能放富文本，但这里只需要「代号 · 进度」。
 *
 * 域与索引章分两个 `<optgroup>`：两者语义不同（学习主线 vs 纯索引），
 * 在同一个平铺列表里混读会重现侧栏「索引混进学习项目」的老问题。
 *
 * 第一项 `value=""` 是**占位项且永远高亮**（`selected`）：
 * 它是「域 / 进度」导航的当前状态，而不是一个可选项。
 * 为什么不让真正的当前域保持 selected：那样「又选了同一个域」时 `<select>` 的值
 * 不变，`change` 不触发 —— 用户会以为导航坏了（390 验收里实测到这一点）。
 * 现在每次选择后都回到占位项，同一个域可以连续选。
 */
function navOptionsHtml(model: HeaderModel): string {
  const domains = model.blocks.filter((b) => (b.group ?? 'domain') === 'domain');
  const chapters = model.blocks.filter((b) => b.group === 'chapter');
  const show = model.showProgress !== false;
  const opt = (b: NavBlock, index: number): string =>
    `<option value="${escapeHtml(b.first)}" data-nav="${index + 1}">${escapeHtml(b.label)} (${escapeHtml(
      b.letter,
    )})${show ? ` · ${pct(b.progress)}%` : ''}</option>`;
  const all = model.blocks;
  return `<option value="" selected>${show ? '域 / 进度…' : '域…'}</option>
      <optgroup label="域">${domains.map((b) => opt(b, all.indexOf(b))).join('')}</optgroup>
      ${chapters.length ? `<optgroup label="索引与导航">${chapters.map((b) => opt(b, all.indexOf(b))).join('')}</optgroup>` : ''}`;
}

/**
 * 五站互链。
 *
 * 两套呈现，**同一份链接**：
 *   · 桌面（≥701px）：`.sitenav` 一排短标签（数学 / 408 / 数一 / 工程 / 英一）；
 *   · 窄屏（≤700px）：`.sitenav` 收起，`.sitemenu` 是一个原生 `<details>` 折叠，
 *     `<summary>` 自带键盘可达（Tab 聚焦 + Enter/Space 展开），里面的 `<a>` 仍是真链接 ——
 *     与已有 `.domnav`（域 / 进度 `<select>`）是**两个不同控件**：
 *     前者换站，后者换域，互不抢占，也不会像自绘菜单那样互相关闭。
 *
 * 为什么不复用 `<select>`：它是导航跨 HTML 文档的跳转，`<select>` 需要 JS 拦截
 * `change` 再 `location.assign`，file:// 与禁用 JS 时全失效；`<a href>` 永远可用。
 *
 * 当前站：`aria-current="page"` 且**不自跳**。
 * 关键点：它仍然是一个可聚焦的 `<a>`（保留在 Tab 序列里，屏幕阅读器能读到
 * 「当前页」），但点击/回车由 `app.ts` 的委托 `preventDefault` 拦下 ——
 * 不用 `href="#"`（会在地址栏留垃圾 hash），也不用 `pointer-events:none`
 * （那会让键盘焦点落在一个「看不见反应」的元素上）。
 */
function siteItemHtml(s: SiteLink, extraClass: string, markCurrent: boolean): string {
  const cur = s.current;
  const base = `${extraClass}${cur ? ' on' : ''}`;
  // 快照里若该文件不存在（单站重建），不渲染成 <a>：坏链接在 file:// 下点了毫无反应，
  // 比「明确不可点」更糟。`missingSnapshot` 只有快照场景会为真。
  if (missingSnapshot(s) && !cur) {
    return `<span class="${base} miss" aria-disabled="true"
      title="${escapeHtml(s.label)}：本次快照未包含该站（单独重建即可生成）">${escapeHtml(s.label)}</span>`;
  }
  // 当前站：可聚焦（保留在 Tab 序列里，屏幕阅读器读得到「当前页」），
  // 但点击由 `app.ts` 的委托 preventDefault，不自跳。
  const attrs = cur
    ? `${markCurrent ? 'aria-current="page" ' : ''}data-current="1" aria-disabled="true"`
    : `href="${escapeHtml(s.href)}"`;
  return `<a class="${base}" ${attrs}
    data-site="${escapeHtml(s.id)}"
    title="${cur ? `当前站点：${escapeHtml(s.label)}` : `切换到 ${escapeHtml(s.label)} 站`}">${escapeHtml(
      s.label,
    )}</a>`;
}

/**
 * 该站的快照文件在**本目录**是否存在。
 *
 * 判据来自 shim 里的 `window.__kbSnapshots`（构建期扫描磁盘得出）。
 * dev / vite build 没有这个变量 → 一律 false（正常入口都在，不需要降级）。
 */
function missingSnapshot(s: SiteLink): boolean {
  if (s.current) return false; // 当前页自己总是「存在」的
  const present = (globalThis as { __kbSnapshots?: string[] }).__kbSnapshots;
  if (!Array.isArray(present)) return false;
  const name = s.href.replace(/^\.\//, '');
  return !present.includes(name);
}

/**
 * 五站导航的两个宿主。**同一时刻只有一份在无障碍树上**：
 * 桌面显示 `.sitenav`，窄屏显示 `.sitemenu`（媒体查询切换）。
 *
 * `aria-current` 只能出现一次：两份都「完整渲染」会让屏幕阅读器读到两处
 * 「当前页」，也让「当前站唯一」的断言变成 `english1,english1`（实测抓到的）。
 *
 * 两份都在 HTML 里（媒体查询只切显示，不切 DOM，重渲染才不会丢开合状态），
 * 但**只有桌面那份**标 `aria-current`：窄屏那份是纯跳转清单，当前站那一项
 * 渲染成「不可点的当前项」（`.on` + `aria-disabled`，不带 `aria-current`），
 * 这样屏幕阅读器只读到一个「当前页」，键盘 Tab 也能跳过它。
 *
 * 五项都要在：`max_items` 要求「任意页面都能看到五个站」，少一项就不算可达。
 */
function sitesHtml(sites: SiteLink[] | undefined): string {
  if (!sites?.length) return '';
  const cur = sites.find((s) => s.current);
  return `<nav class="sitenav" aria-label="学科站点">${sites
    .map((s) => siteItemHtml(s, 'sitelnk', true))
    .join('')}</nav>
    <details class="sitemenu">
      <summary title="切换学科站点（当前：${escapeHtml(cur?.label ?? '')}）">
        <span aria-hidden="true">⇄</span> ${escapeHtml(cur?.label ?? '站点')}
      </summary>
      <div class="sitemenu-list">${sites.map((s) => siteItemHtml(s, 'sitemenu-item', false)).join('')}</div>
    </details>`;
}

/** 选中项在窄屏导航上的摘要文字（当前域 + 进度） */
function navSummary(model: HeaderModel): string {
  const hit = model.blocks.find((b) => b.letter === model.current);
  return hit ? `${hit.label} · ${pct(hit.progress)}%` : '域 / 进度';
}

export function renderHeader(host: HTMLElement, model: HeaderModel): void {
  // 搜索框复用同一个节点：重渲染顶栏（每次掌握度变动都会调）时
  // 不能把正在输入的焦点与光标位置丢掉。
  if (!searchEl || !host.contains(searchEl)) {
    host.innerHTML = `
      <div class="logo">learning-web</div>
      <label class="domnav" title="域 / 进度：展开可跳到任意域或索引章">
        <span class="dnv-ico" aria-hidden="true">☰</span>
        <span class="dnv-txt"></span>
        <select class="dnv-sel" aria-label="域与进度：选择一个域或索引章跳转"></select>
      </label>
      <div class="chapters"></div>
      <div class="warnslot"></div>
      ${sitesHtml(model.sites)}
      ${
        model.syllabus
          ? `<button class="graphbtn" data-graph="1" title="总纲：${escapeHtml(
              model.syllabus.title,
            )}（整个学科的全局图景）">📘 ${escapeHtml(model.syllabus.label)}</button>`
          : ''
      }
      ${
        model.angles
          ? `<button class="graphbtn" data-angles="1" title="路线：${escapeHtml(
              model.angles.title,
            )}（一条具体的切入线，不是全学科总纲）">🧭 ${escapeHtml(model.angles.label)}</button>`
          : ''
      }
      <label class="search">
        <span class="ico">🔍</span>
        <input type="search" placeholder="筛选单元代号 / 标题…" autocomplete="off" spellcheck="false">
      </label>`;
    searchEl = host.querySelector('input[type=search]') as HTMLInputElement;
    searchEl.addEventListener('input', () => model.onSearch(searchEl!.value));
  }

  // 窄屏导航：选项每次重渲染刷新（进度会变），change 只绑一次
  const sel = host.querySelector<HTMLSelectElement>('.dnv-sel');
  if (sel) {
    sel.innerHTML = navOptionsHtml(model);
    sel.value = ''; // 回到占位项：保证「再次选同一个域」也能触发 change
    const txt = host.querySelector<HTMLElement>('.dnv-txt');
    if (txt) txt.textContent = navSummary(model);
    if (navSelect !== sel) {
      navSelect = sel;
      sel.addEventListener('change', () => {
        const to = sel.value;
        sel.value = ''; // 提交即归零（重渲染前也先归零，避免停留在一个"已选"的假状态）
        if (!to) return;
        model.onGoto(to);
      });
    }
  }

  (host.querySelector('.chapters') as HTMLElement).innerHTML = model.blocks
    .map((b, i) => blockHtml(b, model.current, i, model.showProgress !== false))
    .join('');
  (host.querySelector('.warnslot') as HTMLElement).innerHTML = model.errorCount
    ? `<div class="warnchip" title="见右下角数据问题浮层">⚠ ${model.errorCount}</div>`
    : '';
  const gbtn = host.querySelector<HTMLElement>('.graphbtn[data-graph]');
  if (gbtn) gbtn.classList.toggle('on', model.current === 'graph');
  const abtn = host.querySelector<HTMLElement>('.graphbtn[data-angles]');
  if (abtn) abtn.classList.toggle('on', model.current === 'angles');
  if (searchEl.value !== model.query) searchEl.value = model.query;
}

/**
 * 掌握度变动时只改**一个块**的进度环与提示文案（增量刷新）。
 * 顶栏只有 ~20 个块，但重建会连同搜索框一起动，能省则省：
 * 这里只写两个属性，不碰 DOM 结构，输入焦点与光标位置绝不会丢。
 *
 * 窄屏 `<select>` 与摘要文字同样要跟着走，否则手机上显示的「进度」会立刻过期
 * ——那比不显示更糟。
 */
export function patchHeaderProgress(host: HTMLElement, letter: string, progress: number): boolean {
  const b = host.querySelector<HTMLElement>(`.chapters b[data-letter="${attrEscape(letter)}"]`);
  const sel = host.querySelector<HTMLSelectElement>('.dnv-sel');
  if (!b && !sel) return false;
  if (b) {
    const nav = b.dataset.nav ?? '';
    const name = b.getAttribute('aria-label') ?? letter;
    b.title = `${name} · 平均掌握度 ${pct(progress)}%`;
    const bar = b.querySelector<HTMLElement>('i');
    if (bar) bar.style.transform = `scaleX(${progress.toFixed(3)})`;
    // 选项与块用同一个 `data-nav` 序号对应，不靠文本猜测
    const opt = nav ? sel?.querySelector<HTMLOptionElement>(`option[data-nav="${attrEscape(nav)}"]`) : null;
    if (opt) {
      const base = (opt.textContent ?? '').split(' · ')[0];
      opt.textContent = `${base} · ${pct(progress)}%`;
    }
  }
  if (b?.classList.contains('on')) {
    const label = host.querySelector<HTMLElement>('.dnv-txt');
    const name = b.getAttribute('aria-label') ?? letter;
    if (label) label.textContent = `${name} · ${pct(progress)}%`;
  }
  return true;
}
