/** entry-card/v2 契约（TASKBOOK §3）。前端只读，不做写回。 */

export type EntryType =
  | 'statement'
  | 'proof'
  | 'intuition'
  | 'extension'
  | 'counterexample'
  | 'comparison'
  | 'application'
  | 'viz'
  | 'probe'
  | (string & {});

export interface TexRef {
  file?: string;
  line_start?: number;
  line_end?: number;
}

export interface GeneratedBy {
  model?: string;
  date?: string;
  reviewed?: boolean;
}

/** 档1：前端直渲 */
export interface VizFrontend {
  module: string;
  version?: number;
  source?: 'frontend';
  params_hint?: Record<string, unknown>;
}

/** 档2：留空待接（判据 Q1–Q3 命中后端） */
export interface VizPlanned {
  status: 'planned-backend';
  rationale?: string;
  params_hint?: Record<string, unknown>;
}

export type VizSpec = VizFrontend | VizPlanned;

export interface Entry {
  id: string;
  type: EntryType;
  subject?: string;
  title?: string;
  keywords?: string[];
  seed?: string;
  tex_ref?: TexRef | null;
  fill_hint?: string;
  content?: string;
  generated_by?: GeneratedBy;
  status?: string;
  links?: string[];
  viz?: VizSpec;
}

export interface SrcRef {
  file?: string;
  line_start?: number;
  line_end?: number;
  anchor?: string;
}

/** 一个小目/节级 JSON 文件。path 是前端附加的源文件路径，用于报错定位。 */
export interface EntryFile {
  schema?: string;
  code?: string;
  chapter?: string;
  title?: string;
  src?: SrcRef;
  notebook_commit?: string;
  updated?: string;
  entries: Entry[];
  path: string;
}

/** id 形如 `A1.3:mct.statement` → slot = `statement` */
export function slotOf(entry: Entry): string {
  const at = entry.id.indexOf(':');
  if (at < 0) return '';
  const rest = entry.id.slice(at + 1);
  const dot = rest.indexOf('.');
  return dot < 0 ? rest : rest.slice(dot + 1);
}

export function subjectOf(entry: Entry): string {
  if (entry.subject) return entry.subject;
  const at = entry.id.indexOf(':');
  if (at < 0) return 'general';
  const rest = entry.id.slice(at + 1);
  const dot = rest.indexOf('.');
  return dot < 0 ? rest : rest.slice(0, dot);
}

export function isVizFrontend(viz: VizSpec): viz is VizFrontend {
  return typeof (viz as VizFrontend).module === 'string';
}

/**
 * 卡片（掌握度单元）的 key。
 * `general.*` 每个词条自成一张卡，其余按 subject 归并成一张卡。
 * **首页与索引必须用同一条规则**，否则掌握度会算到两个不同的键上。
 */
export function cardKeyOf(code: string, entry: Entry): string {
  const subject = subjectOf(entry);
  return subject === 'general' ? entry.id : `${code}:${subject}`;
}

/**
 * 单元元数据。索引（`json/index.json`）只带这些字段 ——
 * 侧栏、依赖图、frontier、掌握度聚合都不需要词条正文，因此**启动不必拉全库**。
 */
export interface UnitMeta {
  /** 相对路径：json/A1/A1.3.json */
  path: string;
  code: string;
  chapter: string;
  title: string;
  /** 本单元的卡片 key 列表（掌握度聚合用） */
  cards: string[];
  /** 本单元所有词条 links 的并集（依赖图只用它） */
  links: string[];
  /**
   * 语义边真源（`graph/<L>.yaml`）**构建期烘进来的那一份**。
   *
   * 为什么要烘：右栏「依赖◂」与 frontier「今天该学」原先只吃 links 的编号序启发式，
   * 于是 A1.2 的真实上游 A1.4 不显示、P3.1 凭空多 16 个假上游、26 个地基单元被压住
   * （实测）。而浏览器侧现拉 yaml 会撞「零外部请求」红线（dom-harness 把非 json/ 的
   * fetch 全判为外部），所以走构建期注入 —— 与 KaTeX 预渲染（决策 D8）同一哲学。
   *
   * **字段存在即代表该单元被 yaml 覆盖**（哪怕四类边全空，如 A1.1 的 prereq: []）：
   * 覆盖组内的编号序派生 prereq 一律作废，以 yaml 为准（与 mergeGraph 同一规则）。
   */
  sem?: UnitSem;
}

/** 四类语义边（DESIGN §8.2）；构建期从 graph/<L>.yaml 提取 */
export interface UnitSem {
  prereq: string[];
  applies: string[];
  tension: string[];
  dual: string[];
}

export function unitMetaOf(file: EntryFile): UnitMeta {
  const code = file.code ?? '';
  const cards: string[] = [];
  const links = new Set<string>();
  for (const e of file.entries) {
    const key = cardKeyOf(code, e);
    if (code !== 'general') cards.push(key);
    for (const l of e.links ?? []) links.add(l);
  }
  // 去重但保序（cardKeyOf 对同一 subject 会重复产出同一个 key）
  return {
    path: file.path,
    code,
    // 分组键由代号派生（不信 JSON 的 chapter：de/lie 篇 parent 常为 null）
    chapter: code.split('.')[0] || file.chapter || code,
    title: file.title ?? code,
    cards: [...new Set(cards)],
    links: [...links],
  };
}
