import type { EntryFile, UnitMeta } from '../types';

/**
 * 求职价值三档（口径见 `docs/career/roles.md` §1 与 `docs/career/interview.md` §2）：
 *   · `必须`   —— 目标岗位（算法工程测试 / 仿真应用·测试）的硬要求，缺了讲不圆
 *   · `高增益` —— 一次投入喂多条线，或直接补上岗位的关键证据
 *   · `可选`   —— 作对照 / 加分项，不影响岗位竞争力
 */
export type JobTier = '必须' | '高增益' | '可选';

/**
 * 考研价值三档（408 / 数一初试）：
 *   · `直接提分` —— 与考纲具体条目重叠，做了就是复习
 *   · `能力迁移` —— 不直接考，但练的手艺（并发、调试、性能归因）在解题与复试里用得上
 *   · `弱相关`   —— 与初试基本无关，纯工程线投入
 */
export type ExamTier = '直接提分' | '能力迁移' | '弱相关';

export interface ProjectRouteStep {
  code: string;
  stage: string;
  cost: '低' | '中低' | '中' | '中高' | '高';
  outcome: string;
  /** 为什么这一步排在这里（「为了什么做」）—— 只写动机，不复述正文 */
  why: string;
  /** 求职价值（三档），卡片上显示为「求职：必须」 */
  job: JobTier;
  /** 考研价值（三档），卡片上显示为「考研：直接提分」 */
  exam: ExamTier;
}

/** 路线在页面上的定位：`核心` = 置顶主攻，`协同` = 与初试协同，`对照` = 可选参照 */
export type RouteRole = '核心' | '协同' | '对照';

export interface ProjectRoute {
  id: string;
  label: string;
  /** 一句话说明这条路线的地位（为什么排第一 / 为什么只是对照） */
  role: RouteRole;
  goal: string;
  /** 与 408 / 数一的具体重叠，或本条路线的定位说明（不承诺分数） */
  overlap?: string;
  steps: ProjectRouteStep[];
}

/**
 * 路线只回答「为了什么做、按什么顺序做」；能否开始仍由 graph 的 prereq 判定。
 *
 * **数组顺序就是展示顺序，也是 frontier 在 projects 学科的推荐优先级**：
 *   1. `testing-sim`（核心）—— 目标岗位 = 算法工程测试 + 仿真应用/测试（`docs/career/roles.md` 头部口径）
 *   2. `kaoyan-sync`（协同）—— 与 408 / 数一初试直接重叠，考研期不白投入
 *   3. 其余三条为原有分组路线；`graphics` 已降为「可选对照」，排最后
 *
 * `steps[].code` 必须指向**可学习的实际项目**的大纲单元（`.1`），
 * 不许指向 `X00` 分组/索引页 —— 那些页面是把项目串起来的导航，不是交付物。
 * 交付物（`outcome`）与验收口径一律复用这些单元已有的标题/阶段描述，不另抄一份正文。
 */
