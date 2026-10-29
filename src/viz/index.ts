import type { VizSpec } from '../types';
import { isVizFrontend } from '../types';
import { loadVizModule } from './registry';
import type { VizHandle } from './kit';
import { escapeHtml } from '../renderers/markdown';

export type { VizHandle, VizModule, VizSpec as VizSpecKit } from './kit';
export { implementedModules, vizLoaders } from './registry';

function placeholder(host: HTMLElement, title: string, detail: string): void {
  host.innerHTML = `
    <div class="viz">
      <div class="vhead">
        <span class="badge">演示待接入 · 走 viz 层</span>
        <span class="dim">${escapeHtml(title)}</span>
      </div>
      <p class="kv">${escapeHtml(detail)}</p>
    </div>`;
}

/**
 * 挂载一个 viz 到宿主，返回**销毁句柄**（档2/无实现/挂载失败时为 null）。
 *
 * 同步返回、异步加载：模块走 `loadVizModule` 动态 import，首次挂某个演示时才有网络请求。
 * 因此先写一个 `.viz-loading` 占位，模块到位后清空再交给它。
 * 句柄要能**取消**：用户可能在 chunk 还在路上时就切走了 —— `cancelled` 保证迟到的
 * 模块不会往一个已经脱离文档的宿主里画东西。
 *
 * 返回值必须被调用方收走并在切单元时 destroy —— 否则每次切词条都会多留一个不断开的
 * ResizeObserver，且闭包持有已脱离文档的 canvas（体检定位到的泄漏，2026-10-29）。
 */
export function mountViz(host: HTMLElement, viz: VizSpec): VizHandle | null {
  if (!isVizFrontend(viz)) {
    const planned = viz as { status: string; rationale?: string };
    placeholder(
      host,
      '档2 · 后端 viz',
      planned.rationale ?? '四问判据判定该演示需后端计算（Q1–Q3），契约字段待接入。',
    );
    return null;
  }
  const name = viz.module;
  host.innerHTML = `<div class="viz viz-loading"><div class="vhead"><span class="badge">加载演示…</span><span class="dim">${escapeHtml(name)}</span></div></div>`;

  let cancelled = false;
  let real: VizHandle | null = null;

  void (async () => {
    try {
      const mod = await loadVizModule(name);
      if (cancelled) return;
      if (!mod) {
        placeholder(host, name, `viz 模块「${name}」尚未在前端注册（档1 声明但无实现）。`);
        return;
      }
      host.innerHTML = ''; // 清掉占位，交给模块自己写
      real = mod.mount(host, viz.params_hint ?? {}) ?? null;
    } catch (err) {
      if (!cancelled) placeholder(host, name, `模块挂载失败：${(err as Error).message}`);
    }
  })();

  return {
    destroy: () => {
      cancelled = true;
      real?.destroy?.();
      real = null;
    },
  };
}

/** 展示名：模块名本身已经可读，不再额外查表（查表需要同步加载 chunk，会把首屏拖回来） */
export function vizLabel(module: string): string {
  return module;
}