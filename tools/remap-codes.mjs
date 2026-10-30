/**
 * 一次性代号迁移：旧代号（A1.3 / de1.7 / lie3.21）→ 层级代号（AN01.3 / EQ01.7 / AG13.21）。
 *
 * 规则来自 `src/modules/taxonomy.ts`（唯一真源）：域内第 i 章 → `<域><i+1 两位>`，
 * 章内第 j 个单元 → `.j`（按旧代号数值序）。
 *
 * 为什么要一次做完而不是保持双轨：代号是 json 路径、词条 id 前缀、links、
 * graph yaml 节点键、掌握度 localStorage 键、路由 hash 的**同一个主键**。
 * 双轨会让五处同时有两套真相。
 *
 * 用法：
 *   node tools/remap-codes.mjs            # 只算并打印映射表（默认，安全）
 *   node tools/remap-codes.mjs --apply    # 真正改写 json/ graph/ 与产物文档
 *
 * 产物：
 *   docs/codes-map-<date>.md    人读对照表（拿去反馈给 tex 笔记）
 *   docs/codes-map-<date>.json  机器读（旧 → 新，含标题）
 *   src/modules/legacy-codes.ts 掌握度键迁移表（旧代号 → 新代号）
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const CS408 = process.argv.includes('--cs408');
const DATA_DIR = CS408 ? path.join(ROOT, 'cs408', 'json') : path.join(ROOT, 'json');
const GRAPH_DIR = CS408 ? path.join(ROOT, 'cs408', 'graph') : path.join(ROOT, 'graph');
const PREFIX = CS408 ? 'cs408/json/' : 'json/';
const STAMP = '2026-10-30';

/** 408 侧只有一条线，章号固定；数学侧走 taxonomy */
const CS408_CHAPTERS = { OS1: 'OS01', CO1: 'CO01', CN1: 'CN01', DS1: 'DS01' };

async function loadTaxonomy() {
  const res = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src', 'modules', 'taxonomy.ts')],
    bundle: true, write: false, format: 'cjs', platform: 'node', target: 'es2022', logLevel: 'silent',
  });
  const m = { exports: {} };
  new Function('module', 'exports', 'require', res.outputFiles[0].text)(m, m.exports, require);
  return m.exports;
}

/** 旧代号的排序键：字母前缀 → 章号 → 小目号（与 src/modules/graph.ts 的 codeKey 同规则） */
function codeKey(code) {
  const m = /^([A-Za-z]+)(\d+)(?:\.(\d+))?$/.exec(code);
  if (!m) return [code, Number.MAX_SAFE_INTEGER, 0];
  return [m[1].toLowerCase(), Number(m[2]), m[3] ? Number(m[3]) : 0];
}

function cmp(a, b) {
  const ka = codeKey(a);
  const kb = codeKey(b);
  if (ka[0] !== kb[0]) return ka[0] < kb[0] ? -1 : 1;
  if (ka[1] !== kb[1]) return ka[1] - kb[1];
  return ka[2] - kb[2];
}

/** 扫出旧单元：{ code, chapter, file, data } */
function scanUnits() {
  const out = [];
  if (!fs.existsSync(DATA_DIR)) return out;
  for (const chapter of fs.readdirSync(DATA_DIR).sort()) {
    const dir = path.join(DATA_DIR, chapter);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const name of fs.readdirSync(dir).sort()) {
      if (!name.endsWith('.json') || name === 'index.json') continue;
      const file = path.join(dir, name);
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      out.push({ code: data.code ?? name.replace(/\.json$/, ''), chapter, file, data });
    }
  }
  return out;
}

