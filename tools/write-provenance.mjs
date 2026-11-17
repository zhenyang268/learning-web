/**
 * 写 `dist/provenance.json` —— 构建时快照上游 `../notebook` 的 git 状态。
 *
 * 为什么需要它：`AGENTS.md` §1.2 要求构建产物带出处（commit + dirty），
 * 它把「json/ 是从哪一版笔记生成的」变成**可验证的事实**：
 * commit 变了或 `dirty=true`，就说明页面与笔记可能不一致，需要重建。
 * 历史实现是已退役的 `build/archive/slice_notebook.py`（Python 生成线）；
 * 那条线 2026-10-31 退役后这个文件就没有生成者了，本脚本补上 Node 侧的实现，
 * 字段沿用 `DESIGN.md` §3 的 schema（pandoc 相关字段在 Node 线不存在，故不写）。
 *
 * 用法：npm run build 的最后一步（也可单跑）
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOTEBOOK = process.env.LEARNING_NOTEBOOK
  ? path.resolve(process.env.LEARNING_NOTEBOOK)
  : path.resolve(ROOT, '..', 'notebook');

function git(args) {
  return execFileSync('git', ['-C', NOTEBOOK, ...args], { encoding: 'utf8' }).trim();
}

if (!fs.existsSync(path.join(NOTEBOOK, '.git'))) {
  // 明确失败，不静默写一个「看起来有出处」的假文件
  console.error(`CRIT 找不到笔记仓：${NOTEBOOK}（可用 LEARNING_NOTEBOOK 指定）`);
  process.exit(1);
}

const commit = git(['rev-parse', 'HEAD']);
const dirty = git(['status', '--porcelain']).length > 0;

const out = {
  notebook_repo: NOTEBOOK,
  notebook_commit: commit,
  notebook_dirty: dirty,
  built_at: new Date().toISOString(),
  generator: 'tools/write-provenance.mjs',
  // 旧 schema 的 `files` 是当次转换的 .tex 清单；现在 json 由 importer 逐个记录 src.file，
  // 这里不再重复一份清单（避免第二处真源漂移）。
  files: [],
};

const DIST = path.join(ROOT, 'dist');
fs.mkdirSync(DIST, { recursive: true });
const dest = path.join(DIST, 'provenance.json');
fs.writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
console.log(`provenance: ${path.relative(ROOT, dest)} · notebook ${commit.slice(0, 7)}${dirty ? ' (dirty)' : ''}`);