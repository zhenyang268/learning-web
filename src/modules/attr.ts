/**
 * **CSS 选择器**里的值转义：`[data-x="…"]` 只对 `"` 与 `\` 敏感。
 *
 * 为什么不用 `CSS.escape`：jsdom 里**没有 `CSS` 这个全局**（2026-10-30 实测：
 * 掌握度点击 → patchSidebarMastery → `ReferenceError: CSS is not defined`，
 * 而正文里的 `openRef` 也有同样的地雷，只是之前的断言没走到那条路径）。
 * 本项目的代号与词条 id 只含字母、数字与 `.:-_`，转义这两个字符即可，
 * 也让浏览器与 jsdom 走完全同一条代码路径。
 *
 * ⚠️ **只在 querySelector / querySelectorAll 的选择器里用**（如
 * `` `.node[data-goto="${attrEscape(code)}"]` ``）。
 *
 * **不要**用它拼 HTML 属性（`<span title="${attrEscape(x)}">`）：它把 `"` 转成 `\"`，
 * 而 HTML 属性语法里反斜杠**不是**转义符 —— 引号照旧收尾属性，数据里写
 * `" onmouseover="…` 就能跳出属性注入。HTML / XML 属性语境一律用
 * `renderers/markdown.ts` 的 `escapeHtml`（它转 `& < > "`）。
 *
 * 2026-11-15 独立复核：`card.ts`（tex_ref 的 title）、`doc.ts`（data-entry / data-goto /
 * data-selftest / title）、`aside.ts`（溯源 title）都改成 escapeHtml，本文件的用途
 * 收敛为「选择器专用」。
 */
export const attrEscape = (value: string): string => value.replace(/["\\]/g, '\\$&');
