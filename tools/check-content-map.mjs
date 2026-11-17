/**
 * 内容总图（`src/content/content-map.json`）的 Node 侧确定性校验。
 *
 * 校验对象与判据：
 *   1. 章覆盖 —— 线表的章并集 = `json/*` 实际章目录 ∪ 数值库章；无重复、无未知。
 *      基准取**目录名**而不是 `DOMAINS` 常量：目录是事实，常量可能写过时。
 *   2. 组归属 —— 每条线的 `group` 存在；每个组至少一条线。
 *   3. 编号全集 —— 数值库各章 `surveyEntries` 展开后 = survey 的冻结编号空间，不重不漏。
 *   4. 代号格式 —— 章 `^[A-Z]{2}\d{2}$`；数值库章连续且以 NL 开头。
 *   5. 落点非空 —— 每章有库文件 / 桥接源文件 / 显式 `unbuilt`；库文件在 graphics 仓真实存在。
 *   6. 站点唯一 —— `dataRoot` / `entryHtml` 不重复。
 *   7. 路线页 —— track 引用的章与源文件存在。
 *
 * 只看目录名与内容表，**不解析任何 Markdown**（中文表格不是机器格式）。
 * `../graphics` 不存在时（单独拷走本仓）判据 5 的文件存在性降级为 SKIP，不算失败。
 *
 * 用法：node tools/check-content-map.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAP_PATH = path.join(ROOT, 'src/content/content-map.json');
const JSON_DIR = path.join(ROOT, 'json');
const GRAPHICS = path.resolve(ROOT, '..', 'graphics');

let pass = 0;
let fail = 0;
let skip = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) pass += 1;
  else {
    fail += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function readMap() {
  try {
    return JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  } catch (err) {
    console.error(`CRIT 读不到内容总图：${MAP_PATH}\n${err.message}`);
    process.exit(1);
  }
}

/**
 * survey 的编号空间（**冻结**）。
 *
 * 真源：`notebook/math/survey/CONTRACT.md` §1「十一组 A L N C H P D G F T M 是冻结的编号空间」。
 * 这里刻意**第二份硬编码**：如果它从 content-map.json 自己推出来，两边同时写错也会通过，
 * 校验就失去意义。survey 侧改编号空间时，这里必须同一次改动。
 */
const SURVEY_SPACE = {
  A: 6,
  L: 10,
  N: 13,
  C: 6,
  H: 11,
  P: 10,
  D: 8,
  G: 10,
  F: 9,
  T: 7,
  M: 7,
};
const SURVEY_IDS = Object.entries(SURVEY_SPACE).flatMap(([letter, n]) =>
  Array.from({ length: n }, (_, i) => `${letter}${i + 1}`),
);

const CHAPTER_RE = /^[A-Z]{2}\d{2}$/;

const map = readMap();
const lines = Array.isArray(map.lines) ? map.lines : [];
const groups = Array.isArray(map.groups) ? map.groups : [];
const sites = Array.isArray(map.sites) ? map.sites : [];
const numeric = Array.isArray(map.numericChapters) ? map.numericChapters : [];

/**
 * 2026-11-17：数学站拆成两站（数学系 `json/` + 工程数学 `emath/json/`），
 * 章目录因此有两个根。`dirs` 是**两个根的并集**；每条线的 `site` 决定它必须落在哪个根
 * （规则 1e），这样「章搬了但线没改」和「线改了但章没搬」都会被抓到。
 */
const SITE_ROOTS = {
  math: JSON_DIR,
  emath: path.join(ROOT, 'emath/json'),
};
const chaptersOf = (root) =>
  fs.existsSync(root)
    ? fs.readdirSync(root).filter((d) => fs.statSync(path.join(root, d)).isDirectory())
    : [];
const dirs = Object.values(SITE_ROOTS).flatMap(chaptersOf);
const numericCodes = numeric.map((c) => c.code);

/* ---------------------------------------------------------------- 1. 章覆盖 */