export const PROJECT_ROUTES: ProjectRoute[] = [
  {
    id: 'testing-sim',
    label: '测开 + 仿真核心',
    role: '核心',
    goal:
      '目标岗位是算法工程测试与仿真（应用/测试）：先把「能定位、能回归、能说清为什么」立起来，' +
      '再补性能与失效分析。每一步都要能拿出「条件 + 数字 + 失败模式」三件套（口径见 docs/career/roles.md §0.2）。',
    overlap: '与 408 不直接重叠（能力迁移），但并发/调试/性能归因是复试与现岗面试的通用面。',
    steps: [
      {
        code: 'LG01.1',
        stage: '语言地基',
        cost: '中',
        outcome: 'C++ 对象生命周期与资源管理可解释',
        why: '测开的测试代码与故障注入脚本都写在 C++ 里；对象生命周期说不清，就分不清失败是测试错还是被测代码错。',
        job: '必须',
        exam: '能力迁移',
      },
      {
        code: 'CS01.1',
        stage: '机器基础',
        cost: '中高',
        outcome: '位级、汇编、存储与异常控制流实验',
        why: '算法工程测试要判断「数值为什么错」：浮点位级、存储布局、控制流是唯一能追到根因的三层。',
        job: '必须',
        exam: '直接提分',
      },
      {
        code: 'EG02.1',
        stage: '调试',
        cost: '中',
        outcome: 'core、sanitizer 与竞态报告能定位',
        why: 'TSan/ASan 报告是测开岗最核心的证据形态：能把竞态报告读到具体行，才谈得上质量保障。',
        job: '必须',
        exam: '能力迁移',
      },
      {
        code: 'EG01.1',
        stage: '测试',
        cost: '中',
        outcome: '对外行为、覆盖与 flaky 治理形成闭环',
        why: '测试框架、覆盖口径与 flaky 治理就是岗位日常；它把前面两步的手工证据变成可回归的断言。',
        job: '必须',
        exam: '能力迁移',
      },
      {
        code: 'DF01.1',
        stage: '分布式',
        cost: '高',
        outcome: 'Raft 状态机与持久化经故障注入',
        why: '故障注入（分区/延迟/杀节点）是测开岗少见的差异化证据：能测出问题、并把场景沉淀成自动判定的，比只会写用例的稀缺。',
        job: '必须',
        exam: '能力迁移',
      },
      {
        code: 'PA01.1',
        stage: '并行性能',
        cost: '中高',
        outcome: '同机基线、扩展曲线与 roofline 归因',
        why: '测开的另一半是性能基线：先有同机基线与扩展曲线，才可能说清「这次慢了三成」是谁的问题。',
        job: '高增益',
        exam: '能力迁移',
      },
    ],
  },
  {
    id: 'kaoyan-sync',
    label: '考研冲高协同',
    role: '协同',
    goal:
      '把工程线的投入接到 408 与数一初试上：优先做与考纲条目直接重叠的单元，让同一份时间既出面试证据也出复习进度。',
    overlap:
      '与 408 的具体重叠（只记重叠关系，不承诺分数）：CS01.1 = 数据的表示与运算、存储层次、指令与异常控制流；' +
      'SO02.1 = 进程与线程、内存管理（页表/换页）、系统调用；DB01.1 = 文件与磁盘、事务与日志（数据结构里的 B+ 树与索引）；' +
      'SO01.1 = 进程、文件与 I/O；AL01.1 / AL02.1 = 408 数据结构与算法题的复杂度、正确性对拍；' +
      'DX01.1 只作数据结构基础（组合/图结构建模），不作为初试主线。',
    steps: [
      {
        code: 'CS01.1',
        stage: '机器基础',
        cost: '中高',
        outcome: '位级、汇编、存储与异常控制流实验',
        why: '与 408 组成原理/体系结构同源：反汇编与存储层次是「数值为什么错」和「大题怎么算」共用的地基。',
        job: '必须',
        exam: '直接提分',
      },
      {
        code: 'AL01.1',
        stage: '算法验证',
        cost: '中',
        outcome: '复杂度、正确性与暴力对拍分工明确',
        why: '复杂度分析与暴力对拍直接对应 408 数据结构算法题：先能证明写对，才谈得上「会做」。',
        job: '高增益',
        exam: '直接提分',
      },
      {
        code: 'AL02.1',
        stage: '面试迁移',
        cost: '中',
        outcome: '在约束变化时选择并验证数据结构',
        why: '约束变化时选数据结构，是 408 算法大题与测开面试共用的同一道题。',
        job: '高增益',
        exam: '直接提分',
      },
      {
        code: 'DB01.1',
        stage: '存储与事务',
        cost: '高',
        outcome: '索引、MVCC 与日志能解释一致性问题',
        why: 'B+ 树索引、事务与日志在 408 的文件与磁盘管理里有对应条目；同时是后端/测开的高频面。',
        job: '高增益',
        exam: '直接提分',
      },
      {
        code: 'SO02.1',
        stage: '内核实现',
        cost: '高',
        outcome: 'JOS 内存、进程与系统调用全链贯通',
        why: '页表、进程与系统调用是 408 操作系统最重的一章，动手实现一遍比读五遍记得住。',
        job: '高增益',
        exam: '直接提分',
      },
    ],
  },
  {
    id: 'systems',
    label: '系统与内核',
    role: '对照',
    goal: '从机器与 C 运行时出发，经用户态 API 到教学内核，再比较真实内核、驱动与安全。',
    steps: [
      {
        code: 'CS01.1',
        stage: '机器基础',
        cost: '中高',
        outcome: '位级、汇编、存储与异常控制流实验',
        why: '整条系统线的入口；也是「测开核心」与「考研协同」两条路线都要回来补的一步。',
        job: '必须',
        exam: '直接提分',
      },
      {
        code: 'SO01.1',
        stage: '系统接口',
        cost: '中',
        outcome: '进程、文件与事件驱动服务可测',
        why: '用户态 API 是内核行为的观察窗口；I/O 多路复用与进程语义在 408 里也有对应条目。',
        job: '高增益',
        exam: '直接提分',
      },
      {
        code: 'SO02.1',
        stage: '内核实现',
        cost: '高',
        outcome: 'JOS 内存、进程与系统调用全链贯通',
        why: '内核态动手把页表/中断/系统调用连成一条链，是操作系统大题唯一能自证的方式。',
        job: '高增益',
        exam: '直接提分',
      },
      {
        code: 'SO03.1',
        stage: '跨内核比较',
        cost: '中',
        outcome: '同一机制对照 JOS/xv6/Linux',
        why: '同一机制换三个实现对照，才能回答「为什么这么设计」。',
        job: '可选',
        exam: '能力迁移',
      },
      {
        code: 'SO04.1',
        stage: '设备边界',
        cost: '高',
        outcome: '驱动环形缓冲与所有权可验证',
        why: '驱动与所有权是内核侧最容易被问倒的一段，也是目标岗位之外的加分。',
        job: '可选',
        exam: '弱相关',
      },
      {
        code: 'SO05.1',
        stage: '安全边界',
        cost: '中高',
        outcome: '从原语与缓解机制分析攻击面',
        why: '安全边界是加分项，不是主线；放在内核之后才有材料。',
        job: '可选',
        exam: '弱相关',
      },
      {
        code: 'SO06.1',
        stage: '虚拟化',
        cost: '高',
        outcome: '用 VM exit 成本解释优化取舍',
        why: '虚拟化是机器边界的最后一块，只有当页表/特权级/设备/中断都立起来才看得懂。',
        job: '可选',
        exam: '弱相关',
      },
    ],
  },
  {
    id: 'cpu',
    label: 'CPU 与编译',
    role: '对照',
    goal: '把程序从源代码一路跟到指令、流水线和微架构，再用 difftest 与性能模型验收。',
    steps: [
      {
        code: 'LG01.1',
        stage: '语言地基',
        cost: '中',
        outcome: 'C++ 对象生命周期与资源管理可解释',
        why: '语言地基是后面所有 C++ 实验（含测开核心路线）的前置。',
        job: '必须',
        exam: '能力迁移',
      },
      {
        code: 'CP01.1',
        stage: '链接与 ABI',
        cost: '中',
        outcome: '能从目标文件和反汇编定位边界问题',
        why: '链接与 ABI 是定位「编译过了但行为不对」的第一把工具。',
        job: '高增益',
        exam: '能力迁移',
      },
      {
        code: 'CP02.1',
        stage: '微架构',
        cost: '中高',
        outcome: '流水、乱序与性能计数有模型',
        why: 'microarchitecture 是性能归因的理论底；不做 CPU 实现也值得读懂。',
        job: '可选',
        exam: '能力迁移',
      },
      {
        code: 'CP03.1',
        stage: '实现 CPU',
        cost: '高',
        outcome: 'RTL 与参考模型逐条指令对拍',
        why: 'CPU 实现偏目标岗位之外，只作对照（difftest 的思路本身是测开的好题材）。',
        job: '可选',
        exam: '弱相关',
      },
      {
        code: 'CP04.1',
        stage: '编译优化',
        cost: '高',
        outcome: 'SSA、优化与 ABI 问题可定位',
        why: '编译优化离当前目标最远，留作长期选题。',
        job: '可选',
        exam: '弱相关',
      },
      {
        code: 'PA01.1',
        stage: '并行性能',
        cost: '中高',
        outcome: '同机基线、扩展曲线与 roofline 归因',
        why: '并行性能是测开岗的性能基线来源，也是「测开核心」路线的最后一步。',
        job: '高增益',
        exam: '能力迁移',
      },
      {
        code: 'LG03.1',
        stage: 'GPU',
        cost: '中高',
        outcome: 'kernel 瓶颈由算术强度与采样互证',
        why: 'GPU kernel 分析是加分项，放在并行性能之后才有基线可对照。',
        job: '可选',
        exam: '弱相关',
      },
    ],
  },
  {
    id: 'backend',
    label: '后端与可靠性',
    role: '对照',
    goal: '以可观测、可恢复、可验证为主线，覆盖存储、分布式、测试、性能和系统设计。',
    steps: [
      {
        code: 'DB01.1',
        stage: '存储与事务',
        cost: '高',
        outcome: '索引、MVCC 与日志能解释一致性问题',
        why: '存储与事务是可靠性的起点，也是 408 文件与磁盘管理的对照材料。',
        job: '高增益',
        exam: '直接提分',
      },
      {
        code: 'DF01.1',
        stage: '分布式',
        cost: '高',
        outcome: 'Raft 状态机与持久化经故障注入',
        why: '故障注入的完整现场：先能制造故障，才谈得上「测得出、归得清」。',
        job: '必须',
        exam: '能力迁移',
      },
      {
        code: 'EG01.1',
        stage: '测试',
        cost: '中',
        outcome: '对外行为、覆盖与 flaky 治理形成闭环',
        why: '把手工验证沉成可回归断言，是「测开核心」路线里最直接的岗位映射。',
        job: '必须',
        exam: '能力迁移',
      },
      {
        code: 'EG02.1',
        stage: '调试',
        cost: '中',
        outcome: 'core、sanitizer 与竞态报告能定位',
        why: '调试工具链是测试的兄弟技能：能复现、能定位，才有资格谈根因。',
        job: '必须',
        exam: '能力迁移',
      },
      {
        code: 'EG03.1',
        stage: '性能',
        cost: '中高',
        outcome: '压测、火焰图和统计区间支撑结论',
        why: '性能基线要带统计区间，否则「快了」只是噪音。',
        job: '高增益',
        exam: '能力迁移',
      },
      {
        code: 'EG04.1',
        stage: '系统设计',
        cost: '中高',
        outcome: '容量、缓存与幂等能给出量化取舍',
        why: '系统设计是后端面的通用形式，但与目标岗位不是硬要求。',
        job: '可选',
        exam: '弱相关',
      },
      {
        code: 'EG05.1',
        stage: '线上细节',
        cost: '中',
        outcome: '网络与伪共享问题有对照实验',
        why: '线上细节是高质量反问弹药，排在主线之后。',
        job: '可选',
        exam: '弱相关',
      },
    ],
  },
  {
    id: 'algorithms',
    label: '算法与 AI',
    role: '对照',
    goal: '先建立离散结构与复杂度判据，再经面试题训练迁移，最后进入 AI 工程。',
    steps: [
      {
        code: 'DX01.1',
        stage: '离散基础',
        cost: '中',
        outcome: '逻辑、组合与图结构能用于建模',
        why: '只作数据结构基础：组合与图结构建模在 408 有对应，但不作为初试主线。',
        job: '可选',
        exam: '直接提分',
      },
      {
        code: 'AL01.1',
        stage: '算法验证',
        cost: '中',
        outcome: '复杂度、正确性与暴力对拍分工明确',
        why: '「先对拍再优化」既是算法题策略，也是测试的基本姿态。',
        job: '高增益',
        exam: '直接提分',
      },
      {
        code: 'AL02.1',
        stage: '面试迁移',
        cost: '中',
        outcome: '在约束变化时选择并验证数据结构',
        why: '约束变化时选结构，是 408 算法题与测开面试共用的同一道题。',
        job: '高增益',
        exam: '直接提分',
      },
      {
        code: 'AI01.1',
        stage: 'AI 工程',
        cost: '中高',
        outcome: '模型链路的输入、评估与失效点可说明',
        why: 'AI 工程与目标岗位关系弱，作长期选项。',
        job: '可选',
        exam: '弱相关',
      },
    ],
  },
  {
    id: 'graphics',
    label: '图形与游戏',
    role: '对照',
    goal:
      '原来排第一的路线，按目标岗位收窄后降为可选对照：纯渲染不在投递范围（口径见 docs/career/roles.md 头部）。' +
      '只有当你确实要做渲染方向、或需要「同一像素两种解法」的互证练习时再走。',
    overlap: '与 408 / 数一无直接重叠；离散几何只在图形方向内部有用。',
    steps: [
      {
        code: 'GX01.1',
        stage: 'P1 出图',
        cost: '中',
        outcome: '手写光栅化器，关键像素与手推一致',
        why: '出图是渲染方向的入口，但对目标岗位是纯加分。',
        job: '可选',
        exam: '弱相关',
      },
      {
        code: 'GX02.1',
        stage: 'P2 互证',
        cost: '中高',
        outcome: '同场景光追与光栅化交叉验证',
        why: '互证方法本身可迁移（两个实现互相对拍），但题材与岗位无关。',
        job: '可选',
        exam: '弱相关',
      },
      {
        code: 'GX03.1',
        stage: 'P3 连续量',
        cost: '中',
        outcome: '曲线、蒙皮与粒子可手算、可复现',
        why: '连续量是图形方向的必修，不是当前主线的材料。',
        job: '可选',
        exam: '弱相关',
      },
      {
        code: 'GX04.1',
        stage: 'P4 成帧',
        cost: '高',
        outcome: '主循环与资源分层，帧时间能报账',
        why: '帧预算的报账方式与性能基线同构，可以借来学，但不必走完整条线。',
        job: '可选',
        exam: '弱相关',
      },
      {
        code: 'GX05.1',
        stage: 'P5 联机',
        cost: '高',
        outcome: '输入、判定与同步有实测和失效分析',
        why: '联机同步的失效分析与分布式有点像，纯作对照阅读即可。',
        job: '可选',
        exam: '弱相关',
      },
    ],
  },
];

