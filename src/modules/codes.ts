/**
 * 展示层代号（display code）。
 *
 * 背景：单单元章在 json 里的 code 就是章码本身（如 Q8、H5、R1），没有 `.1`
 * 后缀；多单元章是 de1.1 / A1.2 这种。用户口径：**子节必须带子标号**——
 * 侧栏/正文/右栏里唯一子节应显示为 Q8.1，而不是和章标题一样叫 Q8。
 *
 * 为什么在显示层修而改数据：① 已入库 ~90 个单单元章 + 全库 links + 56 个
 * graph/*.yaml 都用裸章码互相引用，数据迁移是全库手术；② JSON agent 还在
 * 并行写 json/（GEN_BRIEF 契约就是章码引用），中途改约定必然撞车。
 *
 * 规则：code 里没有 `.` → 视为「该章唯一子节」，显示为 `<code>.1`。
 * 内部代号（hash 路由、json 路径、mastery 键、links 匹配、data-goto）
 * **一律保持原样**，只有渲染给人看的文本经过本函数。
 * 正文内容里引用的代号（gotoChip 的 label 是对原文的引用）不经过这里，
 * 避免改变文意（如「组代号 C9 非法」这类教材式表述）。
 */
export function displayCode(code: string): string {
  return code.includes('.') ? code : `${code}.1`;
}
