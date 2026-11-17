import type { Entry, EntryFile } from '../types';
import { displayCode } from '../modules/codes';
import { isProbeDone } from '../modules/state';
import { selftestItems, selftestKey, selftestLevel, selftestProgress } from '../content/selftest';
import {
  CORE_GAPS,
  PROJECT_ROUTES,
  projectRoutesFor,
  type ExamTier,
  type JobTier,
  type ProjectRoute,
  type ProjectRouteStep,
} from '../content/project-routes';
import { escapeHtml, renderContent, renderInline } from './markdown';

/**
 * `doc-card/v1` 的渲染：**照着文档读，不套词条卡片**。
 *
 * 为什么不复用 `renderCard`（entry-card 的那套 tab/难度/掌握度）：
 * 搬运来的内容本来就是「一节一段」的连续文档（考法 / 真题 / 分章），
 * 硬塞进「陈述/直觉/证明」的分页会切断上下文，也会把 4000 字的 NOTES 切成碎片。
 *
 * 约定：
 * - `level` 决定标题层级（`level=0` 是无标题引言；`level=2` → `h2`）。
 * - `type=heading` 只出标题不出正文（源里「`## 考法` 下直接跟 `## 题`」的写法）。
 * - `mirror_of` 表示这条是真题镜像，页面上给一个可点的「→ 真题」指针。
 */
/** 路线卡的状态注入：站内已有单元集合 + 每个单元的达标/推荐判定（由 app 提供） */
export interface DocRouteState {
  has(code: string): boolean;
  masteryOf(code: string): number;
  /** 「今天该学」的代号（frontier）；null = 没有可推荐单元 */
  frontier: string | null;
  /** 已达标门槛（与 frontier 同口径：≥3） */
  threshold?: number;
}

/**
 * 章首 `.0` 的「本章考点」导航（2026-11-18）。
 *
 * 数据来自导入器写入的 `meta.kps`（按现行 syllabus 生成），**不解析正文**：
 * 章首页现在已经合并了章讲义，读者看完讲义就在同一页看到考点入口，
 * 不必回侧栏逐个找。导航用 `data-goto` 走现有路由，不新增 hash。
 */
function chapterKpsNav(file: EntryFile, route?: DocRouteState): string {
  const m = ((file as unknown as { meta?: Record<string, unknown> }).meta ?? {}) as Record<string, unknown>;
  const kps = Array.isArray(m.kps) ? m.kps : [];
  const rows = kps
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return '';
      const k = raw as Record<string, unknown>;
      const code = String(k.code ?? '');
      const title = String(k.title ?? '');
      if (!code) return '';
      const level = route?.masteryOf(code) ?? 0;
      return `<li><button class="chip kp" data-goto="${escapeHtml(code)}"><span class="kpcode mono">${escapeHtml(
        displayCode(code),
      )}</span><span class="kpttl">${escapeHtml(title)}</span><span class="kplv">L${level}</span></button></li>`;
    })
    .filter(Boolean)
    .join('');
  if (!rows) return '';
  return `<nav class="chapkps" aria-label="本章考点">
  <h2>本章考点 · ${kps.length}</h2>
  <p class="stnote">点任一考点进入该考点的考法、思路、坑与真题；本页上方是本章讲义。</p>
  <ul>${rows}</ul>
  </nav>`;
}

export function renderDocHtml(file: EntryFile, route?: DocRouteState): string {
  const code = file.code ?? '';
  const meta = docMeta(file);
  const parts: string[] = [];

  parts.push(`<div class="card pagehead">
    <h1>${escapeHtml(displayCode(code))} <em>${renderInline(file.title ?? '')}</em></h1>
    <div class="meta">${meta.map((m) => `<span class="tag">${escapeHtml(m)}</span>`).join('')}</div>
  </div>`);

  const routes = projectRoutesSection(file, route);
  if (routes) parts.push(routes);

  for (const e of file.entries) {
    const level = typeof e.level === 'number' ? e.level : 2;
    const title = (e.title ?? '').trim();
    const body = (e.content ?? '').trim();
    const mirror = mirrorLink(e);
    const head = level === 0 || !title
      ? ''
      : `<h${Math.min(level + 1, 6)} class="dochead">${renderInline(title)}${mirror}</h${Math.min(level + 1, 6)}>`;
    const content = body ? `<div class="docbody">${renderContent(body)}</div>` : '';
    const cls = ['docsec', `docsec-l${level}`, e.type === 'heading' ? 'docsec-heading' : '']
      .filter(Boolean)
      .join(' ');
    // `data-entry` 是 **HTML 属性**语境 → escapeHtml（attrEscape 只防 CSS 选择器的引号/反斜杠，
    // 在 HTML 里 `\"` 不转义引号，数据里的 `"` 仍会提前收尾属性）。
    parts.push(`<section class="${cls}" data-entry="${escapeHtml(e.id)}">${head}${content}</section>`);
  }
  const kps = chapterKpsNav(file, route);
  if (kps) parts.push(kps);
  const selftest = selftestSection(file);
  if (selftest) parts.push(selftest);
  return parts.join('\n');
}