/**
 * 「测开 + 仿真核心」路线的当前缺口 —— **只作文字说明，不虚构单元、不写完成度**。
 *
 * 三条都来自 `docs/career/roles.md` §3 的「岗位要求 ↔ 本仓载体」表：
 *   · `learning-benchmark/` 设计闭合、**代码未开工** → 性能基线与回归没有代码闭环；
 *   · `1D FEM 链路`（变分 → 弱形式 → Gauss–Legendre → 稀疏系统 → CG）本仓零行代码；
 *   · 商业仿真软件（ANSYS/Abaqus/Fluent）无经验。
 * 站内没有对应单元，所以这里只写「缺什么」，**不编出一条踩空的路线步骤**。
 */
export const CORE_GAPS: string[] = [
  'learning-benchmark 代码闭环：设计已闭合（10 次提交 / 7 份文档），代码未开工 —— 性能基线与回归目前没有可执行的框架。',
  '1D FEM 链路：变分 → 弱形式 → Gauss–Legendre 组装 → 边界 → 稀疏系统 → CG，本仓零行代码（grid / sparse / assemble / cg 均不存在）。',
  '商业仿真软件经验：ANSYS / Abaqus / Fluent 均无经验；网格无关性、时间步无关性与理论对标三问目前答不出。',
];

