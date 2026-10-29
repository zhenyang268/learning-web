/**
 * 学科配置表 —— **唯一**知道「有几个学科、各自数据在哪」的地方。
 *
 * 为什么要有它：数学与 408 是两套独立子站（同仓多入口），
 * 但外壳 / 渲染器 / 词条契约 / viz 机制完全共用。区别只在四处：
 * 数据根、语义边根、站点标题、总纲页。把这些收敛到一张表，
 * 其余模块一律只接收 `dataRoot`，**不出现任何 `if (subject === ...)`**。
 *
 * 反例（不要这样写）：在渲染器里判断「这是不是 408，代号要换个正则」——
 * 代号规则本来就允许任意字母前缀（`OS1.1` / `A1.3` / `lie2.7` 同构），
 * 一旦按学科分叉，两边的 bug 会各自演化。
 */
import { SYLLABUS_MD, SYLLABUS_TITLE, SYLLABUS_VERSION } from './content/syllabus';
import { SYLLABUS_408_MD, SYLLABUS_408_TITLE, SYLLABUS_408_VERSION } from './content/syllabus-cs408';

export interface Subject {
  /** 站点 id，只用于日志与入口区分 */
  id: 'math' | 'cs408';
  /** 站点标题（写进 <title>） */
  title: string;
  /** 数据根，相对站点根、带尾斜杠：'json/' | 'cs408/json/' */
  dataRoot: string;
  /** 语义边真源根：'graph/' | 'cs408/graph/' */
  graphRoot: string;
  /** 入口 HTML 名（互链用） */
  entryHtml: string;
  /** 顶栏互链（另一个学科）；无则不给 */
  crossLink?: { label: string; href: string };
  /** 总纲页；null 表示该学科不提供 #graph 路由 */
  syllabus: { md: string; title: string; version: string } | null;
}

export const MATH: Subject = {
  id: 'math',
  title: 'learning-web · 知识库',
  dataRoot: 'json/',
  graphRoot: 'graph/',
  entryHtml: 'index.html',
  crossLink: { label: '408 考研', href: './cs408.html' },
  syllabus: { md: SYLLABUS_MD, title: SYLLABUS_TITLE, version: SYLLABUS_VERSION },
};

export const CS408: Subject = {
  id: 'cs408',
  title: 'learning-web · 408 考研',
  dataRoot: 'cs408/json/',
  graphRoot: 'cs408/graph/',
  entryHtml: 'cs408.html',
  crossLink: { label: '数学', href: './index.html' },
  syllabus: { md: SYLLABUS_408_MD, title: SYLLABUS_408_TITLE, version: SYLLABUS_408_VERSION },
};

/** 构建脚本（vite 插件 / standalone）遍历用 */
export const SUBJECTS: readonly Subject[] = [MATH, CS408];