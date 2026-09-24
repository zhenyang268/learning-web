import type { VizSpec } from '../types';
import { isVizFrontend } from '../types';
import { convergenceThm } from './convergence-thm';
import { escapeHtml } from '../renderers/markdown';

export interface VizHandle {
  destroy?(): void;
}

export interface VizModule {
  label: string;
  mount(host: HTMLElement, hint: Record<string, unknown>): VizHandle | void;
}

/** 档1 模块注册表：module 名 → 实现。未注册的一律降级为占位，不白屏。 */
const registry: Record<string, VizModule> = {
  'convergence-thm': convergenceThm,
};

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

export function mountViz(host: HTMLElement, viz: VizSpec): VizHandle | void {
  if (!isVizFrontend(viz)) {
    const planned = viz as { status: string; rationale?: string };
    placeholder(
      host,
      '档2 · 后端 viz',
      planned.rationale ?? '四问判据判定该演示需后端计算（Q1–Q3），契约字段待接入。',
    );
    return;
  }
  const mod = registry[viz.module];
  if (!mod) {
    placeholder(host, viz.module, `viz 模块「${viz.module}」尚未在前端注册（档1 声明但无实现）。`);
    return;
  }
  try {
    return mod.mount(host, viz.params_hint ?? {});
  } catch (err) {
    placeholder(host, viz.module, `模块挂载失败：${(err as Error).message}`);
  }
}

export function vizLabel(module: string): string {
  return registry[module]?.label ?? module;
}
