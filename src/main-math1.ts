/**
 * 数一考研子站入口（math1.html）。
 *
 * 与 `main-cs408.ts` 同构：只换学科配置（数据根 `kaoyan/json/`、语义边根 `kaoyan/graph/`）。
 * 外壳 / 渲染器 / 词条契约全部复用，没有第二套业务代码。
 */
import { boot } from './app';
import { MATH1 } from './subjects';

void boot(MATH1);
