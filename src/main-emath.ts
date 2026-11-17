/**
 * 工程数学入口（`emath.html`）。
 *
 * 薄入口：应用主体在 `app.ts`，这里只声明「跑哪个学科」。
 * 与 `main.ts` 同形 —— 工具把入口写成常量（`tools/dom-harness.mjs` 的 ENTRY 表），
 * 所以每个站一份 3 行入口，不要合并成一个按参数分叉的入口。
 */
import { boot } from './app';
import { ENGMATH } from './subjects';

void boot(ENGMATH);