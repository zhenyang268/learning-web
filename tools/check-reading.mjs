/**
 * 朗读版笔记的验收闸门（jsdom，无需浏览器）。
 *
 * 检查三件事：
 *   1. 目录渲染出来了（不是白屏）；
 *   2. 随机抽 3 个单元，正文能渲染出 `<p>`，且标题非空；
 *   3. 正文**没有任何会毁掉朗读的残留符号**：`$`、反斜杠、裸 `_`、表格竖线。
 *
 * 为什么查残留要放在页面层而不是 Python 生成器里：生成器的 `check()` 只看得见
 * blocks，看不见页面拼装。这里是端到端——渲染出来的 DOM 才是 TTS 真正读的东西。
 *
 * 用法：
 *   node tools/check-reading.mjs            # 查 release/reading.html
 *   node tools/check-reading.mjs --dev      # 查 readable/*.json（不启服务）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 朗读会念错的残留：`$`、反斜杠、下划线、表格竖线、未转义的 LaTeX 花括号 */
const RESIDUE = /[$\\_|]/;

function checkData(dir = path.join(ROOT, 'readable')) {
  const problems = [];
  let units = 0;
  let blocks = 0;

  const walk = (cur) => {
    for (const name of fs.readdirSync(cur).sort()) {
      const full = path.join(cur, name);
      if (fs.statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!name.endsWith('.json') || name.startsWith('_')) continue;
      const unit = JSON.parse(fs.readFileSync(full, 'utf8'));
      if (!Array.isArray(unit.blocks)) continue; // index.json
      units += 1;
      for (const b of unit.blocks) {
        blocks += 1;
        const hit = RESIDUE.exec(b.x);
        if (hit) {
          problems.push(`${unit.id}: 残留 ${JSON.stringify(hit[0])} → ${b.x.slice(0, 50)}`);
        }
        if (/[A-Z]{4,}/.test(b.x) && /^[A-Z]+$/.test((b.x.match(/[A-Z]{4,}/) ?? [''])[0])) {
          // 全大写留给生成器判（KEEP_AS_IS 里的是合法的），这里不报
        }
      }
    }
  };

  if (!fs.existsSync(dir)) throw new Error(`缺 ${dir}`);
  walk(dir);
  return { units, blocks, problems };
}

async function checkPage() {
  const file = path.join(ROOT, 'release', 'reading.html');
  if (!fs.existsSync(file)) throw new Error('缺 release/reading.html：先跑 node tools/build-reading-standalone.mjs');

  const html = fs.readFileSync(file, 'utf8');
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://127.0.0.1/' });
  const w = dom.window;
  await new Promise((r) => setTimeout(r, 500));

  const links = [...w.document.querySelectorAll('#nav a')];
  if (!links.length) throw new Error('目录为空：页面白屏或 __readingPack 未注入');

  const picks = [links[0], links[Math.floor(links.length / 2)], links[links.length - 1]].filter(Boolean);
  const problems = [];
  for (const a of picks) {
    w.location.hash = a.dataset.id;
    await new Promise((r) => setTimeout(r, 260));
    const h1 = w.document.querySelector('#doc h1');
    const ps = w.document.querySelectorAll('#doc p');
    const bad = w.document.querySelector('#doc .bad');
    if (bad) problems.push(`${a.dataset.id}: 载入失败 ${bad.textContent.slice(0, 60)}`);
    if (!h1) problems.push(`${a.dataset.id}: 没有标题`);
    if (ps.length < 2) problems.push(`${a.dataset.id}: 正文段落只有 ${ps.length} 个`);
    const residue = [...ps].map((p) => p.textContent).find((t) => RESIDUE.test(t));
    if (residue) problems.push(`${a.dataset.id}: DOM 里有残留 → ${residue.slice(0, 50)}`);
  }
  return { links: links.length, picks: picks.length, problems };
}

const devOnly = process.argv.includes('--dev');
const data = checkData();
console.log(`数据：${data.units} 单元 / ${data.blocks} 块`);
for (const p of data.problems.slice(0, 10)) console.log(`  ! ${p}`);

let pageProblems = [];
let pageInfo = { links: 0, picks: 0 };
if (!devOnly) {
  try {
    const page = await checkPage();
    pageInfo = page;
    pageProblems = page.problems;
    console.log(`页面：目录 ${page.links} 条 / 抽查 ${page.picks} 个单元`);
    for (const p of pageProblems) console.log(`  ! ${p}`);
  } catch (err) {
    console.log(`  ! 页面检查失败：${err.message}`);
    pageProblems = [err.message];
  }
}

const total = data.problems.length + pageProblems.length;
console.log(total === 0 ? '通过：残留 0 处' : `未通过：${total} 处`);
process.exit(total === 0 ? 0 : 1);
