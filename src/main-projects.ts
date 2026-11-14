/**
 * 工程线子站入口（projects.html）。
 *
 * 数据根 `projects/json/`（OUTLINE + NOTES 两件套）。外壳与渲染器复用，
 * 只有「单元更长、没有总纲/切入点」两处不同，靠学科配置表达。
 */
import { boot } from './app';
import { PROJECTS } from './subjects';

void boot(PROJECTS);
