/**
 * 索引构建（**Node 侧**，不在浏览器里跑）。
 *
 * 为什么单独抽出来：vite dev 中间件、生产构建、standalone 打包、验收台四处都要
 * 「扫 json/ → 产出带元数据的单元表」，规则必须只有一份。
 *
 * 索引里带 `cards`（卡片 key）与 `links`（词条外链并集）：
 * 侧栏 / 依赖图 / frontier / 掌握度聚合因此都不需要词条正文 ——
 * **启动只拉索引（几 KB），切到哪个单元才拉哪个单元的文件（十几 KB）**。
 */
import fs from 'node:fs';
import path from 'node:path';
import type { EntryFile, UnitMeta } from '../types';
import { unitMetaOf } from '../types';

export interface KbIndexPayload {
  units: UnitMeta[];
  generated: string;
  /** 索引自身字节数，便于在页面/日志里核对「启动到底拉了多少」 */
  indexBytes: number;
}

/** 读 JSON 并按 mtime 缓存解析结果：dev 下每次请求索引都不必重解全库 */
const parseCache = new Map<string, { mtimeMs: number; file: EntryFile | null }>();

function readUnitFile(abs: string, relPath: string): EntryFile | null {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    return null;
  }
  const hit = parseCache.get(abs);
  if (hit && hit.mtimeMs === stat.mtimeMs) return hit.file;
  let file: EntryFile | null = null;
  try {
    const raw = JSON.parse(fs.readFileSync(abs, 'utf8')) as Omit<EntryFile, 'path'>;
    if (Array.isArray(raw.entries)) file = { ...raw, path: relPath };
  } catch {
    file = null; // 坏文件不进索引，交给页面侧的错误浮层
  }
  parseCache.set(abs, { mtimeMs: stat.mtimeMs, file });
  return file;
}

/** 扫出 json/<chapter>/<code>.json（相对路径，已排序） */
export function scanUnitPaths(jsonDir: string): string[] {
  if (!fs.existsSync(jsonDir)) return [];
  const out: string[] = [];
  for (const chapter of fs.readdirSync(jsonDir).sort()) {
    const dir = path.join(jsonDir, chapter);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const name of fs.readdirSync(dir).sort()) {
      if (name.endsWith('.json') && name !== 'index.json') out.push(`json/${chapter}/${name}`);
    }
  }
  return out;
}

export function buildIndex(jsonDir: string): KbIndexPayload {
  const units: UnitMeta[] = [];
  for (const rel of scanUnitPaths(jsonDir)) {
    const file = readUnitFile(path.join(jsonDir, rel.slice('json/'.length)), rel);
    if (file?.code) units.push(unitMetaOf(file));
  }
  units.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  const payload: KbIndexPayload = {
    units,
    generated: new Date().toISOString(),
    indexBytes: 0,
  };
  payload.indexBytes = JSON.stringify({ units }).length;
  return payload;
}
