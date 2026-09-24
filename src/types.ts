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
