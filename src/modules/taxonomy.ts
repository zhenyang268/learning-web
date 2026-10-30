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

export interface Domain {
  /** 两位域代号（与 408 的 OS/CO/CN/DS 同一套格式） */
  id: string;
  /** 中文域名，用于侧栏与总纲 */
  label: string;
  /** 一句话说明这条线在干什么（总纲与目录顶部用） */
  blurb: string;
  /** 该域内的章，**按学习顺序**排列；旧章名，只用于一次性迁移 */
  chapters: string[];
}

export const DOMAINS: Domain[] = [
  {
    id: 'AN',
    label: '分析',
    blurb: '测度与积分 → 泛函与 L^p → Sobolev → 微分形式 → 复分析。整条线的主题是「把极限与积分说清楚」。',
    chapters: ['A1', 'A2', 'A3', 'A4', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'],
  },
  {
    id: 'AG',
    label: '代数与几何',
    blurb: '群与表示 → 点集拓扑 → 流形与黎曼几何 → 李群与李代数。回答「对称性长什么样」。',
    chapters: ['B1', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10', 'Q11', 'B2', 'lie1', 'lie2', 'lie3'],
  },
  {
    id: 'PR',
    label: '概率与随机',
    blurb: '测度论概率 → 分布族 → 条件期望与鞅 → 收敛模式 → 极限定理 → 蒙特卡洛 → SDE。',
    chapters: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10'],
  },
  {
    id: 'EQ',
    label: '微分方程',
    blurb: 'ODE 与线性系统 → 稳定性 → 分离变量与特征线 → 变换法 → 数值格式。',
    chapters: ['de1', 'de2', 'de3', 'de4'],
  },
  {
    id: 'PH',
    label: '物理与量子',
    blurb: '分析力学 → 数学物理（电磁/相对论/规范场）→ 统计与信息 → 量子力学 → 路径积分 → 量子场论。',
    chapters: ['D1', 'D2', 'D3', 'D4', 'E1', 'E2', 'E3', 'E4', 'M1', 'M2', 'M3', 'M5', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'K1', 'K2', 'K3', 'K4', 'K5', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9'],
  },
  {
    id: 'NM',
    label: '数值与计算',
    blurb: '时间积分 → 空间离散（FDM/FEM/谱）→ 数值线代 → 逼近 → 优化 → 接触与变分积分器。',
    chapters: ['G1', 'G2', 'G3', 'G4', 'G5', 'M4', 'M7'],
  },
  {
    id: 'CG',
    label: '图形学',
    blurb: '离散微分几何 → 渲染方程与采样 → 物理仿真 → 流体 → 光学与参与介质。',
    chapters: ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8', 'I9', 'J1', 'J2', 'J3', 'J4', 'J5', 'J6', 'J7', 'J8', 'M6'],
  },
  {
    id: 'TL',
    label: '工具与技法',
    blurb: '手算工具箱：求和、因式、放缩、极限、三角、线代、积分、特殊函数、能量法。**不是定理集，是兵器谱**。',
    chapters: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10'],
  },
  {
    id: 'MP',
    label: '路线与索引',
    blurb: '学习阶段、承重墙清单、教材对照。这一域是**元内容**（关于知识库本身），不是数学。',
    chapters: ['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9', 'N10', 'N11', 'N12', 'N13', 'N14', 'N15'],
  },
];

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
  return DOMAINS.find((d) => d.id === id)?.label ?? id;
}

export function domainBlurb(id: string): string {
  return DOMAINS.find((d) => d.id === id)?.blurb ?? '';
}

/** 侧栏与总纲都按这个顺序，不按代号字典序（字典序会把 MP 排在 NM 前） */
export function domainRank(id: string): number {
  const i = DOMAINS.findIndex((d) => d.id === id);
  return i < 0 ? DOMAINS.length : i;
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
  if (!m) return [DOMAINS.length, Number.MAX_SAFE_INTEGER, 0];
  return [domainRank(m[1]), Number(m[2]), m[3] ? Number(m[3]) : 0];
}

export function cmpCode(a: string, b: string): number {
  const ka = orderKey(a);
  const kb = orderKey(b);
  return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
}