/**
 * 进程内 DOM 验收台（无需浏览器）
 *
 * 为什么存在：本机 Chromium 类浏览器在本环境里会被强杀（SIGTERM/137），无法截图；
 * 而「不白屏 / 四问 tab / 限定词表走真数据 / 反例就地展开 / 断网零外部请求」这类
 * 验收点本质是 DOM 断言，不是像素比对。所以：
 *
 *   esbuild 把 src/main.ts 打成 IIFE（jsdom 不执行 ESM）
 *   → jsdom 载入根 index.html 的骨架
 *   → 注入「读磁盘」的 fetch polyfill（等价 vite dev 的 kb-json 中间件）
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

/* ---------------------------------------------------------------- 工具 */

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

function scanJsonFiles() {
  const out = [];
  if (!fs.existsSync(JSON_DIR)) return out;
  for (const chapter of fs.readdirSync(JSON_DIR)) {
    const dir = path.join(JSON_DIR, chapter);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.json')) out.push(`json/${chapter}/${name}`);
    }
  }
  return out.sort();
}

const JSON_FILES = scanJsonFiles(); // 一次快照：json/ 生成线在并行写，不能前后各扫一遍

const allCodes = () =>
  JSON_FILES
    .map((p) => path.basename(p, '.json'))
    .filter((c) => /^[A-Za-z]\d+(?:\.\d+)?$/.test(c))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

