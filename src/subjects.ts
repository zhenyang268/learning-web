/**
 * 学科配置表 —— **唯一**知道「有几个学科、各自数据在哪」的地方。
 *
 * 为什么要有它：数学与 408 是两套独立子站（同仓多入口），
 * 但外壳 / 渲染器 / 词条契约 / viz 机制完全共用。区别只在四处：
 * 数据根、语义边根、站点标题、总纲页。把这些收敛到一张表，
 * 其余模块一律只接收 `dataRoot`，**不出现任何 `if (subject === ...)`**。
 *
 * 反例（不要这样写）：在渲染器里判断「这是不是 408，代号要换个正则」——
 * 代号规则本来就允许任意字母前缀（`OS01.1` / `AN01.3` / `AG16.7` 同构），
 * 一旦按学科分叉，两边的 bug 会各自演化。
 */
import { SYLLABUS_MD, SYLLABUS_TITLE, SYLLABUS_VERSION } from './content/syllabus';
import { ANGLES_MD, ANGLES_TITLE, ANGLES_VERSION } from './content/angles';
import { SYLLABUS_408_MD, SYLLABUS_408_TITLE, SYLLABUS_408_VERSION } from './content/syllabus-cs408';

export interface Subject {
  /** 站点 id，只用于日志与入口区分 */
  id: 'math' | 'cs408' | 'math1' | 'projects';
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
  /**
   * 「切入点」文档（`#angles`）：一条**具体**的切入线，不是全学科总纲。
   * 这两者曾经混在一个文件里（旧 `syllabus.ts` 其实是「现代分析学一条线」），
   * 2026-10-30 拆开：总纲讲全局图景，切入点讲一条走得通的路。
   */
  angles: { md: string; title: string; version: string } | null;
}

export const MATH: Subject = {
  id: 'math',
  title: 'learning-web · 知识库',
  dataRoot: 'json/',
  graphRoot: 'graph/',
  entryHtml: 'index.html',
  crossLink: { label: '408 考研', href: './cs408.html' },
  syllabus: { md: SYLLABUS_MD, title: SYLLABUS_TITLE, version: SYLLABUS_VERSION },
  angles: { md: ANGLES_MD, title: ANGLES_TITLE, version: ANGLES_VERSION },
};

/**
 * 数一考研（`kaoyan/json/`）。
 *
 * 与 408 是**两套考纲主键**（`M1-*` vs `408-*`），所以拆站不合并：
 * 合站会让「代号 → 侧栏第一级」同时承担两个坐标系。
 * 暂不提供总纲与切入点（`null`），顶栏那两个按钮不渲染。
 */
export const MATH1: Subject = {
  id: 'math1',
  title: 'learning-web · 数一考研',
  dataRoot: 'kaoyan/json/',
  graphRoot: 'kaoyan/graph/',
  entryHtml: 'math1.html',
  crossLink: { label: '408 考研', href: './cs408.html' },
  syllabus: null,
  angles: null,
};

/**
 * 工程线（`projects/json/`）。
 *
 * 单元是 `OUTLINE + NOTES` 两件套，长度量级与词条完全不同，
 * 混进考试线会让「单元 = 一小节」这个前提失效。
 */
export const PROJECTS: Subject = {
  id: 'projects',
  title: 'learning-web · 工程线',
  dataRoot: 'projects/json/',
  graphRoot: 'projects/graph/',
  entryHtml: 'projects.html',
  crossLink: { label: '数学', href: './index.html' },
  syllabus: null,
  angles: null,
};

export const CS408: Subject = {
  id: 'cs408',
  title: 'learning-web · 408 考研',
  dataRoot: 'cs408/json/',
  graphRoot: 'cs408/graph/',
  entryHtml: 'cs408.html',
  crossLink: { label: '数学', href: './index.html' },
  syllabus: { md: SYLLABUS_408_MD, title: SYLLABUS_408_TITLE, version: SYLLABUS_408_VERSION },
  angles: null, // 408 侧暂不提供「切入点」文档
};

/** 构建脚本（vite 插件 / standalone）遍历用 */
export const SUBJECTS: readonly Subject[] = [MATH, CS408, MATH1, PROJECTS];