async function main() {
  const tax = await loadTaxonomy();
  const units = scanUnits();
  if (!units.length) throw new Error(`没有扫到单元：${DATA_DIR}`);

  // 旧章 → 新章
  const chapterMap = new Map();
  for (const dom of tax.DOMAINS) {
    dom.chapters.forEach((oldChapter, i) => {
      chapterMap.set(oldChapter, `${dom.id}${String(i + 1).padStart(2, '0')}`);
    });
  }
  const chapterDomain = new Map();
  for (const dom of tax.DOMAINS) for (const c of dom.chapters) chapterDomain.set(c, dom.id);

  // 旧单元 → 新单元（章内按旧代号数值序编号）
  const byChapter = new Map();
  for (const u of units) {
    const list = byChapter.get(u.chapter) ?? [];
    list.push(u);
    byChapter.set(u.chapter, list);
  }
  const unitMap = new Map(); // 旧 code → 新 code
  const rows = [];
  for (const [oldChapter, list] of byChapter) {
    const newChapter = chapterMap.get(oldChapter) ?? (CS408 ? CS408_CHAPTERS[oldChapter] : undefined);
    if (!newChapter) {
      throw new Error(`章 ${oldChapter} 不在 taxonomy.DOMAINS 里（也没给 408 映射）——先补编排再迁移`);
    }
    list.sort((a, b) => cmp(a.code, b.code));
    list.forEach((u, i) => {
      const newCode = `${newChapter}.${i + 1}`;
      unitMap.set(u.code, newCode);
      rows.push({
        oldCode: u.code,
        newCode,
        oldChapter,
        newChapter,
        domain: chapterDomain.get(oldChapter) ?? newChapter.slice(0, 2),
        title: u.data.title ?? '',
        entries: (u.data.entries ?? []).length,
      });
    });
  }

  // 旧章 → 新章（仅用于报告）
  const chapterRows = [...byChapter.keys()].sort(cmp).map((c) => ({
    oldChapter: c,
    newChapter: chapterMap.get(c) ?? (CS408 ? CS408_CHAPTERS[c] : '?'),
    domain: chapterDomain.get(c) ?? (CS408 ? (CS408_CHAPTERS[c] ?? '').slice(0, 2) : '?'),
    units: byChapter.get(c).length,
    titles: byChapter.get(c).map((u) => u.data.title ?? '').slice(0, 3),
  }));

  console.log(`\n${CS408 ? '408' : '数学'}：${units.length} 单元 / ${chapterRows.length} 章`);
  for (const c of chapterRows) {
    console.log(`  ${c.oldChapter.padEnd(6)} → ${c.newChapter}  [${c.domain}] ${c.units} 单元  ${c.titles.join(' / ').slice(0, 46)}`);
  }

  if (!APPLY) {
    console.log('\n（默认只算不写。确认无误后加 --apply）');
    return;
  }

  // ---------- 改写 json ----------
  const docsDir = path.join(ROOT, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 正文里也可能引用旧代号（「见 A1.3」「A1.3:limit-exchange」），一并换掉。
  // 只换「整 token」：unit 码（带小目号）优先，再换章码；单字母章（I）不换，
  // 否则英文正文里的 "I" 会被替换成章号。
  const unitCodes = [...unitMap.keys()].sort((a, b) => b.length - a.length);
  const chapterCodes = [...chapterMap.keys()].filter((c) => c.length >= 2).sort((a, b) => b.length - a.length);

  function remapText(text) {
    let s = text;
    for (const old of unitCodes) {
      const re = new RegExp(`(?<![A-Za-z0-9.])${escapeRe(old)}(?![0-9])`, 'g');
      s = s.replace(re, unitMap.get(old));
    }
    for (const old of chapterCodes) {
      const re = new RegExp(`(?<![A-Za-z0-9.])${escapeRe(old)}(?![0-9.])`, 'g');
      s = s.replace(re, chapterMap.get(old));
    }
    return s;
  }

  let movedFiles = 0;
  let touchedText = 0;
  for (const u of units) {
    const newCode = unitMap.get(u.code);
    const newChapter = newCode.split('.')[0];
    const d = u.data;
    const before = JSON.stringify(d);

    d.code = newCode;
    if (typeof d.chapter === 'string') d.chapter = newChapter;
    for (const e of d.entries ?? []) {
      if (typeof e.id === 'string' && e.id.startsWith(`${u.code}:`)) {
        e.id = `${newCode}:${e.id.slice(u.code.length + 1)}`;
      }
      if (Array.isArray(e.links)) e.links = e.links.map((l) => unitMap.get(l) ?? l);
      for (const k of ['content', 'title', 'fill_hint', 'seed', 'subject']) {
        if (typeof e[k] === 'string' && (k === 'content' || k === 'fill_hint' || k === 'title')) {
          const nv = remapText(e[k]);
          if (nv !== e[k]) { e[k] = nv; touchedText += 1; }
        }
      }
    }

    const outDir = path.join(DATA_DIR, newChapter);
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `${newCode}.json`);
    fs.writeFileSync(outFile, `${JSON.stringify(d, null, 2)}\n`, 'utf8');
    if (outFile !== u.file) {
      fs.rmSync(u.file, { force: true });
      movedFiles += 1;
    }
    if (JSON.stringify(d) === before) touchedText += 0; // 统计用途，保持简单
  }

  // 清掉空的旧章目录
  for (const dir of fs.existsSync(DATA_DIR) ? fs.readdirSync(DATA_DIR) : []) {
    const abs = path.join(DATA_DIR, dir);
    if (fs.statSync(abs).isDirectory() && fs.readdirSync(abs).length === 0) fs.rmdirSync(abs);
  }

  // ---------- 改写 graph yaml ----------
  let yamlRenamed = 0;
  if (fs.existsSync(GRAPH_DIR)) {
    for (const name of fs.readdirSync(GRAPH_DIR)) {
      if (!name.endsWith('.yaml')) continue;
      const oldChapter = name.slice(0, -'.yaml'.length);
      const newChapter = chapterMap.get(oldChapter) ?? (CS408 ? CS408_CHAPTERS[oldChapter] : undefined);
      const src = path.join(GRAPH_DIR, name);
      let text = fs.readFileSync(src, 'utf8');
      // 节点键与边都用旧代号：走同一份 remapText（含注释里的提及）
      text = remapText(text);
      const dst = path.join(GRAPH_DIR, `${newChapter ?? oldChapter}.yaml`);
      fs.writeFileSync(dst, text, 'utf8');
      if (dst !== src) { fs.rmSync(src, { force: true }); yamlRenamed += 1; }
    }
  }

  // ---------- 产物 ----------
  const mapJson = {
    generated: new Date().toISOString(),
    scheme: '<域2字母><章2位>.<单元序>',
    subject: CS408 ? 'cs408' : 'math',
    chapters: chapterRows,
    units: rows,
  };
  const suffix = CS408 ? '-cs408' : '';
  fs.writeFileSync(path.join(docsDir, `codes-map-${STAMP}${suffix}.json`), `${JSON.stringify(mapJson, null, 2)}\n`, 'utf8');

  const md = [];
  md.push(`# 代号对照表（${CS408 ? '408' : '数学'}）· ${STAMP}`, '');
  md.push('> 新代号 = `<域2字母><章2位>.<单元序>`。本表由 `tools/remap-codes.mjs` 生成，');
  md.push('> 用途：把新标号反馈回 `../math-notebook` 的 `.tex`，让笔记与本仓同步。', '');
  md.push('## 域', '', '| 域 | 名称 | 章数 | 说明 |', '| --- | --- | --- | --- |');
  for (const dom of tax.DOMAINS) {
    const n = dom.chapters.filter((c) => chapterMap.has(c)).length;
    md.push(`| ${dom.id} | ${dom.label} | ${n} | ${dom.blurb} |`);
  }
  md.push('', '## 章', '', '| 旧章 | 新章 | 域 | 单元数 | 旧章代表标题 |', '| --- | --- | --- | --- | --- |');
  for (const c of chapterRows) {
    md.push(`| ${c.oldChapter} | ${c.newChapter} | ${c.domain} | ${c.units} | ${c.titles.join(' / ').replace(/\|/g, '/')} |`);
  }
  md.push('', '## 单元', '', '| 旧代号 | 新代号 | 标题 | 词条数 |', '| --- | --- | --- | --- |');
  for (const r of rows.sort((a, b) => (a.newCode < b.newCode ? -1 : 1))) {
    md.push(`| ${r.oldCode} | ${r.newCode} | ${String(r.title).replace(/\|/g, '/')} | ${r.entries} |`);
  }
  fs.writeFileSync(path.join(docsDir, `codes-map-${STAMP}${suffix}.md`), `${md.join('\n')}\n`, 'utf8');

  // 掌握度键迁移表（只有数学侧写进 src/，408 不进）
  if (!CS408) {
    const legacy = rows
      .slice()
      .sort((a, b) => (a.oldCode < b.oldCode ? -1 : 1))
      .map((r) => `  '${r.oldCode}': '${r.newCode}',`)
      .join('\n');
    const ts = `/**
 * 旧代号 → 新代号（2026-10-30 重排，见 docs/codes-map-${STAMP}.md）。
 *
 * 只为一件事存在：用户浏览器里的掌握度是按旧代号（\`A1.3:mct\`）存的，
 * 重排后必须**一次**迁移到新代号，否则学习进度全丢。
 * 迁移完成后本文件不再增长 —— 新内容不要往这里加。
 */
export const LEGACY_CODES: Record<string, string> = {
${legacy}
};

/** 把旧掌握度键（\`A1.3:mct\`）迁到新键（\`AN01.3:mct\`）；认不出就原样返回 */
export function migrateKey(key: string): string {
  const i = key.indexOf(':');
  const code = i < 0 ? key : key.slice(0, i);
  const next = LEGACY_CODES[code];
  return next ? next + (i < 0 ? '' : key.slice(i)) : key;
}
`;
    fs.writeFileSync(path.join(ROOT, 'src', 'modules', 'legacy-codes.ts'), ts, 'utf8');
  }

  console.log(`\n已迁移：文件移动 ${movedFiles} 个 · yaml 重命名 ${yamlRenamed} 个 · 正文代号替换 ${touchedText} 处`);
  console.log(`对照表：docs/codes-map-${STAMP}${suffix}.md`);
}

main().catch((e) => {
  console.error('代号迁移失败：', e);
  process.exit(1);
});