import { build } from 'esbuild';
import fs from 'node:fs/promises';
import { demoSchematic } from '../src/demo.js';
await fs.mkdir('dist', { recursive: true });
await fs.mkdir('examples', { recursive: true });
const worker = await build({
  entryPoints: ['src/worker.js'],
  bundle: true,
  minify: true,
  write: false,
  format: 'iife',
  target: 'es2022',
});
const app = await build({
  entryPoints: ['src/app.js'],
  bundle: true,
  minify: true,
  write: false,
  format: 'iife',
  target: 'es2022',
  define: { WORKER_SOURCE: JSON.stringify(worker.outputFiles[0].text) },
});
const styles = await fs.readFile('src/style.css', 'utf8');
let html = await fs.readFile('src/index.html', 'utf8');
const licenses = await Promise.all(
  ['three', 'fflate'].map((n) => fs.readFile('node_modules/' + n + '/LICENSE', 'utf8')),
);
html = html
  .replace('/* STYLES */', () => styles)
  .replace('/* APP_SOURCE */', () => app.outputFiles[0].text.replaceAll('</', '<\\/'))
  .replace('/* LICENSES */', () => licenses.join('\n\n').replaceAll('-->', '-- >'));
await fs.writeFile('dist/index.html', html);
await fs.writeFile('dist/.nojekyll', '');
for (const kind of ['house', 'tower', 'basement']) {
  const data = demoSchematic(kind);
  await fs.writeFile('examples/' + kind + '.schem', data);
  await fs.writeFile('dist/' + kind + '.schem', data);
}
console.log('Built standalone dist/index.html (' + Buffer.byteLength(html) + ' bytes)');
