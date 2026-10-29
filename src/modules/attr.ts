/**
 * 属性选择器里的值转义：`[data-x="…"]` 只对 `"` 与 `\` 敏感。
 *
 * 为什么不用 `CSS.escape`：jsdom 里**没有 `CSS` 这个全局**（2026-10-30 实测：
 * 掌握度点击 → patchSidebarMastery → `ReferenceError: CSS is not defined`，
 * 而正文里的 `openRef` 也有同样的地雷，只是之前的断言没走到那条路径）。
 * 本项目的代号与词条 id 只含字母、数字与 `.:-_`，转义这两个字符即可，
 * 也让浏览器与 jsdom 走完全同一条代码路径。
 */
export const attrEscape = (value: string): string => value.replace(/["\\]/g, '\\$&');