import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { buildIndex } from './src/modules/kb-index';

const ROOT = import.meta.dirname;
const JSON_DIR = path.join(ROOT, 'json');
const OUT_JSON_DIR = path.join(ROOT, 'dist', 'json');

function indexPayload(): string {
  return JSON.stringify(buildIndex(JSON_DIR));
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
        next();
      });
      if (fs.existsSync(JSON_DIR)) {
        server.watcher.add(JSON_DIR);
        server.watcher.on('change', (f) => {
          if (typeof f === 'string' && f.startsWith(JSON_DIR)) reload(server);
        });
      }
    },
    closeBundle() {
      fs.rmSync(OUT_JSON_DIR, { recursive: true, force: true });
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
