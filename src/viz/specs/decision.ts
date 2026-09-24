/**
 * inequality-decision-tree：P10 / P9.4 的 flagship 交互词条。
 *
 * 为什么单独写（不走 kit 的声明式规格）：它的交互是「逐层点击选信号 → 掏出该用的不等式」，
 * 主体是 HTML 而不是画布。但数值部分（每个误用的具体数字）仍来自 P9.4 的核验值，
 * 并由 `validateTree()` 做结构性自检（无环 + 每个分支都到得了叶子）。
 */
import type { VizModule, VizHandle } from '../kit';
import { escapeHtml } from '../../renderers/markdown';

export interface Leaf {
  /** 该信号下该掏的不等式 */
  tool: string;
  /** 公式（Unicode，图上直出） */
  formula: string;
  /** 误用现场（取自 P9.4 的已核验数字） */
  misuse: string;
}

export interface Branch {
  id: string;
  /** 信号（问句式） */
  signal: string;
  leaf: Leaf;
}

const BRANCHES: Branch[] = [
  {
    id: 'product',
    signal: '乘积项要拆成两个可分别控制的项？',
    leaf: {
      tool: 'Young 不等式（或 2ab ≤ a² + b²）',
      formula: 'ab ≤ aᵖ/p + bᑫ/q,  1/p + 1/q = 1',
      misuse:
        '拿它去分离「和积绝对值」：a = (1,2,3)、b = (1,1,1)，真值 Σaₖbₖ = 6，逐项 Young 只给到 8.5（松了 2.5）；同类项用 Cauchy–Schwarz 可压到 √14·√3 = 6.4807。',
    },
  },
  {
    id: 'abs-split',
    signal: '和／积的绝对值要分离？',
    leaf: {
      tool: 'Cauchy–Schwarz（L²）／Hölder（Lᵖ）',
      formula: '|⟨f,g⟩| ≤ ‖f‖₂‖g‖₂',
      misuse:
        '在 (1,∞) 取 f = x^(−0.4)、g = x⁻¹：‖f‖₂² = ∫₁^∞ x^(−0.8)dx 发散 ⟹ ‖f‖₂ = ∞，C–S 给出的界是 ∞，完全失效。用前先确认两个因子都在 L² 里。',
    },
  },
  {
    id: 'differential',
    signal: '微分不等式要显式界？',
    leaf: {
      tool: 'Gronwall 引理',
      formula: 'u′ ≤ βu ⟹ u(t) ≤ u(0)e^{βt}',
      misuse:
        '对纯代数不等式 v ≤ 2v（v(t) = t、v(0) = 0）硬套：得 v(1) ≤ e²·0 = 0，真值 v(1) = 1 —— 结论与真值反向，差 1。Gronwall 的入场券是「u 绝对连续 + 形如 u′ ≤ βu」。',
    },
  },
  {
    id: 'absorb',
    signal: '非线性项要被左边吃掉？',
    leaf: {
      tool: '吸收不等式（带 ε 的 Young）',
      formula: 'ab ≤ εa²/2 + b²/(2ε)（ε 待选）',
      misuse:
        'u = sin(πx) 于 [0,1]：真值 ∫u·u_xx = −π²/2 = −4.934802；取 ε = 1 的 Young 给 (0.5 + π⁴/2)/2 = 24.602273 —— 符号都丢了，把负能量估成了正的大数。',
    },
  },
  {
    id: 'convex',
    signal: '凸性／平均值／期望？',
    leaf: {
      tool: 'Jensen 不等式',
      formula: 'φ 凸 ⟹ φ(E X) ≤ E φ(X)',
      misuse:
        'φ(x) = x² 是凸的，方向记反后写 E X² ≤ (E X)²；取 X ∈ {1,3} 各半，得 5 ≤ 4 —— 矛盾量 1 恰好是 Var(X) = 5 − 4。',
    },
  },
];

export interface TreeNode {
  id: string;
  label: string;
  children: string[];
}

export const TREE: TreeNode[] = [
  { id: 'root', label: '要证明的不等式长什么样？', children: BRANCHES.map((b) => b.id) },
];

