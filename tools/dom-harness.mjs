/**
 * 进程内 DOM 验收台（无需浏览器）
 *
 * 为什么存在：本机 Chromium 类浏览器在本环境里会被强杀（SIGTERM/137），无法截图；
 * 而「不白屏 / 四问 tab / 限定词表走真数据 / 反例就地展开 / 按需加载 / 零外部请求」
 * 这类验收点本质是 DOM 断言，不是像素比对。所以：
 *
 *   esbuild 把 src/main.ts 打成 IIFE（jsdom 不执行 ESM）
 *   → jsdom 载入根 index.html 的骨架
 *   → 注入 fetch polyfill：索引从内存给，词条正文**按需从磁盘读**（等价 vite dev 中间件）
 *   → 跑起来后对真实 DOM 断言；期望值一律从 json/ 真数据推导，不写死
 *
 * 用法（在 learning-web 目录）：
 *   node tools/dom-harness.mjs [代号…]
 *   node tools/dom-harness.mjs --all      # 遍历全库每个已生成的单元（断言模式）
 *   node tools/dom-harness.mjs --audit    # 全量体检：不断言，**收集问题**落结构化清单
 * 环境变量：HARNESS_JSON=<dir> 指向另一份 json/（默认 <repo>/json）
 *
 * 断言模式与体检模式的分工：前者答「有没有回归」，后者答「318 个单元里哪些坏了、坏在哪一级」。
 * 体检只读 json/ 与 dist/，不改任何内容文件。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const esbuild = require('esbuild');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 学科（`--subject math|cs408|math1|projects`，默认 math）。
 * 四站是同仓多入口：入口 HTML / 入口 TS / 数据根各一套，其余完全共用。
 * 默认 math 保证既有调用（`npm run check`）行为一字不变。
 *
 * 这里必须写一张静态表：subjects.ts 在后面才用 esbuild 载入，模块级拿不到。
 * 表只影响 harness 自己的路径，真源仍是 subjects.ts（`npm run check:content-map` 校验站点唯一性）。
 */
const SUBJECT_ID = (() => {
  const i = process.argv.indexOf('--subject');
  return i >= 0 ? process.argv[i + 1] : 'math';
})();
const ENTRY = {
  math: { root: 'json/', html: 'index.html', ts: 'src/main.ts' },
  cs408: { root: 'cs408/json/', html: 'cs408.html', ts: 'src/main-cs408.ts' },
  math1: { root: 'kaoyan/json/', html: 'math1.html', ts: 'src/main-math1.ts' },
  projects: { root: 'projects/json/', html: 'projects.html', ts: 'src/main-projects.ts' },
}[SUBJECT_ID] ?? { root: 'json/', html: 'index.html', ts: 'src/main.ts' };
const DATA_ROOT = ENTRY.root;
const ENTRY_HTML = ENTRY.html;
const ENTRY_TS = ENTRY.ts;
const INDEX_URL = `${DATA_ROOT}index.json`;

const JSON_DIR = process.env.HARNESS_JSON ?? path.join(ROOT, DATA_ROOT.replace(/\/$/, ''));

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) pass += 1;
  else {
    fail += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  }
  return !!cond;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const textOf = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** 把 TS 模块打成 CJS 再 require（复用生产代码，规则不写第二份） */
async function requireTs(entry) {
  const res = await esbuild.build({
    entryPoints: [path.join(ROOT, entry)],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    target: 'es2022',
    logLevel: 'silent',
  });
  const m = { exports: {} };
  new Function('module', 'exports', 'require', res.outputFiles[0].text)(m, m.exports, require);
  return m.exports;
}

/** 索引（元数据）——启动时页面只该拉这一份 */
let INDEX = null;
let ALL_CODES = [];

/* ------------------------------------------------------- 打包 + 载入 */

let bundleCache = null;
async function bundle() {
  if (bundleCache) return bundleCache;
  const result = await esbuild.build({
    entryPoints: [path.join(ROOT, ENTRY_TS)],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
    platform: 'browser',
    logLevel: 'silent',
    loader: { '.css': 'text' }, // 样式与断言无关，当文本读掉，避免产出额外文件
    define: { 'process.env.NODE_ENV': '"development"' },
  });
  const js = result.outputFiles.find((f) => !f.path.endsWith('.css')) ?? result.outputFiles[0];
  if (!js) throw new Error('esbuild 未产出 js');
  bundleCache = js.text;
  return bundleCache;
}

/** 把根 index.html 的 module 脚本换成内联 IIFE，并注入 fetch polyfill */
function buildPage(bundleJs) {
  const html = fs.readFileSync(path.join(ROOT, ENTRY_HTML), 'utf8');
  const shim = `
    window.__requests = [];
    window.__miss = [];
    window.fetch = function (input) {
      const url = typeof input === 'string' ? input : input.url;
      const clean = String(url).split('?')[0];
      window.__requests.push(clean);
      let body = null;
      const root = window.__dataRoot;
      if (clean === root + 'index.json') {
        body = window.__indexJson;
      } else if (clean.startsWith(root)) {
        const abs = window.__jsonDir + '/' + clean.slice(root.length);
        try { body = window.__fs.readFileSync(abs, 'utf8'); } catch (e) { body = null; }
        if (window.__mutate) body = window.__mutate(clean, body);
      }
      if (body === null) {
        window.__miss.push(clean);
        return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found',
          text: () => Promise.resolve('') });
      }
      return Promise.resolve({ ok: true, status: 200, statusText: 'OK',
        text: () => Promise.resolve(body) });
    };
  `;
  const marker = `<script type="module" src="/${ENTRY_TS}"></script>`;
  if (!html.includes(marker)) throw new Error(`${ENTRY_HTML} 缺少入口脚本标记：${marker}`);
  // 只内联 shim（它引用 window 上的全局）；bundle 稍后由 mount() 手动 eval，
  // 这样「注入全局」一定发生在应用启动之前 ——
  // 否则启动时那次 fetch 会在 JSDOM 构造期读到还没赋值的 __indexJson。
  void bundleJs;
  return html.replace(marker, () => `<script>${shim}</script>`);
}

/** 上一次 mount 的时延（毫秒）：分帧挂载后，首卡与「全部卡片就绪」是两个不同的时刻 */
let mountTiming = { firstMs: 0, readyMs: 0 };

