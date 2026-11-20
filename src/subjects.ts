/**
 * 学科配置表 —— **唯一**知道「有几个学科、各自数据在哪」的地方。
 *
 * 为什么要有它：数学 / 408 / 数一 / 工程线 / 英语一是五套独立子站（同仓多入口），
 * 但外壳 / 渲染器 / 词条契约 / viz 机制完全共用。区别只在五处：
 * 数据根、语义边根、站点标题、总纲页、**侧栏排序与首屏落点**。把这些收敛到一张表，
 * 其余模块一律只接收 `dataRoot`，**不出现任何 `if (subject === ...)`**。
 *
 * 反例（不要这样写）：在渲染器里判断「这是不是 408，代号要换个正则」——
 * 代号规则本来就允许任意字母前缀（`OS01.1` / `AN01.3` / `GE01.1` 同构），
 * 一旦按学科分叉，两边的 bug 会各自演化。
 */
import { SYLLABUS_MD, SYLLABUS_TITLE, SYLLABUS_VERSION } from './content/syllabus';
import { ANGLES_MD, ANGLES_TITLE, ANGLES_VERSION } from './content/angles';
import { SYLLABUS_408_MD, SYLLABUS_408_TITLE, SYLLABUS_408_VERSION } from './content/syllabus-cs408';
import {
  SYLLABUS_PROJECTS_HAS_ROUTES,
  SYLLABUS_PROJECTS_MD,
  SYLLABUS_PROJECTS_TITLE,
  SYLLABUS_PROJECTS_VERSION,
} from './content/syllabus-projects';
import { DOMAINS, type Domain, type GroupId } from './modules/taxonomy';

export interface Subject {
  /** 站点 id，只用于日志与入口区分 */
  id: 'math' | 'emath' | 'cs408' | 'math1' | 'projects' | 'english1';
  /** 站点标题（写进 <title>） */
  title: string;
  /** 顶栏短标签（五站互链用）：两三个字，桌面顶栏一排放得下 */
  shortLabel: string;
  /** 数据根，相对站点根、带尾斜杠：'json/' | 'cs408/json/' */
  dataRoot: string;
  /** 语义边真源根：'graph/' | 'cs408/graph/' */
  graphRoot: string;
  /** 侧车导语根：'guide/math/' | 'guide/cs408/' */
  guideRoot: string;
  /** 入口 HTML 名（互链用） */
  entryHtml: string;
  /**
   * 首屏落点：没有 hash 时优先打开哪个单元。
   *
   * 为什么不一律用「frontier（今天该学）」：frontier 按**代号序**兜底，
   * 英语一号代序（`CZ01` 完形）在最前，于是首页会落在「完形填空」，
   * 而读者要的是「导览」（`GE01.1` 考纲主键表：题型 + 分值 + 文件在哪）。
   * 引擎未掌握任何单元时先看导览，之后的阅读顺序仍由 frontier 决定。
   *
   * 缺省（`undefined`）＝沿用 frontier，其余四站行为一字不变。
   */
  startCode?: string;
  /**
   * 侧栏 / 顶栏的**章序**：代号前缀（`GE` / `VO` …）到学习次序的映射。
   *
   * 为什么不做成 `if (subject === 'english1')`：排序是站点数据的一部分，
   * 与 dataRoot 同源；写进这张表，sidebar / header 只认「这张表有没有给」。
   * 未登记的域排到最后（按代号），所以其余四站不传此字段时完全不受影响。
   */
  chapterOrder?: readonly string[];
  /**
   * 本站的域表（侧栏第一级 / 顶栏字母块的唯一清单）。
   *
   * 为什么需要「站点级」覆盖：代号前两位在两站之间**可能撞车**。
   * `NT` 在 408 是计算机网络（`NT01–NT06`），在英语一是新题型（`NT01`）；
   * 只有代号无法区分，结果是英一的新题型被归进「408 考纲」组并排到最前
   * （实测目录第一行是 `NT01`）。代号由已生成的 JSON 固定，只能由学科裁决。
   *
   * 缺省（`undefined`）＝沿用 `taxonomy.DOMAINS`，四个老站一字不变。
   */
  domainTable?: readonly Domain[];
  /**
   * 首屏直接落在某个文档路由（`graph` / `angles`），而不是某个单元。
   *
   * 为什么需要：工程线的第一屏应当是「总纲 + 按目标选路线」，不是某个项目页；
   * `startCode` 只能指向单元，所以单独给文档路由留一个字段。
   */
  startRoute?: 'graph' | 'angles';
  /** 总纲页下方是否追加「按目标选路线」的静态路线卡（工程线用） */
  routesOnGraph?: boolean;
  /**
   * 是否显示进度（掌握度环 / 侧栏 L0 / 进度条 / 「今天该学」）。
   * 缺省 true；工程线显式关掉 —— 进度不在这套静态站里控制。
   */
  showProgress?: boolean;
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
  title: 'learning-web · 数学系数学',
  shortLabel: '数学',
  dataRoot: 'json/',
  graphRoot: 'graph/',
  guideRoot: 'guide/math/',
  entryHtml: 'index.html',
  syllabus: { md: SYLLABUS_MD, title: SYLLABUS_TITLE, version: SYLLABUS_VERSION },
  angles: { md: ANGLES_MD, title: ANGLES_TITLE, version: ANGLES_VERSION },
};