/** 结构自检：无环 + 每个分支都从 root 可达 + 每个分支都有叶子 */
export function validateTree(): { cycles: boolean; unreachable: string[]; leafMissing: string[] } {
  const ids = new Set([...TREE.map((t) => t.id), ...BRANCHES.map((b) => b.id)]);
  const reach = new Set<string>(['root']);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of TREE) {
      if (reach.has(t.id)) {
        for (const c of t.children) {
          if (!reach.has(c) && ids.has(c)) {
            reach.add(c);
            grew = true;
          }
        }
      }
    }
  }
  const unreachable = BRANCHES.filter((b) => !reach.has(b.id)).map((b) => b.id);
  const leafMissing = BRANCHES.filter((b) => !b.leaf?.tool).map((b) => b.id);
  // 环检测：DFS 三色
  const color = new Map<string, number>();
  const cycles = (function hasCycle(): boolean {
    const adj = new Map(TREE.map((t) => [t.id, t.children]));
    let found = false;
    const dfs = (u: string): void => {
      color.set(u, 1);
      for (const v of adj.get(u) ?? []) {
        if (color.get(v) === 1) found = true;
        else if (!color.get(v)) dfs(v);
      }
      color.set(u, 2);
    };
    dfs('root');
    return found;
  })();
  return { cycles, unreachable, leafMissing };
}

export const inequalityDecisionTree: VizModule = {
  label: '不等式决策树',
  mount(host): VizHandle | void {
    let active = '';
    let trace: string[] = [];

    host.innerHTML = `
      <div class="viz">
        <div class="vhead">
          <span class="badge warn">前端计算 · 未对拍</span>
          <span class="dim">inequality-decision-tree v1 · 逐层点信号，掏出该用的不等式</span>
        </div>
        <div class="dt">
          <div class="dt-q">${escapeHtml(TREE[0].label)}</div>
          <div class="dt-opts">
            ${BRANCHES.map(
              (b) => `<button class="chip" data-b="${b.id}">${escapeHtml(b.signal)}</button>`,
            ).join('')}
          </div>
          <div class="dt-out"></div>
          <div class="dt-trace"></div>
        </div>
        <div class="invariant"></div>
        <p class="kv">结构自检：${((): string => {
          const v = validateTree();
          const ok = !v.cycles && !v.unreachable.length && !v.leafMissing.length;
          return ok
            ? '<span class="badge ok">树无环 ✓</span> 5 个分支全部可达且有叶子（含具体误用数字）。'
            : `<span class="badge err">结构异常</span> 环=${
                v.cycles ? '有' : '无'
              }，不可达=${v.unreachable.join(',') || '无'}，缺叶子=${v.leafMissing.join(',') || '无'}`;
        })()}</p>
      </div>`;

    const root = host.querySelector('.viz') as HTMLElement;
    const out = root.querySelector('.dt-out') as HTMLElement;
    const traceBox = root.querySelector('.dt-trace') as HTMLElement;

    function render(): void {
      const b = BRANCHES.find((x) => x.id === active);
      out.innerHTML = b
        ? `<div class="dt-card">
             <div class="dt-tool">◆ ${escapeHtml(b.leaf.tool)}</div>
             <div class="dt-formula">${escapeHtml(b.leaf.formula)}</div>
             <div class="dt-misuse"><b>误用现场</b>：${escapeHtml(b.leaf.misuse)}</div>
           </div>`
        : '<p class="dim">从上面挑一条信号。</p>';
      traceBox.innerHTML = trace.length
        ? `<span class="dim mono">路径：${trace.map(escapeHtml).join(' → ')}</span>
           <button class="chip" data-reset="1">重置</button>`
        : '';
    }

    root.querySelectorAll<HTMLButtonElement>('[data-b]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.b ?? '';
        active = id;
        trace = ['要证明的不等式长什么样？', BRANCHES.find((b) => b.id === id)?.signal ?? ''];
        root.querySelectorAll('[data-b]').forEach((x) => x.classList.toggle('on', x === btn));
        render();
      });
    });
    root.addEventListener('click', (ev) => {
      const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-reset]');
      if (!t) return;
      active = '';
      trace = [];
      root.querySelectorAll('[data-b]').forEach((x) => x.classList.remove('on'));
      render();
    });

    render();
    return undefined;
  },
};

export { BRANCHES };
