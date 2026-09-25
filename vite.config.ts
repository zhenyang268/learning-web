import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { buildIndex } from './src/modules/kb-index';

const ROOT = import.meta.dirname;
const JSON_DIR = path.join(ROOT, 'json');
const OUT_JSON_DIR = path.join(ROOT, 'dist', 'json');
const GRAPH_DIR = path.join(ROOT, 'graph');
const OUT_GRAPH_DIR = path.join(ROOT, 'dist', 'graph');

function indexPayload(): string {
  // 语义边真源（graph/*.yaml）构建期烘进索引：右栏「依赖◂」与 frontier 因此吃真源，
  // 不再是编号序猜测（详见 kb-index.ts 的 attachSem）。
  return JSON.stringify(buildIndex(JSON_DIR, GRAPH_DIR));
}

/** graph/ 语义边真源的清单（字母列表）。yaml 缺失是常态（逐章补），前端按清单探测 + 降级。 */
function graphIndexPayload(): string {
  const letters: string[] = [];
  if (fs.existsSync(GRAPH_DIR)) {
    for (const name of fs.readdirSync(GRAPH_DIR).sort()) {
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
 * json/ 是运行时数据（不打进 bundle，改 JSON 秒级刷新）：
 * - dev：中间件即时生成 /json/index.json（**只含元数据**，几 KB）；监听 json/ 变化触发整页刷新
 * - build：把 json/ 原样拷进 dist/json/，并落一份 index.json
 *
 * 索引里带 code/chapter/title/cards/links —— 侧栏、依赖图、frontier、掌握度聚合都只吃它，
 * 于是启动不必拉全库；词条正文由前端在切换单元时按需 fetch。
 */
function kbJson(): Plugin {
  return {
    name: 'kb-json',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (url === '/json/index.json') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(indexPayload());
          return;
        }
        if (url === '/graph/index.json') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(graphIndexPayload());
          return;
        }
        if (url.startsWith('/graph/') && url.endsWith('.yaml')) {
          const abs = path.join(GRAPH_DIR, path.basename(url));
          if (fs.existsSync(abs)) {
            res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end(fs.readFileSync(abs, 'utf8'));
            return;
          }
          res.statusCode = 404;
          res.end('');
          return;
        }
        next();
      });
      for (const dir of [JSON_DIR, GRAPH_DIR]) {
        if (!fs.existsSync(dir)) continue;
        server.watcher.add(dir);
        server.watcher.on('change', (f) => {
          if (typeof f === 'string' && f.startsWith(dir)) reload(server);
        });
      }
    },
    closeBundle() {
      fs.rmSync(OUT_JSON_DIR, { recursive: true, force: true });
      fs.rmSync(OUT_GRAPH_DIR, { recursive: true, force: true });
      if (fs.existsSync(GRAPH_DIR)) {
        fs.cpSync(GRAPH_DIR, OUT_GRAPH_DIR, { recursive: true });
        fs.writeFileSync(path.join(OUT_GRAPH_DIR, 'index.json'), graphIndexPayload());
      }
      if (!fs.existsSync(JSON_DIR)) return;
      fs.cpSync(JSON_DIR, OUT_JSON_DIR, { recursive: true });
      fs.writeFileSync(path.join(OUT_JSON_DIR, 'index.json'), indexPayload());
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [kbJson()],
  server: { port: 5173, host: '127.0.0.1' },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
});
