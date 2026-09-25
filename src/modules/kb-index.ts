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
import { parse as parseYaml } from 'yaml';
import type { EntryFile, UnitMeta, UnitSem } from '../types';
import { unitMetaOf } from '../types';
import { normalizeSemYaml, type SemYaml } from './graph-model';

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

/** yaml 文件缓存（按 mtime）：dev 下每次请求索引都不必重解 graph/ */
const yamlCache = new Map<string, { mtimeMs: number; doc: SemYaml | null }>();

function readSemYaml(abs: string): SemYaml | null {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    return null;
  }
  const hit = yamlCache.get(abs);
  if (hit && hit.mtimeMs === stat.mtimeMs) return hit.doc;
  let doc: SemYaml | null = null;
  try {
    const parsed = parseYaml(fs.readFileSync(abs, 'utf8')) as SemYaml;
    if (parsed && typeof parsed === 'object') doc = parsed;
  } catch {
    doc = null; // 坏 yaml 不进索引；构建期有 check:graph 把关，运行期降级为派生边
  }
  yamlCache.set(abs, { mtimeMs: stat.mtimeMs, doc });
  return doc;
}

/**
 * 把 `graph/<L>.yaml` 的四类语义边烘进索引（构建期，Node 侧）。
 *
 * **规则与 `graph-model.ts` 的 mergeGraph 完全一致**（同一段 normalizeSemYaml）：
 *   - 被 yaml 列进 nodes 的单元 → 打上 `sem`，其编号序派生 prereq 作废、以 yaml 为准；
 *   - 未被 yaml 覆盖的单元 → 不打 `sem`，运行期继续用 links 派生（向后兼容，不白屏）。
 *
 * 为什么在构建期而不是运行期做：浏览器侧 fetch graph/*.yaml 会撞「零外部请求」红线
 * （dom-harness 把非 json/ 的 fetch 全判为外部请求），且每次开图谱都要多 26 个往返。
 */
export function attachSem(units: UnitMeta[], graphDir: string): void {
  if (!fs.existsSync(graphDir)) return;
  const known = new Set(units.map((u) => u.code));
  const byCode = new Map(units.map((u) => [u.code, u]));
  const covered = new Map<string, UnitSem>();

  for (const name of fs.readdirSync(graphDir).sort()) {
    if (!name.endsWith('.yaml')) continue;
    const letter = name.slice(0, -'.yaml'.length);
    const doc = readSemYaml(path.join(graphDir, name));
    if (!doc) continue;
    // 规范化边：端点不存在 / 未知边类型 / 自指一律进 problems，这里丢弃坏边不进索引
    const { directed, undirected, problems } = normalizeSemYaml(letter, doc, known);
    if (problems.length) {
      console.warn(`[kb-index] graph/${name} 规范化有 ${problems.length} 处问题（已跳过坏边）：`, problems.slice(0, 5));
    }
    // **覆盖标记以 yaml 的 nodes 键为准**：即使四类边全空（如 A1.1 的 prereq: []），
    // 也要标 covered —— 否则运行期会把编号序派生的假 prereq 又加回来。
    for (const node of Object.keys(doc.nodes ?? {})) {
      if (known.has(node) && !covered.has(node)) {
        covered.set(node, { prereq: [], applies: [], tension: [], dual: [] });
      }
    }
    for (const e of directed) {
      if (e.kind === 'prereq') covered.get(e.to)?.prereq.push(e.from);
      else covered.get(e.from)?.applies.push(e.to);
    }
    for (const e of undirected) {
      covered.get(e.a)?.[e.kind].push(e.b);
      covered.get(e.b)?.[e.kind].push(e.a);
    }
  }

  for (const [code, sem] of covered) {
    const u = byCode.get(code);
    if (!u) continue;
    // 去重 + 按代号排序（无向边两端都写会重复；排序让 diff 稳定）
    const uniq = (a: string[]) => [...new Set(a)].sort();
    u.sem = {
      prereq: uniq(sem.prereq),
      applies: uniq(sem.applies),
      tension: uniq(sem.tension),
      dual: uniq(sem.dual),
    };
  }
}

/**
 * @param jsonDir   json/ 绝对路径（dom-harness 可用 HARNESS_JSON 指向别处）
 * @param graphDir  graph/ 绝对路径。**显式传入**，不从 jsonDir 推：
 *                  原先写 `resolve(jsonDir, '..', 'graph')` 隐含「json 与 graph 是兄弟目录」，
 *                  一旦 HARNESS_JSON 指到别处就找不到 yaml → 语义边**静默全丢**（不报错，
 *                  界面悄悄退回编号序启发式）。调用方（vite/standalone/harness）都手里有仓库根。
 */
export function buildIndex(jsonDir: string, graphDir: string): KbIndexPayload {
  const units: UnitMeta[] = [];
  for (const rel of scanUnitPaths(jsonDir)) {
    const file = readUnitFile(path.join(jsonDir, rel.slice('json/'.length)), rel);
    if (file?.code) units.push(unitMetaOf(file));
  }
  units.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  attachSem(units, graphDir);
  const payload: KbIndexPayload = {
    units,
    generated: new Date().toISOString(),
    indexBytes: 0,
  };
  payload.indexBytes = JSON.stringify({ units }).length;
  return payload;
}
