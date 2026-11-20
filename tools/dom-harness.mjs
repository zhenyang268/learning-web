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
const YAML = require('yaml');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 学科（`--subject math|cs408|math1|projects|english1`，默认 math）。
 * 五站是同仓多入口：入口 HTML / 入口 TS / 数据根各一套，其余完全共用。
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
  emath: { root: 'emath/json/', html: 'emath.html', ts: 'src/main-emath.ts' },
  cs408: { root: 'cs408/json/', html: 'cs408.html', ts: 'src/main-cs408.ts' },
  math1: { root: 'kaoyan/json/', html: 'math1.html', ts: 'src/main-math1.ts' },
  projects: { root: 'projects/json/', html: 'projects.html', ts: 'src/main-projects.ts' },
  english1: { root: 'english1/json/', html: 'english1.html', ts: 'src/main-english1.ts' },
}[SUBJECT_ID];
// 未知学科**直接失败**，不回退 math：静默回退会让 `--subject english1` 实际在验数学站，
// 闸门全绿但新站一片没测（五站接入时最容易踩）。
if (!ENTRY) {
  console.error(`[dom-harness] 未知学科：${SUBJECT_ID}（可选 math|cs408|math1|projects|english1）`);
  process.exit(1);
}
const DATA_ROOT = ENTRY.root;
const ENTRY_HTML = ENTRY.html;
const ENTRY_TS = ENTRY.ts;
const INDEX_URL = `${DATA_ROOT}index.json`;
let GUIDE_ROOT = '';

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
      } else if (window.__guideRoot && clean.startsWith(window.__guideRoot)) {
        // 导读侧车与单元 json 不在同一根下：单独一条分支，避免把 guide/ 当数据根
        const abs = window.__guideDir + '/' + clean.slice(window.__guideRoot.length);
        try { body = window.__fs.readFileSync(abs, 'utf8'); } catch (e) { body = null; }
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
  dom.window.__guideRoot = GUIDE_ROOT;
  dom.window.__guideDir = path.join(ROOT, GUIDE_ROOT);
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
  // 有导语的单元会多一条 guide/ 请求；预取邻居若也有导语，最多再多 2 条。
  p('请求总数有界（索引 + 当前单元 + 导语 + ≤2 预取邻居，绝不拉全库）',
    afterBoot.length <= 8,
    `请求 ${afterBoot.length} 条：${afterBoot.join(', ')}`);
  p('请求全在数据根/导读根下（零外部请求）',
    afterBoot.every((u) => u.startsWith(DATA_ROOT) || u.startsWith(GUIDE_ROOT)),
    afterBoot.filter((u) => !u.startsWith(DATA_ROOT) && !u.startsWith(GUIDE_ROOT)).join(', '));
  p('首个请求就是索引', afterBoot[0] === INDEX_URL, afterBoot[0] ?? '(无)');
  p('第二个请求是当前单元', afterBoot[1] === meta.path, afterBoot.slice(1, 3).join(', '));
  if (meta.hasGuide) {
    const want = `${GUIDE_ROOT}${code.split('.')[0]}/${code}.json`;
    p('有导语的单元会取第三份数据', afterBoot.includes(want), afterBoot.slice(0, 5).join(', '));
  }

  // ── 基本渲染
  p('无致命错误浮层', !textOf(overlay).includes('数据索引读取失败'), textOf(overlay).slice(0, 120));
  p('阅读区非空（不白屏）', reader.children.length > 0);
  p('页面标题含代号', textOf(reader.querySelector('.pagehead h1')).includes(code));

  // ── 导读层（guide-card/v1）：有 hasGuide 就必须渲染，且位置在页头之后、正文之前
  const guideEl = reader.querySelector('.guide');
  if (meta.hasGuide) {
    p('导语已渲染', !!guideEl);
    const head = reader.querySelector('.pagehead');
    p('导语紧接在页头之后', !!head && head.nextElementSibling === guideEl);
    const firstBody = [...reader.children].find(
      (el) => el !== head && el !== guideEl && !el.classList.contains('guide'),
    );
    p('导语在正文之前', !!guideEl && !!firstBody &&
      (guideEl.compareDocumentPosition(firstBody) & 4) !== 0);
    const srcLink = guideEl?.querySelector('.guidesrc a');
    p('朗读版链接可点（Mode T 才有）',
      !srcLink || (srcLink.getAttribute('href') ?? '').startsWith('./reading.html#'));
    p('导语公式无渲染错误', !!guideEl && !guideEl.querySelector('.katex-error') &&
      !textOf(guideEl).includes('$'));
  } else {
    p('无导语时不渲染空块', !guideEl);
  }
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
    const secs = [
      ...reader.querySelectorAll('.docsec:not(.selftest):not(.interviewq):not(.projchildren)'),
    ];
    p('文档分节已渲染（节数 == 词条数，不含自测）', secs.length === unit.entries.length,
      `sections=${secs.length} entries=${unit.entries.length}`);
    const heads = reader.querySelectorAll(
      '.docsec:not(.selftest):not(.interviewq):not(.projchildren) .dochead',
    );
    const wantHeads = unit.entries.filter((e) => (e.level ?? 2) > 0 && (e.title ?? '').trim()).length;
    p('小节标题全部渲染', heads.length === wantHeads, `heads=${heads.length} want=${wantHeads}`);
    const mirrors = reader.querySelectorAll('.mirror');
    const wantMirror = unit.entries.filter((e) => e.mirror_of).length;
    p('真题镜像指针数量一致', mirrors.length === wantMirror, `mirrors=${mirrors.length} want=${wantMirror}`);
    p('镜像指针指向真题单元',
      [...mirrors].every((a) => /^EX\d{2}\.\d$/.test(a.getAttribute('data-goto') ?? '')),
      [...mirrors].slice(0, 3).map((a) => a.getAttribute('data-goto')).join(','));
    // 章首页的「本章考点」导航（2026-11-18）：数据来自 meta.kps，必须与索引里的考点一一对应。
    // 只对 chapter 单元生效；KP/真题/速学页没有 meta.kps，不产生这条断言。
    const kps = Array.isArray(unit.meta?.kps) ? unit.meta.kps : [];
    if (kps.length) {
      const nav = reader.querySelector('.chapkps');
      p('章首页渲染本章考点导航', !!nav, nav ? '' : '缺 .chapkps');
      const got = [...(nav?.querySelectorAll('[data-goto]') ?? [])]
        .map((a) => a.getAttribute('data-goto'))
        .filter(Boolean);
      p('考点导航与 meta.kps 一一对应',
        got.length === kps.length && got.every((g, i) => g === kps[i].code),
        `got=${got.join(',')} want=${kps.map((k) => k.code).join(',')}`);
    }
    const selftest = reader.querySelector('.selftest');
    // ── 页面契约分流（不按 subject 批量跳过）
    //  `meta.kind` 是数据侧真源：`project-group` / `project-index` 是**导航页**
    //  （一章的分组大纲 / 面试索引），它们把别的项目串起来，自己既不可交付也无判据
    //  —— `src/content/selftest.ts` 的 NO_SELFTEST_KINDS 与 `modules/graph.ts` 的
    //  `isLearnableUnit` 都这么判。这类页**只验可达性 / 导航 / 落点**，不跑 L1–L5；
    //  真实项目 / 数一考点（`project` / `kaoyan-kp`）**仍跑满 L1–L5**。
    const kind = unit.meta?.kind ?? '';
    if (kind === 'project' || kind === 'project-chapter') {
      p('项目页不再复制全局路线卡', reader.querySelectorAll('[data-route]').length === 0,
        `got=${reader.querySelectorAll('[data-route]').length}`);
    }
    if (kind === 'kaoyan-kp') {
      const back = reader.querySelector('.chapterlink');
      const want = `${code.split('.')[0]}.0`;
      p('考点页有回本章讲义的入口',
        back?.getAttribute('data-goto') === want,
        `got=${back?.getAttribute('data-goto') ?? '(无)'} want=${want}`);
    }
    const NAV_KINDS = new Set(['project-group', 'project-index']);
    const isNav = NAV_KINDS.has(kind);
    if (isNav) {
      // 导航页契约：不出自测区（答了也不作数 —— 这正是「点满五题右栏仍 L0」的旧 bug 现场）
      p(`导航页（${kind}）不渲染自测区`, !selftest,
        selftest ? `仍渲染了 ${selftest.querySelectorAll('.stbtn').length} 个自测按钮` : '');
      p('导航页仍渲染正文与页头', reader.children.length > 0 && textOf(reader.querySelector('.pagehead h1')).length > 0);
      // 落点：导航页必须真的能走到它串联的那些单元（不含自己、且都在索引里）
      const links = [...reader.querySelectorAll('[data-goto]')]
        .map((a) => a.getAttribute('data-goto'))
        .filter((g) => g && g !== code);
      p('导航页给出可达落点（data-goto 非空）', links.length > 0, `落点 ${links.length} 个`);
      p('导航页落点全部是索引里的真实单元',
        links.every((g) => ALL_CODES.includes(g)),
        [...new Set(links.filter((g) => !ALL_CODES.includes(g)))].slice(0, 5).join(','));
    } else if (selftest) {
      const buttons = [...selftest.querySelectorAll('.stbtn')];
      const keys = buttons.map((b) => b.getAttribute('data-selftest'));
      p('自测覆盖 L1–L5', [1, 2, 3, 4, 5].every((n) => textOf(selftest).includes(`L${n}`)));
      p('自测键唯一且使用统一作用域', new Set(keys).size === keys.length && keys.every((k) => k?.includes(':selftest.')));
      // 掌握度口径（src/content/selftest.ts）：**每一级的题全部达标才升到该级**，
      // 所以「点第一题就 L1」只在 L1 恰好只有一题时成立。这里从 DOM 读每题的 Lk 标签
      // 自己算「点 k 题后应有的等级」，逐个点、逐个断言 —— 顺便把「非末题提前升级」挡在闸门外。
      const levelOf = (btn) => {
        const m2 = /L([1-5])/.exec(textOf(btn.closest('li')?.querySelector('.sttag')));
        return m2 ? Number(m2[1]) : 0;
      };
      const levels = buttons.map(levelOf);
      const expected = (clicked) => {
        const done = new Set(clicked);
        let lv = 0;
        for (const target of [1, 2, 3, 4, 5]) {
          const idx = levels.map((l2, i) => (l2 === target ? i : -1)).filter((i) => i >= 0);
          if (!idx.length || !idx.every((i) => done.has(i))) break;
          lv = target;
        }
        return lv;
      };
      const ringNow = () => textOf(aside.querySelector('.ring .num'));
      const sideNow = () => textOf(selfNode?.querySelector('.m'));
      p('自测首屏掌握度为 L0（未答任何题）', ringNow() === 'L0', ringNow());
      const clicked = [];
      let earlyUp = '';
      let mismatch = '';
      for (let i = 0; i < buttons.length; i += 1) {
        buttons[i].click();
        clicked.push(i);
        const want = expected(clicked);
        const got = ringNow();
        if (got !== `L${want}` && !mismatch) mismatch = `第 ${i + 1} 题（L${levels[i]}）→ 期望 L${want} 实得 ${got}`;
        // 提前升级的**正确定义**：升到 `want` 级时，`want` 以下（含 want 自己）存在
        // 「有题但没答完」的级。也就是说，级别不能越过任何一道未答的题。
        //
        // 旧写法拿「刚点的那道题的等级」当基准（`want !== 该题等级 - 1`），
        // 于是 AL01 这种「L1 一道、L2 两道、L3 两道」的题库在点第 1 题（L1）时
        // 被判成「L3 还有未答题却升到 L1」—— 那是**正常**行为（L1 的题答完了），
        // 误报让整批 projects 单元红掉（96 个单元里有 12 个属此类）。
        const pendingBelow = [1, 2, 3, 4, 5]
          .filter((lv2) => lv2 <= want)
          .filter((lv2) => {
            const idx = levels.map((l2, k) => (l2 === lv2 ? k : -1)).filter((k) => k >= 0);
            return idx.length > 0 && !idx.every((k) => clicked.includes(k));
          });
        if (pendingBelow.length && !earlyUp) {
          earlyUp = `升到 L${want} 时 L${pendingBelow[0]} 尚有未答题`;
        }
      }
      p('逐题达标后才升级（全级题都答对才升，不假设首题即升级）', mismatch === '', mismatch);
      p('非末题不提前升级（同级仍有未答题时停在前一级）', earlyUp === '', earlyUp);
      const full = levels.length ? Math.max(...levels) : 0;
      p(`全部自测通过后掌握度为 L${full}`, ringNow() === `L${full}`, ringNow());
      p('自测后侧栏掌握度与右栏一致', sideNow() === ringNow(), `侧栏 ${sideNow()} / 右栏 ${ringNow()}`);
      const last = buttons[buttons.length - 1];
      p('自测按钮暴露开关状态', clicked.every((i) => buttons[i].getAttribute('aria-pressed') === 'true') &&
        last.getAttribute('aria-pressed') === 'true');
      // 收回：撤掉最后一题后必须退回前一级（增量刷新要跟着降，不能只升不降）
      last.click();
      p('撤销末题后掌握度退回前一级', ringNow() === `L${expected(clicked.slice(0, -1))}`,
        `期望 L${expected(clicked.slice(0, -1))} 实得 ${ringNow()}`);
      // 清空全部题目，把状态还原成 L0（后续断言/体检不带着残留掌握度跑）
      for (let i = buttons.length - 2; i >= 0; i -= 1) buttons[i].click();
      p('全部撤销后掌握度回到 L0', ringNow() === 'L0', ringNow());
    }
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
  p('目录与顶栏字母块可键盘聚焦', selfNode?.getAttribute('tabindex') === '0' &&
    [...d.querySelectorAll('#header .chapters b')].every((b) => b.getAttribute('tabindex') === '0'));
  p('左栏有域分组（域 → 章 → 单元三层）', d.querySelectorAll('#sidebar .dom').length > 0,
    `domains=${d.querySelectorAll('#sidebar .dom').length}`);
  for (const det of d.querySelectorAll('#sidebar details.chap')) det.setAttribute('open', '');
  await sleep(10); // <details> 的 toggle 事件是异步派发的，等一拍再数
  p('展开全部章后左栏节点数 == 索引单元数',
    d.querySelectorAll('#sidebar .node').length === INDEX.units.length,
    `nodes=${d.querySelectorAll('#sidebar .node').length} units=${INDEX.units.length}`);

  // ── Enter 键导航（app.ts 的 keydown：role=button + data-goto → goTo）
  //    「有 tabindex」不等于「按 Enter 真能走」，所以真派发一次键盘事件看路径是否改变。
  //    用侧栏另一个单元（不动 hash 即可验；goTo 走 hash 路由）。
  const enterTarget = [...d.querySelectorAll('#sidebar .node[role="button"][data-goto]')]
    .find((n) => n.getAttribute('data-goto') !== code);
  if (enterTarget) {
    const dest = enterTarget.getAttribute('data-goto');
    const before = dom.window.location.hash;
    enterTarget.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(120);
    p('Enter 键触发目录跳转（role=button + data-goto）',
      dom.window.location.hash === `#/${dest}`,
      `期望 #/${dest} 实得 ${dom.window.location.hash}（原 ${before}）`);
    const t1 = Date.now();
    while (Date.now() - t1 < 2000 && reader.dataset.loading === '1') await sleep(20);
    p('Enter 跳转后正文换成目标单元',
      textOf(reader.querySelector('.pagehead h1')).includes(dest ?? ''),
      textOf(reader.querySelector('.pagehead h1')).slice(0, 40));
    // 回到本单元，后续断言仍在原上下文中跑
    dom.window.location.hash = `#/${code}`;
    await sleep(150);
  } else {
    p('Enter 键导航目标存在（左栏另有一个单元可跳）', false, '侧栏只有当前单元');
  }
  p('右栏有掌握度/依赖/被用于',
    textOf(aside).includes('依赖') && textOf(aside).includes('被用于'));
  if (SUBJECT_ID === 'projects') {
    const front = d.getElementById('frontier');
    p('工程线横幅是总纲入口（不是「今天该学」）',
      textOf(front).includes('工程总纲') && !!front.querySelector('[data-graph]'),
      textOf(front).slice(0, 40));
    p('工程线不显示已达标/当前位置',
      !reader.querySelector('.pstepstep, .prouteprog, .prouteroute'));
    p('工程线右栏不显示掌握度环', !aside.querySelector('.ring'));
    p('工程线侧栏不显示 L 徽标', !selfNode?.querySelector('.m'));
  } else {
    p('frontier 横幅已算出', textOf(d.getElementById('frontier')).includes('今天该学'));
  }

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

  // ── 合成 entry-card 正例：每个「已进 READ_ORDER」的类型都必须真的渲染出来
  //    现场（2026-11-16）：`READ_ORDER` 早把 `example` 登记在 application 之后、
  //    viz 之前，但 `MORE_TYPES` 漏了它，`byType.get('example')` 在 `more` 里取不到 ——
  //    该类型词条**不进任何 tab、也不进 vizslot**，渲染无声消失（不报错、不占位）。
  //    真数据目前 75 条 example 全在 doc-card/v1（走 renderDocHtml，不受影响），
  //    所以这条缺口在现有数据上**看不见**，只能靠合成的 entry-card 组来守。
  if (!isDoc) await runSyntheticEntryCard();

  // ── 限定词拆解（灵魂词条）：走真数据、默认可见、可点行锚到真实词条
  const qTableLines = quant ? (quant.content?.match(/^\s*\|/gm)?.length ?? 0) : 0;
  const expectTable = qTableLines >= 2;
  if (hasQuant) {
    // 限定词块在 `.card` 的 innerHTML 里拼出来，但要等该卡真的被渲染。
    // 全量跑时（进程里已开过几百个 jsdom）重单元首屏会更慢，
    // 采样一次可能撞在「卡还没进 DOM」的瞬间 —— 那会把 6 条断言全判红
    // （AG16.23 / NM02.2 / TL06.2 在全量偶发、单跑必绿，实测核对）。
    // 这里等它出现（最多 2s），出现即继续，不拖慢正常单元。
    const tq = Date.now();
    while (Date.now() - tq < 2000 && !reader.querySelector(`.qbody[data-q="${qId}"]`)) await sleep(20);
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
  //
  // `mountViz` **不是同步完成**的：`viz/kit.ts` 用 canvas + rAF + ResizeObserver 绘制，
  // 声明式模块还要先跑一遍 invariant 自检。上面刚点过「掌握度 +1」与全部 tab，
  // 都可能在 viz 还没落位时就把断言跑到 —— 全量跑时进程已开过几百个 jsdom，
  // 机器更忙，于是出现「渲染 7 / 应有 8」「渲染 6 / 应有 10」这类**假红**
  // （同一单元单独跑时是 8/8、10/10，已实测核对）。
  //
  // 所以这里等 `.vizitem` 数量**收敛到期望值**再断言（最多 2s），
  // 而不是「采样一次就判」。数量一旦够了立即通过，不会拖慢正常的单元。
  const plannedEntries = vizFront.length + vizPlanned.length;
  const vizCount = () => reader.querySelectorAll('.vizslot .vizitem .viz').length;
  if (plannedEntries) {
    const tv = Date.now();
    while (Date.now() - tv < 2000 && vizCount() < plannedEntries) await sleep(20);
  }
  const vizRendered = vizCount();
  const unregistered = allText.match(/尚未在前端注册/g)?.length ?? 0;
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
  const external = reqs().filter((u) => !u.startsWith(DATA_ROOT) && !u.startsWith(GUIDE_ROOT));
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
    // 真正的指标：按需加载没有退化成全量 —— 全程拉过的单元文件数要远小于全库。
    //
    // 阈值**按预取契约算**（app.ts 的 prefetch：`requestIdleCallback` 拉 idx+1 / idx+2），
    // 不是拍一个数字再往上加 1。一个单元断言里一共走三条加载路径：
    //   ① 首屏        当前单元 + 2 个预取邻居
    //   ② Enter 导航  侧栏另一个单元 + 2 个预取邻居
    //   ③ 切到 other （全库第一个单元）+ 2 个预取邻居
    // 三条路径的邻居可能重合，所以去重后的**上界**是 3*(1+2) = 9；实测恰好 9
    // （math1 HS02.1：HS02.1/2/3 + DM01/2/3 的邻居，加 Enter 目标 = 9）。
    //
    // 因此不变式两条，缺一不可：
    //   · `<= PREFETCH_BOUND`（契约上界，越界说明有第四条加载路径 —— 真回归）
    //   · `< 全库/4`（仍未退化成全量；106 单元 → 26，81 单元 → 20）
    // 只写 `<=8` 会把契约内的合法行为判红（旧写法 40 处失败的来源）；
    // 只写「+1」则会把真实回归一起放过。
    const PREFETCH_BOUND = 3 * (1 + 2);
    const fetchedUnits = new Set(
      reqs().filter((u) => u !== INDEX_URL && u.startsWith(DATA_ROOT)),
    );
    const quarterLib = Math.floor(INDEX.units.length / 4);
    p('全程拉过的单元文件数在预取契约上界内，且远小于全库（未退化成全量）',
      fetchedUnits.size <= PREFETCH_BOUND && fetchedUnits.size <= quarterLib,
      `拉过 ${fetchedUnits.size} / 全库 ${INDEX.units.length}` +
        `（契约上界 ${PREFETCH_BOUND}，全库 1/4 = ${quarterLib}）`);

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

/* ------------------------------------------ 代码文本 vs 数学定界符（渲染层） */

/**
 * `$` 在**代码**里是字面量，在数学里是定界符 —— 这是渲染层最容易踩的一条线。
 *
 * 现场（2026-11-15）：工程线 SO01.2 正文有一句
 *   `ls -l /proc/$PID/fd | awk '{print $NF}' | sort | uniq -c`
 * 写在反引号里。旧 renderInline 先切 MATH 再管代码，于是 `$PID/fd | awk '{print $` 被当成
 * 行内公式送进 KaTeX，报 `Expected '}', got 'EOF'`，正文里嵌一颗红字 `.katex-error`
 * —— 体检（--audit）判 P0「KaTeX 报错」，用户看到的就是坏页面。
 *
 * 这里不走页面导航，直接打渲染层（**生产代码**，规则不写第二份），因为要断的是
 * HTML 语义（哪段在 `<code>` 里、哪段在 `<annotation>` 里），DOM 文本比对分不出来。
 * 只在 projects 站跑：shell 片段是工程线文档的常态，数学站没有这类正文。
 */
async function runMathCodeGuard() {
  const { renderContent, renderInline } = await requireTs('src/renderers/markdown.ts');
  const BT = '`';
  const F = BT + BT + BT;
  const codeTexts = (html) => [...html.matchAll(/<code>([\s\S]*?)<\/code>/g)].map((m2) => m2[1]);
  const annos = (html) =>
    [...html.matchAll(/<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/g)].map((m2) => m2[1]);

  console.log('\n9) 代码文本不被当数学（$-定界符）');

  // ① 真实数据形态：awk 的 $NF（SO01.2 的 P0 现场），$ 在反引号里
  {
    const src = `x ${BT}ls -l /proc/$PID/fd | awk '{print $NF}' | sort | uniq -c${BT} y`;
    const out = renderContent(src);
    check('行内代码里的 $NF 不进 KaTeX（无 .katex-error）', !/katex-error|katex-fail/.test(out), out.slice(0, 140));
    check('行内代码里的 $NF 完全不算公式（无 .katex）', !/class="katex"/.test(out), out.slice(0, 140));
    check('awk $NF 的代码文本原样保留',
      codeTexts(out)[0] === "ls -l /proc/$PID/fd | awk '{print $NF}' | sort | uniq -c",
      JSON.stringify(codeTexts(out)));
  }
  // ①b 同一形态的第二个现场：awk 取第 4 列
  {
    const out = renderContent(`c ${BT}awk 'NR>1{print $4}' /proc/net/tcp${BT} d`);
    check('awk $4 不进 KaTeX', !/class="katex"/.test(out) && !/katex-error/.test(out), out.slice(0, 140));
    // 代码内容是**已转义**的 HTML（`>` → `&gt;`），期望值按同一口径写；
    // 这条要验的是「$ 与代码正文都还在、没被公式切走」，不是转义策略。
    check('awk $4 代码文本保留', codeTexts(out)[0] === "awk 'NR&gt;1{print $4}' /proc/net/tcp", JSON.stringify(codeTexts(out)));
  }
  // ② shell 的 $$（PID 变量）：行内代码 + 围栏代码块都必须按字面量走
  {
    const inline = renderContent(`p ${BT}echo $$; top -H -p $$${BT} q`);
    check('行内代码里的 $$ 不渲染成 KaTeX（shell PID 不回归误报）',
      !/class="katex"/.test(inline) && !/katex-error/.test(inline), inline);
    check('行内代码里的 $$ 文本保留', codeTexts(inline)[0] === 'echo $$; top -H -p $$', JSON.stringify(codeTexts(inline)));
    const fenced = renderContent(`p\n\n${F}sh\necho $$; cat /proc/$$/smaps_rollup\n${F}\n\nq`);
    check('围栏代码块里的 $$ 原样输出（pre 内，无 KaTeX）',
      /<pre class="md-pre">[\s\S]*echo \$\$; cat \/proc\/\$\$\/smaps_rollup[\s\S]*<\/pre>/.test(fenced) &&
        !/class="katex"/.test(fenced),
      fenced.slice(0, 160));
  }
  // ③ 混排：真公式与代码在同一行，互相不吞并
  {
    const out = renderInline(`$x$ 与 ${BT}echo $$${BT} 与 $y$`);
    const an = annos(out);
    check('公式与代码混排：两个公式都在且顺序正确',
      an.length === 2 && an[0] === 'x' && an[1] === 'y', JSON.stringify(an));
    check('公式与代码混排：中间是代码且文本正确', codeTexts(out)[0] === 'echo $$', JSON.stringify(codeTexts(out)));
    check('公式与代码混排：无 KaTeX 报错', !/katex-error/.test(out), out.slice(0, 140));
  }
  // ④ 正常公式不因这次的修复回归
  {
    const inline = renderContent('$x^2$ ok');
    check('行内公式 $x^2$ 仍渲染', annos(inline)[0] === 'x^2', JSON.stringify(annos(inline)));
    const disp = renderContent('$$(a+b)^2$$');
    check('单行行间公式 $$…$$ 仍渲染', annos(disp)[0] === '(a+b)^2', JSON.stringify(annos(disp)));
    const multi = renderContent('$$a=b\n+c$$');
    check('跨行行间公式（断行）仍渲染', annos(multi)[0] === 'a=b\n+c', JSON.stringify(annos(multi)));
    const bold = renderContent('**$m$ 阶极点**');
    check('粗体包公式仍成对（** 不因 stash 分家）',
      /^<p><b>[\s\S]*class="katex"[\s\S]*阶极点<\/b><\/p>$/.test(bold), bold.slice(0, 120));
    const dollar = renderContent('$\\$1$ 元');
    check('公式内的 \\$ 仍渲染（R3 不回归）', annos(dollar)[0] === '\\$1' && /元/.test(dollar), JSON.stringify(annos(dollar)));
  }
  // ⑤ 表格单元格：代码里的 | 不切列、$ 不翻转公式状态
  {
    const out = renderContent(`| a | b |\n| --- | --- |\n| ${BT}cut -d'|' -f1${BT} | $x$ |`);
    const tds = [...out.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((m2) => m2[1]);
    check('表格里代码含 | 不切出多余列', tds.length === 2, `tds=${tds.length} ${out.slice(0, 160)}`);
    check('表格里代码含 | 文本保留', /cut -d'\|' -f1/.test(tds[0] ?? ''), tds[0] ?? '');
    check('表格单元格里的公式仍渲染', annos(tds[1] ?? '')[0] === 'x', tds[1] ?? '');
  }
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
  check('快照登记 guideRoot', typeof dom.window.__kbStandalone?.guideRoot === 'string' &&
    dom.window.__kbStandalone.guideRoot === subj.guideRoot, dom.window.__kbStandalone?.guideRoot ?? '(无)');
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
  // 工程线首屏是总纲页（不是单元页），侧栏没有当前章可展开 → 允许 nodes=0；
  // 但域分组必须渲染，且阅读区确实是总纲。
  const startsAtPlan =
    SUBJECT_ID === 'projects' && textOf(reader).includes('工程总纲');
  check('快照左栏分层渲染（域分组 + 节点数 ≤ 内联单元数）',
    d.querySelectorAll('#sidebar .dom').length > 0 &&
      (startsAtPlan || d.querySelectorAll('#sidebar .node').length > 0) &&
      d.querySelectorAll('#sidebar .node').length <= inlineUnits,
    `doms=${d.querySelectorAll('#sidebar .dom').length} nodes=${d.querySelectorAll('#sidebar .node').length} inline=${inlineUnits}`);

  // ── 语义边在快照里仍然有效（2026-09-25：快照曾静默丢掉 graph/*.yaml 的语义边，
  //    现在语义边是**构建期烘进索引**的，所以断言索引里带 sem 字段）
  const idxUnits = pack?.index ?? [];
  const inlineSem = idxUnits.filter((u) => u && typeof u.sem === 'object' && u.sem !== null).length;
  // 语义边是人工标注：只按**本学科 graph 根下真有 yaml** 才要求非零。
  // 2026-11-15：四个学科都已有 yaml（graph / cs408/graph / kaoyan/graph / projects/graph），
  // 旧注释「数一 / 工程线还没有」已过期 —— 有 yaml 却 sem=0 就是构建漏烘，必须红。
  const graphDir = path.join(ROOT, subj.graphRoot.replace(/\/$/, ''));
  const yamlCount = fs.existsSync(graphDir)
    ? fs.readdirSync(graphDir).filter((n) => n.endsWith('.yaml')).length
    : 0;
  // 期望值一律从 **yaml 真源**独立推导，不用构建产物自己验自己：
  //   yamlDeclNodes = yaml 里 nodes 声明的**全部**代号（不论索引里有没有）——作分母，防止
  //                   「yaml 代号与索引错位 → 交集成空 → 断言空真」这类静默盲区；
  //   yamlNodes     = 上述代号里真在索引中的（这些**必须**带 sem，即使四类边全空）；
  //   yamlEdges     = yaml 真正声明的边条目总数（四类之和；0 = 该图「已覆盖但本来就是无边图」）。
  const yamlDeclCodes = new Set();
  const yamlNodes = new Set();
  let yamlEdges = 0;
  let yamlBad = 0;
  if (yamlCount > 0) {
    const idxCodes = new Set(idxUnits.map((u) => u?.code));
    for (const name of fs.readdirSync(graphDir).filter((n) => n.endsWith('.yaml')).sort()) {
      let doc = null;
      try {
        doc = YAML.parse(fs.readFileSync(path.join(graphDir, name), 'utf8'));
      } catch {
        yamlBad += 1; // 坏 yaml 由 check:graph 报红，这里不计入期望
        continue;
      }
      for (const [code, node] of Object.entries(doc?.nodes ?? {})) {
        yamlDeclCodes.add(code);
        if (idxCodes.has(code)) yamlNodes.add(code);
        for (const k of ['prereq', 'applies', 'tension', 'dual']) {
          const v = node?.[k];
          if (Array.isArray(v)) yamlEdges += v.length;
        }
      }
    }
  }
  // yaml 里声明了、但索引里压根没这个代号 = 真源与数据根错位（多半是路径/改名问题），必须红
  const yamlOrphans = [...yamlDeclCodes].filter((c) => !yamlNodes.has(c));
  const semCovered = idxUnits.filter((u) => u?.code && yamlNodes.has(u.code) &&
    u.sem && typeof u.sem === 'object' && u.sem !== null).length;
  // 断言 A（防「全部 sem 被丢」）：yaml 覆盖到的每个单元都必须带 sem 字段。
  // 这一条对 cs408 也成立 —— 它的 2 个节点即便四类边全空，也必须有 sem 对象，
  // 否则就是构建漏烘（历史上 HARNESS_JSON 改动让语义边静默全丢就是这么坏的）。
  if (yamlCount > 0) {
    check('内联索引带语义边（sem 已烘入，不靠运行期 fetch graph/*）',
      yamlNodes.size > 0 && semCovered === yamlNodes.size && yamlOrphans.length === 0,
      `${subj.graphRoot} ${yamlCount} 个 yaml；yaml 声明 ${yamlDeclCodes.size} 个代号、其中存在于索引的 ` +
      `${yamlNodes.size} 个里带 sem 的 ${semCovered} 个` +
      (yamlOrphans.length ? ` / yaml 有而索引无的代号 ${yamlOrphans.length} 个（${yamlOrphans.slice(0, 5).join(',')}）` : '') +
      `（索引 ${idxUnits.length} 单元 / 带 sem 的 ${inlineSem} 个${yamlBad ? ` / 坏 yaml ${yamlBad}` : ''}）`);
  } else {
    check('无 yaml 时语义边为 0 且不报错（下一期人工标注）', inlineSem === 0, `sem=${inlineSem}`);
  }
  check('快照不依赖 graph/*.yaml 数据（运行期零 graph 请求）',
    !/"graph\/[A-Za-z0-9]+\.yaml":/.test(html),
    '快照里仍内联着 yaml —— 应已移除（语义边在索引里）');

  // ── 依赖栏在快照里真的可用（不只是「索引有个 sem 字段」）
  //    右栏「依赖 ◂ / 被用于 ▸」应出 chip：有 sem.prereq 的单元必须列出前序代号，
  //    有 sem.applies / sem.dual 的单元必须出现在对方的被用于里；全库一个 chip 都没有 = 语义边没接上界面。
  const aside = d.getElementById('aside');
  const asideTxt = textOf(aside);
  const semWithPrereq = idxUnits.filter((u) => Array.isArray(u?.sem?.prereq) && u.sem.prereq.length);
  const semWithFwd = idxUnits.filter(
    (u) => (u?.sem?.applies?.length ?? 0) + (u?.sem?.dual?.length ?? 0) + (u?.sem?.tension?.length ?? 0) > 0,
  );
  if (yamlCount > 0 && !startsAtPlan) {
    check('快照右栏渲染「依赖 / 被用于」两栏',
      asideTxt.includes('依赖') && asideTxt.includes('被用于'), asideTxt.slice(0, 120));
    // 首屏单元的 sem 若带 prereq，右栏依赖栏必须把前序代号列出来（不是只说「无前序」）
    const curH1 = textOf(reader.querySelector('.pagehead h1'));
    const cur = idxUnits.find((u) => curH1.includes(u.code));
    if (cur?.sem?.prereq?.length) {
      const listed = cur.sem.prereq.filter((c) => asideTxt.includes(c));
      check(`快照首屏单元 ${cur.code} 的依赖栏列出前序代号`,
        listed.length === cur.sem.prereq.length,
        `prereq=${cur.sem.prereq.join(',')} 列出 ${listed.length} 个 / 栏内「${asideTxt.slice(0, 100)}」`);
    } else {
      // 首屏单元没有 sem.prereq（拓扑起点）：只能验两栏已渲染 + 说明文案，不硬造断言。
      //
      // 可接受的三种说明（**都是「无前序」的合法表达**，判据按语义收而不是按字面收）：
      //   · 「无前序（拓扑序起点）」   —— 未标注时的默认说法；
      //   · 「起点（真源已标注）」     —— yaml 显式声明为空且确有下游（更准，见
      //                                  `app.ts:prereqEmptyNote` 第 2 分支）；
      //   · 「组内无前序（真源已标注）。跨章关联 N 条…」—— 有跨章 links 但方向未判定。
      //
      // 2026-11-16 修：旧判据只认前两种字面（`无前序` / `暂无`），漏掉了
      // 「起点（真源已标注）」这一**最精确**的分支，于是 math1 快照首屏（HS01.0，
      // 被 QK05.1 依赖、yaml 明确声明无前序）长期判红 —— 断言比数据窄，是断言的问题。
      const explainsEmpty =
        asideTxt.includes('无前序') || asideTxt.includes('暂无') || asideTxt.includes('起点（真源已标注）');
      check('快照首屏单元无前序时依赖栏给出说明', explainsEmpty, asideTxt.slice(0, 100));
    }
    // 全库层面（防「构建退化成全空」）：**期望值以 yaml 真源为准**，不假定每个学科都有 prereq。
    //
    //   yamlEdges > 0 → yaml 真声明了边，索引里必须烘出对应数量的边单元，否则是构建丢 sem；
    //   yamlEdges = 0 → 该学科图是「已覆盖、本来就是无边图」（如 cs408 的 OS01/OS02 两章，
    //                   yaml 注释明确写「没有人工标注的语义边，保留空边表示已覆盖、不是漏标」），
    //                   此时硬要求 prereq 就是拿断言伪造内容依赖 —— 改为验「覆盖标记齐全 + 确实无边」。
    const semEdges = semWithPrereq.length + semWithFwd.length;
    if (yamlEdges > 0) {
      check('yaml 声明的语义边已烘入索引（未退化成空对象）', semEdges > 0,
        `yaml 声明 ${yamlEdges} 条边；索引里有 prereq 的 ${semWithPrereq.length} 个 / 有正向边的 ${semWithFwd.length} 个`);
    } else {
      // 无边图：既要证明「没丢」（覆盖标记齐全，见上面断言 A），也要盯住「不是构建全空」
      check('yaml 无边图时索引如实为无边（不伪造 prereq）', semEdges === 0,
        `yaml 声明 0 条边；索引里有 prereq 的 ${semWithPrereq.length} 个 / 有正向边的 ${semWithFwd.length} 个` +
        `（若 >0 说明凭空造边，与 yaml 契约不符）`);
      check('无边图仍带 sem 覆盖标记（区分「无边」与「构建丢 sem」）', semCovered > 0,
        `yaml 覆盖 ${yamlNodes.size} 个单元 / 带 sem 的 ${semCovered} 个`);
    }
  }

  // 2026-10-30 起两个文档页分开：
  //   #graph  = 总纲（数学大观 v1：四条主轴 / 两个出口 / 交叉点 / 五个切入点 / 四阶段）
  //   #angles = 切入点（原「现代分析学总纲 v3.0」，一条具体路线，不是全学科总纲）
  if (SUBJECT_ID === 'projects') {
    dom.window.location.hash = '#graph';
    await sleep(120);
    const rd = d.getElementById('reader');
    const txt = textOf(rd);
    check('工程总纲能渲染（五类能力线 + 工程实践/性能工程）',
      txt.includes('五类能力线') && txt.includes('工程实践') && txt.includes('性能工程'));
    check('工程总纲写明「进度不在这里」', txt.includes('进度不在这里'));
    check('工程总纲渲染 7 条路线卡', rd.querySelectorAll('[data-route]').length === 7,
      `got=${rd.querySelectorAll('[data-route]').length}`);
    check('工程总纲不显示已达标/当前位置/进度摘要',
      !rd.querySelector('.pstepstep, .prouteprog, .prouteroute'));
    check('工程总纲路线卡有可点落点', rd.querySelectorAll('.proute [data-goto]').length > 0);
    check('工程总纲右栏不显示掌握度环', !d.getElementById('aside').querySelector('.ring'));
    const tGuide = Date.now();
    while (Date.now() - tGuide < 1500 && !rd.querySelector('.guide')) await sleep(20);
    check('工程总纲顶部有站点级导语（scope=site）', !!rd.querySelector('.guide'));
    check('站点导语不替代路线卡', rd.querySelectorAll('[data-route]').length === 7,
      `got=${rd.querySelectorAll('[data-route]').length}`);
    dom.window.close();
    return;
  }
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

/**
 * Markdown 里**属于数学定界符**的 `$$` 个数（剥掉代码块 / 行内代码之后数）。
 *
 * 为什么必须剥：工程线与运维类文档的正文里有大量 shell 片段，
 * `$$` 在那里是 **PID 变量**（`echo $$`、`cat /proc/$$/smaps_rollup`、`top -H -p $$`）。
 * 直接数 `$$` 会把这些**正确的**文档判成「$$ 未配对」+「公式裸泄漏」。
 *
 * 剥法按 Markdown 常识：围栏代码块（``` / ~~~）、缩进代码块、行内代码（`…`）。
 * 只改写不改删 —— 用等长空白替换，保持与原文对齐便于人工核对偏移。
 */
function countTexDelims(md) {
  const stripped = String(md)
    .replace(/^ {0,3}(```|~~~)[\s\S]*?^ {0,3}\1/gm, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^ {4,}\S.*$/gm, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, (m) => m.replace(/[^\n]/g, ' '));
  return (stripped.match(/\$\$/g) ?? []).length;
}

/**
 * 两种数据契约，字段要求不同 —— 体检必须分开判，否则「按 entry-card 的字段单去查
 * doc-card」会把整站都判成坏数据（这就是原先 81 个 projects 单元全红、
 * P1 里 636 条 `keywords 越界` 的来源）。
 *
 *   · `entry-card/v1|v2`（数学词条 / 408 / 数一考点）：**模型生成的内容**。
 *     词条必须带 `keywords`（检索/限定词拆解要用）、`status`、`generated_by`，
 *     还要有 `links` 交叉引用。这些是**它在页面上的功能依赖**，缺了就是真缺陷。
 *   · `doc-card/v1`（从 notebook 搬运的文档）：作者写的文档按「节」渲染，
 *     词条只有 `id / type / title / level / content`。它**不参与检索与限定词拆解**，
 *     也没有生成元数据 —— 查 `keywords` / `status` / `generated_by` 是**套错契约**。
 *     对它的正确判据是：正文非空、id 前缀对、标题层级在、内容里没有未回填标记。
 */
function dataIssues(code, unit, regs) {
  const out = [];
  const add = (level, kind, detail = '') => out.push({ level, kind, detail });
  if (!Array.isArray(unit.entries) || unit.entries.length === 0) {
    add('P0', '无词条', 'entries 为空或非数组');
    return out;
  }
  const isDoc = unit.schema === 'doc-card/v1';
  const codes = new Set(ALL_CODES);
  for (const e of unit.entries) {
    const id = e?.id ?? '(无 id)';
    if (!e?.content || !String(e.content).trim()) add('P1', '空正文', id);
    if (typeof e?.id === 'string' && !e.id.startsWith(`${code}:`)) {
      add('P1', 'id 前缀不符', `${id} 应为 ${code}:…`);
    }
    // `keywords` 只是 entry-card 的契约（doc-card 的词条没有这个字段，见上）
    if (!isDoc) {
      const kw = e?.keywords;
      if (!Array.isArray(kw) || kw.length < 3 || kw.length > 7) {
        add('P1', 'keywords 越界', `${id} = ${Array.isArray(kw) ? kw.length : '非数组'}`);
      }
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
      // `$$` 计数**必须先剥掉代码**：工程线的正文里 `$$` 是 shell 的 PID 变量
      // （`echo $$` / `/proc/$$/smaps_rollup` / `top -H -p $$`），不是 LaTeX 块定界符。
      // 不剥就把「文档写得对」判成「$$ 未配对 + 公式裸泄漏」
      // （SO00.2 / SO06.2 / EG05.2 三处误报的来源）。
      const dd = countTexDelims(e.content);
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
  // doc-card/v1 走文档渲染：**按「节」出 `.docsec`，一个 `.card` 都没有**（div 卡片会把
  // 长文切碎）。所以「无卡片」只对 entry-card 成立；对文档契约，判据是「节渲染出来了」。
  const docsecs = [...reader.querySelectorAll('.docsec:not(.selftest)')];
  if (!cards.length && !docsecs.length) add('P0', '无卡片', '');
  if (docsecs.length && !cards.length) {
    const hasHead = docsecs.some((s) => s.querySelector('.dochead'));
    if (!hasHead) add('P2', '文档节缺标题层级', `${docsecs.length} 节无 .dochead`);
  }
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
  // 「公式裸泄漏」= **本该渲染成数学**的 `$$` 漏在正文里。代码块里的 `$$` 是 shell 的
  // PID 变量（`echo $$`），属于正文正确内容 —— 因此先把代码节点从统计里摘掉再判定。
  // 摘法：克隆一份 reader，删掉 `pre/code/.md-pre/.md-code/kbd` 这些「代码容器」，
  // 再看剩下的文本里还有没有 `$$`。
  const probe = reader.cloneNode(true);
  for (const el of [...probe.querySelectorAll('pre, code, kbd, .md-pre, .md-code, .viz, .vizslot')]) {
    el.remove();
  }
  const texTxt = textOf(probe);
  if (/\$\$/.test(texTxt)) {
    add('P2', '公式裸泄漏', (texTxt.match(/.{0,20}\$\$.{0,20}/) ?? [''])[0]);
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

/* ------------------------------------------------- 合成 entry-card 正例 */

/**
 * `READ_ORDER` 登记的每一种类型，都必须真的落到某个 tab（或独立块）里。
 *
 * 为什么单独做一份**合成**数据：`MORE_TYPES` 漏登记 = 该类型词条渲染无声消失，
 * 这种缺口在现有数据上可能完全看不见（目前 75 条 `example` 全在 doc-card/v1，
 * 走 `renderDocHtml`，压根不经过 `MORE_TYPES`）。等数据侧真在 entry-card 引入该类型时，
 * 用户才会发现「例题怎么没了」，而那时距离引入已经过去很久。
 *
 * 用生产代码 `renderCard`（不写第二份规则），在一个最小 DOM 里渲染一张合成卡，
 * 断言：
 *   · 每个类型的词条 id 都出现在 DOM 里（渲染出来）
 *   · 「更多」面板内按 READ_ORDER 排（example 在 viz / counterexample / probe 之前）
 *   · 四问 tab（statement/intuition/proof/application）不因此回归
 * 只在 entry-card 单元上跑；合成组不碰真数据。
 */
let syntheticDone = false;
async function runSyntheticEntryCard() {
  if (syntheticDone) return; // 每个进程只跑一次（结论与单元无关）
  syntheticDone = true;

  const cardMod = await requireTs('src/renderers/card.ts');
  if (typeof cardMod.renderCard !== 'function') {
    check('合成 entry-card：renderCard 可载入', false, 'src/renderers/card.ts 未导出 renderCard');
    return;
  }
  // renderCard 依赖 document：给它一个最小 jsdom（不跑应用，只当 DOM 工厂）
  const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', {
    url: 'http://localhost/',
  });
  const g = globalThis;
  const saved = { document: g.document, window: g.window, HTMLElement: g.HTMLElement };
  g.document = dom.window.document;
  g.window = dom.window;
  g.HTMLElement = dom.window.HTMLElement;

  const CODE = 'SYN.1';
  const SUBJ = 'synsubject';
  // 倒序声明：若渲染只是「按原数组顺序」，序断言就抓不到 READ_ORDER 的排序作用
  const TYPES = ['probe', 'counterexample', 'viz', 'example', 'extension', 'application',
    'proof', 'intuition', 'statement', 'comparison'];
  const entries = TYPES.map((t) => ({
    id: `${CODE}:${SUBJ}.${t}`,
    type: t,
    subject: SUBJ,
    title: `合成词条 ${t}`,
    keywords: ['a', 'b', 'c'],
    status: 'drafted',
    generated_by: { model: 'glm', date: '2026-11-16' },
    content: `合成正文 ${t}`,
  }));
  const file = { code: CODE, schema: 'entry-card/v2', entries };
  const index = { codes: new Set([CODE]) };
  const group = { key: `${CODE}:${SUBJ}`, label: '合成组', subject: SUBJ, entries };

  let rendered = null;
  let err = '';
  try {
    rendered = cardMod.renderCard(file, group, index);
  } catch (e) {
    err = e?.message ?? String(e);
  } finally {
    g.document = saved.document;
    g.window = saved.window;
    g.HTMLElement = saved.HTMLElement;
  }
  check('合成 entry-card 渲染不抛错', !!rendered && !err, err);
  if (!rendered) {
    dom.window.close();
    return;
  }

  const el = rendered.el;
  dom.window.document.getElementById('host').append(el);
  // 懒渲染：把每个 tab 都点开，让所有 pane 填上内容
  for (const btn of [...el.querySelectorAll('.tabs button')]) {
    btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  }

  const visible = new Set([...el.querySelectorAll('.entry')].map((n) => n.getAttribute('data-id')));
  const missing = entries.map((e) => e.id).filter((id) => !visible.has(id));
  check('合成 entry-card：每种类型的词条都渲染进 DOM（无静默丢失）',
    missing.length === 0, `未渲染 ${missing.length}/${entries.length}：${missing.join(', ')}`);

  // 「更多」面板内的相对顺序：example 必须在 viz / counterexample / probe 之前
  // （READ_ORDER 的 rank：example 7 < viz 8 < counterexample 9 < probe 10）
  const paneOf = (t) => [...el.querySelectorAll('.pane')].find((p) =>
    [...p.querySelectorAll('.entry')].some((n) => n.getAttribute('data-id') === `${CODE}:${SUBJ}.${t}`));
  const morePane = paneOf('example');
  const order = morePane
    ? [...morePane.querySelectorAll('.entry')].map((n) => n.getAttribute('data-id'))
    : [];
  const pos = (t) => order.indexOf(`${CODE}:${SUBJ}.${t}`);
  check('合成 entry-card：example 在「更多」面板内',
    pos('example') >= 0,
    order.length ? order.join(' → ') : '(未找到含 example 的面板)');
  check('合成 entry-card：example 排在 viz / 反例 / 检验题之前（READ_ORDER）',
    pos('example') >= 0 && pos('example') < pos('viz') &&
      pos('example') < pos('counterexample') && pos('example') < pos('probe'),
    `序：example=${pos('example')} viz=${pos('viz')} cx=${pos('counterexample')} probe=${pos('probe')}`);

  // 四问 tab 不因这次补齐而回归：statement/intuition/proof/application 各自成 tab
  for (const t of ['statement', 'intuition', 'proof', 'application']) {
    check(`合成 entry-card：${t} 有独立 tab 且渲染`, !!paneOf(t), `${t} 未成 tab`);
  }

  dom.window.close();
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
  GUIDE_ROOT = SUBJ.guideRoot;
  // 语义边根从学科配置取（锚定仓库根，不随 HARNESS_JSON 漂移）——语义边烘进索引后，
  // 右栏/frontier 的断言才是在验真源而不是编号序启发式。
  const guideRoot = SUBJ.guideRoot.endsWith('/') ? SUBJ.guideRoot.slice(0, -1) : SUBJ.guideRoot;
  INDEX = kbIndex.buildIndex(
    JSON_DIR,
    path.join(ROOT, SUBJ.graphRoot.replace(/\/$/, '')),
    DATA_ROOT,
    path.join(ROOT, guideRoot),
  );
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

  // 代码文本 vs 数学定界符：只在工程线跑（shell/awk 片段是那边文档的常态）。
  // 放在单元断言之后、快照之前 —— 它验的是渲染层不变式，与具体单元无关。
  if (SUBJECT_ID === 'projects') await runMathCodeGuard();

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
