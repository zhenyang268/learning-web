import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { buildIndex } from './src/modules/kb-index';
import { SUBJECTS, type Subject } from './src/subjects';

const ROOT = import.meta.dirname;
const OUT = path.join(ROOT, 'dist');

/** 学科配置里是「相对站点根的路径」，这里换成绝对路径 */
const abs = (rel: string): string => path.join(ROOT, rel.replace(/\/$/, ''));

/**
 * 每个学科各一份索引（元数据，几 KB），dev 即时生成、build 落盘。
 * 语义边真源（`<graphRoot>*.yaml`）构建期烘进索引：运行期零 yaml 请求。
 */
function subjectIndex(subject: Subject): string {
  return JSON.stringify(buildIndex(abs(subject.dataRoot), abs(subject.graphRoot), subject.dataRoot));
}

/** 某个学科 dataRoot 下的 yaml 清单（前端按清单探测 + 降级） */
function subjectGraphIndex(subject: Subject): string {
  const dir = abs(subject.graphRoot);
  const letters: string[] = [];
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir).sort()) {
      if (name.endsWith('.yaml')) letters.push(name.slice(0, -'.yaml'.length));
    }
  }
  return JSON.stringify({ letters, generated: new Date().toISOString() });
}

function reload(server: ViteDevServer) {
  const hot = (server as unknown as { hot?: { send: (p: unknown) => void } }).hot;
  if (hot) hot.send({ type: 'full-reload' });
  else (server as unknown as { ws: { send: (p: unknown) => void } }).ws.send({ type: 'full-reload' });
}

/**
 * 数据层插件（多学科）：
 * - dev：中间件即时生成 `<dataRoot>index.json` 与 `<graphRoot>index.json`（**只含元数据**）；
 *   单元正文与 408 的数据目录本身就是站点根下的静态文件，Vite 直接伺服，无需中间件。
 * - build：各学科的数据根整体拷进 dist（数学 `json/`、408 `cs408/json/`），并落一份索引。
 *
 * 这样两个站点各拉各的数据，`cs408.html` 的首屏不会因为数学 318 个单元变重。
 */
function kbJson(): Plugin {
  const indexUrl = (s: Subject): string => `/${s.dataRoot}index.json`;
  const graphIndexUrl = (s: Subject): string => `/${s.graphRoot}index.json`;

  return {
    name: 'kb-json',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        for (const subject of SUBJECTS) {
          if (url === indexUrl(subject)) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end(subjectIndex(subject));
            return;
          }
          if (url === graphIndexUrl(subject)) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end(subjectGraphIndex(subject));
            return;
          }
        }
        // graph/*.yaml 原文（调试用）：按学科的 graphRoot 前缀分派
        for (const subject of SUBJECTS) {
          const prefix = `/${subject.graphRoot}`;
          if (url.startsWith(prefix) && url.endsWith('.yaml')) {
            const file = path.join(abs(subject.graphRoot), path.basename(url));
            if (fs.existsSync(file)) {
              res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
              res.setHeader('Cache-Control', 'no-store');
              res.end(fs.readFileSync(file, 'utf8'));
              return;
            }
            res.statusCode = 404;
            res.end('');
            return;
          }
        }
        next();
      });
      for (const subject of SUBJECTS) {
        for (const dir of [abs(subject.dataRoot), abs(subject.graphRoot)]) {
          if (!fs.existsSync(dir)) continue;
          server.watcher.add(dir);
          server.watcher.on('change', (f) => {
            if (typeof f === 'string' && f.startsWith(dir)) reload(server);
          });
        }
      }
    },
    closeBundle() {
      for (const subject of SUBJECTS) {
        const dataDir = abs(subject.dataRoot);
        const graphDir = abs(subject.graphRoot);
        const outData = path.join(OUT, subject.dataRoot);
        const outGraph = path.join(OUT, subject.graphRoot);
        fs.rmSync(outData, { recursive: true, force: true });
        fs.rmSync(outGraph, { recursive: true, force: true });
        if (fs.existsSync(graphDir)) {
          fs.cpSync(graphDir, outGraph, { recursive: true });
          fs.writeFileSync(path.join(outGraph, 'index.json'), subjectGraphIndex(subject));
        }
        if (fs.existsSync(dataDir)) {
          fs.cpSync(dataDir, outData, { recursive: true });
          fs.writeFileSync(path.join(outData, 'index.json'), subjectIndex(subject));
        }
      }
    },
  };
}

/**
 * 朗读稿数据根（`readable/`）：
 *
 * dev 下 Vite 直接伺服根目录里的静态文件，不需要中间件；
 * build 时必须整份拷进 `dist/readable/`，否则 `reading.html` 的 fetch 全 404。
 *
 * 它与 `SUBJECTS` 完全无关（朗读稿没有代号、没有语义边），所以不并进 `kbJson()`。
 */
function readingData(): Plugin {
  return {
    name: 'reading-data',
    closeBundle() {
      const src = path.join(ROOT, 'readable');
      if (!fs.existsSync(src)) {
        console.warn('readable/ 不存在：先跑 build/reading/build_index.py');
        return;
      }
      fs.cpSync(src, path.join(OUT, 'readable'), { recursive: true });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [kbJson(), readingData()],
  server: { port: 5173, host: '127.0.0.1' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      // 多入口：六个站点各一个入口脚本（共用一套外壳与渲染器，数据根各自独立）
      // `reading` 是第七个入口，独立轻入口 —— 不复用 Subject 体系，理由见 src/reading/main.ts
      input: {
        main: path.join(ROOT, 'index.html'),
        emath: path.join(ROOT, 'emath.html'),
        cs408: path.join(ROOT, 'cs408.html'),
        math1: path.join(ROOT, 'math1.html'),
        projects: path.join(ROOT, 'projects.html'),
        english1: path.join(ROOT, 'english1.html'),
        reading: path.join(ROOT, 'reading.html'),
      },
    },
  },
});