/**
 * 工程数学（`emath/json/`，2026-11-17 从数学站拆出）。
 *
 * 拆分判据（`docs/content-map.md` §拆分记录）：**判据是「能算/能对拍」的章进这里**，
 * 判据是「能证明/能看懂」的留在数学站。数值库 NL01–NL18、数值方法 NM、图形学 CG、
 * 微分方程 EQ，外加三处按内容判据搬过来的章（AN02 泛函 / AN03 微分形式 /
 * AN04 Sobolev·弱解、PR09 蒙特卡洛误差）。
 *
 * 代号**不重排**：AN02 在这里仍叫 AN02，掌握度与笔记引用才不断。
 * 所以本站必须自带域表 —— `AN` 在数学站是「测度与积分线的入口」，
 * 在这里只承载泛函与弱解，标签与组都必须按本站语义重写。
 */
const ENGMATH_DOMAINS: readonly Domain[] = [
  {
    id: 'AN',
    group: 'fundamentals',
    label: '泛函与弱解',
    blurb: '巴拿赫/希尔伯特空间、有界算子与谱、分布、Sobolev 与弱解 —— 数值方法与 FEM 的地基',
    legacyChapters: [],
  },
  {
    id: 'PR',
    group: 'structure',
    label: '蒙特卡洛与误差',
    blurb: '估计量、偏差与方差缩减：随机模拟与 CG 的误差判据从这里来',
    legacyChapters: [],
  },
  {
    id: 'EQ',
    group: 'computing',
    label: '微分方程与格式',
    blurb: 'ODE/PDE → 稳定性 → 变换法与 Green 函数 → 数值格式（归档在数学站的物理侧）',
    legacyChapters: [],
  },
  {
    id: 'NM',
    group: 'computing',
    label: '数值方法',
    blurb: '时间积分与辛积分器、空间离散、数值线代与逼近、优化与变分',
    legacyChapters: [],
  },
  {
    id: 'CG',
    group: 'computing',
    label: '图形学与仿真',
    blurb: '渲染方程与采样、流体、光学与介质、离散外微分',
    legacyChapters: [],
  },
  {
    id: 'NL',
    group: 'numeric',
    label: '数值库',
    blurb: '主仓数值库的镜像：契约与容差 → 值与代数 → 变换 → 张量与形式 → 求解 → 工程切入线',
    legacyChapters: [],
  },
];

export const ENGMATH: Subject = {
  id: 'emath',
  title: 'learning-web · 工程数学',
  shortLabel: '工数',
  dataRoot: 'emath/json/',
  graphRoot: 'emath/graph/',
  guideRoot: 'guide/emath/',
  entryHtml: 'emath.html',
  domainTable: ENGMATH_DOMAINS,
  syllabus: null,
  angles: null,
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
  shortLabel: '数一',
  dataRoot: 'kaoyan/json/',
  graphRoot: 'kaoyan/graph/',
  guideRoot: 'guide/kaoyan/',
  entryHtml: 'math1.html',
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
  shortLabel: '工程',
  dataRoot: 'projects/json/',
  graphRoot: 'projects/graph/',
  guideRoot: 'guide/projects/',
  entryHtml: 'projects.html',
  startRoute: 'graph',
  routesOnGraph: SYLLABUS_PROJECTS_HAS_ROUTES,
  showProgress: false,
  syllabus: {
    md: SYLLABUS_PROJECTS_MD,
    title: SYLLABUS_PROJECTS_TITLE,
    version: SYLLABUS_PROJECTS_VERSION,
  },
  angles: null,
};