/**
 * 路线步骤的三种状态，全部由**已有掌握度**推出（不新增存储）：
 *   - `done`  已达标（mastery ≥ 3，与 frontier 的「前序达标」同口径）
 *   - `now`   就是「今天该学」的那一步
 *   - 其余    未达标
 */
const REACHED = 3;

/**
 * 「当前位置」那一行。抽成独立函数：自测作答后 app 要就地重写它
 * （`patchRouteState`），两处必须用同一段 HTML，否则文案/转义会漂移。
 */
function nowStepHtml(step: ProjectRouteStep | undefined): string {
  if (!step) return '';
  return `<p class="prouteroute">当前位置：<b>${escapeHtml(step.stage)}</b> · ${escapeHtml(step.code)}</p>`;
}

/** 路线卡片元素 → 路线 id（就地刷新时要按 id 找回数据，不靠 DOM 反推步骤） */
export const ROUTE_ATTR = 'data-route';

function stepState(code: string, route?: DocRouteState): 'done' | 'now' | 'todo' {
  if (!route) return 'todo';
  const threshold = route.threshold ?? REACHED;
  if (route.frontier && route.frontier === code) return 'now';
  return route.masteryOf(code) >= threshold ? 'done' : 'todo';
}

function stepBadge(state: 'done' | 'now' | 'todo'): string {
  if (state === 'done') return '<span class="pstepstep done">已达标</span>';
  if (state === 'now') return '<span class="pstepstep now">当前位置</span>';
  return '';
}

/**
 * 两个价值徽标：「求职：必须 / 高增益 / 可选」「考研：直接提分 / 能力迁移 / 弱相关」。
 *
 * 档位是**人工审定**的判断（口径见 `docs/career/roles.md` / `interview.md`），
 * 不是从掌握度推出来的 —— 所以它们放在 `data-tier` 属性里，且与「已达标/当前位置」
 * 那套**运行期状态徽标**分开渲染：前者随数据静态，后者由自测作答实时变。
 *
 * 文案用缩写形态（「求职 必须」）以压宽度：移动端一行里还要放交付物。
 * 完整语义在 `title` 里，悬停可读。
 *
 * **低信息双徽标不渲染**（2026-11）：`求职 可选` + `考研 弱相关` 同时出现时，
 * 两个徽标都在告诉读者「这一步与你的两个目标都无关」—— 同一条信息说了两遍，
 * 占掉手机一整行，还把真正要看的「交付：…」挤下去。
 * 这种组合直接不出徽标；**数据本身（`step.job` / `step.exam`）一字不动**，
 * 右栏「动机 · 交付 · 验收」里的「价值：求职 可选 · 考研 弱相关」照旧完整显示，
 * 想核对档位就看那里（或看 `docs/career/roles.md`）。
 */
function tierBadges(job: JobTier, exam: ExamTier): string {
  if (job === '可选' && exam === '弱相关') return '';
  return `<span class="ptier"><span class="ptag job j-${escapeHtml(job)}" title="求职价值：${escapeHtml(
    job,
  )}（口径见 docs/career/roles.md）">求职 ${escapeHtml(job)}</span><span class="ptag exam e-${escapeHtml(
    exam,
  )}" title="考研价值：${escapeHtml(exam)}（口径见 docs/career/interview.md）">考研 ${escapeHtml(
    exam,
  )}</span></span>`;
}

/** 路线定位徽标：核心 = 置顶主攻，协同 = 与初试协同，对照 = 可选参照 */
function roleBadge(role: ProjectRoute['role']): string {
  return `<span class="prole r-${escapeHtml(role)}">${escapeHtml(role)}</span>`;
}

