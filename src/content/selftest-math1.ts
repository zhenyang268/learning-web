import type { EntryFile } from '../types';
import type { SelftestItem } from './selftest';

/**
 * 数一 KP 自测：直接由已导入的「考法 / 思路 / 坑 / 例题」生成，避免另抄一份正文。
 * 每个 KP 独立记录；五题分别对应概念、机制、边界、独立解题与条件迁移。
 */
export function math1Selftest(file: EntryFile): SelftestItem[] {
  const title = file.title ?? file.code ?? '本考点';
  const methods = file.entries.filter((e) => e.title?.trim().startsWith('考法'));
  const names = methods.map((e) => short(e.title ?? '', 34));
  const first = methods[0];
  const firstMethod = first ? short(first.title ?? '', 46) : title;
  const mechanism = first ? labelled(first.content ?? '', '思路') : '';
  const pitfalls = methods
    .map((e) => labelled(e.content ?? '', '坑'))
    .filter(Boolean)
    .slice(0, 3)
    .join('；');

  return [
    {
      level: 1,
      tag: '概念',
      q: `不看书列出「${title}」的考法，并说明各自的识别信号。`,
      bar: names.length ? `至少完整覆盖：${names.join('；')}。` : '能准确复述定义、核心公式与适用对象。',
    },
    {
      level: 2,
      tag: '机制',
      q: `针对「${firstMethod}」，第一步做什么，为什么这样做？`,
      bar: mechanism ? `关键思路：${mechanism}` : '能说明识别信号、第一步及后续推导之间的因果关系。',
    },
    {
      level: 3,
      tag: '边界',
      q: `做「${title}」时，哪些前提与易错点必须先检查？`,
      bar: pitfalls ? `至少答出：${pitfalls}` : '能给出一个常见错误，并说明它违反了哪个前提。',
    },
    {
      level: 4,
      tag: '验证',
      q: `不看解答，独立完成本页「${title}」例题，写出关键步骤与最终结果。`,
      bar: '能先独立完成，再逐步核对；结果、定义域/方向/正负号等必要条件均检查，不只对最终答案。',
    },
    {
      level: 5,
      tag: '迁移',
      q: `若「${title}」题目的函数形式、参数或条件改变，怎样重新选考法？`,
      bar: '能构造一个具体变式，指出原方法是否仍可用、失效原因及替代路径。',
    },
  ];
}

function labelled(content: string, label: string): string {
  const match = content.match(new RegExp(`\\*\\*${label}\\*\\*[：:]?\\s*([\\s\\S]*)`));
  return short(match?.[1] ?? content, 180);
}

function short(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