export const CS408: Subject = {
  id: 'cs408',
  title: 'learning-web · 408 考研',
  shortLabel: '408',
  dataRoot: 'cs408/json/',
  graphRoot: 'cs408/graph/',
  guideRoot: 'guide/cs408/',
  entryHtml: 'cs408.html',
  syllabus: { md: SYLLABUS_408_MD, title: SYLLABUS_408_TITLE, version: SYLLABUS_408_VERSION },
  angles: null, // 408 侧暂不提供「切入点」文档
};

/**
 * 英语一（`english1/json/`，2026-11 接入第 40 单元后转正为第五站）。
 *
 * 与另外四站的三处结构性差异，全部收在这张表里：
 *
 *  1. **代号前缀不表示「学科域」而表示「题型」**：`GE`（导览）/ `RC`（阅读）/
 *     `WR`（写作，大作文 `.1` 与 `.2`）/ `TR`（翻译）/ `NT`（新题型）/ `CZ`（完形）/
 *     `VO`（词汇，`VO00` 导览 + `VO01–VO30` 主题组 + `VO97` 大纲补全）。
 *     所以 `chapterOrder` 按**题型的学习顺序**排，而不是代号字典序 ——
 *     字典序会把 `CZ` 排在 `GE` 前，首页就落到了完形（实测）。
 *  2. **首屏落点是导览**（`startCode: 'GE01.1'`），不是 frontier 的代号序兜底。
 *  3. 单元全部是 `doc-card/v1`（题型 + 判据 + 自拟例题），**没有**数学那种 L1–L5
 *     自测；判据以题型化文字条目呈现（见 `renderers/doc.ts` 的既定行为，
 *     不硬套自测阶梯 —— 自测型单元的判定看 `kind`，不看学科）。
 */
/**
 * 英语一的域表 = **基础表去掉撞车前缀 + 英一自己的七个题型域**。
 *
 * 为什么不是「基础表 + 追加」：`NT` 在基础表里已是 408 的计算机网络，
 * 追加会得到两个同 id 的域（`find` 取第一个 = 还是 408）。所以先剔除 NT
 * 再按英一的语义重新加进来 —— 这张表是**英一站的全部域**，不是补丁。
 *
 * 组 id 只用 `examEnglish1`：英一的域表里不存在 408 的域，因此不会把
 * 「408 考纲」空组渲染出来（空组本来也会被侧栏跳过，这里只是更明确）。
 */
const ENGLISH1_DOMAINS: readonly Domain[] = [
  // 只剔除**撞车前缀**（NT）；其余域（含工程线 / 索引 / 备考工具）原样保留，
  // 这样英一站的域表仍是「一张完整的表」，而不是只认得自己那几个域。
  // 数一考纲 / 408 考纲的域在英一站里确实没有数据，侧栏不会为空组渲染任何东西。
  ...DOMAINS.filter((d) => d.id !== 'NT'),
  ...( [
    ['GE', '导览', '考纲主键表：六大题型的分值口径、判据与文件位置（首屏落点）'],
    ['RC', '阅读', '六题型（主旨 / 细节 / 推断 / 词义 / 态度 / 例证）、错误选项特征、精读方法（40 分）'],
    ['WR', '写作', '大作文（20 分）与小作文（10 分）两套判据：结构、句式、常见扣分点'],
    ['TR', '翻译', '长难句拆解与英译汉的判据（10 分）'],
    ['NT', '新题型', '七选五 / 排序 / 标题匹配的定位与判据（10 分）'],
    ['CZ', '完形', '完形填空：逻辑关系、固定搭配、上下文复现（10 分）'],
    ['VO', '词汇', '词汇导览 + 30 个主题组 + 大纲补全（5500 词真源在 notebook 的 words/ 目录）'],
  ] as const).map(([id, label, blurb]) => ({
    id,
    label,
    blurb,
    group: 'examEnglish1' as GroupId,
    legacyChapters: [],
  })),
];