/**
 * 卡头只出一个徽标。
 *
 * 现场：路线 `label` 本身已经写着「测开 + 仿真核心」「考研冲高协同」，卡头再拼
 * `roleBadge('核心')` 就变成「测开 + 仿真核心核心」「考研冲高协同协同」。
 *
 * 去重规则（不是简单删掉徽标）：
 *   · label 里已含 role 字样（如「…核心」）→ **只保留 label**，不再出徽标；
 *   · label 不含 role（如「系统与内核」+「对照」）→ 保留徽标，它是唯一的定位线索。
 * 两条分支都保证「定位信息恰好出现一次」，不会一边重复一边丢失。
 */
function routeHeadBages(route: ProjectRoute): { label: string; badge: string } {
  return route.label.includes(route.role)
    ? { label: route.label, badge: '' }
    : { label: route.label, badge: roleBadge(route.role) };
}

/**
 * 紧凑变体：**只**给 label + 进度摘要，不给步骤列表。
 *
 * 用途是第 3 条的「其余 5 条收进 details」——折叠状态下读者需要一个能分辨
 * 「哪条是哪条、走到哪了」的最短摘要；展开后再渲染完整卡（`routeCard`）。
 */
function routeSummaryCard(route: ProjectRoute, state?: DocRouteState): string {
  const done = route.steps.filter((s) => stepState(s.code, state) === 'done').length;
  const head = routeHeadBages(route);
  return `<article class="proute compact" ${ROUTE_ATTR}="${escapeHtml(route.id)}">
    <div class="proutehead">
      <h3>${escapeHtml(head.label)}${head.badge}</h3>
      <span class="prouteprog mono">${done}/${route.steps.length} 已达标</span>
    </div>
  </article>`;
}

function routeCard(route: ProjectRoute, state?: DocRouteState): string {
  const done = route.steps.filter((s) => stepState(s.code, state) === 'done').length;
  const nowStep = route.steps.find((s) => stepState(s.code, state) === 'now');
  const head0 = routeHeadBages(route);
  const head = `<div class="proutehead">
      <h3>${escapeHtml(head0.label)}${head0.badge}</h3>
      <span class="prouteprog mono">${done}/${route.steps.length} 已达标</span>
    </div>
    ${nowStepHtml(nowStep)}
    <p>${escapeHtml(route.goal)}</p>
    ${route.overlap ? `<p class="poverlap">${escapeHtml(route.overlap)}</p>` : ''}`;
  const steps = route.steps
    .map((step) => {
      const st = stepState(step.code, state);
      const exists = state ? state.has(step.code) : true;
      // `data-goto` / `title` 都是 **HTML 属性**语境：`attrEscape` 只适合 CSS 选择器
      // （它把 `"` 转成 `\"`，在 HTML 里引号照旧收尾、可跳出属性），所以这里用 escapeHtml。
      const chip = exists
        ? `<button class="chip" data-goto="${escapeHtml(step.code)}">${escapeHtml(step.code)}</button>`
        : `<button class="chip pending" data-goto="${escapeHtml(step.code)}" title="该单元尚未生成">${escapeHtml(
            step.code,
          )} ·待生成</button>`;
      return `<li class="pstep ${st}">${chip}
        <span class="pstepbody"><b>${escapeHtml(step.stage)} · 成本${escapeHtml(step.cost)}</b>${stepBadge(st)}
        ${tierBadges(step.job, step.exam)}
        <span class="pstepwhy">为什么：${escapeHtml(step.why)}</span>
        <span class="pstepout">交付：${escapeHtml(step.outcome)}</span></span></li>`;
    })
    .join('');
  return `<article class="proute" ${ROUTE_ATTR}="${escapeHtml(route.id)}">${head}<ol>${steps}</ol></article>`;
}

/**
 * 核心路线的**当前缺口**：只有文字，没有单元按钮、没有完成度。
 *
 * 为什么必须显式写出来：路线右侧都是「站内能学的单元」，
 * 而测开/仿真岗最硬的三块（benchmark 代码、1D FEM 链路、商业仿真软件）**站内没有**。
 * 不给这段文字，用户会以为走完这条路线就补齐了岗位要求 —— 那是虚的。
 * 缺口来自 `docs/career/roles.md` §3，本文件只引用，不复述判据。
 */