const seen = new Map();
const dup = [];
for (const line of lines) {
  for (const ch of line.chapters ?? []) {
    if (seen.has(ch)) dup.push(`${ch}（${seen.get(ch)} 与 ${line.id}）`);
    else seen.set(ch, line.id);
  }
}
check('1a 线表无重复章', dup.length === 0, dup.slice(0, 5).join('；'));

const unknown = [...seen.keys()].filter((c) => !dirs.includes(c) && !numericCodes.includes(c));
check('1b 线表无未知章', unknown.length === 0, unknown.slice(0, 8).join('、'));

const missingDirs = dirs.filter((d) => !seen.has(d));
check('1c 全部章目录都已归线', missingDirs.length === 0, missingDirs.join('、'));

const missingNumeric = numericCodes.filter((c) => !seen.has(c));
check('1d 全部数值库章都已归线', missingNumeric.length === 0, missingNumeric.join('、'));

// 1e 站点落位：每条线声明的章必须真的在自己站点的数据根里（默认 math）
const wrongRoot = [];
for (const line of lines) {
  const siteId = line.site ?? 'math';
  const root = SITE_ROOTS[siteId];
  if (!root) {
    wrongRoot.push(`${line.id}→未知站点 ${siteId}`);
    continue;
  }
  const have = new Set(chaptersOf(root));
  for (const ch of line.chapters ?? []) {
    if (!have.has(ch)) wrongRoot.push(`${line.id}:${ch} 不在 ${siteId}/`);
  }
}
check('1e 每条线的章都落在本站数据根', wrongRoot.length === 0, wrongRoot.slice(0, 8).join('、'));

/* ---------------------------------------------------------------- 2. 组归属 */

const groupIds = new Set(groups.map((g) => g.id));
const badGroup = lines.filter((l) => !groupIds.has(l.group)).map((l) => `${l.id}→${l.group}`);
check('2a 每条线的 group 都存在', badGroup.length === 0, badGroup.join('、'));

const emptyGroups = [...groupIds].filter((g) => !lines.some((l) => l.group === g));
check('2b 每个组至少一条线', emptyGroups.length === 0, emptyGroups.join('、'));

/* ---------------------------------------------------------------- 3. 编号全集 */

const entries = numeric.flatMap((c) => c.surveyEntries ?? []);
const entryDup = entries.filter((e, i) => entries.indexOf(e) !== i);
check('3a survey 编号无重复', entryDup.length === 0, [...new Set(entryDup)].join('、'));

const entrySet = new Set(entries);
const expected = new Set(SURVEY_IDS);
const notAssigned = [...expected].filter((e) => !entrySet.has(e));
const extra = [...entrySet].filter((e) => !expected.has(e));
check('3b survey 编号无遗漏', notAssigned.length === 0, notAssigned.join('、'));
check('3c survey 编号无越界', extra.length === 0, extra.join('、'));

/* ---------------------------------------------------------------- 4. 代号格式 */

const badChapter = [...seen.keys()].filter((c) => !CHAPTER_RE.test(c));
check('4a 章代号格式', badChapter.length === 0, badChapter.join('、'));

const nlSeqs = numericCodes.map((c) => Number(c.slice(2)));
const nlContinuous =
  numericCodes.every((c) => /^NL\d{2}$/.test(c)) &&
  nlSeqs.every((n, i) => n === i + 1);
check('4b 数值库章 NL 连续', nlContinuous, numericCodes.join('、'));

const nlDup = numericCodes.filter((c, i) => numericCodes.indexOf(c) !== i);
check('4c 数值库章不重复', nlDup.length === 0, nlDup.join('、'));

/* ---------------------------------------------------------------- 5. 落点非空 */

const noAnchor = numeric
  .filter((c) => {
    const hasFiles = (c.libraryFiles ?? []).length > 0;
    const hasBridge = typeof c.bridgeFile === 'string' && c.bridgeFile.length > 0;
    return !hasFiles && !hasBridge && c.status !== 'unbuilt';
  })
  .map((c) => c.code);
check('5a 每章有落点或标 unbuilt', noAnchor.length === 0, noAnchor.join('、'));

