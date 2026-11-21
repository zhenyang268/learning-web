#!/usr/bin/env node
/**
 * 导读内容审计（只读）。
 *
 * 与 check-guide 的分工：
 *   check-guide 管「结构 / 契约 / sha / 覆盖」，是硬闸门；
 *   本脚本管「像不像一篇教师导语」，输出可读报告，不改任何文件。
 *
 * 判据刻意保守：重复、口语残留、元叙述、绝对化、与 unit/talk 的高重合、
 * connect 代号与目标标题的候选错配。高重合与链接候选只作 WARN ——
 * 它们需要人读上下文，不能直接判死。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const GUIDE_ROOT = path.join(ROOT, 'guide');
const LOG = path.join(ROOT, 'build/logs');
const OUT = path.join(LOG, 'guide-content-audit-2026-11-21.md');

const SITE_JSON = {
  math: 'json',
  emath: 'emath/json',
  cs408: 'cs408/json',
  kaoyan: 'kaoyan/json',
  projects: 'projects/json',
  english1: 'english1/json',
};

const FORBIDDEN_META = ['本导读', '这一节', '本节', '我们', '你可能会想', '非常重要', '高频', '众所周知', '显然'];
// 只留真正「屏幕读者会看不懂」的绝对化；「都/一定/唯一」在中文里多为正常限定。
const ABSOLUTE = ['全部', '必然', '永远', '从不'];
// 只留口述稿才会出现的符号写法；「的逆/的秩/一阶导/分之」多是正常中文。
const SPOKEN = [
  /(?:^|[^A-Za-z$])O\s*\(?\s*1\s*\)?/,
  /O\s*log/,
  /\d+\s*除以\s*\d+/,
  /n\s*除以/,
  /的转置/,
];

function walkJson(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir).sort()) {
    if (name.startsWith('_')) continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walkJson(p, out);
    else if (name.endsWith('.json')) out.push(p);
  }
  return out;
}

function norm(s) {
  return String(s ?? '')
    .replace(/\$[^$]*\$/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '');
}

function grams(s, n = 10) {
  const t = norm(s);
  const out = new Set();
  for (let i = 0; i + n <= t.length; i += 1) out.add(t.slice(i, i + n));
  return out;
}

function containment(small, big) {
  if (!small.size) return 0;
  let hit = 0;
  for (const g of small) if (big.has(g)) hit += 1;
  return hit / small.size;
}

function collectStrings(node, out = []) {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) for (const x of node) collectStrings(x, out);
  else if (node && typeof node === 'object') for (const v of Object.values(node)) collectStrings(v, out);
  return out;
}

function unitText(site, code) {
  if (code === '__site') {
    const p = path.join(ROOT, '..', 'notebook/projects/README.md');
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  }
  const chapter = code.split('.')[0];
  const p = path.join(ROOT, SITE_JSON[site], chapter, `${code}.json`);
  if (!fs.existsSync(p)) return '';
  try {
    const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
    return collectStrings(doc.entries ?? []).join('\n');
  } catch {
    return '';
  }
}

function sourceText(card) {
  const out = [];
  for (const key of ['talk', 'note']) {
    const rel = card.source?.[key];
    if (typeof rel !== 'string') continue;
    const p = path.resolve(ROOT, '..', rel);
    if (fs.existsSync(p)) out.push(fs.readFileSync(p, 'utf8'));
  }
  return out.join('\n');
}

function cardText(card) {
  return [card.lead, card.principle, card.connect, ...(card.why ?? []).map((w) => `${w.h}\n${w.p}`)]
    .filter((x) => typeof x === 'string')
    .join('\n');
}

function plainLen(s) {
  return [...String(s ?? '').replace(/\s+/g, '')].length;
}

function repeatedGrams(text, n = 6) {
  const t = norm(text);
  const count = new Map();
  for (let i = 0; i + n <= t.length; i += 1) {
    const g = t.slice(i, i + n);
    count.set(g, (count.get(g) ?? 0) + 1);
  }
  return [...count.entries()].filter(([, c]) => c >= 2);
}

function auditCard(site, card, unitTitles) {
  const text = cardText(card);
  const unit = unitText(site, card.code);
  const src = sourceText(card);
  const cardG = grams(text, 10);
  const unitG = grams(unit, 10);
  const srcG = grams(src, 10);
  const unitOverlap = containment(cardG, unitG);
  const srcOverlap = containment(cardG, srcG);

  const meta = FORBIDDEN_META.filter((w) => text.includes(w));
  const absolute = ABSOLUTE.filter((w) => text.includes(w));
  const spoken = SPOKEN.filter((r) => r.test(text)).map((r) => r.source);

  const dup = [];
  for (const w of card.why ?? []) {
    if (typeof w.p !== 'string') continue;
    const reps = repeatedGrams(w.p, 6).filter(([g]) => /[\u4e00-\u9fa5]{4}/.test(g));
    if (reps.length) dup.push({ h: w.h, grams: reps.slice(0, 3).map(([g, c]) => `${g}×${c}`) });
  }

  const links = [];
  for (const m of String(card.connect ?? '').matchAll(/[A-Z]{2}\d{2}(?:\.\d+)?/g)) {
    const code = m[0];
    const title = unitTitles[site]?.[code] ?? '';
    if (!title) continue;
    const around = String(card.connect).slice(Math.max(0, m.index - 40), m.index + 4);
    const keys = [...new Set(title.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '').split('').filter((_, i, a) => i + 2 <= a.length).map((_, i, a) => a.slice(i, i + 2)))];
    const hit = keys.some((k) => around.includes(k));
    if (!hit) links.push({ code, title, around });
  }

  return {
    code: card.code,
    site,
    total: plainLen(text),
    why: card.why?.length ?? 0,
    unitOverlap,
    srcOverlap,
    meta,
    absolute,
    spoken,
    dup,
    links,
  };
}

function main() {
  const titles = {};
  for (const [site, rel] of Object.entries(SITE_JSON)) {
    titles[site] = {};
    const dir = path.join(ROOT, rel);
    for (const abs of walkJson(dir)) {
      try {
        const doc = JSON.parse(fs.readFileSync(abs, 'utf8'));
        if (doc.code) titles[site][doc.code] = doc.title ?? doc.meta?.title ?? '';
      } catch {
        // 坏单元由 check 负责
      }
    }
  }

  const rows = [];
  for (const site of Object.keys(SITE_JSON)) {
    const dir = path.join(GUIDE_ROOT, site);
    if (!fs.existsSync(dir)) continue;
    for (const abs of walkJson(dir)) {
      try {
        const card = JSON.parse(fs.readFileSync(abs, 'utf8'));
        rows.push(auditCard(site, card, titles));
      } catch {
        // 坏卡由 check-guide 负责
      }
    }
  }

  const bySite = {};
  for (const r of rows) {
    bySite[r.site] ??= { n: 0, total: 0, unitHigh: 0, srcHigh: 0, meta: 0, spoken: 0, dup: 0, abs: 0, links: 0 };
    const s = bySite[r.site];
    s.n += 1;
    s.total += r.total;
    if (r.unitOverlap >= 0.3) s.unitHigh += 1;
    if (r.srcOverlap >= 0.5) s.srcHigh += 1;
    if (r.meta.length) s.meta += 1;
    if (r.spoken.length) s.spoken += 1;
    if (r.dup.length) s.dup += 1;
    if (r.absolute.length) s.abs += 1;
    if (r.links.length) s.links += 1;
  }

  const fmt = (x) => `${(x * 100).toFixed(1)}%`;
  const lines = [];
  lines.push('# 导读内容审计（2026-11-21）', '');
  lines.push('> 只读报告。`check-guide` 管结构/契约；本报告管内容像不像教师导语。');
  lines.push('> 高重合与链接候选是 WARN，不是判决：需要读上下文。', '');
  lines.push('## 汇总', '');
  lines.push('| 站点 | 卡片 | 平均字数 | 与正文 10-gram 重合≥30% | 与源重合≥50% | 元叙述 | 口语残留 | 句内重复 | 绝对化 | 链接候选 |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const [site, s] of Object.entries(bySite)) {
    lines.push(`| ${site} | ${s.n} | ${Math.round(s.total / s.n)} | ${s.unitHigh} | ${s.srcHigh} | ${s.meta} | ${s.spoken} | ${s.dup} | ${s.abs} | ${s.links} |`);
  }
  lines.push('');

  const section = (title, list) => {
    lines.push(`## ${title}`, '');
    if (!list.length) {
      lines.push('（无）', '');
      return;
    }
    for (const r of list) lines.push(`- ${r}`, '');
  };

  const top = (key, n = 25, filter = () => true) =>
    rows.filter(filter).sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0)).slice(0, n);

  section('1. 与正文重合最高（可能是复述）', top('unitOverlap', 25, (r) => r.unitOverlap >= 0.25).map((r) => `\`${r.site}/${r.code}\` ${fmt(r.unitOverlap)} · ${r.total} 字`));
  section('2. 与 talk/note 重合最高（可能是搬运）', top('srcOverlap', 25, (r) => r.srcOverlap >= 0.4).map((r) => `\`${r.site}/${r.code}\` ${fmt(r.srcOverlap)} · ${r.total} 字`));
  section('3. 口语残留', rows.filter((r) => r.spoken.length).map((r) => `\`${r.site}/${r.code}\` ${r.spoken.join(' / ')}`));
  section('4. 元叙述/禁词', rows.filter((r) => r.meta.length).map((r) => `\`${r.site}/${r.code}\` ${r.meta.join(' / ')}`));
  section('5. 句内重复 6-gram', rows.filter((r) => r.dup.length).map((r) => `\`${r.site}/${r.code}\` ${r.dup.map((d) => `${d.h}: ${d.grams.join(', ')}`).join(' | ')}`));
  section('6. 绝对化', rows.filter((r) => r.absolute.length).map((r) => `\`${r.site}/${r.code}\` ${r.absolute.join(' / ')}`));
  section('7. connect 链接候选（代号附近没有目标标题关键词）', rows.filter((r) => r.links.length).map((r) => `\`${r.site}/${r.code}\` ${r.links.map((l) => `${l.code}=${l.title}（…${l.around.replace(/\n/g, ' ')}）`).join(' | ')}`));

  fs.mkdirSync(LOG, { recursive: true });
  fs.writeFileSync(OUT, `${lines.join('\n')}\n`, 'utf8');
  console.log(`[audit-guide-content] ${rows.length} 张卡 → ${path.relative(ROOT, OUT)}`);
}

main();