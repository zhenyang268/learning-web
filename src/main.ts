/**
 * 数学站入口（index.html）。
 *
 * 薄入口：应用主体在 `app.ts`，这里只声明「跑哪个学科」。
 * 保持这个文件路径不变很重要 —— `tools/dom-harness.mjs` 与
 * `tools/build-standalone.mjs` 都写死了 `src/main.ts` 作为入口，
 * 把学科选择收敛到 3 行入口，两个工具的爆破半径就是 0。
 */
import { boot } from './app';
import { MATH } from './subjects';

void boot(MATH);