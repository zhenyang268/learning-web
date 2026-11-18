/**
 * 朗读版笔记的页面逻辑。
 *
 * ## 为什么这是一个独立入口，而不是第六个 Subject
 *
 * `SUBJECTS` 那套绑定了代号体系（`X#.k`）、语义边 yaml、掌握度、frontier，
 * 而朗读稿是**派生物**：没有代号、没有边、不记进度。塞进去要同时改
 * `Subject['id']` 联合类型、content-map、`check:graph`、`dom-harness --subject`
 * 等十处，换来的只是一个侧栏。这里自己写 200 行更省。
 *
 * ## 为什么不做 tab、不做 KaTeX
 *
 * 朗读（Edge 大声朗读）只读**已经在 DOM 里**的文本：
 *   - tab 懒渲染 → 未展开的面板是空 DOM，朗读只覆盖第一个 tab；
 *   - KaTeX 输出 `katex-mathml` + `katex-html` 两份，读出来是重复或乱码。
 * 所以这里一个单元一次性全渲染成 `<p>`，公式在构建期就转成了口语文字。
 *
 * ## 两种宿主共用同一个加载函数
 *
 * - dev：`fetch('readable/xxx.json')`，Vite 直接服务根目录下的文件；
 * - standalone（`release/reading.html`）：数据被内联进 `window.__readingPack`，
 *   构建脚本把 fetch 换成查表，`file://` 双击即可用。
 * 判据是「有没有 pack」，不是协议 —— 与 `subjects.ts` 的 `IS_SNAPSHOT` 同一口径。
 */

export {}; // 让本文件成为 external module，`declare global` 才合法

interface Block {
  t: 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'q' | 'f';
  x: string;
  /** 独立公式的原始 TeX，仅供核对，不参与朗读 */
  tex?: string;
}

interface UnitMeta {
  id: string;
  title: string;
  group: string;
  source: string;
  sha: string;
  n: number;
  words?: number;
  path: string;
}

interface UnitFile extends UnitMeta {
  blocks: Block[];
  /** 生成器写入的是 `sourceSha`，索引里叫 `sha`；两处都要能取到 */
  sourceSha?: string;
}

interface LineIndex {
  id: string;
  title: string;
  units: UnitMeta[];
}

interface ReadingIndex {
  version: string;
  generated: string;
  lines: LineIndex[];
}

declare global {
  interface Window {
    __readingPack?: Record<string, unknown>;
    __readingFatal?: string;
  }
}

const elNav = document.getElementById('nav') as HTMLElement;
const elDoc = document.getElementById('doc') as HTMLElement;

const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** 读一个 json：快照走内联表，dev 走 fetch。 */
async function loadJson<T>(path: string): Promise<T> {
  const pack = window.__readingPack;
  if (pack) {
    const hit = pack[path];
    if (hit === undefined) throw new Error(`快照里没有 ${path}`);
    return hit as T;
  }
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} → ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

const currentId = (): string => location.hash.replace(/^#\/?/, '');

/** 目录：line → group → unit。group 只有一个时不渲染那一层。 */
function renderNav(index: ReadingIndex): void {
  const parts: string[] = [];
  index.lines.forEach((line, li) => {
    const groups = new Map<string, UnitMeta[]>();
    for (const u of line.units) {
      const list = groups.get(u.group) ?? [];
      list.push(u);
      groups.set(u.group, list);
    }
    const inner: string[] = [];
    for (const [group, units] of groups) {
      const rows = units
        .map((u) => `<a href="#${esc(u.id)}" data-id="${esc(u.id)}">${esc(u.title)}</a>`)
        .join('');
      inner.push(
        groups.size > 1
          ? `<details open><summary>${esc(group)}（${units.length}）</summary>${rows}</details>`
          : rows,
      );
    }
    parts.push(
      `<details ${li === 0 ? 'open' : ''}><summary>${esc(line.title)}（${line.units.length}）</summary>${inner.join('')}</details>`,
    );
  });
  elNav.innerHTML = parts.join('');
}

function blockHtml(b: Block): string {
  switch (b.t) {
    // h1 降成 h2：页面 itself 已经有 h1（单元标题），避免一页两个 h1
    case 'h1':
      return `<h2>${esc(b.x)}</h2>`;
    case 'h2':
      return `<h2>${esc(b.x)}</h2>`;
    case 'h3':
      return `<h3>${esc(b.x)}</h3>`;
    case 'li':
      return `<p class="li">${esc(b.x)}</p>`;
    case 'q':
      return `<p class="q">${esc(b.x)}</p>`;
    case 'f':
      return `<p class="f">${esc(b.x)}</p>`;
    default:
      return `<p>${esc(b.x)}</p>`;
  }
}

function markActive(id: string): void {
  for (const a of elNav.querySelectorAll<HTMLAnchorElement>('a')) {
    a.classList.toggle('on', a.dataset.id === id);
  }
}

async function show(
  index: ReadingIndex,
  id: string,
): Promise<void> {
  const hit = index.lines.flatMap((l) => l.units).find((u) => u.id === id);
  if (!hit) {
    elDoc.innerHTML = '<p class="empty">没有这个单元。</p>';
    return;
  }
  markActive(id);
  elDoc.innerHTML = '<p class="empty">载入中…</p>';
  try {
    const unit = await loadJson<UnitFile>(hit.path);
    elDoc.innerHTML = [
      `<h1>${esc(unit.title)}</h1>`,
      `<p class="src">${esc(unit.source)} · ${esc(unit.sourceSha ?? unit.sha)} · ${unit.blocks.length} 块</p>`,
      ...unit.blocks.map(blockHtml),
    ].join('');
    document.title = `${unit.title} · 朗读版`;
    window.scrollTo(0, 0);
  } catch (err) {
    elDoc.innerHTML = `<p class="bad">载入失败：${esc((err as Error).message)}</p>`;
  }
}

async function boot(): Promise<void> {
  if (window.__readingFatal) {
    elDoc.innerHTML = `<p class="bad">${esc(window.__readingFatal)}</p>`;
    return;
  }
  try {
    const index = await loadJson<ReadingIndex>('readable/index.json');
    renderNav(index);
    const id = currentId();
    if (id) {
      await show(index, id);
    }
    window.addEventListener('hashchange', () => {
      const next = currentId();
      if (next) void show(index, next);
    });
  } catch (err) {
    elDoc.innerHTML = `<p class="bad">目录载入失败：${esc((err as Error).message)}</p>`;
  }
}

void boot();
