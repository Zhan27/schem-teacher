// Optional bundled support for the three kitchen blocks used by the reference.
import fs from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const commit = 'e854d56d4eea8dc120650d43da0d1472711797ad';
const base = 'https://raw.githubusercontent.com/vectorwing/FarmersDelight/' + commit + '/';
const files = {},
  urls = {},
  seen = new Set();
async function get(resource) {
  if (files[resource]) return files[resource];
  for (const root of ['src/generated/resources/', 'src/main/resources/']) {
    const response = await fetch(base + root + resource, { signal: AbortSignal.timeout(20000) });
    if (response.status === 404) continue;
    if (!response.ok) throw Error('Resource download failed: ' + response.status + ' ' + resource);
    const data = Buffer.from(await response.arrayBuffer());
    files[resource] = data;
    urls[resource] = root + resource;
    return data;
  }
  throw Error('Missing upstream resource: ' + resource);
}
async function model(id) {
  if (!id.startsWith('farmersdelight:') || seen.has(id)) return;
  seen.add(id);
  const tail = id.includes(':') ? id.split(':')[1] : id;
  const data = JSON.parse((await get('assets/farmersdelight/models/' + tail + '.json')).toString());
  if (data.parent) await model(data.parent);
  for (const texture of Object.values(data.textures || {})) {
    if (texture.startsWith('#') || texture.startsWith('minecraft:')) continue;
    await get(
      'assets/farmersdelight/textures/' + (texture.includes(':') ? texture.split(':')[1] : texture) + '.png',
    );
  }
}
function variants(data) {
  if (Array.isArray(data)) return data.flatMap(variants);
  if (data && typeof data === 'object')
    return [...(data.model ? [data.model] : []), ...Object.values(data).flatMap(variants)];
  return [];
}
for (const block of ['stove', 'cutting_board', 'cooking_pot']) {
  const state = JSON.parse((await get('assets/farmersdelight/blockstates/' + block + '.json')).toString());
  for (const id of new Set(variants(state))) await model(id);
}
const payload = Object.fromEntries(
  Object.keys(files)
    .sort()
    .map((n) => [n, files[n].toString('base64')]),
);
const packed = gzipSync(JSON.stringify(payload), { level: 9 });
const sha = (b) => createHash('sha256').update(b).digest('hex');
await fs.mkdir('assets', { recursive: true });
await fs.writeFile('assets/farmers-delight.json.gz', packed);
const license = await fetch(base + 'LICENSE', { signal: AbortSignal.timeout(20000) });
if (!license.ok) throw Error('Upstream license missing');
await fs.writeFile('assets/farmers-delight-LICENSE.txt', await license.text());
await fs.writeFile(
  'assets/farmers-delight.meta.json',
  JSON.stringify(
    {
      source: 'https://github.com/vectorwing/FarmersDelight',
      commit,
      branch: '1.20',
      license: 'MIT',
      blocks: ['stove', 'cutting_board', 'cooking_pot'],
      packedSHA256: sha(packed),
      files: Object.keys(payload).map((n) => ({ path: n, upstream: urls[n], sha256: sha(files[n]) })),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({ files: Object.keys(payload).length, bytes: packed.length, sha256: sha(packed) }),
);
