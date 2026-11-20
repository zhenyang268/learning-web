#!/usr/bin/env node
/**
 * guide-card/v1 闸门。
 *
 * 三件事：
 *   1. 结构：schema/必填/长度/why 条数/公式配平/禁词/代号存在；
 *   2. 漂移：card.source.talkSha / unitSha 必须等于源头当前 sha256 前 12 位；
 *   3. 覆盖：_map.json 里每个 code 必须在 _progress.json 里 done 或显式 skip。
 *
 * `--allow-incomplete` 只放宽「pending 必须清零」，不放宽任何一条结构判据 ——
 * 施工中间态可以缺篇，但写下来的每一篇都必须合格。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const NB_ROOT = path.resolve(ROOT, '..');
const GUIDE_ROOT = path.join(ROOT, 'guide');

const SITE_JSON = {
  math: 'json',
  emath: 'emath/json',
  cs408: 'cs408/json',
  kaoyan: 'kaoyan/json',
  math1: 'kaoyan/json',
  projects: 'projects/json',
  english1: 'english1/json',
};

const FORBIDDEN = ['非常重要', '高频', '众所周知', '显然', '本导读', '我们', '你可能会想'];
const UNICODE_SUP = /[²³¹⁰⁴⁵⁶⁷⁸⁹ᵀᴴᴸᵖ]/;

function sha12(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 12);
}

function plainLen(s) {
  return [...String(s ?? '').replace(/\s+/g, '')].length;
}

function stripMath(s) {
  return String(s ?? '').replace(/\$[^$]*\$/g, '');
}

function collectCodes(site) {
  const root = path.join(ROOT, SITE_JSON[site] ?? '');
  const out = new Set();
  if (!fs.existsSync(root)) return out;
  for (const chapter of fs.readdirSync(root)) {
    const dir = path.join(root, chapter);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.json') && name !== 'index.json') out.add(name.slice(0, -'.json'.length));
    }
  }
  return out;
}

/** 返回错误数组；空数组 = 通过。ctx 见 runSite / selfTest */
function validateCard(card, ctx) {
  const errs = [];
  const add = (msg) => errs.push(msg);
  if (!card || typeof card !== 'object') return ['不是对象'];
  if (card.schema !== 'guide-card/v1') add(`schema 不是 guide-card/v1：${String(card.schema)}`);
  if (card.code !== ctx.code) add(`code 与文件名不一致：${String(card.code)} ≠ ${ctx.code}`);
  if (card.site !== ctx.site) add(`site 不一致：${String(card.site)} ≠ ${ctx.site}`);
  const wantScope = ctx.isSite ? 'site' : 'unit';
  if (card.scope !== wantScope) add(`scope 应为 ${wantScope}：${String(card.scope)}`);

  for (const key of ['lead', 'connect']) {
    if (typeof card[key] !== 'string' || !card[key].trim()) add(`${key} 缺失或为空`);
  }
  if (typeof card.lead === 'string' && plainLen(card.lead) > 60) add(`lead 超长：${plainLen(card.lead)} > 60`);

  if (!Array.isArray(card.why)) add('why 不是数组');
  else {
    if (card.why.length < 2 || card.why.length > 4) add(`why 条数 ${card.why.length} 不在 2–4`);
    card.why.forEach((w, i) => {
      if (!w || typeof w !== 'object') return add(`why[${i}] 不是对象`);
      if (typeof w.h !== 'string' || !w.h.trim()) add(`why[${i}].h 缺失`);
      else if (plainLen(w.h) > 20) add(`why[${i}].h 超长：${plainLen(w.h)} > 20`);
      if (typeof w.p !== 'string' || !w.p.trim()) add(`why[${i}].p 缺失`);
      else {
        const n = plainLen(w.p);
        if (n < 80 || n > 180) add(`why[${i}].p 长度 ${n} 不在 80–180`);
      }
    });
  }
  if (card.principle !== undefined) {
    if (typeof card.principle !== 'string') add('principle 不是字符串');
    else if (plainLen(card.principle) > 80) add(`principle 超长：${plainLen(card.principle)} > 80`);
  }
  if (typeof card.connect === 'string') {
    const n = plainLen(card.connect);
    if (n < 60 || n > 160) add(`connect 长度 ${n} 不在 60–160`);
  }
  if (!card.generated || card.generated.reviewed !== true) add('generated.reviewed 必须为 true');
  if (card.generated && typeof card.generated.date === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(card.generated.date)) {
    add(`generated.date 不是 YYYY-MM-DD：${card.generated.date}`);
  }
  if (card.fixes !== undefined) {
    if (!Array.isArray(card.fixes) || card.fixes.some((f) => typeof f !== 'string')) add('fixes 必须是字符串数组');
  }

  // 公式：$ 必须成对；禁止 \( \[ 与 Unicode 上标；正文不许裸 _
  const allText = [card.lead, card.connect, card.principle, ...(card.why ?? []).flatMap((w) => [w?.h, w?.p])]
    .filter((x) => typeof x === 'string')
    .join('\n');
  if ((allText.match(/\$/g) ?? []).length % 2 !== 0) add('$ 数量不是偶数（公式未配平）');
  if (/\\\(|\\\[/.test(allText)) add('出现禁用的 \\( 或 \\[');
  if (UNICODE_SUP.test(allText)) add('出现 Unicode 上标');
  const noMath = stripMath(allText).replace(/`[^`]*`/g, '');
  if (noMath.includes('_')) add('数学定界符外出现裸 _');

  for (const word of FORBIDDEN) {
    if (allText.includes(word)) add(`禁词：${word}`);
  }
  // 题号 / 选项字母：只抓显式的年份#数字 与「选项 A」
  if (/\b(19|20)\d{2}\s*#/.test(allText)) add('出现真题题号');
  if (/选项\s*[A-D]\b/.test(allText)) add('出现选项字母');

  // connect 里的代号必须存在
  for (const m of String(card.connect ?? '').matchAll(/[A-Z]{2}\d{2}(?:\.\d+)?/g)) {
    if (!ctx.unitCodes.has(m[0])) add(`connect 指向不存在的代号：${m[0]}`);
  }

  // 长度：总长按全文字数（数学/工程数学 500–900，其余 350–700）
  const total = plainLen(
    [card.lead, card.principle, card.connect, ...(card.why ?? []).flatMap((w) => [w?.h, w?.p])].join(''),
  );
  const [lo, hi] = ctx.site === 'math' || ctx.site === 'emath'
    ? [500, 900]
    : ctx.site === 'projects' ? [400, 700] : [350, 700];
  if (total < lo || total > hi) add(`总长 ${total} 不在 ${lo}–${hi}`);

  // 源 sha 漂移
  const src = card.source;
  if (!src || typeof src !== 'object') add('source 缺失');
  else {
    if (!ctx.isSite && !ctx.modeS) {
      if (!src.talk) add('source.talk 缺失');
      else if (src.talkSha !== ctx.talkSha) add(`talk sha 漂移：${String(src.talkSha)} ≠ ${ctx.talkSha}`);
    }
    if (!src.unit) add('source.unit 缺失');
    else if (src.unitSha !== ctx.unitSha) add(`unit sha 漂移：${String(src.unitSha)} ≠ ${ctx.unitSha}`);
  }

  // 重复 lead（同一站点内）
  if (card.lead) {
    if (ctx.seenLeads.has(card.lead)) add('lead 与同站另一篇重复');
    ctx.seenLeads.add(card.lead);
  }
  return errs;
}

function runSite(site, opts) {
  const dir = path.join(GUIDE_ROOT, site);
  const mapPath = path.join(dir, '_map.json');
  if (!fs.existsSync(mapPath)) {
    console.log(`[check-guide] ${site} · 未开工（无 _map.json），跳过`);
    return { crit: 0, checked: 0, skipped: 0 };
  }
  const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const progPath = path.join(dir, '_progress.json');
  const prog = fs.existsSync(progPath)
    ? JSON.parse(fs.readFileSync(progPath, 'utf8')).units ?? {}
    : {};
  const unitCodes = collectCodes(site);
  const seenLeads = new Set();
  let crit = 0;
  let checked = 0;
  let skipped = 0;

  for (const code of Object.keys(map.units).sort()) {
    if (opts.code && code !== opts.code) continue;
    const item = map.units[code];
    const state = prog[code] ?? { status: 'pending' };
    if (state.status === 'skip') {
      if (!state.reason) {
        console.log(`✗ ${code} skip 但没写 reason`);
        crit += 1;
      } else skipped += 1;
      continue;
    }
    const isSite = code === '__site';
    const chapter = code.split('.')[0];
    const cardPath = isSite ? path.join(dir, '__site.json') : path.join(dir, chapter, `${code}.json`);
    const hasCard = fs.existsSync(cardPath);
    // --draft：施工期用。文件在就验，不看 _progress 是否已经标 done；
    // 没有文件才按 pending 处理。这样一批写完能立刻被闸门打红，不必先改状态。
    const draftCheck = opts.draft && hasCard;
    if (state.status !== 'done' && !draftCheck) {
      if (!opts.allowIncomplete) {
        console.log(`✗ ${code} 仍是 ${state.status ?? 'pending'}`);
        crit += 1;
      }
      continue;
    }
    if (!hasCard) {
      console.log(`✗ ${code} 标了 done 但没有 ${path.relative(ROOT, cardPath)}`);
      crit += 1;
      continue;
    }
    let card;
    try {
      card = JSON.parse(fs.readFileSync(cardPath, 'utf8'));
    } catch (err) {
      console.log(`✗ ${code} JSON 解析失败：${err.message}`);
      crit += 1;
      continue;
    }
    if (item.talk) {
      const talkAbs = path.join(ROOT, item.talk);
      if (!fs.existsSync(talkAbs)) {
        console.log(`✗ ${code} talk 源不存在：${item.talk}`);
        crit += 1;
        continue;
      }
    }
    const unitJsonPath = path.join(ROOT, SITE_JSON[site], chapter, `${code}.json`);
    if (!isSite && !fs.existsSync(unitJsonPath)) {
      console.log(`✗ ${code} unit json 不存在：${path.relative(ROOT, unitJsonPath)}`);
      crit += 1;
      continue;
    }
    // Mode S 的 source.unit 指向 notebook 源（相对父仓）；Mode T 指向单元 json
    const srcAbs = item.talk
      ? unitJsonPath
      : path.resolve(NB_ROOT, item.src ?? '');
    if (!fs.existsSync(srcAbs)) {
      console.log(`✗ ${code} source.unit 不存在：${item.src}`);
      crit += 1;
      continue;
    }
    const errs = validateCard(card, {
      code,
      site,
      isSite,
      modeS: !item.talk,
      unitCodes,
      talkSha: item.talk ? sha12(path.join(ROOT, item.talk)) : '',
      unitSha: sha12(srcAbs),
      seenLeads,
    });
    if (errs.length) {
      crit += 1;
      console.log(`✗ ${code}`);
      for (const e of errs) console.log(`    - ${e}`);
    } else checked += 1;
  }
  console.log(`[check-guide] ${site}：合格 ${checked} · skip ${skipped} · CRIT ${crit}`);
  return { crit, checked, skipped };
}

function selfTest() {
  const base = {
    schema: 'guide-card/v1',
    code: 'DS02.3',
    site: 'cs408',
    scope: 'unit',
    lead: '链表的所有差异都来自有没有一条直接指向前驱的边。',
    why: [
      { h: '为什么要有链表', p: '数组要求连续存放，中间插入要搬移后续元素，内存碎片时还可能分配不出整块。链表去掉连续这个前提，插入只改指针，代价是丢掉随机访问。'.repeat(1) },
      { h: '为什么要头结点', p: '没有头结点时第一个结点会随插入删除变化，外部持有的指针随之失效，空表还要处处特判。加一个哨兵让外部只记一个不变地址，空表与非空表走同一段逻辑。'.repeat(1) },
    ],
    connect: '往后是线索树与图的邻接表，前者把空指针变成前驱后继，后者是链表的数组。相关代号见 DS04.1 与 DS05.1。',
    source: {
      talk: 'build/reading/talk/408-kp-0203.md',
      talkSha: 'aaaaaaaaaaaa',
      unit: 'cs408/json/DS02/DS02.3.json',
      unitSha: 'bbbbbbbbbbbb',
    },
    generated: { model: 'coding-agent', date: '2026-11-20', reviewed: true },
  };
  const ctx = () => ({
    code: 'DS02.3',
    site: 'cs408',
    unitCodes: new Set(['DS02.3', 'DS04.1', 'DS05.1']),
    talkSha: 'aaaaaaaaaaaa',
    unitSha: 'bbbbbbbbbbbb',
    seenLeads: new Set(),
  });
  const cases = [
    ['缺字段', (c) => { delete c.lead; }],
    ['错 sha', (c) => { c.source.talkSha = 'ffffffffffff'; }],
    ['坏代号', (c) => { c.connect = '往后见 ZZ99.1。' + '补充'.repeat(30); }],
    ['口语残留', (c) => { c.lead = '非常重要：链表的所有差异都来自有没有前驱边。'; }],
    ['why 只有 1 条', (c) => { c.why = [c.why[0]]; }],
  ];
  let bad = 0;
  for (const [name, mutate] of cases) {
    const card = JSON.parse(JSON.stringify(base));
    mutate(card);
    const errs = validateCard(card, ctx());
    const ok = errs.length > 0;
    console.log(`${ok ? '✓' : '✗'} self-test：${name}${ok ? '' : ' 未被抓住'}`);
    if (!ok) bad += 1;
  }
  // 重复 lead 需要两篇一起判：第二篇的 seenLeads 已含第一篇
  const c2 = JSON.parse(JSON.stringify(base));
  const ctx2 = ctx();
  validateCard(base, ctx2);
  const errs2 = validateCard(c2, ctx2);
  const dupOk = errs2.some((e) => e.includes('重复'));
  console.log(`${dupOk ? '✓' : '✗'} self-test：重复 lead${dupOk ? '' : ' 未被抓住'}`);
  if (!dupOk) bad += 1;
  console.log(`[check-guide] self-test：${bad ? `FAIL ${bad}` : 'PASS 6/6'}`);
  return bad ? 1 : 0;
}

const args = process.argv.slice(2);
const opts = {
  site: 'all',
  code: '',
  allowIncomplete: args.includes('--allow-incomplete'),
  draft: args.includes('--draft'),
};
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--site') opts.site = args[i + 1] ?? 'all';
  if (args[i] === '--code') opts.code = args[i + 1] ?? '';
}
if (args.includes('--self-test')) process.exit(selfTest());

const sites = opts.site === 'all'
  ? (fs.existsSync(GUIDE_ROOT) ? fs.readdirSync(GUIDE_ROOT).filter((s) => fs.existsSync(path.join(GUIDE_ROOT, s, '_map.json'))) : [])
  : [opts.site];
if (!sites.length) {
  console.log('[check-guide] 没有已开工的站点（guide/*/_map.json），跳过');
  process.exit(0);
}
let crit = 0;
for (const site of sites) crit += runSite(site, opts).crit;
if (crit) {
  console.log(`\n[check-guide] FAIL：${crit} 处 CRIT`);
  process.exit(1);
}
console.log('\n[check-guide] PASS');