export const ENGLISH1: Subject = {
  id: 'english1',
  title: 'learning-web · 英语一',
  shortLabel: '英一',
  dataRoot: 'english1/json/',
  graphRoot: 'english1/graph/',
  guideRoot: 'guide/english1/',
  entryHtml: 'english1.html',
  startCode: 'GE01.1',
  // 章序（前缀或完整章号；完整章号优先）。`WR02`（大作文）与 `WR01`（小作文）
  // 各占一个名次，中间夹着 `TR`（翻译）—— 侧栏因此读作「…阅读 → 大作文 → 翻译 →
  // 小作文 → 新题型…」，而`WR01` 的章号比 `WR02` 小，它排在后面是**刻意的**。
  chapterOrder: ['GE', 'RC', 'WR02', 'TR', 'WR01', 'NT', 'CZ', 'VO'],
  domainTable: ENGLISH1_DOMAINS,
  syllabus: null,
  angles: null,
};

/** 构建脚本（vite 插件 / standalone）遍历用；顺序 = 顶栏五站互链顺序 */
export const SUBJECTS: readonly Subject[] = [MATH, ENGMATH, CS408, MATH1, PROJECTS, ENGLISH1];

/**
 * 五站互链：**唯一**派生入口（取代旧的单条 `subject.crossLink`）。
 *
 * 为什么放这里而不是 header：dev 与 standalone 是两套外壳宿主，
 * 链接必须同源 —— 一处派生，「从任意站到任意站」就都成立。
 *
 * `currentId` 用来标 `aria-current`：当前站**仍渲染成链接**（可发现性优先），
 * 但带 `aria-current="page"` 且点击时不跳（`aria-disabled` + `tabindex` 保留），
 * 避免「点了一下什么也没发生」的假按钮。
 */
export interface SiteLink {
  id: Subject['id'];
  label: string;
  href: string;
  current: boolean;
}

/**
 * 快照判据：`tools/build-standalone.mjs` 打包时用 esbuild `define` 把它换成 `true`。
 *
 * 为什么不在运行期嗅探（`location.protocol === 'file:'`）：dev 也可以用 file:// 打开
 * 构建产物，而快照也可以被 http 伺服。**产物形态**才是判据，协议不是。
 * `typeof` 守卫让源码在 vite / vitest / 冒烟脚本里都能直接跑（未定义即 false）。
 */
declare const __KB_SNAPSHOT__: boolean | undefined;
const IS_SNAPSHOT = typeof __KB_SNAPSHOT__ !== 'undefined' && __KB_SNAPSHOT__;

/**
 * 站点 id → 快照文件名。与 `tools/build-standalone.mjs` 的 `outNameOf` 必须同形：
 * 数学沿用 `knowledge.html`（历史文件名，发出去的文件不能改名），其余 `knowledge-<id>.html`。
 */
const snapshotNameOf = (id: Subject['id']): string =>
  id === 'math' ? 'knowledge.html' : `knowledge-${id}.html`;

/**
 * 五站互链的 href：**dev / 生产构建** → 真实入口 HTML；
 * **单文件快照** → 同目录的快照文件名（同目录，`./` 前缀在 file:// 下才成立）。
 */
const siteHrefOf = (s: Subject): string => (IS_SNAPSHOT ? `./${snapshotNameOf(s.id)}` : `./${s.entryHtml}`);

export function siteLinksOf(currentId: Subject['id']): SiteLink[] {
  return SUBJECTS.map((s) => ({
    id: s.id,
    label: s.shortLabel,
    href: siteHrefOf(s),
    current: s.id === currentId,
  }));
}

/**
 * 章序名次：`chapterOrder` 里没有的前缀排到最后（互相按代号比）。
 * 四个老站不配 `chapterOrder`，于是恒返回 `Infinity` —— 排序回落到原来的
 * 「域序 → 章号」，行为一字不变。
 */
export function chapterOrderRank(subject: Subject, chapter: string): number {
  const order = subject.chapterOrder;
  if (!order) return Number.POSITIVE_INFINITY;
  const i = order.indexOf(chapter.slice(0, 2));
  return i < 0 ? Number.POSITIVE_INFINITY : i;
}