/** 单元种类（`meta.kind`）：分组大纲/详解、面试索引页都不是「可学的项目」 */
const GROUP_KINDS = new Set(['project-group', 'project-index']);

function kindOf(file: EntryFile): string {
  const meta = (file as unknown as { meta?: Record<string, unknown> }).meta;
  return typeof meta?.kind === 'string' ? meta.kind : '';
}

function chapterOf(code: string): string {
  return code.split('.')[0] ?? '';
}

/** 本页所属的路线（分组页/索引页给出全部，项目页给出自己那条） */
export function projectRoutesFor(file: EntryFile): ProjectRoute[] {
  const kind = kindOf(file);
  if (!kind.startsWith('project')) return [];
  if (GROUP_KINDS.has(kind)) return PROJECT_ROUTES;
  const chap = chapterOf(file.code ?? '');
  return PROJECT_ROUTES.filter((route) => route.steps.some((step) => chapterOf(step.code) === chap));
}

/** 某章的路线步骤（不在任何路线里时为空数组） */
export function routeStepsOf(code: string): ProjectRouteStep[] {
  const chap = chapterOf(code);
  return PROJECT_ROUTES.flatMap((route) => route.steps.filter((s) => chapterOf(s.code) === chap));
}

/**
 * 某个代号在路线里的位置（`null` = 不是任何路线的步骤）。
 * 用于卡片/右栏的「这是路线的第几步」，让「为什么做它」读得出来。
 *
 * **优先返回核心/协同路线里的那一步**：同一章可能在多条路线里出现
 * （如 `CS01.1` 同时在「测开核心」「考研协同」「系统与内核」），
 * 页面上该说「它是主攻路线的第 2 步」，而不是随便取数组里第一条命中的。
 *
 * 这里只给「静态路线表说了什么」，**不判定单元是否入库** —— 那是
 * `routeStepsPresent(steps, units)` 的职责（它拿真实索引过滤）。原先这里还挂了
 * 一个恒为 `false` 的 `present` 字段，既没有调用方读取，也和「本函数不查索引」
 * 的语义矛盾，属于重排后残留的死字段，已删除。
 */