function coreGapsBlock(): string {
  if (!CORE_GAPS.length) return '';
  const items = CORE_GAPS.map((g) => `<li>${escapeHtml(g)}</li>`).join('');
  // 标题写「岗位缺口」而不是「这条路线补不上的」：它紧跟在**核心**路线之后，
  // 语义就是「走完主线仍缺的岗位能力」，原先的措辞在 7 张卡平铺时指代不清。
  return `<div class="pgaps">
    <b>岗位缺口 · 主线补不上的（站内无对应单元，只作文字说明）</b>
    <ul>${items}</ul>
    <span class="stnote">缺口以 docs/career/roles.md §3 的对应表为准；这里不虚构单元，也不标完成度。</span>
  </div>`;
}

/**
 * 主路线 = 数组里 role 为核心/协同的那两条（`testing-sim` / `kaoyan-sync`）。
 * 用 role 判定而不是写死 id：数据侧调整 id 时这里不会静默失配。
 */
const isMainRoute = (r: ProjectRoute): boolean => r.role === '核心' || r.role === '协同';

/**
 * 路线区：只回答「为了什么做、按什么顺序做、我现在在哪」。
 * 交付物用步骤自带的 `outcome`；验收=该单元的自测（L1–L5），这里只给指针不复述正文。
 *
 * 顺序 = `PROJECT_ROUTES` 数组顺序（核心 → 协同 → 原有分组路线，graphics 在最后）：
 * 同一份顺序既决定展示，也决定 projects 学科 frontier 的推荐优先级（见 `modules/graph.ts`）。
 *
 * **两种页面的呈现不同**（2026-11，解决「过度平铺」）：
 *
 *   ① 整表页（`project-group` / `project-index`，7 条路线全在）：
 *      只完整展开 testing-sim 与 kaoyan-sync 两条主路线；其余 5 条对照路线收进
 *      `<details>`，每条只留 label + 进度摘要。原来 7 张 3 米长的卡平铺，
 *      读者滚到第三条就已经忘记自己在看哪条。
 *      `核心缺口` 紧跟在 testing-sim 之后（独立成块、标题写「岗位缺口」），
 *      不被后面 5 条对照路线淹没。
 *
 *   ② 单项目页（`projectRoutesFor` 只命中该章所属的几条）：
 *      只完整展开「主路线那一张」（`routePlaceOf` 同款优先序：PROJECT_ROUTES 里第一条
 *      命中本章的，即核心 > 协同 > 对照），其余所属路线压成一行「同时在：…」。
 *      现场（CS01.1）：同一个单元被渲染 3 张卡、3 个「当前位置」，页面像在自我重复。
 */
export function projectRoutesSection(file: EntryFile, state?: DocRouteState): string {
  const routes = projectRoutesFor(file);
  if (!routes.length) return '';

  // ── 整表页：7 条全在
  if (routes.length === PROJECT_ROUTES.length) {
    const total = new Set(routes.flatMap((r) => r.steps.map((s) => s.code))).size;
    const mains = routes.filter(isMainRoute);
    const rest = routes.filter((r) => !isMainRoute(r));
    // 主路线按数组序（核心→协同）逐张渲染；缺口块贴在**核心**那张之后
    const mainHtml = mains
      .map((r) =>
        `${routeCard(r, state)}${r.role === '核心' ? `<div class="pgaps-slot">${coreGapsBlock()}</div>` : ''}`,
      )
      .join('');
    const folded = rest.length
      ? `<details class="proutes-more">
      <summary>其余 ${rest.length} 条对照路线（可选参照）</summary>
      <div class="proutes">${rest.map((r) => routeSummaryCard(r, state)).join('')}</div>
    </details>`
      : '';
    return `<section class="project-routes" aria-label="按目标选择项目路线">
    <h2>按目标选路线</h2>
    <p class="stnote">路线定方向（${mains.length} 条主线 · ${total} 个阶段）：先走 <b>${mains
      .map((r) => escapeHtml(r.label))
      .join('</b> → <b>')}</b>；其余 ${rest.length} 条为对照，折在下面。<b>已达标</b> = 该单元自测到 L3 及以上，<b>当前位置</b> = 拓扑序 + 掌握度算出的「今天该学」。</p>
    <div class="proutes">${mainHtml}</div>
    ${folded}
  </section>`;
  }

  // ── 单项目页：只完整展开主路线一张
  const primary = routes.find(isMainRoute) ?? routes[0];
  const others = routes.filter((r) => r !== primary);
  const total = new Set(routes.flatMap((r) => r.steps.map((s) => s.code))).size;
  const alsoOn = others.length
    ? `<p class="palsoon">同时在：${others
        .map(
          (r) =>
            `<button class="plink" data-route-jump="${escapeHtml(r.id)}" title="这条路线也包含本章">${escapeHtml(
              r.label,
            )}</button>`,
        )
        .join('<span class="dim"> · </span>')}</p>`
    : '';
  return `<section class="project-routes" aria-label="本单元所属的项目路线">
    <h2>在路线里的位置</h2>
    <p class="stnote">本单元属于 ${routes.length} 条路线，这里只展开主路线一张（${total} 个阶段合计）；其余路线见下方「同时在」。</p>
    <div class="proutes">${routeCard(primary, state)}</div>
    ${alsoOn}
  </section>`;
}