async function mount(bundleJs, opts = {}) {
  const dom = new JSDOM(buildPage(bundleJs), {
    url: `http://localhost:5173/${opts.hash ? `#/${opts.hash}` : ''}`,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  dom.window.__fs = fs;
  dom.window.__jsonDir = JSON_DIR;
  dom.window.__dataRoot = DATA_ROOT;
  dom.window.__indexJson = JSON.stringify({ units: INDEX.units });
  if (opts.mutate) dom.window.__mutate = opts.mutate;
  const t0 = Date.now();
  dom.window.eval(bundleJs);
  // 启动是异步的：索引 → 目标单元按需拉取 → 渲染。等渲染真出现（而不是固定 sleep）
  const d = dom.window.document;
  const reader = d.getElementById('reader');
  let firstMs = 0;
  let readyMs = 0;
  while (Date.now() - t0 < (opts.timeout ?? 3000)) {
    const txt = reader.textContent ?? '';
    // 页头 + 首卡 = 2 个子节点：这一时刻是「点完目录有东西看」的真实起点
    if (!firstMs && reader.children.length > 1) firstMs = Date.now() - t0;
    // data-ready 由 renderReader 在分帧挂载全部结束后置 1；缺省视为就绪（兼容旧渲染路径）
    if (
      reader.children.length > 0 &&
      reader.dataset.ready !== '0' &&
      !txt.includes('按需加载') &&
      !txt.includes('加载中')
    ) {
      readyMs = Date.now() - t0;
      break;
    }
    await sleep(5);
  }
  // viz 模块改成动态 import 后先是 `.viz-loading` 占位、到位再替换：
  // 等它落定再让断言跑，否则「演示已渲染」会误报（chunk 在真实浏览器里还要走网络）
  const t1 = Date.now();
  while (Date.now() - t1 < 800 && reader.querySelectorAll('.viz-loading').length) await sleep(10);
  mountTiming = { firstMs, readyMs };
  await sleep(opts.settle ?? 10);
  return dom;
}

/* ------------------------------------------------------- 单元级断言 */

async function runUnit(bundleJs, code) {
  const meta = INDEX.units.find((u) => u.code === code);
  if (!meta) {
    check(`[${code}] 索引里有该单元`, false);
    return null;
  }
  const unit = JSON.parse(fs.readFileSync(path.join(JSON_DIR, code.split('.')[0], `${code}.json`), 'utf8'));
  const entryIds = new Set(unit.entries.map((e) => e.id));
  const quant = unit.entries.find((e) => e.id.endsWith('.quantifiers'));
  const hasQuant = !!quant;
  const qId = quant?.id ?? '';
  const vizFront = unit.entries.filter((e) => e.viz && typeof e.viz.module === 'string');
  const vizPlanned = unit.entries.filter((e) => e.viz?.status === 'planned-backend');

  const dom = await mount(bundleJs, { hash: code });
  const d = dom.window.document;
  const reader = d.getElementById('reader');
  const overlay = d.getElementById('overlay-root');
  const aside = d.getElementById('aside');
  const reqs = () => dom.window.__requests ?? [];
  const p = (s, c, det) => check(`[${code}] ${s}`, c, det);

  // ── 等首屏**真正**渲染完再断言
  // 固定 10ms 的 settle 只够挂载，工程线单篇 NOTES 上百 KB、上千条公式，KaTeX 在 jsdom 里
  // 逐条同步渲染，断言会跑到「加载中」面板上（那样后面的断言全是假绿）。这里按体积给预算。
  const unitSize = fs.statSync(path.join(JSON_DIR, meta.path.replace(DATA_ROOT, ''))).size;
  const readyBudget = unitSize > 50_000 ? 15_000 : 5_000;
  const tReady = Date.now();
  while (
    Date.now() - tReady < readyBudget &&
    (reader.dataset.loading === '1' || reader.dataset.ready !== '1')
  ) {
    await sleep(50);
  }
  p('首屏在预算内渲染完成（不卡在加载中）',
    reader.dataset.loading !== '1',
    `等了 ${Date.now() - tReady}ms / 上限 ${readyBudget}ms`);

  // ── 按需加载：首个请求是索引，之后是当前单元；允许「空闲预取」多拉 **至多 2 个邻居**
  // （prefetch 是文档化行为：setTimeout/requestIdleCallback 200ms 后拉 idx+1/idx+2，
  //   与本断言的采样窗口存在时序竞争 —— 之前 <=2 的写法靠机器忙碌偶然变绿）。
  //   真不变式：**绝不全库拉取**（<=4 条）且索引第一。
  const afterBoot = reqs().slice();
  p('请求总数有界（索引 + 当前 + ≤2 预取邻居，绝不拉全库）',
    afterBoot.length <= 4,
    `请求 ${afterBoot.length} 条：${afterBoot.join(', ')}`);
  p('请求全在 json/ 下（零外部请求）', afterBoot.every((u) => u.startsWith(DATA_ROOT)),
    afterBoot.filter((u) => !u.startsWith(DATA_ROOT)).join(', '));
  p('首个请求就是索引', afterBoot[0] === INDEX_URL, afterBoot[0] ?? '(无)');
  p('第二个请求是当前单元', afterBoot[1] === meta.path, afterBoot.slice(1, 3).join(', '));

  // ── 基本渲染
  p('无致命错误浮层', !textOf(overlay).includes('数据索引读取失败'), textOf(overlay).slice(0, 120));
  p('阅读区非空（不白屏）', reader.children.length > 0);
  p('页面标题含代号', textOf(reader.querySelector('.pagehead h1')).includes(code));
  // ── 显示码（src/modules/codes.ts）：单单元章（code 无 `.`）的子节必须显示为
  //    `<code>.1`（用户口径：子节要有子标号）；内部码（data-goto/路由）保持原样。
  const selfNode = d.querySelector('#sidebar .node.on');
  if (!code.includes('.')) {
    p('单单元章侧栏显示码补 .1',
      selfNode?.querySelector('.code')?.textContent === `${code}.1`,
      `got=${selfNode?.querySelector('.code')?.textContent}`);
    p('单单元章 data-goto 保持内部码',
      selfNode?.getAttribute('data-goto') === code,
      `got=${selfNode?.getAttribute('data-goto')}`);
    p('正文 h1 显示码补 .1',
      textOf(reader.querySelector('.pagehead h1')).includes(`${code}.1`),
      textOf(reader.querySelector('.pagehead h1')).slice(0, 30));
  } else {
    p('多单元章显示码不加后缀',
      selfNode?.querySelector('.code')?.textContent === code,
      `got=${selfNode?.querySelector('.code')?.textContent}`);
  }
  const isDoc = unit.schema === 'doc-card/v1';
  const cards = [...reader.querySelectorAll('.card')].filter((c) => !c.classList.contains('pagehead'));
  if (isDoc) {
    // 搬运来的文档按「节」渲染，不出词条卡；断言改成「节数 == 词条数、标题层级在」
    const secs = [...reader.querySelectorAll('.docsec')];
    p('文档分节已渲染（节数 == 词条数）', secs.length === unit.entries.length,
      `sections=${secs.length} entries=${unit.entries.length}`);
    const heads = reader.querySelectorAll('.dochead');
    const wantHeads = unit.entries.filter((e) => (e.level ?? 2) > 0 && (e.title ?? '').trim()).length;
    p('小节标题全部渲染', heads.length === wantHeads, `heads=${heads.length} want=${wantHeads}`);
    const mirrors = reader.querySelectorAll('.mirror');
    const wantMirror = unit.entries.filter((e) => e.mirror_of).length;
    p('真题镜像指针数量一致', mirrors.length === wantMirror, `mirrors=${mirrors.length} want=${wantMirror}`);
    p('镜像指针指向真题单元',
      [...mirrors].every((a) => /^EX\d{2}\.\d$/.test(a.getAttribute('data-goto') ?? '')),
      [...mirrors].slice(0, 3).map((a) => a.getAttribute('data-goto')).join(','));
  } else {
    p('定理卡已渲染', cards.length > 0, `cards=${cards.length}`);
  }
  p('顶栏字母块非空', d.querySelectorAll('#header .chapters b').length > 0);
  // 侧栏改成「域 → 章 → 单元」三层且单元懒渲染（2026-10-30）：默认只展开当前章，
  // 所以首屏节点数应 **≤** 单元数；展开全部章之后必须一个不少（懒渲染不能丢内容）。
  const nodesLazy = d.querySelectorAll('#sidebar .node').length;
  p('左栏分层懒渲染（首屏节点数 ≤ 单元数）',
    nodesLazy > 0 && nodesLazy <= INDEX.units.length,
    `nodes=${nodesLazy} units=${INDEX.units.length}`);
  p('当前单元在左栏可见且高亮', !!selfNode);
  p('左栏有域分组（域 → 章 → 单元三层）', d.querySelectorAll('#sidebar .dom').length > 0,
    `domains=${d.querySelectorAll('#sidebar .dom').length}`);
  for (const det of d.querySelectorAll('#sidebar details.chap')) det.setAttribute('open', '');
  await sleep(10); // <details> 的 toggle 事件是异步派发的，等一拍再数
  p('展开全部章后左栏节点数 == 索引单元数',
    d.querySelectorAll('#sidebar .node').length === INDEX.units.length,
    `nodes=${d.querySelectorAll('#sidebar .node').length} units=${INDEX.units.length}`);
  p('右栏有掌握度/依赖/被用于',
    textOf(aside).includes('依赖') && textOf(aside).includes('被用于'));
  p('frontier 横幅已算出', textOf(d.getElementById('frontier')).includes('今天该学'));

  // ── 四问 tab（仅 entry-card；doc-card 没有分页）
  if (!isDoc) {
    const tabsAll = cards.flatMap((c) => [...c.querySelectorAll('.tabs button')]);
    if (unit.entries.some((e) => ['statement', 'intuition', 'proof', 'application'].includes(e.type))) {
      p('四问 tab 存在', tabsAll.length > 0, tabsAll.slice(0, 8).map(textOf).join('/'));
    }
    p('tab 数 == 面板数（逐卡）',
      cards.every((c) => c.querySelectorAll('.pane').length === c.querySelectorAll('.tabs button').length));
    p('默认每卡至多一个面板展开',
      cards.every((c) => c.querySelectorAll('.pane.on').length <= 1));
  }

  // ── 限定词拆解（灵魂词条）：走真数据、默认可见、可点行锚到真实词条
  const qTableLines = quant ? (quant.content?.match(/^\s*\|/gm)?.length ?? 0) : 0;
  const expectTable = qTableLines >= 2;
  if (hasQuant) {
    const qbody = reader.querySelector(`.qbody[data-q="${qId}"]`);
    p('限定词块存在且指向 .quantifiers 词条', !!qbody, qbody?.dataset.q ?? '(无)');
    p('限定词块默认展开（不在 .pane 内）', !!qbody && !qbody.closest('.pane'));
    if (expectTable) {
      const qTable = qbody?.querySelector('table');
      p('限定词表带 class=q', qTable?.classList.contains('q') === true);
      const heads = [...(qTable?.querySelectorAll('thead th') ?? [])].map(textOf);
      const cols = heads.length;
      // 列数随数据形态：标准形 4 列、博物馆 3 列、方差缩减 5 列（多一列「技术」）。
      // 渲染器本来就按数据出列，这里只防「被竖线切坏」这类结构错误。
      p('限定词表列数合理（3–6 列）', cols >= 3 && cols <= 6, `cols=${cols} ${heads.join(' | ')}`);
      const trs = [...(qTable?.querySelectorAll('tbody tr') ?? [])];
      const widths = trs.map((tr) => tr.querySelectorAll('td').length);
      p('表头列数与每行单元格数一致',
        widths.length > 0 && widths.every((w) => w === cols),
        `heads=${cols} rows=${[...new Set(widths)].join(',')} 错行=${trs
          .map((tr, i) => [i, tr.querySelectorAll('td').length])
          .filter(([, w]) => w !== cols)
          .map(([i, w]) => `${i}:${w}`)
          .join(',')}`);
      p('限定词表行数 >= 2', widths.length >= 2, `rows=${widths.length}`);
    }
  }

  // 可点行（若有）必须锚到同文件真实词条。数据里只有部分单元在表行 / keywords 里
  // 点名引用别的词条（A2.3、A3 的引用写在正文段落里），这是数据形态，不是缺陷。
  const qrows = [...reader.querySelectorAll('tr.qrow[data-cx]')];
  p('可点行（若有）全部锚到同文件真实词条',
    qrows.every((r) => entryIds.has(r.dataset.cx ?? '')),
    `qrows=${qrows.length} 非法=${qrows.map((r) => r.dataset.cx).filter((i) => !entryIds.has(i ?? '')).join(',')}`);
  if (qrows.length) {
    p('可点行带 caret 指示', !!qrows[0]?.querySelector('.caret'));
    const hashBefore = dom.window.location.hash;
    const before = reader.querySelectorAll('tr.detail').length;
    qrows[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    const after = reader.querySelectorAll('tr.detail').length;
    p('点行后就地插入展开体', after === before + 1, `${before}→${after} cx=${qrows[0].dataset.cx}`);
    p('展开体含反例正文', textOf(reader.querySelector('tr.detail')).length > 40);
    p('展开不跳页（hash 不变）', dom.window.location.hash === hashBefore);
    qrows[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    p('再点折叠', reader.querySelectorAll('tr.detail').length === before);
  }

  // ── 文字引用 → 可点元素（三种形式各自的失败处理）
  const refs = [...reader.querySelectorAll('.ref')];
  const pseudo = refs.filter((r) => /^[a-z]\.[a-z]$/.test(textOf(r)));
  p('「a.e.」这类 subject.slot 伪引用未被误包', pseudo.length === 0, pseudo.map(textOf).join(', '));
  const selfLinks = refs.filter((r) => r.dataset.goto === code);
  p('无指向当前代号的空跳转', selfLinks.length === 0, selfLinks.map(textOf).join(', '));
  const inFileRefs = refs.filter((r) => r.dataset.ref);
  p('同文件引用全部锚到真实词条',
    inFileRefs.every((r) => entryIds.has(r.dataset.ref ?? '')),
    inFileRefs.map((r) => r.dataset.ref).filter((i) => !entryIds.has(i ?? '')).join(','));
  const cross = refs.filter((r) => r.dataset.goto);
  p('跨代号引用带 cross 样式', cross.length === 0 || cross.every((r) => r.classList.contains('cross')));

  // ── 徽标（entry-card/v2 契约）
  // `doc-card/v1` 是从 notebook 搬运的文档，词条没有 generated_by / status 两字段
  // （它们不是模型生成的内容），因此这两条只对 v2 生效；页面本身仍要被完整断言。
  const allText = textOf(reader);
  if (unit.schema !== 'doc-card/v1') {
    p('显示 status 徽标', allText.includes('drafted'));
    p('显示 generated_by', /glm|deepseek|kimi/.test(allText));
  }

  // ── viz
  const vizRendered = reader.querySelectorAll('.vizslot .vizitem .viz').length;
  const unregistered = allText.match(/尚未在前端注册/g)?.length ?? 0;
  const plannedEntries = vizFront.length + vizPlanned.length;
  if (plannedEntries) {
    p('每个 viz 词条都有独立渲染体',
      vizRendered === plannedEntries, `渲染 ${vizRendered} / 应有 ${plannedEntries}`);
    p('无「模块挂载失败」占位', (allText.match(/模块挂载失败/g)?.length ?? 0) === 0);
  }
  if (vizFront.length) {
    p(`viz 档1 全部已注册（${vizFront.map((e) => e.viz.module).join(',')}）`,
      unregistered === 0, `未注册 ${unregistered} 处`);
    p('viz 有实际渲染体', vizRendered > 0, `viz=${vizRendered}`);

    // 声明式模块才有 .readout/.invariant；交互式决策树用 HTML 自己表达
    const specModules = vizFront.filter((e) => e.viz.module !== 'inequality-decision-tree');
    if (specModules.length) {
      const readouts = [...reader.querySelectorAll('.vizslot .viz .readout .r b')].map(textOf);
      p('viz 读数非空', readouts.length > 0, `读数 ${readouts.length} 条`);
      p('viz 读数无 NaN/undefined',
        readouts.every((t) => !/NaN|undefined/.test(t)),
        readouts.filter((t) => /NaN|undefined/.test(t)).slice(0, 3).join(' | '));
      p('viz invariant 自检通过（无 .bad）',
        reader.querySelectorAll('.vizslot .invariant.bad').length === 0);
      p('viz invariant 徽标已渲染',
        reader.querySelectorAll('.vizslot .invariant .badge.ok').length > 0);
      p('viz 说明文字非空',
        [...reader.querySelectorAll('.vizslot .v-note')].every((el) => textOf(el).length > 0));
    } else {
      p('决策树渲染出全部信号按钮',
        reader.querySelectorAll('.vizslot .dt-opts [data-b]').length >= 5);
      const first = reader.querySelector('.vizslot .dt-opts [data-b]');
      if (first) {
        first.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
        p('点信号后给出该用哪个不等式',
          textOf(reader.querySelector('.vizslot .dt-card')).length > 40);
        p('误用现场含具体数字',
          /[0-9]/.test(textOf(reader.querySelector('.vizslot .dt-misuse'))));
      }
    }

    // 拖滑块：只能断言「零请求 + 不破坏 invariant」。
    // 不能断言读数必变 —— bump 这类反例的整条叙事就是「∫fₙ ≡ 1 与 n 无关」。
    const range = reader.querySelector('.vizslot input[type=range]');
    if (range) {
      const reqBefore = reqs().length;
      const mid = (Number(range.min) + Number(range.max)) / 2;
      range.value = String(Number(range.value) > mid ? Number(range.min) : Number(range.max));
      range.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      p('拖滑块零请求', reqs().length === reqBefore, `+${reqs().length - reqBefore} 个请求`);
      p('拖滑块后 invariant 仍通过',
        reader.querySelectorAll('.vizslot .invariant.bad').length === 0);
      p('滑块读数已同步', textOf(reader.querySelector('.vizslot .nval')).length > 0);
    }
  }

  // ── 零外部请求
  const external = reqs().filter((u) => !u.startsWith(DATA_ROOT));
  p('零外部请求（断网可用）', external.length === 0, external.slice(0, 5).join(', '));

  // ── 掌握度 +1 只该动「目录那一行 + 顶栏那个字母块」，**不许**整树重建目录
  //    （判据：sidebar DOM 变更节点数 ≤3；见 2026-10-30 增量刷新）
  const masteryEl = reader.querySelector('.card [data-mastery]');
  const sideEl = d.getElementById('sidebar');
  if (masteryEl && sideEl) {
    const mrecs = [];
    const mo = new dom.window.MutationObserver((list) => mrecs.push(...list));
    mo.observe(sideEl, { childList: true, subtree: true, characterData: true, attributes: true });
    masteryEl.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    mo.disconnect();
    p('掌握度 +1 不重建侧栏根节点', !mrecs.some((r) => r.target === sideEl),
      `records=${mrecs.length}`);
    const touched = new Set(mrecs.map((r) => r.target));
    p('掌握度 +1 只触及 ≤3 个侧栏节点', touched.size <= 3, `触及 ${touched.size} 个`);
  }

  // ── 切换单元：新单元**必须**被拉；额外的只允许是「空闲预取相邻单元」（上限 2）
  const other = INDEX.units.find((u) => u.code !== code);
  if (other) {
    await sleep(300); // 让「空闲预取」的定时器先落地，避免把它的请求算进下面的窗口
    const n0 = reqs().length;
    dom.window.location.hash = `#/${other.code}`;
    await sleep(450);
    const added = reqs().slice(n0);
    // 目标可能已被「空闲预取」提前拉进内存（这是设计），所以看的是**渲染结果**而非请求
    p('切到别的单元后正文换成它',
      textOf(reader.querySelector('.pagehead h1')).includes(other.code),
      textOf(reader.querySelector('.pagehead h1')).slice(0, 40));
    void added;
    p('不重拉已看过的单元', !added.includes(meta.path), added.join(', '));
    // 真正的指标：按需加载没有退化成全量 —— 全程拉过的单元文件数要远小于全库
    const fetchedUnits = new Set(
      reqs().filter((u) => u !== INDEX_URL && u.startsWith(DATA_ROOT)),
    );
    p('全程拉过的单元文件数远小于全库（未退化成全量）',
      fetchedUnits.size <= 8 && fetchedUnits.size < INDEX.units.length,
      `拉过 ${fetchedUnits.size} / 全库 ${INDEX.units.length}`);

    // 切回：原单元已在内存，不该重新请求它的文件
    const n1 = reqs().length;
    dom.window.location.hash = `#/${code}`;
    await sleep(350);
    const back = reqs().slice(n1);
    p('切回已看过的单元不重拉它的文件', !back.includes(meta.path), back.join(', '));
    // 等「加载中」消失，而不是死等 350ms：工程线单篇 NOTES 可达数万字，
    // 固定睡眠在慢机上会把「渲染慢」误判成「缓存失效」。超过 3s 仍加载中才算 FAIL。
    // 判据看 `data-loading`，不看正文文字：笔记里本来就可能出现「按需加载」四个字。
    const t0 = Date.now();
    while (Date.now() - t0 < readyBudget && reader.dataset.loading === '1') await sleep(50);
    p('切回后正文直接就位（不再出现加载中）',
      reader.dataset.loading !== '1',
      `等了 ${Date.now() - t0}ms`);
  }

  return dom;
}

/* ---------------------------------------------------- 坏 JSON / 错误浮层 */

async function runErrorPath(bundleJs, code) {
  const meta = INDEX.units.find((u) => u.code === code);
  const target = meta?.path ?? `${DATA_ROOT}${code.split('.')[0]}/${code}.json`;
  const dom = await mount(bundleJs, {
    hash: code,
    mutate: (p2, body) => (p2 === target ? '{ "schema": "entry-card/v2", ' : body),
  });
  const bd = dom.window.document;
  const overlayText = textOf(bd.getElementById('overlay-root'));
  check('坏 JSON → 浮层可见（绝不白屏）', overlayText.length > 0);
  check('浮层指明文件名', overlayText.includes(`${code}.json`), overlayText.slice(0, 160));
  // 侧栏是分层懒渲染的（2026-10-30）：只验「结构还在」，不再拿节点数当单元数
  check('坏 JSON 时侧栏仍渲染（索引没坏）',
    bd.querySelectorAll('#sidebar .dom').length > 0 && bd.querySelectorAll('#sidebar .node').length > 0,
    `doms=${bd.querySelectorAll('#sidebar .dom').length} nodes=${bd.querySelectorAll('#sidebar .node').length}`);
  dom.window.close();
}

/* --------------------------------------------- 分帧挂载的并发正确性（D-D） */

/**
 * 分帧挂载唯一的正确性风险：两次渲染交错往同一个容器里 append。
 * 这里**不等待**首单元挂完就切走，检验 renderToken 守卫是否真的让旧批次停手。
 * 用全库卡片最多的两个单元，把窗口拉到最大。
 */
async function runRace(bundleJs, codeA, codeB) {
  const dom = await mount(bundleJs, { hash: codeA, timeout: 5000 });
  const d = dom.window.document;
  const reader = d.getElementById('reader');
  // 立刻切走，不等 A 挂完：旧批次必须停手，且新单元要能正常就绪
  const t0 = Date.now();
  dom.window.location.hash = `#/${codeB}`;
  let firstMs = 0;
  let readyMs = 0;
  while (Date.now() - t0 < 5000) {
    const h1 = textOf(reader.querySelector('.pagehead h1'));
    const mine = h1.includes(codeB);
    if (!firstMs && mine && reader.children.length > 1) firstMs = Date.now() - t0;
    if (mine && reader.dataset.ready === '1') {
      readyMs = Date.now() - t0;
      break;
    }
    await sleep(5);
  }
  console.log(`  切换时延：首卡 ${firstMs}ms · 全部就绪 ${readyMs}ms`);
  check('快速连切后正文是后者（旧批次已停手）',
    textOf(reader.querySelector('.pagehead h1')).includes(codeB),
    textOf(reader.querySelector('.pagehead h1')).slice(0, 40));
  const groups = [...reader.querySelectorAll('.card[data-group]')].map((c) => c.getAttribute('data-group'));
  check('快速连切后卡片不重复',
    new Set(groups).size === groups.length, `卡片 ${groups.length} 个，去重后 ${new Set(groups).size} 个`);
  check('快速连切后全部卡片就绪（data-ready=1）', reader.dataset.ready === '1', reader.dataset.ready ?? '(无)');
  // 时延阈值按 **jsdom 口径**放宽（真浏览器预算另见计划表：首卡 200ms / 全部就绪 800ms）。
  // 实测同一份代码连跑三次：首卡 97 / 103 / 257ms，全部就绪 627 / 710 / 812 / 1075ms ——
  // jsdom 没有真实排版引擎、单元 JSON 走磁盘同步读，机器负载能让数字翻 2.5 倍。
  // 因此这里只当**回归护栏**（防止退回「全量同步渲染」那种量级），不当性能预算。
  // 时延判据分两档（2026-10-31）：
  //   **理想档**（真浏览器预算 200/800ms 的 jsdom 换算）只提示、不判失败；
  //   **红线档**（3 倍）才失败 —— 用来抓「量级回归」（比如又退回全量同步挂载），
  //   而不是抓机器负载。实测：同一份代码在 load 8.8 的机器上从 600ms 漂到 1900ms。
  const ideal = { first: 400, ready: 1600 };
  const red = { first: ideal.first * 3, ready: ideal.ready * 3 };
  if (firstMs > ideal.first || readyMs > ideal.ready) {
    console.log(
      `  提示：时延高于理想档（首卡 ${firstMs}ms / 就绪 ${readyMs}ms，理想 ≤${ideal.first}/≤${ideal.ready}）` +
        ` —— 多为机器负载，红线档 ≤${red.first}/≤${red.ready}`,
    );
  }
  check(`切到重单元后首卡就位（红线 ≤${red.first}ms）`, firstMs > 0 && firstMs <= red.first, `${firstMs}ms`);
  check(`切到重单元后全部卡片就绪（红线 ≤${red.ready}ms）`, readyMs > 0 && readyMs <= red.ready, `${readyMs}ms`);
  dom.window.close();
}

/* ------------------------------------------- standalone 单文件快照验收 */

/**
 * dist/knowledge.html 是「双击即开」的单文件快照（DESIGN §9.1）：
 * 数据内联 + IIFE + 零外部请求。这里在 jsdom 里真加载一遍，确认它不是空壳。
 */
async function runStandalone(subj) {
  // 2026-11-14：单文件快照按学科拆开（math 仍叫 knowledge.html，其余 knowledge-<id>.html）
  const name = SUBJECT_ID === 'math' ? 'knowledge.html' : `knowledge-${SUBJECT_ID}.html`;
  const file = path.join(ROOT, 'dist', name);
  if (!fs.existsSync(file)) {
    console.log(`\n8) standalone 快照 —— 未生成（跳过；npm run build:standalone -- --subject ${SUBJECT_ID}）`);
    return;
  }
  console.log(`\n8) standalone 单文件快照 dist/${name}`);
  const html = fs.readFileSync(file, 'utf8');

  check('无 <script src> / <link href>（零外部请求）',
    !/<(script|link)[^>]*(src|href)=/.test(html));
  check('无外部 url() 引用（字体已 base64 内联）', !/url\((?!data:|#)/.test(html));
  // 2026-10-30 起数据是 gzip+base64 块（原先 9.7MB 明文内联，解析太贵）
  check('数据已内联（gzip base64 块存在）',
    /window\.__kbPayload\s*=\s*"[A-Za-z0-9+/=]{5000,}"/.test(html),
    `HTML ${(html.length / 1048576).toFixed(2)}MB`);
  // 2026-11-14：4.5 → 4.6MB —— 工程线新增「考点自测」内容层（+约 30KB，30 项目 135 题），
  // 旧预算在此之前就已被数学线顶到 4.50。下个内容大户出现时优先给快照瘦身，不要再抬预算。
  check('快照体积 ≤4.6MB（解压前的传输/解析成本）', html.length <= 4.6 * 1024 * 1024,
    `${(html.length / 1048576).toFixed(2)}MB`);

  const dom = new JSDOM(html, {
    url: `file://${file}`,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    // jsdom 不实现 DecompressionStream / Response / Blob.stream：
    // 注入 Node 的同名实现，快照才能走**真实**的解压路径（而不是绕过它）
    beforeParse(window) {
      window.DecompressionStream = globalThis.DecompressionStream;
      window.Response = globalThis.Response;
      window.Blob = globalThis.Blob;
    },
  });
  const d = dom.window.document;
  const reader = d.getElementById('reader');
  const t0 = Date.now();
  while (Date.now() - t0 < 3000) {
    const txt = reader.textContent ?? '';
    if (reader.children.length > 0 && !txt.includes('按需加载') && !txt.includes('加载中')) break;
    await sleep(10);
  }
  check('快照能渲染出阅读区（file:// 双击可用）', reader.children.length > 0);
  check('快照无致命浮层',
    !textOf(d.getElementById('overlay-root')).includes('数据索引读取失败'));
  check('快照顶栏字母块非空', d.querySelectorAll('#header .chapters b').length > 0);
  check('快照首屏不是空页',
    textOf(reader.querySelector('.pagehead h1')).length > 0,
    textOf(reader.querySelector('.pagehead h1')).slice(0, 40));

  // 内联数据解压后的真值：shim 会把解析结果挂到 __kbPack（供自检/排障）
  const pack = dom.window.__kbPack;
  const inlineUnits = pack ? Object.keys(pack.data).length : 0;
  check('内联数据解压成功（gzip → 318 单元）', inlineUnits >= 1,
    pack ? `${inlineUnits} 个单元` : (dom.window.__kbFatal ?? '未生成 __kbPack'));
  // 侧栏三层 + 单元懒渲染（2026-10-30）：首屏只渲染当前章的单元
  check('快照左栏分层渲染（域分组 + 节点数 ≤ 内联单元数）',
    d.querySelectorAll('#sidebar .dom').length > 0 &&
      d.querySelectorAll('#sidebar .node').length > 0 &&
      d.querySelectorAll('#sidebar .node').length <= inlineUnits,
    `doms=${d.querySelectorAll('#sidebar .dom').length} nodes=${d.querySelectorAll('#sidebar .node').length} inline=${inlineUnits}`);

  // ── 语义边在快照里仍然有效（2026-09-25：快照曾静默丢掉 graph/*.yaml 的语义边，
  //    现在语义边是**构建期烘进索引**的，所以断言索引里带 sem 字段）
  const idxUnits = pack?.index ?? [];
  const inlineSem = idxUnits.filter((u) => u && typeof u.sem === 'object' && u.sem !== null).length;
  // 语义边是人工标注：math 与 cs408 有 yaml，数一 / 工程线还没有（下一期），不能一律要求 >0
  const graphDir = path.join(ROOT, subj.graphRoot.replace(/\/$/, ''));
  const yamlCount = fs.existsSync(graphDir)
    ? fs.readdirSync(graphDir).filter((n) => n.endsWith('.yaml')).length
    : 0;
  if (yamlCount > 0) {
    check('内联索引带语义边（sem 已烘入，不靠运行期 fetch graph/*）', inlineSem > 0,
      `内联索引 ${idxUnits.length} 单元中带 sem 的 ${inlineSem} 个`);
  } else {
    check('无 yaml 时语义边为 0 且不报错（下一期人工标注）', inlineSem === 0, `sem=${inlineSem}`);
  }
  check('快照不依赖 graph/*.yaml 数据（运行期零 graph 请求）',
    !/"graph\/[A-Za-z0-9]+\.yaml":/.test(html),
    '快照里仍内联着 yaml —— 应已移除（语义边在索引里）');

  // 2026-10-30 起两个文档页分开：
  //   #graph  = 总纲（数学大观 v1：四条主轴 / 两个出口 / 交叉点 / 五个切入点 / 四阶段）
  //   #angles = 切入点（原「现代分析学总纲 v3.0」，一条具体路线，不是全学科总纲）
  if (SUBJECT_ID !== 'math') {
    // 非数学站没有「数学大观」总纲与切入点：只验空态说明，不套数学的断言
    dom.window.location.hash = '#graph';
    await sleep(60);
    const txt = textOf(d.getElementById('reader'));
    check('无总纲时给出说明而不是白屏', txt.length > 0, txt.slice(0, 50));
    dom.window.close();
    return;
  }

  dom.window.location.hash = '#graph';
  const t1 = Date.now();
  let docTxt = '';
  while (Date.now() - t1 < 3000) {
    docTxt = textOf(d.getElementById('reader'));
    if (docTxt.includes('四条主轴') && docTxt.includes('交叉点')) break;
    await sleep(10);
  }
  check('快照总纲页能渲染（四条主轴 / 两个出口 / 交叉点齐全）',
    docTxt.includes('四条主轴') && docTxt.includes('出口') && docTxt.includes('交叉点') &&
      docTxt.includes('五个切入点'),
    docTxt.slice(0, 60));
  check('快照总纲页表格已渲染（域表 + 交叉点表 + 路线表）',
    d.querySelectorAll('#reader .mdtable').length >= 3,
    `tables=${d.querySelectorAll('#reader .mdtable').length}`);
  check('快照总纲页大观图已渲染（围栏 pre）',
    d.querySelectorAll('#reader pre.md-pre').length >= 1,
    `pre=${d.querySelectorAll('#reader pre.md-pre').length}`);

  // 切入点页：原总纲正文（三块 + 三篇附文），verifying 「拆出去的那份还在」
  dom.window.location.hash = '#angles';
  const t2 = Date.now();
  let angTxt = '';
  while (Date.now() - t2 < 3000) {
    angTxt = textOf(d.getElementById('reader'));
    if (angTxt.includes('第一块') && angTxt.includes('待办清单')) break;
    await sleep(10);
  }
  check('快照切入点页能渲染（首块与收尾章节齐全）',
    angTxt.includes('第一块') && angTxt.includes('待办清单') && angTxt.includes('顶层架构'),
    angTxt.slice(0, 60));
  check('快照切入点附篇能渲染（变换一条线：总脉络/速查/总结）',
    angTxt.includes('变换一条线') && angTxt.includes('关键公式速查') && angTxt.includes('倒谱'),
    angTxt.slice(-60));
  check('快照切入点附三能渲染（矩阵微积分与自动微分）',
    angTxt.includes('交换性避难所') && angTxt.includes('backward 公式库') && angTxt.includes('视角转换七组'),
    angTxt.slice(-80));
  // 空公式防线（2026-09-28 事故：renderInline 占位符重构后对全局正则用 .match()
  // 重取捕获组，/g 的 match 不返回组，tex 恒空串，全页公式渲染成空 KaTeX ——
  // span 数量断言抓不住它，必须验 annotation 内容非空）：
  const anns = [...d.querySelectorAll('#reader annotation')];
  const filled = anns.filter((a) => a.textContent.trim().length > 0);
  check('快照切入点页公式内容非空（annotation 全部有 tex）',
    anns.length >= 200 && filled.length === anns.length,
    `非空 ${filled.length}/${anns.length}`);
  check('快照总纲页数学未裸泄漏（无未处理的 $ 字样残块）',
    !/\$\$/.test(docTxt),
    docTxt.match(/.{0,30}\$\$.{0,30}/)?.[0] ?? '');
  dom.window.close();
}

/* ------------------------------------------------- 全量体检（--audit） */

/**
 * 体检 ≠ 断言。断言模式回答「有没有回归」，体检模式回答
 * 「318 个单元里**哪些**坏了、坏在**哪一级**、能不能一起修」。
 *
 * 分级口径（与 build/logs/health-*.md 一致）：
 *   P0 致命   —— 白屏 / 渲染崩溃 / 公式排版失败 / 空公式 / 数据不可读。用户看到的就是坏页面。
 *   P1 内容错 —— 空正文、links 悬空、id 前缀不符、viz 模块未注册、请求 404、待核验未回填。
 *   P2 结构   —— tab/pane 数不符、空面板、$$ 未配对、公式裸泄漏、页头代号不符。
 *
 * 只读：不改 json/、不改 dist/。产物落 build/logs/。
 */

const LEVEL_RANK = { P0: 0, P1: 1, P2: 2 };

function readUnitData(code) {
  const abs = path.join(JSON_DIR, code.split('.')[0], `${code}.json`);
  try {
    const raw = fs.readFileSync(abs, 'utf8');
    return { data: JSON.parse(raw), bytes: Buffer.byteLength(raw) };
  } catch (err) {
    return { data: null, bytes: 0, error: err.message };
  }
}

/** 数据侧：不需要 DOM 就能判定的契约问题 */
function dataIssues(code, unit, regs) {
  const out = [];
  const add = (level, kind, detail = '') => out.push({ level, kind, detail });
  if (!Array.isArray(unit.entries) || unit.entries.length === 0) {
    add('P0', '无词条', 'entries 为空或非数组');
    return out;
  }
  const codes = new Set(ALL_CODES);
  for (const e of unit.entries) {
    const id = e?.id ?? '(无 id)';
    if (!e?.content || !String(e.content).trim()) add('P1', '空正文', id);
    if (typeof e?.id === 'string' && !e.id.startsWith(`${code}:`)) {
      add('P1', 'id 前缀不符', `${id} 应为 ${code}:…`);
    }
    const kw = e?.keywords;
    if (!Array.isArray(kw) || kw.length < 3 || kw.length > 7) {
      add('P1', 'keywords 越界', `${id} = ${Array.isArray(kw) ? kw.length : '非数组'}`);
    }
    for (const lk of e?.links ?? []) {
      if (!codes.has(lk)) add('P1', 'links 悬空', `${id} → ${lk}`);
    }
    const v = e?.viz;
    if (v && typeof v === 'object') {
      if (v.status === 'planned-backend') {
        if ('module' in v) add('P2', 'viz 档2 多写 module', id);
      } else if (typeof v.module === 'string') {
        if (!regs.has(v.module)) add('P1', 'viz 模块未注册', `${id} → ${v.module}`);
      } else {
        add('P1', 'viz 无 module', id);
      }
    }
    if (typeof e?.content === 'string') {
      if (e.content.includes('【待核验')) add('P1', '待核验未回填', id);
      const dd = (e.content.match(/\$\$/g) ?? []).length;
      if (dd % 2) add('P2', '$$ 未配对', `${id} 出现 ${dd} 处`);
    }
  }
  return out;
}

/** DOM 侧：只读已渲染的 DOM，不做任何交互（体检要跑 318 遍，交互留给断言模式） */
function domIssues(dom, code, entryIds) {
  const out = [];
  const add = (level, kind, detail = '') => out.push({ level, kind, detail });
  const d = dom.window.document;
  const reader = d.getElementById('reader');

  const overlayText = textOf(d.getElementById('overlay-root'));
  if (/失败|错误|Cannot|Error/.test(overlayText)) add('P0', '错误浮层', overlayText.slice(0, 120));
  if (!reader || reader.children.length === 0) {
    add('P0', '白屏', '阅读区无子节点');
    return out;
  }

  const h1 = textOf(reader.querySelector('.pagehead h1'));
  if (!h1) add('P0', '缺页头', '.pagehead h1 为空');
  else if (!h1.includes(code)) add('P2', '页头代号不符', h1.slice(0, 40));

  // 卡片 tab 已改懒渲染：非当前面板在首次切过去之前是空占位。
  // 必须逐个点开再检查，否则「公式是否排版成功」只验了 1/n 的内容（会漏掉大部分公式）。
  // 点击是同步的（fillPane 当场拼 HTML），所以这里不需要等待。
  for (const btn of [...reader.querySelectorAll('.card .tabs button')]) {
    btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  }

  // KaTeX 开的是 throwOnError:false，所以失败公式会渲染成 .katex-error：
  // title 是 ParseError 原文，textContent 是被拒的 TeX —— 两样都要抄进清单，否则「19 处报错」不可修。
  const kerrEls = [...reader.querySelectorAll('.katex-error')];
  if (kerrEls.length) {
    const samples = kerrEls.slice(0, 3).map((el) => {
      const msg = (el.getAttribute('title') ?? '').replace(/^ParseError:\s*/, '').slice(0, 70);
      return `${textOf(el).slice(0, 60)} ⟵ ${msg}`;
    });
    add('P0', 'KaTeX 报错', `${kerrEls.length} 处：${samples.join(' ／ ')}`);
  }
  const kfail = reader.querySelectorAll('.katex-fail').length;
  if (kfail) add('P0', 'KaTeX 抛错', `${kfail} 处`);
  const anns = [...reader.querySelectorAll('.katex annotation')];
  const emptyAnn = anns.filter((a) => !a.textContent.trim()).length;
  if (emptyAnn) add('P0', 'KaTeX 空公式', `${emptyAnn}/${anns.length}`);

  const cards = [...reader.querySelectorAll('.card')].filter((c) => !c.classList.contains('pagehead'));
  if (!cards.length) add('P0', '无卡片', '');
  for (const c of cards) {
    const tb = c.querySelectorAll('.tabs button').length;
    const pn = c.querySelectorAll('.pane').length;
    if (tb !== pn) add('P2', 'tab/pane 数不符', `${tb} tab vs ${pn} pane`);
    if (c.querySelectorAll('.pane.on').length > 1) add('P2', '多面板同时展开', '');
    const emptyPanes = [...c.querySelectorAll('.pane')].filter((p) => textOf(p).length < 4).length;
    if (emptyPanes) add('P2', '空面板', `${emptyPanes} 个`);
  }

  const txt = textOf(reader);
  const unreg = (txt.match(/尚未在前端注册/g) ?? []).length;
  if (unreg) add('P1', 'viz 未注册占位', `${unreg} 处`);
  const mountFail = (txt.match(/模块挂载失败/g) ?? []).length;
  if (mountFail) add('P1', 'viz 挂载失败', `${mountFail} 处`);
  if (/\$\$/.test(txt)) {
    add('P2', '公式裸泄漏', (txt.match(/.{0,20}\$\$.{0,20}/) ?? [''])[0]);
  }

  const codeSet = new Set(ALL_CODES);
  const badGoto = [...reader.querySelectorAll('[data-goto]')]
    .map((el) => el.getAttribute('data-goto'))
    .filter((g) => g && !codeSet.has(g));
  if (badGoto.length) add('P1', 'data-goto 悬空', [...new Set(badGoto)].slice(0, 5).join(','));

  const badRef = [...reader.querySelectorAll('[data-ref]')]
    .map((el) => el.getAttribute('data-ref'))
    .filter((r) => r && !entryIds.has(r));
  if (badRef.length) add('P1', 'data-ref 悬空', [...new Set(badRef)].slice(0, 5).join(','));

  const miss = [...new Set(dom.window.__miss ?? [])];
  if (miss.length) add('P1', '请求 404', miss.slice(0, 5).join(','));

  return out;
}

async function runAudit(bundleJs, codes) {
  const regsMod = await requireTs('src/viz/registry.ts');
  const regs = new Set(regsMod.implementedModules());
  const rows = [];
  const t0 = Date.now();

  for (let i = 0; i < codes.length; i += 1) {
    const code = codes[i];
    const row = { code, issues: [] };
    const { data, bytes, error } = readUnitData(code);
    row.bytes = bytes;
    row.entries = data?.entries?.length ?? 0;
    if (error) row.issues.push({ level: 'P0', kind: 'JSON 不可读', detail: error });
    if (data) row.issues.push(...dataIssues(code, data, regs));
    const entryIds = new Set((data?.entries ?? []).map((e) => e?.id).filter(Boolean));

    let dom = null;
    try {
      dom = await mount(bundleJs, { hash: code, timeout: 2500, settle: 5 });
      row.firstMs = mountTiming.firstMs;
      row.readyMs = mountTiming.readyMs;
      row.issues.push(...domIssues(dom, code, entryIds));
    } catch (err) {
      row.issues.push({ level: 'P0', kind: '渲染崩溃', detail: err.message });
    } finally {
      dom?.window.close();
    }
    rows.push(row);
    if (process.stdout.isTTY) process.stdout.write(`\r体检 ${i + 1}/${codes.length} ${code.padEnd(8)}`);
  }
  if (process.stdout.isTTY) process.stdout.write('\r');

  const count = { P0: 0, P1: 0, P2: 0 };
  const byKind = new Map();
  for (const r of rows) {
    for (const it of r.issues) {
      count[it.level] = (count[it.level] ?? 0) + 1;
      const key = `${it.level} ${it.kind}`;
      byKind.set(key, (byKind.get(key) ?? 0) + 1);
    }
  }
  const clean = rows.filter((r) => r.issues.length === 0).length;
  // 首卡时延是「切词条卡不卡」的正向指标（分帧挂载后它与「全部就绪」分开计）
  const pct = (arr, q) => {
    const s = [...arr].filter((n) => n > 0).sort((a, b) => a - b);
    return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : 0;
  };
  const firsts = rows.map((r) => r.firstMs ?? 0);
  const readys = rows.map((r) => r.readyMs ?? 0);
  const summary = {
    generated: new Date().toISOString(),
    units: rows.length,
    clean,
    counts: count,
    latency: {
      firstP50: pct(firsts, 0.5),
      firstP95: pct(firsts, 0.95),
      firstMax: Math.max(0, ...firsts),
      readyP50: pct(readys, 0.5),
      readyP95: pct(readys, 0.95),
      readyMax: Math.max(0, ...readys),
    },
    kinds: [...byKind.entries()]
      .map(([k, n]) => ({ level: k.slice(0, 2), kind: k.slice(3), n }))
      .sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || b.n - a.n),
    seconds: Math.round((Date.now() - t0) / 1000),
  };

  const outDir = path.join(ROOT, 'build', 'logs');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const suffix = SUBJECT_ID === 'math' ? '' : `-${SUBJECT_ID}`;
  const jsonPath = path.join(outDir, `health-frontend${suffix}-${stamp}.json`);
  fs.writeFileSync(jsonPath, `${JSON.stringify({ summary, rows }, null, 1)}\n`, 'utf8');

  const md = [];
  md.push(`# 前端体检${suffix} · ${stamp}`, '');
  md.push(`- 单元 ${summary.units} 个，完全干净 ${clean} 个，用时 ${summary.seconds}s`);
  md.push(`- P0 致命 ${count.P0 ?? 0} · P1 内容 ${count.P1 ?? 0} · P2 结构 ${count.P2 ?? 0}`);
  const lat = summary.latency;
  md.push(
    `- 时延（jsdom，含索引加载）：首卡 p50 ${lat.firstP50}ms / p95 ${lat.firstP95}ms / max ${lat.firstMax}ms；` +
      `全部卡片就绪 p50 ${lat.readyP50}ms / p95 ${lat.readyP95}ms / max ${lat.readyMax}ms`,
  );
  md.push('', '## 按类型统计', '', '| 级别 | 类型 | 条数 |', '| --- | --- | --- |');
  for (const k of summary.kinds) md.push(`| ${k.level} | ${k.kind} | ${k.n} |`);
  md.push('', '## 问题单元（按级别与条数排序）', '');
  const sorted = rows
    .filter((r) => r.issues.length)
    .sort((a, b) => {
      const rank = (r) => Math.min(...r.issues.map((i) => LEVEL_RANK[i.level]));
      return rank(a) - rank(b) || b.issues.length - a.issues.length;
    });
  for (const r of sorted) {
    md.push(`### ${r.code} · ${r.issues.length} 条 · ${(r.bytes / 1024).toFixed(0)}KB / ${r.entries} 词条`, '');
    for (const it of r.issues) md.push(`- \`${it.level}\` ${it.kind}${it.detail ? ` — ${it.detail}` : ''}`);
    md.push('');
  }
  const mdPath = path.join(outDir, `health-frontend${suffix}-${stamp}.md`);
  fs.writeFileSync(mdPath, `${md.join('\n')}\n`, 'utf8');

  console.log(`\n体检 ${summary.units} 个单元：干净 ${clean} / 有问题 ${summary.units - clean}`);
  console.log(`P0 ${count.P0 ?? 0} · P1 ${count.P1 ?? 0} · P2 ${count.P2 ?? 0}（${summary.seconds}s）`);
  console.log(
    `首卡 p50 ${summary.latency.firstP50}ms / p95 ${summary.latency.firstP95}ms · ` +
      `全部就绪 p50 ${summary.latency.readyP50}ms / p95 ${summary.latency.readyP95}ms`,
  );
  for (const k of summary.kinds.slice(0, 12)) console.log(`  ${k.level} ${k.kind.padEnd(18)} ${k.n}`);
  console.log(`\n清单：${path.relative(ROOT, mdPath)} ／ ${path.relative(ROOT, jsonPath)}`);
  return count.P0 ?? 0;
}

/* ------------------------------------------------------------ 主流程 */

async function main() {
  const argv = process.argv.slice(2);
  const all = argv.includes('--all');
  const audit = argv.includes('--audit');
  // 代号参数：跳过所有 flag **以及 --subject 的取值**（否则 'cs408' 会被当成代号）
  const args = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--subject') {
      i += 1;
      continue;
    }
    if (a.startsWith('-')) continue;
    args.push(a);
  }

  const kbIndex = await requireTs('src/modules/kb-index.ts');
  const subjects = await requireTs('src/subjects.ts');
  const SUBJ = subjects.SUBJECTS.find((s) => s.id === SUBJECT_ID) ?? subjects.MATH;
  // 语义边根从学科配置取（锚定仓库根，不随 HARNESS_JSON 漂移）——语义边烘进索引后，
  // 右栏/frontier 的断言才是在验真源而不是编号序启发式。
  INDEX = kbIndex.buildIndex(JSON_DIR, path.join(ROOT, SUBJ.graphRoot.replace(/\/$/, '')), DATA_ROOT);
  ALL_CODES = INDEX.units.map((u) => u.code);
  const indexKb = (JSON.stringify({ units: INDEX.units }).length / 1024).toFixed(1);

  // 显式代号优先（体检时先用几个单元试跑）；否则 --all / --audit 才铺全库
  const codes = args.length
    ? args
    : all || audit
      ? ALL_CODES
      : process.env.HARNESS_CODE
        ? [process.env.HARNESS_CODE]
        : ['A1.3'];
  const bundleJs = await bundle();
  const kb = (bundleJs.length / 1024).toFixed(0);
  console.log(`\n[${SUBJ.id}] 索引 ${INDEX.units.length} 单元 / ${indexKb} KB · bundle ${kb} KB`);
  if (all) console.log(`遍历全库 ${codes.length} 个已生成单元\n`);

  if (audit) {
    const p0 = await runAudit(bundleJs, codes);
    process.exit(p0 ? 1 : 0);
  }

  const multi = codes.length > 1;
  const summary = [];
  for (const code of codes) {
    const before = { pass, fail };
    let dom = null;
    try {
      dom = await runUnit(bundleJs, code);
      await runErrorPath(bundleJs, code);
    } catch (err) {
      fail += 1;
      failures.push(`[${code}] 渲染崩溃：${err.message}`);
    } finally {
      dom?.window.close();
    }
    const df = fail - before.fail;
    summary.push({ code, df });
    if (multi) console.log(`${df ? '✗' : '✓'} ${code.padEnd(8)} PASS ${pass - before.pass}  FAIL ${df}`);
  }

  // 体积最大的两个单元：分帧窗口最大，交错写入最容易暴露，时延也最有代表性
  const sizeOf = (u) => {
    try {
      return fs.statSync(path.join(JSON_DIR, u.path.slice('json/'.length))).size;
    } catch {
      return 0;
    }
  };
  const heaviest = [...INDEX.units]
    .sort((a, b) => sizeOf(b) - sizeOf(a))
    .slice(0, 2)
    .map((u) => u.code);
  if (heaviest.length === 2) {
    console.log(`\n分帧挂载并发检验：${heaviest[0]} → ${heaviest[1]}（不等待即切走）`);
    await runRace(bundleJs, heaviest[0], heaviest[1]);
  }

  // standalone 快照只有数学站有（408 暂不产单文件）
  // 每个学科都有自己的单文件快照（knowledge.html / knowledge-<id>.html），逐站验
  await runStandalone(SUBJ);

  console.log(`\n${'-'.repeat(52)}`);
  if (multi) {
    const bad = summary.filter((s) => s.df);
    console.log(`单元 ${summary.length} 个：${summary.length - bad.length} 通过 / ${bad.length} 有问题`);
  }
  console.log(`断言 PASS ${pass}  FAIL ${fail}`);
  if (fail) {
    console.log('\n失败项：');
    for (const f of [...new Set(failures)].slice(0, 40)) console.log(`  · ${f}`);
    if (failures.length > 40) console.log(`  … 另有 ${failures.length - 40} 条`);
  }
  console.log('');
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error('harness 崩溃：', err);
  process.exit(2);
});
