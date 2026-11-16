/**
 * 英语一子站入口（english1.html）。
 *
 * 与 `main-cs408.ts` / `main-math1.ts` / `main-projects.ts` 同构：只换学科配置
 * （数据根 `english1/json/`、语义边根 `english1/graph/`、首屏落点 `GE01.1`、
 * 侧栏章序）。外壳 / 渲染器 / 词条契约全部复用，没有第二套业务代码。
 *
 * 首屏落点与章序为什么写进 `subjects.ts` 而不是这里：`tools/build-standalone.mjs`
 * 会用同一个 `Subject` 对象烤快照，两边（dev / standalone）必须看到同一份配置。
 */
import { boot } from './app';
import { ENGLISH1 } from './subjects';

void boot(ENGLISH1);
