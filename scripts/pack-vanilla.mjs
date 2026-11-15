// Build a deterministic, block-only resource library. Never package client code or user data.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { unzipSync } from 'fflate';

const clientPath = process.argv[2];
if (!clientPath) throw Error('Usage: node scripts/pack-vanilla.mjs <local-client.jar>');
const client = await fs.readFile(clientPath);
const allowed =
  /^assets\/minecraft\/(?:blockstates\/.*\.json|models\/block\/.*\.json|textures\/(?:block\/.*|entity\/(?:bed\/.*|chest\/.*|banner\/base|banner_base))\.png)$/;
const extracted = unzipSync(client, { filter: (e) => e.name === 'version.json' || allowed.test(e.name) });
const version = JSON.parse(new TextDecoder().decode(extracted['version.json'])).id;
if (version !== '1.20.1') throw Error('The bundled library currently targets Java 1.20.1');
delete extracted['version.json'];
const sha = (data) => createHash('sha256').update(data).digest('hex');
const names = Object.keys(extracted).sort();
const payload = Object.fromEntries(names.map((n) => [n, Buffer.from(extracted[n]).toString('base64')]));
const packed = gzipSync(JSON.stringify(payload), { level: 9 });
const metadata = {
  version,
  source: 'Minecraft: Java Edition client, block rendering resources only',
  copyright:
    'Minecraft assets are copyright Mojang Studios / Microsoft. Not covered by the project MIT license.',
  sourceClientSHA256: sha(client),
  packedSHA256: sha(packed),
  fileCount: names.length,
  unpackedBytes: names.reduce((n, name) => n + extracted[name].length, 0),
  samples: Object.fromEntries(
    [
      'assets/minecraft/textures/block/stone_bricks.png',
      'assets/minecraft/textures/block/deepslate_tiles.png',
      'assets/minecraft/models/block/ladder.json',
      'assets/minecraft/blockstates/stone_brick_stairs.json',
    ].map((n) => [n, sha(extracted[n])]),
  ),
};
await fs.mkdir('assets', { recursive: true });
await fs.writeFile('assets/vanilla-1.20.1.json.gz', packed);
await fs.writeFile('assets/vanilla-1.20.1.meta.json', JSON.stringify(metadata, null, 2) + '\n');
console.log(
  JSON.stringify({ version, files: names.length, packedBytes: packed.length, sha256: sha(packed) }),
);
