/**
 * 学科分层与代号编排 —— **代号规则的唯一真源**。
 *
 * 为什么重排（2026-10-30）：旧代号（`A1`/`P3`/`de1`/`lie2`/`N9`）是几次小任务各自
 * 加出来的，字母顺序既不是学习顺序也不是主题分组 —— 侧栏 132 章平铺、看不出学科边界，
 * 也无法回答「这一章属于哪条线」。这里改成**可 Derive 的层级代号**：
 *
 *   ```
 *   AN03.2
 *   │└┬┘└┬┘
 *   │ │  └─ 单元序（该章内第 2 个单元）
 *   │ └──── 章序（该域内第 3 章，两位定长，便于排序与阅读）
 *   └────── 域（两位字母，AN = 分析）
 *   ```
 *
 * 三级都由代号本身给出，所以侧栏分层、路由、排序**不需要任何附加字段**；
 * 加章只需在 `chapters` 里插一行，后面的章号会整体平移 —— 与旧方案一样有位移风险，
 * 但位移范围收敛在**一个域内**，且 `docs/codes-map-*.md` 留了对照表。
 *
 * 换号的红线：`chapters` 里的**旧章名**只用于一次性迁移（`tools/remap-codes.mjs`），
 * 迁移完成后它只剩「历史注释」的作用，不要再往这里加新内容。
 */
import contentMap from '../content/content-map.json';

/**
 * 侧栏的第一级：把域归成组。**组的清单以 `src/content/content-map.json` 为准**
 * （`check-content-map.mjs` 校验该表），这里的联合类型与它保持同步。
 *
 * 2026-11-14 增 `numeric`：数值库是**关于库本身**的一条线（API 形状 / 容差 / 异常 / 状态），
 * 与「计算」组（数学怎么离散：FDM/FEM/图形学）是两个视角，不能互相折叠。
 */
export type GroupId =
  | 'fundamentals'
  | 'structure'
  | 'physics'
  | 'computing'
  | 'numeric'
  | 'meta'
  | 'exam408'
  | 'exam1'
  | 'examEnglish1'
  | 'examKit'
  | 'project';

export interface Group {
  id: GroupId;
  label: string;
  blurb: string;
}

export const GROUPS: Group[] = [
  { id: 'fundamentals', label: '基础', blurb: '手算技法与极限/积分 —— 其余各线的前置' },
  { id: 'structure', label: '结构', blurb: '对称与随机：描述世界的两种骨架' },
  { id: 'physics', label: '物理', blurb: '方程与物理：从 ODE 到场论' },
  { id: 'computing', label: '计算', blurb: '数值方法与图形学：落到机器的部分' },
  { id: 'numeric', label: '数值库', blurb: '主仓数值库的镜像：每个模块讲清数学背景、设计取舍与数值判据' },
  { id: 'meta', label: '索引', blurb: '关于知识库本身：阶段、清单、教材对照' },
  { id: 'exam408', label: '408 考纲', blurb: '数据结构 / 组成原理 / 操作系统 / 计算机网络' },
  { id: 'exam1', label: '数一考纲', blurb: '高等数学 / 线性代数 / 概率统计' },
  {
    id: 'examEnglish1',
    label: '英一考纲',
    blurb: '按题型分组：导览 / 阅读 / 写作 / 翻译 / 新题型 / 完形 / 词汇（顺序见 subjects.ts 的 chapterOrder）',
  },
  { id: 'examKit', label: '备考工具', blurb: '真题、拔高题线、速学稿、分层表' },
  { id: 'project', label: '工程线', blurb: '按项目分组：系统 / 体系结构 / 语言 / 算法 / 工程方法 / 图形' },
];

