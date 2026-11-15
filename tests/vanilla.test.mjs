import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

test('bundled library is pinned, intact and limited to block-rendering assets', async () => {
  const packed = await fs.readFile('assets/vanilla-1.20.1.json.gz');
  const meta = JSON.parse(await fs.readFile('assets/vanilla-1.20.1.meta.json', 'utf8'));
  const sha = (v) => createHash('sha256').update(v).digest('hex');
  assert.equal(meta.version, '1.20.1');
  assert.equal(sha(packed), 'bc31111e6af31e6a44ff8fc2d252cf87b5775f5df98946c39ed14a37e0fcf548');
  assert.equal(sha(packed), meta.packedSHA256);
  const files = JSON.parse(gunzipSync(packed));
  assert.equal(Object.keys(files).length, meta.fileCount);
  let total = 0;
  for (const [name, data] of Object.entries(files)) {
    assert.match(
      name,
      /^assets\/minecraft\/(?:blockstates\/.*\.json|models\/block\/.*\.json|textures\/block\/.*\.png)$/,
    );
    const bytes = Buffer.from(data, 'base64');
    total += bytes.length;
    if (name.endsWith('.json')) assert.doesNotThrow(() => JSON.parse(bytes));
    else assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  }
  assert.equal(total, meta.unpackedBytes);
  for (const [name, hash] of Object.entries(meta.samples))
    assert.equal(sha(Buffer.from(files[name], 'base64')), hash);
});
