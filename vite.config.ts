import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = import.meta.dirname;
const JSON_DIR = path.join(ROOT, 'json');
const OUT_JSON_DIR = path.join(ROOT, 'dist', 'json');

/** 扫描 json/ 下所有 `json/<章节>/<代号>.json`，作为运行时索引。 */
function scanJsonFiles(): string[] {
  if (!fs.existsSync(JSON_DIR)) return [];
  const out: string[] = [];
  for (const chapter of fs.readdirSync(JSON_DIR)) {
    const dir = path.join(JSON_DIR, chapter);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.json')) out.push(`json/${chapter}/${name}`);
    }
  }
  return out.sort();
}

function indexPayload(): string {
  return JSON.stringify({ files: scanJsonFiles(), generated: new Date().toISOString() });
}

function reload(server: ViteDevServer) {
  const hot = (server as unknown as { hot?: { send: (p: unknown) => void } }).hot;
  if (hot) hot.send({ type: 'full-reload' });
  else (server as unknown as { ws: { send: (p: unknown) => void } }).ws.send({ type: 'full-reload' });
}

/**
 * json/ 是运行时数据（不打进 bundle，改 JSON 秒级刷新）：
 * - dev：中间件即时生成 /json/index.json；监听 json/ 变化触发整页刷新
 * - build：把 json/ 原样拷进 dist/json/，并落一份 index.json
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
