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
 *   NODE_PATH=<托管 node workspace>/node_modules node tools/dom-harness.mjs [代号…]
 *   node tools/dom-harness.mjs --all      # 遍历全库每个已生成的单元
 * 环境变量：HARNESS_JSON=<dir> 指向另一份 json/（默认 <repo>/json）
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const esbuild = require('esbuild');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JSON_DIR = process.env.HARNESS_JSON ?? path.join(ROOT, 'json');

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
    entryPoints: [path.join(ROOT, 'src', 'main.ts')],
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
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const shim = `
    window.__requests = [];
    window.fetch = function (input) {
      const url = typeof input === 'string' ? input : input.url;
      const clean = String(url).split('?')[0];
      window.__requests.push(clean);
      let body = null;
      if (clean === 'json/index.json') {
        body = window.__indexJson;
      } else if (clean.startsWith('json/')) {
        const abs = window.__jsonDir + '/' + clean.slice(5);
        try { body = window.__fs.readFileSync(abs, 'utf8'); } catch (e) { body = null; }
        if (window.__mutate) body = window.__mutate(clean, body);
      }
      if (body === null) {
        return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found',
          text: () => Promise.resolve('') });
      }
      return Promise.resolve({ ok: true, status: 200, statusText: 'OK',
        text: () => Promise.resolve(body) });
    };
  `;
  const marker = '<script type="module" src="/src/main.ts"></script>';
  if (!html.includes(marker)) throw new Error(`index.html 缺少入口脚本标记：${marker}`);
  // 只内联 shim（它引用 window 上的全局）；bundle 稍后由 mount() 手动 eval，
  // 这样「注入全局」一定发生在应用启动之前 ——
  // 否则启动时那次 fetch 会在 JSDOM 构造期读到还没赋值的 __indexJson。
  void bundleJs;
  return html.replace(marker, () => `<script>${shim}</script>`);
}

