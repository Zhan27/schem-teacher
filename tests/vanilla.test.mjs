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
  assert.equal(sha(packed), 'ee9cb99ec741421716d69b632098baa8969289816a96c8aacbbf5e2774ea4f81');
  assert.equal(sha(packed), meta.packedSHA256);
  const files = JSON.parse(gunzipSync(packed));
  assert.equal(Object.keys(files).length, meta.fileCount);
  let total = 0;
  for (const [name, data] of Object.entries(files)) {
    assert.match(
      name,
      /^assets\/minecraft\/(?:blockstates\/.*\.json|models\/block\/.*\.json|textures\/(?:block\/.*|entity\/(?:bed\/.*|chest\/.*|banner\/base|banner_base))\.png)$/,
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

test('kitchen block add-on matches the pinned upstream resource hashes and MIT notice', async () => {
  const packed = await fs.readFile('assets/farmers-delight.json.gz');
  const meta = JSON.parse(await fs.readFile('assets/farmers-delight.meta.json', 'utf8'));
  const files = JSON.parse(gunzipSync(packed));
  const sha = (v) => createHash('sha256').update(v).digest('hex');
  assert.equal(sha(packed), '2b94df5521859f2bae68d0d405527961289e5ed5798c3ad575a7e129e89528f8');
  assert.equal(sha(packed), meta.packedSHA256);
  assert.equal(Object.keys(files).length, meta.files.length);
  for (const record of meta.files) {
    assert.match(
      record.path,
      /^assets\/farmersdelight\/(?:blockstates|models\/block|textures\/block)\/[a-z0-9_/]+\.(?:json|png)$/,
    );
    assert.equal(sha(Buffer.from(files[record.path], 'base64')), record.sha256);
  }
  assert.match(
    await fs.readFile('assets/farmers-delight-LICENSE.txt', 'utf8'),
    /Copyright \(c\) 2020 vectorwing/,
  );
});