export function routePlaceOf(code: string): { step: ProjectRouteStep; routeLabel: string } | null {
  const chap = chapterOf(code);
  for (const route of PROJECT_ROUTES) {
    const step = route.steps.find((s) => chapterOf(s.code) === chap);
    if (step) return { step, routeLabel: route.label };
  }
  return null;
}

/**
 * 路线某一步在**图上之外**的动机：属于哪条路线、目标是第几步。
 * 交付物/验收口径：`step.outcome` 是「这一阶段要能拿出什么」，
 * 每级的自测就是验收（见 `content/selftest.ts` 的 L1–L5），不另立一份文字。
 */
export function routeMotivation(
  code: string,
): {
  routeLabel: string;
  routeRole: RouteRole;
  stage: string;
  outcome: string;
  why: string;
  job: JobTier;
  exam: ExamTier;
  index: number;
  total: number;
} | null {
  const place = routePlaceOf(code);
  if (!place) return null;
  const route = PROJECT_ROUTES.find((r) => r.label === place.routeLabel);
  const idx = route ? route.steps.findIndex((s) => s.code === place.step.code) : -1;
  return {
    routeLabel: place.routeLabel,
    routeRole: route?.role ?? '对照',
    stage: place.step.stage,
    outcome: place.step.outcome,
    why: place.step.why,
    job: place.step.job,
    exam: place.step.exam,
    index: idx + 1,
    total: route?.steps.length ?? 0,
  };
}

