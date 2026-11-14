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

- 生成日期：2026-11-14
- 数据 commit：`3488a59`（数值库 106 / 408 159 / 数一 105 / 工程线 81）
- 源内容仓：`notebook` @ `718f85c7`
