import type { Entry, EntryFile, UnitMeta } from '../types';

export interface LoadIssue {
  /** 哪个文件（json/A1/A1.3.json） */
  file: string;
  /** 哪个字段（entries[3].content）；文件级问题写 `file` 或 `<parse>` */
  field: string;
  message: string;
  fatal?: boolean;
}

const REQUIRED_FILE_FIELDS = ['schema', 'code', 'chapter', 'title'] as const;
/** 词条必填：id/type 必须是字符串；content 允许缺省，由渲染层给占位 */
const REQUIRED_ENTRY_FIELDS = ['id', 'type'] as const;
/** 两级代号：A1.3 / B2 / P10 / de1.7 / lie3.28 合法（前缀可多字母）；A1.3.2 非法 */
const CODE_RE = /^[A-Za-z]+\d+(?:\.\d+)?$/;

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    const e = err as Error;
    throw new Error(`JSON 语法错误：${e.message}`);
  }
}

/**
 * 只拉索引（几 KB）：含 code/chapter/title/cards/links，
 * 侧栏、依赖图、frontier、掌握度聚合都够用 —— **启动不再拉全库**。
 */
export async function loadIndex(): Promise<UnitMeta[]> {
  const data = (await fetchJson('json/index.json')) as { units?: unknown };
  if (!Array.isArray(data.units)) throw new Error('json/index.json 缺少 units 数组');
  const units: UnitMeta[] = [];
  for (const raw of data.units) {
    if (typeof raw !== 'object' || raw === null) continue;
    const u = raw as Record<string, unknown>;
    if (typeof u.path !== 'string' || typeof u.code !== 'string') continue;
    units.push({
      path: u.path,
      code: u.code,
      chapter: typeof u.chapter === 'string' ? u.chapter : u.code,
      title: typeof u.title === 'string' ? u.title : u.code,
      cards: Array.isArray(u.cards) ? u.cards.filter((c): c is string => typeof c === 'string') : [],
      links: Array.isArray(u.links) ? u.links.filter((c): c is string => typeof c === 'string') : [],
    });
  }
  return units;
}

function validateFile(raw: unknown, path: string, issues: LoadIssue[]): EntryFile | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    issues.push({ file: path, field: '<root>', message: '顶层不是对象', fatal: true });
    return null;
  }
  const obj = raw as Record<string, unknown>;
  for (const key of REQUIRED_FILE_FIELDS) {
    if (typeof obj[key] !== 'string' || (obj[key] as string) === '') {
      issues.push({ file: path, field: key, message: `文件级必填字段缺失或非字符串：${key}` });
    }
  }
  if (obj.schema !== undefined && obj.schema !== 'entry-card/v2') {
    issues.push({ file: path, field: 'schema', message: `未知 schema：${String(obj.schema)}（期望 entry-card/v2）` });
  }
  if (typeof obj.code === 'string' && !CODE_RE.test(obj.code)) {
    issues.push({ file: path, field: 'code', message: `代号不是两级：${obj.code}` });
  }
  if (!Array.isArray(obj.entries)) {
    issues.push({ file: path, field: 'entries', message: 'entries 缺失或非数组', fatal: true });
    return null;
  }

  const entries: Entry[] = [];
  (obj.entries as unknown[]).forEach((item, i) => {
    const at = `entries[${i}]`;
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      issues.push({ file: path, field: at, message: '词条不是对象' });
      return;
    }
    const e = item as Record<string, unknown>;
    for (const key of REQUIRED_ENTRY_FIELDS) {
      if (typeof e[key] !== 'string') {
        issues.push({ file: path, field: `${at}.${key}`, message: `词条必填字段缺失或非字符串：${key}` });
      }
    }
    if (e.title !== undefined && typeof e.title !== 'string') {
      issues.push({ file: path, field: `${at}.title`, message: 'title 非字符串' });
    }
    const id = typeof e.id === 'string' ? e.id : '';
    const code = typeof obj.code === 'string' ? obj.code : '';
    if (code && id && !id.startsWith(`${code}:`)) {
      issues.push({ file: path, field: `${at}.id`, message: `id 前缀与文件代号不一致：${id} ∉ ${code}` });
    }
    if (Array.isArray(e.links)) {
      e.links.forEach((l, j) => {
        if (typeof l !== 'string' || !CODE_RE.test(l)) {
          issues.push({ file: path, field: `${at}.links[${j}]`, message: `links 不是两级代号：${String(l)}` });
        }
      });
    }
    if (e.viz !== undefined && typeof e.viz === 'object' && e.viz !== null) {
      const viz = e.viz as Record<string, unknown>;
      const front = typeof viz.module === 'string';
      const planned = viz.status === 'planned-backend';
      if (!front && !planned) {
        issues.push({ file: path, field: `${at}.viz`, message: 'viz 既非档1（module）也非档2（planned-backend）' });
      }
    }
    entries.push(item as unknown as Entry);
  });

  return { ...(obj as unknown as EntryFile), entries, path };
}

export interface UnitResult {
  file: EntryFile | null;
  issues: LoadIssue[];
}

/** 拉单个单元（切到哪个才拉哪个）。调用方负责缓存，避免重复请求。 */
export async function loadUnit(path: string): Promise<UnitResult> {
  const issues: LoadIssue[] = [];
  let raw: unknown;
  try {
    raw = await fetchJson(path);
  } catch (err) {
    issues.push({ file: path, field: '<fetch>', message: (err as Error).message, fatal: true });
    return { file: null, issues };
  }
  return { file: validateFile(raw, path, issues), issues };
}