/** 只保留索引里真实存在的单元（路线表可能领先于数据） */
export function routeStepsPresent(steps: ProjectRouteStep[], units: ReadonlyMap<string, UnitMeta> | null): ProjectRouteStep[] {
  if (!units) return steps;
  return steps.filter((s) => units.has(s.code));
}

/**
 * 求职优先级表：`项目章代号 → 档位`（`必须` = 0、`高增益` = 1、`可选` = 2）。
 *
 * 取**同一章在全部路线里最高的那一档**：`CS01` 既是「测开核心」的必须、
 * 也是「考研协同」的直接提分，作为求职排序依据时取更严的那一档 —— 它对目标岗位确实更关键。
 * `routeStepsOf` 保持原样（只取第一条命中），不改既有调用方语义。
 */
export function jobTierOfChapter(chap: string): { tier: JobTier; rank: number } | null {
  let best: JobTier | null = null;
  for (const route of PROJECT_ROUTES) {
    for (const step of route.steps) {
      if (chapterOf(step.code) !== chap) continue;
      if (best === null) best = step.job;
      else if (JOB_RANK[step.job] < JOB_RANK[best]) best = step.job;
    }
  }
  return best ? { tier: best, rank: JOB_RANK[best] } : null;
}

/** 求职档位 → 排序键（数值越小越靠前） */
export const JOB_RANK: Record<JobTier, number> = { 必须: 0, 高增益: 1, 可选: 2 };

/**
 * 在 projects 学科里，frontier 的**推荐优先级**：满足前置且未达 L3 的候选按
 * 「求职档位（必须 → 高增益 → 可选）」排，同档再按原拓扑序。
 *
 * 这里只给「章 → 排序键」，真实筛选（未达标 / 前置全达标 / 排除分组索引页）
 * 仍由 `modules/graph.ts` 的 `frontierOf` 用同一份 prereq 做 —— 本文件不复制那套判定。
 */
export function jobPriorityOfUnit(code: string): { tier: JobTier; rank: number } | null {
  const chap = chapterOf(code);
  if (!chap) return null;
  return jobTierOfChapter(chap);
}