if (fs.existsSync(GRAPHICS)) {
  const libRefs = numeric.flatMap((c) =>
    (c.libraryFiles ?? [])
      .filter((f) => f.startsWith('src/'))
      .map((f) => ({ code: c.code, file: f })),
  );
  const missing = libRefs.filter((r) => !fs.existsSync(path.join(GRAPHICS, r.file)));
  check('5b 库文件在 graphics 仓真实存在', missing.length === 0, missing.map((m) => `${m.code}:${m.file}`).join('、'));

  const bridgeRefs = numeric
    .filter((c) => typeof c.bridgeFile === 'string')
    .map((c) => ({ code: c.code, file: c.bridgeFile.replace(/^notebook\//, '') }));
  const missingBridge = bridgeRefs.filter((r) => !fs.existsSync(path.resolve(ROOT, '..', 'notebook', r.file)));
  check('5c 桥接源文件在 notebook 仓真实存在', missingBridge.length === 0, missingBridge.map((m) => `${m.code}:${m.file}`).join('、'));
} else {
  skip += 2;
  console.log('SKIP 5b/5c —— 找不到 ../graphics 或 ../notebook（本仓被单独拷走时正常）');
}

/* ------------------------------------------------- 5d/5e 现代号章清单只许有一份 */

/*
 * 2026-11-14 复核发现：`taxonomy.ts` 的 `DOMAINS` 曾是**第二份手写章清单**（旧章名），
 * 与 content-map 的现代号体系各自演化。现在它的字段已改名为 `legacyChapters`，
 * 只给 `remap-codes.mjs` 用；下面两条守卫确保它不会被重新写成第二份真源。
 */
const TAX_PATH = path.join(ROOT, 'src/modules/taxonomy.ts');
if (fs.existsSync(TAX_PATH)) {
  const taxSrc = fs.readFileSync(TAX_PATH, 'utf8');
  check(
    '5d taxonomy 不持有现代号章清单',
    !/^\s+chapters:\s*\[/m.test(taxSrc),
    '出现字面 chapters: [ … ]，章清单应放 content-map.json',
  );
  const modernInLegacy = [...taxSrc.matchAll(/legacyChapters:\s*\[([^\]]*)\]/g)].flatMap(
    (m) => m[1].match(/'[A-Z]{2}\d{2}'/g) ?? [],
  );
  check('5e legacyChapters 不含现代号', modernInLegacy.length === 0, modernInLegacy.join('、'));
} else {
  skip += 2;
  console.log('SKIP 5d/5e —— 找不到 src/modules/taxonomy.ts');
}

/* ---------------------------------------------------------------- 6. 站点唯一 */

const roots = sites.map((s) => s.dataRoot);
const entriesHtml = sites.map((s) => s.entryHtml);
check('6a dataRoot 不重复', new Set(roots).size === roots.length, roots.join('、'));
check('6b entryHtml 不重复', new Set(entriesHtml).size === entriesHtml.length, entriesHtml.join('、'));
check('6c 站点字段非空', sites.every((s) => s.id && s.title && s.dataRoot && s.entryHtml));

/* ---------------------------------------------------------------- 7. 路线页 */

const tracks = map.routePage?.tracks ?? [];
check('7a 路线页有两段', tracks.length === 2, `实际 ${tracks.length} 段`);
for (const t of tracks) {
  if (t.chapters) {
    const bad = t.chapters.filter((c) => !numericCodes.includes(c));
    check(`7b 路线段 ${t.id} 指向数值库章`, bad.length === 0, bad.join('、'));
  }
  if (t.source) {
    check(`7c 路线段 ${t.id} 源文件存在`, fs.existsSync(path.join(ROOT, t.source)), t.source);
  }
}

/* ---------------------------------------------------------------- 报告 */

console.log(`内容总图：${lines.length} 条线 / ${seen.size} 章 / 数值库 ${numeric.length} 章 / survey 编号 ${entrySet.size} 条`);
console.log(`PASS ${pass} · FAIL ${fail} · SKIP ${skip}`);
if (fail) {
  console.log('\n失败项：');
  for (const f of failures) console.log(`  CRIT ${f}`);
  process.exit(1);
}
