// Serves a built site for local review: node site/serve.ts [dist] [--port 4321]
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const args = process.argv.slice(2);
const portAt = args.indexOf('--port');
const PORT = portAt >= 0 ? Number(args[portAt + 1]) : Number(process.env.PORT ?? 4321);
const ROOT = join(import.meta.dirname, '..', args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--port') ?? 'dist');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  let file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!path.endsWith('/')) {
      res.writeHead(301, { location: `${path}/` }).end();
      return;
    }
    file = join(file, 'index.html');
  }
  const found = existsSync(file) && statSync(file).isFile();
  const target = found ? file : join(ROOT, '404.html');
  res.writeHead(found ? 200 : 404, {
    'content-type': TYPES[extname(target)] ?? 'application/octet-stream',
    'cache-control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(target).pipe(res);
}).listen(PORT, () => console.log(`Serving ${ROOT} at http://localhost:${PORT}/`));