async function mount(bundleJs, opts = {}) {
  const dom = new JSDOM(buildPage(bundleJs), {
    url: `http://localhost:5173/${opts.hash ? `#/${opts.hash}` : ''}`,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  dom.window.__fs = fs;
  dom.window.__jsonDir = JSON_DIR;
  dom.window.__indexJson = JSON.stringify({ units: INDEX.units });
  if (opts.mutate) dom.window.__mutate = opts.mutate;
  dom.window.eval(bundleJs);
  // 启动是异步的：索引 → 目标单元按需拉取 → 渲染。等渲染真出现（而不是固定 sleep）
  const d = dom.window.document;
  const reader = d.getElementById('reader');
  const t0 = Date.now();
  while (Date.now() - t0 < (opts.timeout ?? 3000)) {
    const txt = reader.textContent ?? '';
    if (reader.children.length > 0 && !txt.includes('按需加载') && !txt.includes('加载中')) break;
    await sleep(10);
  }
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

  // ── 按需加载：启动只拉索引 + 目标单元，**不拉全库**
  const afterBoot = reqs().slice();
  p('启动只拉索引 + 当前单元（不拉全库）',
    afterBoot.length <= 2,
    `首屏请求 ${afterBoot.length} 条：${afterBoot.join(', ')}`);
  p('首个请求就是索引', afterBoot[0] === 'json/index.json', afterBoot[0] ?? '(无)');
  p('拉到的正是当前单元', afterBoot.slice(1).every((u) => u === meta.path),
    afterBoot.slice(1).join(', '));

  // ── 基本渲染
  p('无致命错误浮层', !textOf(overlay).includes('数据索引读取失败'), textOf(overlay).slice(0, 120));
  p('阅读区非空（不白屏）', reader.children.length > 0);
  p('页面标题含代号', textOf(reader.querySelector('.pagehead h1')).includes(code));
  const cards = [...reader.querySelectorAll('.card')].filter((c) => !c.classList.contains('pagehead'));
  p('定理卡已渲染', cards.length > 0, `cards=${cards.length}`);
  p('顶栏字母块非空', d.querySelectorAll('#header .chapters b').length > 0);
  p('左栏节点数 == 索引单元数',
    d.querySelectorAll('#sidebar .node').length === INDEX.units.length,
    `nodes=${d.querySelectorAll('#sidebar .node').length} units=${INDEX.units.length}`);
  p('右栏有掌握度/依赖/被用于',
    textOf(aside).includes('依赖') && textOf(aside).includes('被用于'));
  p('frontier 横幅已算出', textOf(d.getElementById('frontier')).includes('今天该学'));

  // ── 四问 tab
  const tabsAll = cards.flatMap((c) => [...c.querySelectorAll('.tabs button')]);
  if (unit.entries.some((e) => ['statement', 'intuition', 'proof', 'application'].includes(e.type))) {
    p('四问 tab 存在', tabsAll.length > 0, tabsAll.slice(0, 8).map(textOf).join('/'));
  }
  p('tab 数 == 面板数（逐卡）',
    cards.every((c) => c.querySelectorAll('.pane').length === c.querySelectorAll('.tabs button').length));
  p('默认每卡至多一个面板展开',
    cards.every((c) => c.querySelectorAll('.pane.on').length <= 1));

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

  // ── 徽标
  const allText = textOf(reader);
  p('显示 status 徽标', allText.includes('drafted'));
  p('显示 generated_by', /glm|deepseek|kimi/.test(allText));

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
  const external = reqs().filter((u) => !u.startsWith('json/'));
  p('零外部请求（断网可用）', external.length === 0, external.slice(0, 5).join(', '));

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
      reqs().filter((u) => u !== 'json/index.json' && u.startsWith('json/')),
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
    p('切回后正文直接就位（不再出现加载中）',
      !(reader.textContent ?? '').includes('按需加载'));
  }

  return dom;
}

/* ---------------------------------------------------- 坏 JSON / 错误浮层 */

async function runErrorPath(bundleJs, code) {
  const meta = INDEX.units.find((u) => u.code === code);
  const target = meta?.path ?? `json/${code.split('.')[0]}/${code}.json`;
  const dom = await mount(bundleJs, {
    hash: code,
    mutate: (p2, body) => (p2 === target ? '{ "schema": "entry-card/v2", ' : body),
  });
  const bd = dom.window.document;
  const overlayText = textOf(bd.getElementById('overlay-root'));
  check('坏 JSON → 浮层可见（绝不白屏）', overlayText.length > 0);
  check('浮层指明文件名', overlayText.includes(`${code}.json`), overlayText.slice(0, 160));
  check('坏 JSON 时侧栏仍渲染（索引没坏）',
    bd.querySelectorAll('#sidebar .node').length === INDEX.units.length);
  dom.window.close();
}

/* ------------------------------------------- standalone 单文件快照验收 */

/**
 * dist/knowledge.html 是「双击即开」的单文件快照（DESIGN §9.1）：
 * 数据内联 + IIFE + 零外部请求。这里在 jsdom 里真加载一遍，确认它不是空壳。
 */
async function runStandalone() {
  const file = path.join(ROOT, 'dist', 'knowledge.html');
  if (!fs.existsSync(file)) {
    console.log('\n8) standalone 快照 —— 未生成（跳过；npm run build:standalone）');
    return;
  }
  console.log('\n8) standalone 单文件快照 dist/knowledge.html');
  const html = fs.readFileSync(file, 'utf8');
  const inlineUnits = (html.match(/"json\/[A-Za-z0-9.]+\/[A-Za-z0-9.]+\.json":/g) ?? []).length;

  check('无 <script src> / <link href>（零外部请求）',
    !/<(script|link)[^>]*(src|href)=/.test(html));
  check('无外部 url() 引用（字体已 base64 内联）', !/url\((?!data:|#)/.test(html));
  check('数据已内联', inlineUnits >= 1, `内联 ${inlineUnits} 个单元`);

  const dom = new JSDOM(html, {
    url: `file://${file}`,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
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
  check('快照左栏节点数 == 内联单元数',
    d.querySelectorAll('#sidebar .node').length === inlineUnits,
    `nodes=${d.querySelectorAll('#sidebar .node').length} inline=${inlineUnits}`);
  check('快照首屏不是空页',
    textOf(reader.querySelector('.pagehead h1')).length > 0,
    textOf(reader.querySelector('.pagehead h1')).slice(0, 40));
  dom.window.close();
}

/* ------------------------------------------------------------ 主流程 */

async function main() {
  const argv = process.argv.slice(2);
  const all = argv.includes('--all');
  const args = argv.filter((a) => !a.startsWith('-'));

  const kbIndex = await requireTs('src/modules/kb-index.ts');
  INDEX = kbIndex.buildIndex(JSON_DIR);
  ALL_CODES = INDEX.units.map((u) => u.code);
  const indexKb = (JSON.stringify({ units: INDEX.units }).length / 1024).toFixed(1);

  const codes = all
    ? ALL_CODES
    : args.length
      ? args
      : process.env.HARNESS_CODE
        ? [process.env.HARNESS_CODE]
        : ['A1.3'];
  const bundleJs = await bundle();
  const kb = (bundleJs.length / 1024).toFixed(0);
  console.log(`\n索引 ${INDEX.units.length} 单元 / ${indexKb} KB · bundle ${kb} KB`);
  if (all) console.log(`遍历全库 ${codes.length} 个已生成单元\n`);

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

  await runStandalone();

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
