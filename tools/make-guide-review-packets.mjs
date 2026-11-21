#!/usr/bin/env node
/**
 * 生成 guide-card 全量内容审查包（只读产物，供 reviewer 逐包审）。
 *
 * 每包 24 张卡：卡片全文 + connect 目标单元标题 + 单元 intro/小节标题。
 * 目的是让审查者在一个文件里同时看到「导语怎么说」与「目标单元是什么」，
 * 不靠标题关键词猜链接。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'build/logs/review-packets');
const CHUNK = 24;

const SITE_JSON = {
  math: 'json',
  emath: 'emath/json',
  cs408: 'cs408/json',
  kaoyan: 'kaoyan/json',
  projects: 'projects/json',
  english1: 'english1/json',
};

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

function truncate(s, n) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

function unitInfo(site, code) {
  if (code === '__site') {
    const p = path.join(ROOT, '..', 'notebook/projects/README.md');
    return { title: '工程线总纲（README）', intro: '', sections: [] };
  }
  const chapter = code.split('.')[0];
  const p = path.join(ROOT, SITE_JSON[site], chapter, `${code}.json`);
  if (!fs.existsSync(p)) return { title: '（单元不存在）', intro: '', sections: [] };
  try {
    const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
    const entries = Array.isArray(doc.entries) ? doc.entries : [];
    const intro = entries
      .filter((e) => e.type === 'introduction')
      .map((e) => e.content)
      .join('\n');
    const sections = entries
      .filter((e) => e.type !== 'introduction' && (e.title || e.type === 'statement'))
      .map((e) => e.title || e.type)
      .filter(Boolean)
      .slice(0, 12);
    return {
      title: doc.title ?? doc.meta?.title ?? '',
      intro: truncate(intro, 400),
      sections,
    };
  } catch {
    return { title: '（单元 JSON 解析失败）', intro: '', sections: [] };
  }
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, f), { force: true });

  const allTitles = {};
  for (const [site, rel] of Object.entries(SITE_JSON)) {
    allTitles[site] = {};
    const dir = path.join(ROOT, rel);
    for (const abs of walkJson(dir)) {
      try {
        const doc = JSON.parse(fs.readFileSync(abs, 'utf8'));
        if (doc.code) allTitles[site][doc.code] = doc.title ?? doc.meta?.title ?? '';
      } catch {
        // 坏单元由 check 负责
      }
    }
  }

  let packetNo = 0;
  for (const site of Object.keys(SITE_JSON)) {
    const dir = path.join(ROOT, 'guide', site);
    if (!fs.existsSync(dir)) continue;
    const cards = walkJson(dir).map((p) => JSON.parse(fs.readFileSync(p, 'utf8')));
    for (let i = 0; i < cards.length; i += CHUNK) {
      packetNo += 1;
      const slice = cards.slice(i, i + CHUNK);
      const lines = [`# 审查包 ${site}-${String(packetNo).padStart(2, '0')}`, ''];
      for (const c of slice) {
        const ui = unitInfo(site, c.code);
        lines.push(`## ${site}/${c.code}`, '');
        lines.push(`- 单元标题：${ui.title}`);
        lines.push(`- 来源：${c.source?.talk ? `talk=${c.source.talk}` : `note=${c.source?.note ?? ''}`}`);
        lines.push(`- lead：${c.lead}`);
        lines.push('- why：');
        for (const w of c.why ?? []) lines.push(`  - ${w.h} :: ${w.p}`);
        if (c.principle) lines.push(`- principle：${c.principle}`);
        lines.push(`- connect：${c.connect}`);
        const codes = [...new Set([...String(c.connect ?? '').matchAll(/[A-Z]{2}\d{2}(?:\.\d+)?/g)].map((m) => m[0]))];
        if (codes.length) {
          lines.push('- connect 目标：');
          for (const code of codes) lines.push(`  - ${code} = ${allTitles[site]?.[code] ?? '（不存在）'}`);
        }
        if (ui.intro) lines.push(`- 单元 intro（查重复）：${ui.intro}`);
        if (ui.sections.length) lines.push(`- 单元小节：${ui.sections.join(' | ')}`);
        lines.push('');
      }
      const name = `${site}-${String(packetNo).padStart(2, '0')}.md`;
      fs.writeFileSync(path.join(OUT, name), `${lines.join('\n')}\n`, 'utf8');
      console.log(`  ${name}  ${slice.length} 张`);
    }
  }
  console.log(`\n审查包目录：${path.relative(ROOT, OUT)}`);
}

main();