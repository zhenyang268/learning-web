# release/ —— 可直接下载的单文件快照

> 这一目录**入库**（`dist/` 仍然不进 git）：做的事就是「在 GitHub 上点一下文件，
> 下载下来双击打开」。不需要服务器、不需要联网、不需要 `npm install`。

| 文件 | 内容 | 单元 |
|---|---|---|
| `knowledge-index.html` | 索引页，四份快照的入口 | — |
| `knowledge.html` | 数学（含数值库） | 424 |
| `knowledge-cs408.html` | 408 考研 | 159 |
| `knowledge-math1.html` | 数一考研 | 105 |
| `knowledge-projects.html` | 工程线（OUTLINE + NOTES） | 81 |
| `reading.html` | **口述版（TTS）**：208 篇讲解稿 + 笔记清理稿 + 词表，共 321 单元 | 321 |

`reading.html` 的三层结构（2026-11-18 完成）：

| 层 | 内容 | 单元数 |
|---|---|---|
| 讲解稿（主力） | 408 四科导读 + 应试分层 + 112 个考点；数一 72 篇；英语六题型；工程线 13 篇方向大纲 | **208** |
| 笔记清理稿 | 数一 72 篇原笔记的公式口语化版本（未改写成讲解） | 72 |
| 词表与作文 | 英语 31 个主题词表（3996 词条）+ 6 篇原作文讲义 | 37 |

`reading.html` 是**口述版（TTS）**，也是主站导读层（guide-card/v1）Mode T 的脚手架；
主站单元页显示的是屏幕版（KaTeX），两处共用同一批 talk，不互相搬运正文。

`reading.html` 与上面五份的形态差别（2026-11-18 落地，生成链见 `build/reading/`）：

- **它是给耳朵的**，上面五份是给眼睛的。正文在构建期就把公式、缩写、下划线转成了
  可朗读的口语文字（`$Q^{T}AQ$` → `Q 转置 A Q`、`epoll_wait` → `epoll wait`）。
- **没有 tab、没有 KaTeX、没有交互**：朗读只读已在 DOM 里的文本，tab 懒渲染会让
  未展开面板读不到，KaTeX 的双份 DOM 会读成重复或乱码。
- **不登记进 `SUBJECTS`**：朗读稿没有代号、没有语义边、不记掌握度，是独立轻入口。

重新生成：

```bash
for g in gen_math1 gen_408 gen_words gen_writing; do uv run python build/reading/$g.py; done
uv run python build/reading/build_index.py
node tools/build-reading-standalone.mjs
node tools/check-reading.mjs     # 闸门：残留符号必须 0
```

## 怎么用

1. 在 GitHub 上点开要看的那个 html → 右上 **Download raw file**；
2. 双击打开。数据、字体、公式引擎全部内联在文件里，`file://` 直接跑。

要求浏览器支持 `DecompressionStream`（Chrome 80+ / Safari 16.4+ / Firefox 113+）。
低于这个版本会显示一条明确提示，不会白屏。

## 与 `dist/` 的区别

- `dist/` 是完整构建产物（约 27 MB）：四个入口页 + 四个数据根 + assets，**必须走 HTTP**，
  用于本地开发与部署。**不入 git**。
- `release/` 只放五份自包含快照（约 9.7 MB），是**发给人看**的那一份。

## 什么时候重新生成

内容改了以后：

```bash
npm run release     # = npm run build + 把五份快照同步进 release/
```

生成后把 `release/` 的改动一起提交，GitHub 上的下载物才会更新。

## 版本

- 生成日期：2026-11-21
- 六站快照：math 199 / emath 225 / cs408 160 / 数一 106 / 工程线 458 / 英一 40 单元
- 导读侧车：560 个目标单元全部 done（cs408 112、数一 72、英一 6、工程线 43、数学系 199、工程数学 128）
- 源内容仓：`notebook` @ `529acb5`

## 内容状态

- `codedesign/` 七章已从骨架扩成正文：46 个单元，`NOTES` 每章 5–8 节；
- 导读层六站全部 done，`npm run check` 已包含 `check:guide`；
- 本快照是内容完整版；发布判据见 `build/guide/prompt/check-release.md`。
