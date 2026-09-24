import type { LoadIssue } from '../modules/loader';
import { escapeHtml } from './markdown';

interface OverlayOptions {
  issues: LoadIssue[];
  /** 致命错误：索引本身读不出来，无法渲染任何内容 */
  fatal?: string | null;
  onReload: () => void;
}

let collapsed = false;

/** 坏 JSON / 校验问题浮层：定位到「哪个文件哪个字段」，不接管页面（绝不白屏） */
export function mountOverlay(root: HTMLElement, { issues, fatal, onReload }: OverlayOptions): void {
  root.innerHTML = '';
  const fatalIssues = issues.filter((i) => i.fatal);
  const total = issues.length + (fatal ? 1 : 0);
  document.body.classList.toggle('has-error', total > 0);
  if (total === 0) return;

  const panel = document.createElement('div');
  panel.className = 'errpanel';
  panel.innerHTML = `
    <div class="eh">
      <span class="pulse"></span>
      <b>数据问题 · ${total} 处</b>
      ${fatalIssues.length ? `<span class="tag err">${fatalIssues.length} 个文件无法渲染</span>` : ''}
      <span class="grow"></span>
      <button class="ebtn" data-act="reload">重新加载</button>
      <button class="ebtn" data-act="toggle">${collapsed ? '展开' : '收起'}</button>
    </div>
    <div class="elist"${collapsed ? ' hidden' : ''}>
      ${fatal ? `<div class="eitem fatal"><span class="efile">json/index.json</span><span class="emsg">${escapeHtml(fatal)}</span></div>` : ''}
      ${issues
        .map(
          (i) => `<div class="eitem${i.fatal ? ' fatal' : ''}">
            <span class="efile">${escapeHtml(i.file)}</span>
            <span class="efield">${escapeHtml(i.field)}</span>
            <span class="emsg">${escapeHtml(i.message)}</span>
          </div>`,
        )
        .join('')}
    </div>`;
  panel.querySelector('[data-act=reload]')!.addEventListener('click', onReload);
  panel.querySelector('[data-act=toggle]')!.addEventListener('click', () => {
    collapsed = !collapsed;
    const list = panel.querySelector('.elist') as HTMLElement;
    list.hidden = collapsed;
    (panel.querySelector('[data-act=toggle]') as HTMLElement).textContent = collapsed ? '展开' : '收起';
  });
  root.append(panel);
}
