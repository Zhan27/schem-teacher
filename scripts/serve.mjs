import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('dist'),
  port = Number(process.env.PORT || 4173);
http
  .createServer(async (req, res) => {
    try {
      const p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(root, '.' + (p === '/' ? '/index.html' : p));
      if (!file.startsWith(root + path.sep)) throw Error('path');
      const data = await fs.readFile(file);
      res.setHeader(
        'Content-Type',
        file.endsWith('.html')
          ? 'text/html; charset=utf-8'
          : file.endsWith('.schem')
            ? 'application/octet-stream'
            : 'text/plain',
      );
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  })
  .listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:' + port));