export interface Domain {
  /** 两位域代号（与 408 的 OS/CO/CN/DS 同一套格式） */
  id: string;
  /** 中文域名，用于侧栏与总纲 */
  label: string;
  /** 一句话说明这条线在干什么（总纲与目录顶部用） */
  blurb: string;
  /** 所属分层组（侧栏第一级） */
  group: GroupId;
  /**
   * **迁移期遗留的旧章名**（`A1` / `lie2` / `de3` …），只被 `tools/remap-codes.mjs` 读。
   *
   * **它不是「这一域有哪些章」的真源**：章清单在 `src/content/content-map.json` 的 `lines` 里，
   * 由 `LINES` / `lineOfChapter` 查。两条清单对不上是正常的（旧名 vs `AN03` 现代号），
   * 但**现代号不许再写在这里** —— `check-content-map.mjs` 会拦下字面 `chapters: [` 数组。
   */
  legacyChapters: string[];
}

export const DOMAINS: Domain[] = [
  {
    id: 'AN',
    group: 'fundamentals',
    label: '分析',
    blurb: '测度与积分 → 泛函与 L^p → Sobolev → 微分形式 → 复分析。整条线的主题是「把极限与积分说清楚」。',
    legacyChapters: ['A1', 'A2', 'A3', 'A4', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'],
  },
  {
    id: 'AG',
    group: 'structure',
    label: '代数与几何',
    blurb: '群与表示 → 点集拓扑 → 流形与黎曼几何 → 李群与李代数。回答「对称性长什么样」。',
    legacyChapters: ['B1', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10', 'Q11', 'B2', 'lie1', 'lie2', 'lie3'],
  },
  {
    id: 'PR',
    group: 'structure',
    label: '概率与随机',
    blurb: '测度论概率 → 分布族 → 条件期望与鞅 → 收敛模式 → 极限定理 → 蒙特卡洛 → SDE。',
    legacyChapters: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10'],
  },
  {
    id: 'EQ',
    group: 'physics',
    label: '微分方程',
    blurb: 'ODE 与线性系统 → 稳定性 → 分离变量与特征线 → 变换法 → 数值格式。',
    legacyChapters: ['de1', 'de2', 'de3', 'de4'],
  },
  {
    id: 'PH',
    group: 'physics',
    label: '物理与量子',
    blurb: '分析力学 → 数学物理（电磁/相对论/规范场）→ 统计与信息 → 量子力学 → 路径积分 → 量子场论。',
    legacyChapters: ['D1', 'D2', 'D3', 'D4', 'E1', 'E2', 'E3', 'E4', 'M1', 'M2', 'M3', 'M5', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'K1', 'K2', 'K3', 'K4', 'K5', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9'],
  },
  {
    id: 'NM',
    group: 'computing',
    label: '数值与计算',
    blurb: '时间积分 → 空间离散（FDM/FEM/谱）→ 数值线代 → 逼近 → 优化 → 接触与变分积分器。',
    legacyChapters: ['G1', 'G2', 'G3', 'G4', 'G5', 'M4', 'M7'],
  },
  {
    id: 'CG',
    group: 'computing',
    label: '图形学',
    blurb: '离散微分几何 → 渲染方程与采样 → 物理仿真 → 流体 → 光学与参与介质。',
    legacyChapters: ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8', 'I9', 'J1', 'J2', 'J3', 'J4', 'J5', 'J6', 'J7', 'J8', 'M6'],
  },
  {
    id: 'TL',
    group: 'fundamentals',
    label: '工具与技法',
    blurb: '手算工具箱：求和、因式、放缩、极限、三角、线代、积分、特殊函数、能量法。**不是定理集，是兵器谱**。',
    legacyChapters: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10'],
  },
  {
    id: 'NL',
    group: 'numeric',
    label: '数值库',
    blurb:
      '主仓数值库的镜像：以**库模块**为章（值与代数 / 稠密分解 / 变换与分布 / 自动微分 / 时间积分 / 几何 / 离散与求解 / 张量与形式 / 工程切入线），每章讲数学背景、设计取舍与数值判据。',
    // NL 是 2026-11-14 新建，没有旧章名可迁移；它的 18 章只在 content-map.json 的 lines 里。
    legacyChapters: [],
  },
  {
    id: 'DS',
    group: 'exam408',
    label: '数据结构',
    blurb: '线性表、树、图、查找、排序（408 45 分）',
    legacyChapters: [],
  },
  {
    id: 'CO',
    group: 'exam408',
    label: '组成原理',
    blurb: '数据表示、运算、存储、指令、CPU、总线、IO（408 45 分）',
    legacyChapters: [],
  },
  {
    id: 'OS',
    group: 'exam408',
    label: '操作系统',
    blurb: '进程与线程、调度、同步、内存、文件、IO（408 35 分）',
    legacyChapters: [],
  },
  {
    id: 'NT',
    group: 'exam408',
    label: '计算机网络',
    blurb: '体系结构、物理层到应用层（408 25 分）',
    legacyChapters: [],
  },
  {
    id: 'HS',
    group: 'exam1',
    label: '高等数学',
    blurb: '极限、一元与多元微积分、级数、微分方程（约 84 分）',
    legacyChapters: [],
  },
  {
    id: 'LA',
    group: 'exam1',
    label: '线性代数',
    blurb: '行列式、矩阵、向量组、特征值、二次型（约 33 分）',
    legacyChapters: [],
  },
  {
    id: 'PS',
    group: 'exam1',
    label: '概率统计',
    blurb: '随机变量、数字特征、大数定律、参数估计（约 33 分）',
    legacyChapters: [],
  },
  {
    id: 'EX',
    group: 'examKit',
    label: '历年真题',
    blurb: '2016–2024 九套选择题 + 缺图清单',
    legacyChapters: [],
  },
  {
    id: 'DL',
    group: 'examKit',
    label: '408 拔高题线',
    blurb: '41–47 七条题线，冲刺满分用',
    legacyChapters: [],
  },
  {
    id: 'DM',
    group: 'examKit',
    label: '数一拔高题线',
    blurb: '八条题型线（极限到中值证明）',
    legacyChapters: [],
  },
  {
    id: 'QK',
    group: 'examKit',
    label: '速学稿',
    blurb: '一科一份：概括版 + 口语版',
    legacyChapters: [],
  },
  {
    id: 'SY',
    group: 'examKit',
    label: '分层与索引',
    blurb: 'T1/T2/T3 应试分层',
    legacyChapters: [],
  },
  {
    id: 'GD',
    group: 'examKit',
    label: '408 导读',
    blurb: '四科在考什么：职责 / 块表 / 线 / KP 映射 / 考试问法 vs 工程问法（KP 正文仍在各科条目）',
    legacyChapters: [],
  },
  {
    id: 'SO',
    group: 'project',
    label: '操作系统项目',
    blurb: 'linux-api / xv6 / kernel-compare / drivers / security / virtualization',
    legacyChapters: [],
  },
  {
    id: 'CP',
    group: 'project',
    label: '体系结构与编译器',
    blurb: '汇编链接 / 读核 / 造核 / LLVM',
    legacyChapters: [],
  },
  {
    id: 'LG',
    group: 'project',
    label: '语言与并行',
    blurb: 'C++ / Python / CUDA',
    legacyChapters: [],
  },
  {
    id: 'AL',
    group: 'project',
    label: '算法',
    blurb: '实现体检 / 面试题库',
    legacyChapters: [],
  },
  {
    id: 'EG',
    group: 'project',
    label: '工程方法',
    blurb: '测试 / 调试 / 性能 / 系统设计 / 隐性陷阱',
    legacyChapters: [],
  },
  {
    id: 'GX',
    group: 'project',
    label: '图形与游戏',
    blurb: '光栅化 / 光线追踪 / 几何动画 / 引擎 / 游戏',
    legacyChapters: [],
  },
  {
    id: 'CS',
    group: 'project',
    label: 'CSAPP',
    blurb: '数据表示到并发的整条链路',
    legacyChapters: [],
  },
  {
    id: 'DF',
    group: 'project',
    label: '6.824',
    blurb: 'Raft 共识与多副本收敛',
    legacyChapters: [],
  },
  {
    id: 'PA',
    group: 'project',
    label: 'CS149',
    blurb: 'SIMD、多核、GPU 与性能分析',
    legacyChapters: [],
  },
  {
    id: 'DB',
    group: 'project',
    label: '数据库',
    blurb: '索引、事务、MVCC、日志恢复',
    legacyChapters: [],
  },
  {
    id: 'AI',
    group: 'project',
    label: 'AI',
    blurb: '从 MLP 到 Transformer 的架构演进',
    legacyChapters: [],
  },
  {
    id: 'DX',
    group: 'project',
    label: '离散数学',
    blurb: '归纳与不变量、容斥、主定理、网络流、模运算',
    legacyChapters: [],
  },
  {
    id: 'PX',
    group: 'project',
    label: '面试索引',
    blurb: '36 份 OUTLINE 的「面试怎么讲」抽成一页',
    legacyChapters: [],
  },
  {
    id: 'MP',
    group: 'meta',
    label: '路线与索引',
    blurb: '学习阶段、承重墙清单、教材对照。这一域是**元内容**（关于知识库本身），不是数学。',
    legacyChapters: ['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9', 'N10', 'N11', 'N12', 'N13', 'N14', 'N15'],
  },
];

/**
 * **站点级域覆盖**：代号前缀在两站之间撞车时必须由学科裁决。
 *
 * 现场（2026-11 五站接入）：`NT` 在 408 是「计算机网络」（`NT01–NT06`），
 * 在英语一是「新题型」（`NT01`）。`domainOf` 只看代号，无法区分两个站，
 * 于是英一的 `NT01` 被判成 408 的计算机网络：侧栏把它归进「408 考纲」组、
 * 排在所有英一题型之前（实测首屏目录第一行是 `NT01`）。代号不能改（40 个
 * JSON 已生成），所以由 `Subject.domainTable` 把该站的域表**覆盖**给引擎。
 *
 * 缺省为 `null`：四个老站不声明，行为与改造前逐字节一致。
 */
let domainTable: readonly Domain[] | null = null;

/** 由 `boot()` 在启动时调用一次（学科切换 = 换这张表） */
export function useDomains(table: readonly Domain[] | null): void {
  domainTable = table;
}

/** 当前生效的域表：站点的覆盖表优先，否则用本文件的 `DOMAINS` */
export function activeDomains(): readonly Domain[] {
  return domainTable ?? DOMAINS;
}

/** `AN03.2` → `AN`；不匹配返回 '' */
export function domainOf(code: string): string {
  const m = /^([A-Z]{2})\d{2}(?:\.\d+)?$/.exec(code);
  return m ? m[1] : '';
}

/** `AN03.2` → `AN03`；不匹配返回 code 本身 */
export function chapterOf(code: string): string {
  const m = /^([A-Z]{2}\d{2})(?:\.\d+)?$/.exec(code);
  return m ? m[1] : code;
}

export function domainLabel(id: string): string {
  return activeDomains().find((d) => d.id === id)?.label ?? id;
}

export function domainBlurb(id: string): string {
  return activeDomains().find((d) => d.id === id)?.blurb ?? '';
}

/** 侧栏与总纲都按这个顺序，不按代号字典序（字典序会把 MP 排在 NM 前） */
export function domainRank(id: string): number {
  const table = activeDomains();
  const i = table.findIndex((d) => d.id === id);
  return i < 0 ? table.length : i;
}

/** 章的中文标签要靠数据（章标题取自该章第一个单元），这里只给「章号 → 域」 */
export function isCode(code: string): boolean {
  return /^[A-Z]{2}\d{2}(?:\.\d+)?$/.test(code);
}

const ORDER_RE = /^([A-Z]{2})(\d{2})(?:\.(\d+))?$/;

/**
 * **学习顺序**键：域序 → 章序 → 单元序。
 *
 * 为什么不直接比字符串：字符串序把 CG 排在 EQ 前、把 MP 排在 NM 前 ——
 * 那是拼音巧合，不是课程顺序。派生依赖（links → prereq）按「谁在前谁是前序」判定，
 * 一旦用字符串序，跨域链接会凭空造出**环**（2026-10-30 重排实测：PH 系 37 个单元成环）。
 * 所以顺序只有一个来源：本文件的 DOMAINS 数组顺序。
 */
export function orderKey(code: string): [number, number, number] {
  const m = ORDER_RE.exec(code);
  if (!m) return [activeDomains().length, Number.MAX_SAFE_INTEGER, 0];
  return [domainRank(m[1]), Number(m[2]), m[3] ? Number(m[3]) : 0];
}

export function cmpCode(a: string, b: string): number {
  const ka = orderKey(a);
  const kb = orderKey(b);
  return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
}

/** 域 → 所属组；未知域归到 meta（侧栏末尾，不干扰阅读顺序） */
export function groupOf(domainId: string): GroupId {
  return activeDomains().find((d) => d.id === domainId)?.group ?? 'meta';
}

/** 组的显示顺序（按 GROUPS 定义，不按字典序） */
export function groupRank(g: GroupId): number {
  return GROUPS.findIndex((x) => x.id === g);
}

export function groupLabel(g: GroupId): string {
  return GROUPS.find((x) => x.id === g)?.label ?? g;
}

/* ------------------------------------------------------------------ 线层（2026-11-14） */

/**
 * 线：组与章之间的中间层，**只做分组与排序，不进代号**。
 *
 * 为什么加：域层过重（PH 32 章、CG 26 章），展开后一屏全是章号，读者拿不到中间语义。
 * 加线后层级仍是「组 → 线 → 章 → 单元」四层，但第二级能一句话说清「这一段在讲什么」。
 *
 * 为什么不拆域：拆域要重排章号（一个域内整体平移），会把已收敛的 318 个单元、掌握度键、
 * links 与 graph/*.yaml 一起推倒。线不进代号，所以**零迁移**。
 *
 * 数据真源是 `src/content/content-map.json`（规则与理由见 `docs/content-map.md`），
 * 这里只做类型收口与查表；不要在 TS 里另写一份线表。
 */
export interface ContentLine {
  id: string;
  label: string;
  group: GroupId;
  /** 所属域：必须是 DOMAINS 里的 id；一条线只属于一个域 */
  domain: string;
  blurb?: string;
  /** 学习顺序；全表内每个章恰好出现一次（`check-content-map.mjs` 判据 1） */
  chapters: string[];
  status: 'present' | 'planned';
}

/** 内容表的边界类型：JSON 导入只有一处 cast，其余代码按真实类型用 */
interface ContentMapFile {
  sites: unknown[];
  groups: unknown[];
  lines: ContentLine[];
  numericChapters: unknown[];
  routePage: unknown;
  fixups: unknown[];
}

const MAP = contentMap as unknown as ContentMapFile;

export const LINES: readonly ContentLine[] = MAP.lines;

const LINE_OF_CHAPTER = new Map<string, ContentLine>();
for (const line of LINES) for (const ch of line.chapters) LINE_OF_CHAPTER.set(ch, line);

/** 章或单元代号 → 所属线（`AN03.2` 先取 `AN03`）；未登记返回 undefined */
export function lineOfChapter(code: string): ContentLine | undefined {
  return LINE_OF_CHAPTER.get(chapterOf(code));
}

/** 某个组下的线，按内容表书写顺序（即学习顺序） */
export function linesOfGroup(group: GroupId): ContentLine[] {
  return LINES.filter((l) => l.group === group);
}

/**
 * 侧栏第二级的分组键：有线走线，没线退回域。
 *
 * 一处定义、三处使用（渲染侧栏 / 增量刷新进度条 / 未来的线层跳转），
 * 避免两边各写一份 `line ? line.id : domain` 而逐渐分叉。
 */
export function sectionKeyOf(code: string): string {
  const ch = chapterOf(code);
  const line = LINE_OF_CHAPTER.get(ch);
  return line ? `line:${line.id}` : `dom:${domainOf(ch) || 'ZZ'}`;
}