/**
 * 路线区的**就地刷新**（自测点完之后）：只重写每张路线卡内部的「已达标数 / 当前位置 / 每步状态」，
 * 不整页重渲染 —— 用户刚点的「能答」按钮在文档末尾，整页替换会把滚动位置弹回顶部。
 *
 * `state.masteryOf` / `state.frontier` 由调用方即时算好（与 `masteryByCode` 同一口径）。
 * @returns 是否有任何路线卡真的被更新（false = 该页没有路线区，调用方可跳过）
 */
export function patchRouteState(host: ParentNode, state: DocRouteState): boolean {
  const cards = host.querySelectorAll<HTMLElement>(`article.proute[${ROUTE_ATTR}]`);
  if (!cards.length) return false;
  let touched = false;
  cards.forEach((el) => {
    const id = el.getAttribute(ROUTE_ATTR) ?? '';
    const route = PROJECT_ROUTES.find((r) => r.id === id);
    if (!route) return;
    const prog = el.querySelector<HTMLElement>('.prouteprog');
    const done = route.steps.filter((s) => stepState(s.code, state) === 'done').length;
    if (prog) prog.textContent = `${done}/${route.steps.length} 已达标`;
    // 「当前位置」行可能原来不存在（没有 now 步骤）→ 用同一段 HTML 重建/插入
    const nowStep = route.steps.find((s) => stepState(s.code, state) === 'now');
    const cur = el.querySelector<HTMLElement>('.prouteroute');
    if (nowStep) {
      const html = nowStepHtml(nowStep);
      if (cur) cur.outerHTML = html;
      else el.querySelector('.proutehead')?.insertAdjacentHTML('afterend', html);
    } else if (cur) {
      cur.remove();
    }
    // 每步的 done / now / todo 与徽标（列表结构不动，只切 class 与徽标）
    const items = el.querySelectorAll<HTMLElement>('li.pstep');
    route.steps.forEach((step, i) => {
      const li = items[i];
      if (!li) return;
      const st = stepState(step.code, state);
      li.classList.remove('done', 'now', 'todo');
      li.classList.add(st);
      let badge = li.querySelector<HTMLElement>('.pstepstep');
      const want = stepBadge(st);
      if (!want) {
        badge?.remove();
        return;
      }
      if (!badge) {
        const body = li.querySelector('.pstepbody');
        if (!body) return;
        body.insertAdjacentHTML('afterbegin', want);
        badge = li.querySelector<HTMLElement>('.pstepstep');
        return;
      }
      badge.outerHTML = want;
    });
    touched = true;
  });
  return touched;
}

/**
 * 自测区：L1 概念 → L2 机制 → L3 边界 → L4 独立验证 → L5 迁移；每级全部达标才升级。
 *
 * 题键来自 `selftestKey`（内容指纹，不随插入/换序串题）。
 * 这里**只渲染**，写入口只有 `app.ts` 的委托处理器 ——
 * 所以「自测是唯一写入口、手动徽标不得抬高 frontier」的口径由两处共同保证。
 */
