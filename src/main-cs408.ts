/**
 * 408 子站入口（cs408.html）。
 *
 * 与 `main.ts` 的唯一差别就是传入的学科配置：数据根 `cs408/json/`、
 * 语义边根 `cs408/graph/`、总纲换成 `syllabus-cs408.ts`。
 * 外壳 / 渲染器 / 词条契约 / viz 机制全部复用，**没有第二套业务代码**。
 */
import { boot } from './app';
import { CS408 } from './subjects';

void boot(CS408);