function readUnit(code) {
  const p = path.join(JSON_DIR, code.split('.')[0], `${code}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const textOf = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

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
    // CSS 是纯样式，DOM 断言用不到；当文本读掉，避免产出额外文件
    loader: { '.css': 'text' },
    define: { 'process.env.NODE_ENV': '"development"' },
  });
  // write:false 且无 outfile 时 esbuild 把产物命名为 `<stdout>`
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
      const clean = url.split('?')[0];
      window.__requests.push(clean);
      let body = null;
      if (clean === 'json/index.json') {
        body = JSON.stringify({ files: ${JSON.stringify(JSON_FILES)} });
      } else if (clean.startsWith('json/')) {
        const abs = ${JSON.stringify(JSON_DIR)} + '/' + clean.slice(5);
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
  // 必须用函数式替换 —— bundle 里含 \`$'\`（KaTeX 的正则），
  // 字符串替换会把它展开成"匹配之后的整段"，产出语法错误的脚本。
  return html.replace(marker, () => `<script>${shim}</script><script>${bundleJs}</script>`);
}

async function mount(bundleJs, opts = {}) {
  const dom = new JSDOM(buildPage(bundleJs), {
    url: `http://localhost:5173/${opts.hash ? `#/${opts.hash}` : ''}`,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  dom.window.__fs = fs;
  if (opts.mutate) dom.window.__mutate = opts.mutate;
  await new Promise((r) => setTimeout(r, opts.wait ?? 120)); // 启动是异步的（fetch → 渲染）
  return dom;
}

/* ------------------------------------------------------- 单元级断言 */

async function runUnit(bundleJs, code) {
  const unit = readUnit(code);
  const entryIds = new Set(unit.entries.map((e) => e.id));
  const hasQuant = unit.entries.some((e) => e.id.endsWith('.quantifiers'));
  const quant = unit.entries.find((e) => e.id.endsWith('.quantifiers'));
  const qId = quant?.id ?? '';
  const vizFront = unit.entries.filter((e) => e.viz && typeof e.viz.module === 'string');
  const vizPlanned = unit.entries.filter((e) => e.viz?.status === 'planned-backend');

  const dom = await mount(bundleJs, { hash: code });
  const d = dom.window.document;
  const reader = d.getElementById('reader');
  const overlay = d.getElementById('overlay-root');
  const aside = d.getElementById('aside');

  check('无致命错误浮层', !textOf(overlay).includes('数据索引读取失败'),
    textOf(overlay).slice(0, 120));
  const p = (s, c, det) => check(`[${code}] ${s}`, c, det);

  p('阅读区非空（不白屏）', reader.children.length > 0);
  p('页面标题含代号', textOf(reader.querySelector('.pagehead h1')).includes(code));
  const cards = [...reader.querySelectorAll('.card')].filter((c) => !c.classList.contains('pagehead'));
  p('定理卡已渲染', cards.length > 0, `cards=${cards.length}`);
  p('顶栏字母块非空', d.querySelectorAll('#header .chapters b').length > 0);
  p('左栏节点数 == 数据文件数',
    d.querySelectorAll('#sidebar .node').length === JSON_FILES.length,
    `nodes=${d.querySelectorAll('#sidebar .node').length} files=${JSON_FILES.length}`);
  p('右栏有掌握度/依赖/被用于',
    textOf(aside).includes('依赖') && textOf(aside).includes('被用于'));
  p('frontier 横幅已算出', textOf(d.getElementById('frontier')).includes('今天该学'));

  // 四问 tab：不要求第一张卡就有（`general.quantifiers` 自成一张只放限定词表的卡）
  const firstCard = cards[0];
  const tabsAll = cards.flatMap((c) => [...c.querySelectorAll('.tabs button')]);
  if (unit.entries.some((e) => ['statement', 'intuition', 'proof', 'application'].includes(e.type))) {
    p('四问 tab 存在', tabsAll.length > 0, tabsAll.slice(0, 8).map(textOf).join('/'));
  }
  p('tab 数 == 面板数（逐卡）',
    cards.every((c) => c.querySelectorAll('.pane').length === c.querySelectorAll('.tabs button').length));
  p('默认每卡至多一个面板展开',
    cards.every((c) => c.querySelectorAll('.pane.on').length <= 1));
  void firstCard;

  // 限定词拆解（灵魂词条）：必须走真数据、默认可见、可点行锚到真实词条。
  // 期望值从数据推导：并非每个单元的 quantifiers 都用管道表（A1.2 是散文 + 加粗步骤），
  // 也并非每行都点名引用别的词条（A2.3/A3 的引用写在正文段落里）——这些是数据形态，不是缺陷。
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
      // spec §4 的四列是标准形；P 篇语义换装、C6.2 博物馆有意用 3 列 ——
      // 真正要保证的是「结构完好」，措辞随数据。
      p('限定词表列数合理（3–4 列）', cols >= 3 && cols <= 4, `cols=${cols} ${heads.join(' | ')}`);
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

  // 可点行（若存在）必须锚到同文件真实词条。
  // 不要求「必须有可点行」：数据里只有部分单元在表行/ keywords 里点名引用别的词条
  // （A2.3、A3 的引用写在正文段落里），这是数据形态，不是缺陷。
  const qrows = [...reader.querySelectorAll('tr.qrow[data-cx]')];
  p('可点行（若有）全部锚到同文件真实词条',
    qrows.every((r) => entryIds.has(r.dataset.cx ?? '')),
    `qrows=${qrows.length} 非法=${qrows.map((r) => r.dataset.cx).filter((i) => !entryIds.has(i ?? '')).join(',')}`);
  if (qrows.length) {
    p('可点行带 caret 指示', !!qrows[0]?.querySelector('.caret'));
    // 点行 → 就地展开（不跳页）
    const hashBefore = dom.window.location.hash;
    const before = reader.querySelectorAll('tr.detail').length;
    qrows[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    const after = reader.querySelectorAll('tr.detail').length;
    p('点行后就地插入展开体', after === before + 1, `${before}→${after} cx=${qrows[0].dataset.cx}`);
    p('展开体含反例正文', textOf(reader.querySelector('tr.detail')).length > 40);
    p('展开不跳页（hash 不变）', dom.window.location.hash === hashBefore);
    // 再点一次应折叠
    qrows[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    p('再点折叠', reader.querySelectorAll('tr.detail').length === before);
  }

  // 文字引用 → 可点元素（三种形式各自的失败处理）
  const refs = [...reader.querySelectorAll('.ref')];
  const pseudo = refs.filter((r) => /^[a-z]\.[a-z]$/.test(textOf(r)));
  p('「a.e.」这类 subject.slot 伪引用未被误包', pseudo.length === 0,
    pseudo.map(textOf).join(', '));
  const selfLinks = refs.filter((r) => r.dataset.goto === code);
  p('无指向当前代号的空跳转', selfLinks.length === 0, selfLinks.map(textOf).join(', '));
  if (refs.some((r) => r.dataset.ref)) {
    p('同文件引用全部锚到真实词条',
      refs.filter((r) => r.dataset.ref).every((r) => entryIds.has(r.dataset.ref ?? '')));
  }
  const cross = refs.filter((r) => r.dataset.goto);
  p('跨代号引用带 cross 样式', cross.length === 0 || cross.every((r) => r.classList.contains('cross')));

  // 徽标
  const allText = textOf(reader);
  p('显示 status 徽标', allText.includes('drafted'));
  p('显示 generated_by', /glm|deepseek|kimi/.test(allText));

  // viz：档1 必须有实现（不能是「尚未注册」占位），档2 必须是 planned 占位，
  // 且**每个 viz 词条都要有自己的渲染体**（否则同一张卡里后面的会把前面的冲掉）
  const vizRendered = reader.querySelectorAll('.vizslot .vizitem .viz').length;
  const unregistered = allText.match(/尚未在前端注册/g)?.length ?? 0;
  const mountFailures = allText.match(/模块挂载失败/g)?.length ?? 0;
  const plannedEntries = vizFront.length + vizPlanned.length;
  if (plannedEntries) {
    p('每个 viz 词条都有独立渲染体',
      vizRendered === plannedEntries,
      `渲染 ${vizRendered} / 应有 ${plannedEntries}`);
    p('无「模块挂载失败」占位', mountFailures === 0, `${mountFailures} 处`);
  }
  if (vizFront.length) {
    p(`viz 档1 全部已注册（${vizFront.map((e) => e.viz.module).join(',')}）`,
      unregistered === 0, `未注册 ${unregistered} 处`);
    p('viz 有实际渲染体', vizRendered > 0, `viz=${vizRendered}`);
  }
  if (vizPlanned.length) {
    p('viz 档2 渲染「演示待接入」占位',
      allText.includes('演示待接入') || allText.includes('planned'),
      `vizPlanned=${vizPlanned.map((e) => e.id).join(',')} 槽位=${reader.querySelectorAll('.vizslot .vhead').length}` +
        ` 文案=${(allText.match(/.{0,10}待接入.{0,10}/g) ?? []).join('|')}`);
  }

  // 零外部请求
  const external = (dom.window.__requests ?? []).filter((u) => !u.startsWith('json/'));
  p('零外部请求（断网可用）', external.length === 0, external.slice(0, 5).join(', '));

  return { dom, reader, code };
}

/* ---------------------------------------------------- 坏 JSON / 错误浮层 */

async function runErrorPath(bundleJs, code) {
  const target = `json/${code.split('.')[0]}/${code}.json`;
  const dom = await mount(bundleJs, {
    hash: code,
    mutate: (p2, body) => (p2 === target ? '{ "schema": "entry-card/v2", ' : body),
  });
  const bd = dom.window.document;
  const overlayText = textOf(bd.getElementById('overlay-root'));
  check('坏 JSON → 浮层可见（绝不白屏）', overlayText.length > 0);
  check('浮层指明文件名', overlayText.includes(`${code}.json`), overlayText.slice(0, 160));
  check('坏 JSON 时其余文件仍渲染', bd.getElementById('reader').children.length > 0);
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
  const inlineFiles = (html.match(/"json\/[A-Za-z0-9.]+\/[A-Za-z0-9.]+\.json":/g) ?? []).length;

  check('无 <script src> / <link href>（零外部请求）',
    !/<(script|link)[^>]*(src|href)=/.test(html));
  check('无外部 url() 引用（字体已 base64 内联）',
    !/url\((?!data:|#)/.test(html));
  check('数据已内联', inlineFiles >= 1, '内联 ' + inlineFiles + ' 个单元');

  const dom = new JSDOM(html, {
    url: `file://` + file,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  await new Promise((r) => setTimeout(r, 300));
  const d = dom.window.document;
  const reader = d.getElementById('reader');
  check('快照能渲染出阅读区（file:// 双击可用）', reader.children.length > 0);
  check('快照无致命浮层',
    !textOf(d.getElementById('overlay-root')).includes('数据索引读取失败'));
  check('快照顶栏字母块非空', d.querySelectorAll('#header .chapters b').length > 0);
  check('快照左栏节点数 == 内联单元数',
    d.querySelectorAll('#sidebar .node').length === inlineFiles,
    'nodes=' + d.querySelectorAll('#sidebar .node').length + ' inline=' + inlineFiles);
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
  const codes = all
    ? allCodes()
    : args.length
      ? args
      : process.env.HARNESS_CODE
        ? [process.env.HARNESS_CODE]
        : ['A1.3'];
  const bundleJs = await bundle();
  if (all) console.log(`\n遍历全库 ${codes.length} 个已生成单元\n`);

  const multi = codes.length > 1;
  const summary = [];
  for (const code of codes) {
    const before = { pass, fail };
    if (!multi) console.log(`\n单元 ${code}\n`);
    try {
      await runUnit(bundleJs, code);
      if (!multi) await runErrorPath(bundleJs, code);
      else await runErrorPath(bundleJs, code);
    } catch (err) {
      fail += 1;
      failures.push(`${code} 渲染崩溃：${err.message}`);
    }
    const dp = pass - before.pass;
    const df = fail - before.fail;
    summary.push({ code, dp, df });
    if (multi) console.log(`${df ? '✗' : '✓'} ${code.padEnd(8)} PASS ${dp}  FAIL ${df}`);
  }

  await runStandalone();

  if (!multi) {
    console.log(`\n${'-'.repeat(52)}`);
    console.log(`PASS ${pass}  FAIL ${fail}`);
  } else {
    const bad = summary.filter((s) => s.df);
    console.log(`\n${'-'.repeat(52)}`);
    console.log(`单元 ${summary.length} 个：${summary.length - bad.length} 通过 / ${bad.length} 有问题`);
    console.log(`断言 PASS ${pass}  FAIL ${fail}`);
  }
  if (fail) {
    console.log('\n失败项：');
    for (const f of [...new Set(failures)]) console.log(`  · ${f}`);
  }
  console.log('');
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error('harness 崩溃：', err);
  process.exit(2);
});