function selftestSection(file: EntryFile): string {
  const code = file.code ?? '';
  const items = selftestItems(file);
  if (!items.length) return '';
  const prog = selftestProgress(file);
  const rows = items
    .map((it, i) => {
      const key = selftestKey(file, i);
      const done = isProbeDone(key);
      return `<li class="stq${done ? ' done' : ''}">
      <span class="sttag">L${selftestLevel(it)} · ${escapeHtml(it.tag)}</span>
      <span class="stbody"><span class="stq-text">${renderInline(it.q)}</span>
      <span class="stbar">会标准：${renderInline(it.bar)}</span></span>
      <button class="stbtn${done ? ' done' : ''}" data-selftest="${escapeHtml(key)}" data-unit="${escapeHtml(code)}"
        aria-pressed="${done}">${done ? '✓ 能答' : '能答？'}</button>
    </li>`;
    })
    .join('');
  return `<section class="docsec selftest"${levelAttrs(prog)}>
  <h2 class="dochead">自测 · 不看书能答吗？</h2>
  <div class="docbody">
  <div class="sthead">
    <span class="stnow">${levelText(prog)}</span>
    <span class="stmeta">${answeredText(file)}</span>
  </div>
  <p class="stnote">${escapeHtml(selftestNextText(prog))}</p>
  <p class="stnote">先口头作答，再对照「会标准」自评。L1–L5 逐级记录，每级题全部通过才升级；L3 才计入「下一步」的已达标前序。答不出就回正文，不用凭感觉点亮。</p>
  <ul class="stlist">${rows}</ul>
  </div>
  </section>`;
}


/**
 * 自测区头部三段文字 —— 渲染与「点了之后就地刷新」**共用同一组函数**，
 * 避免两处文案各写一遍后漂移（app.ts 的 patchSelftestHead 直接调这三个）。
 */
export interface SelftestProgressView {
  level: number;
  next: 1 | 2 | 3 | 4 | 5 | null;
  remaining: number;
  nextTotal: number;
}

export function levelAttrs(prog: SelftestProgressView): string {
  const next = prog.next == null ? '' : ` data-next="${prog.next}" data-remaining="${prog.remaining}"`;
  return ` data-level="${prog.level}"${next}`;
}

export function levelText(prog: SelftestProgressView): string {
  return `当前 <b>L${prog.level}</b>${prog.next == null ? '' : ` · 下一级 L${prog.next}`}`;
}

export function answeredText(file: EntryFile): string {
  const items = selftestItems(file);
  const done = items.filter((_, i) => isProbeDone(selftestKey(file, i))).length;
  return `已答 ${done}/${items.length} 题`;
}

export function selftestNextText(prog: SelftestProgressView): string {
  if (prog.next == null) return '五级全部达标：本单元已到 L5 上限，回正文做变式，或去下一条线。';
  if (prog.remaining === 0) return `L${prog.next} 的 ${prog.nextTotal} 题都已能答 —— 本单元已可计入 L${prog.next}。`;
  return `下一级 L${prog.next} 还差 ${prog.remaining}/${prog.nextTotal} 题。`;
}

function mirrorLink(e: Entry): string {
  const to = (e as unknown as { mirror_of?: string }).mirror_of;
  if (!to) return '';
  const q = (e as unknown as { question_id?: string }).question_id ?? '';
  return ` <a class="mirror" data-goto="${escapeHtml(to)}" title="题干真源在这一年的真题单元">→ 真题 ${escapeHtml(q)}</a>`;
}

/** 页头标签：只列**数据里有**的字段，不编造 */
function docMeta(file: EntryFile): string[] {
  const out: string[] = ['doc-card'];
  const m = ((file as unknown as { meta?: Record<string, unknown> }).meta ?? {}) as Record<string, unknown>;
  if (typeof m.kind === 'string') out.push(String(m.kind));
  if (typeof m.kp === 'string') out.push(String(m.kp));
  if (typeof m.requirement === 'string') out.push(String(m.requirement));
  if (typeof m.tag === 'string') out.push(String(m.tag));
  if (typeof m.tier === 'string') out.push(`档位 ${String(m.tier)}`);
  if (typeof m.examCount === 'number' && m.examCount > 0) out.push(`真题 ${m.examCount} 题`);
  if (typeof m.surveyId === 'string') out.push(String(m.surveyId));
  if (typeof m.status === 'string' && m.status) out.push(String(m.status));
  if (m.lecture && typeof m.lecture === 'object') out.push('章讲义');
  if (Array.isArray(m.kps) && m.kps.length) out.push(`${m.kps.length} 考点`);
  out.push(`${file.entries.length} 节`);
  return out;
}
