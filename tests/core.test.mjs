import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSchematic, validateModel } from '../src/schematic.js';
import { makeOperations, buildPlan, defaultSettings, validateRegions } from '../src/planner.js';
import { demoSchematic, encodeSchematic } from '../src/demo.js';
for (const kind of ['house', 'tower', 'basement'])
  test('v3 ' + kind + ' exact coverage and rectangular construction', async () => {
    const m = await parseSchematic(demoSchematic(kind), kind + '.schem');
    validateModel(m);
    const p = buildPlan(m, defaultSettings(m)),
      cells = p.tasks.flatMap((t) => t.ops.flatMap((i) => p.ops[i].cells));
    assert.equal(cells.length, m.cells.length);
    assert.equal(new Set(cells).size, m.cells.length);
    assert(p.tasks.length > 1);
    for (const t of p.tasks) {
      assert.deepEqual(new Set(t.runs.flat()), new Set(t.ops));
      for (const group of t.runs)
        if (group.length > 1 && group.every((i) => p.ops[i].cells.length === 1)) {
          const bs = group.map((i) => m.cells[p.ops[i].anchor]),
            span = [0, 1, 2].map(
              (k) => Math.max(...bs.map((b) => b[k])) - Math.min(...bs.map((b) => b[k])) + 1,
            );
          assert.equal(
            span.reduce((a, b) => a * b, 1),
            bs.length,
          );
        }
    }
  });
test('paired doors, double slabs and air filtering retain stairs', async () => {
  const blocks = new Map([
    ['0,0,0', 'minecraft:stone_brick_stairs[facing=north,half=bottom,shape=straight]'],
    ['1,0,0', 'minecraft:stone_brick_slab[type=double]'],
    ['2,0,0', 'minecraft:oak_door[half=lower,facing=north]'],
    ['2,1,0', 'minecraft:oak_door[half=upper,facing=north]'],
  ]);
  const m = await parseSchematic(encodeSchematic({ dimensions: [3, 2, 1], blocks })),
    ops = makeOperations(m);
  assert.equal(m.cells.length, 4);
  assert.equal(ops.length, 3);
  assert.equal(ops.find((o) => o.cells.length === 2).items['minecraft:oak_door'], 1);
  assert.equal(ops.find((o) => o.items['minecraft:stone_brick_slab']).items['minecraft:stone_brick_slab'], 2);
});
test('region overlap owns each source cell once', async () => {
  const m = await parseSchematic(demoSchematic()),
    settings = defaultSettings(m),
    regions = [
      { id: 'left', name: '左区', boxes: [[0, 10, 0, 14, 0, 15]] },
      { id: 'right', name: '右区', boxes: [[7, 17, 0, 14, 0, 15]] },
    ];
  validateRegions(regions, m);
  const p = buildPlan(m, settings, regions);
  assert.equal(p.coverage, m.cells.length);
  assert(p.tasks.some((t) => t.region === 'left'));
  assert(p.tasks.some((t) => t.region === 'right'));
  assert.throws(() => validateRegions([{ id: 'bad', name: '坏', boxes: [[0, 100, 0, 14, 0, 15]] }], m));
});
test('invalid and truncated input fail explicitly', async () => {
  await assert.rejects(parseSchematic(new Uint8Array([1, 2, 3])));
  const bytes = demoSchematic();
  await assert.rejects(parseSchematic(bytes.subarray(0, 30)));
  await assert.rejects(parseSchematic(new Uint8Array()));
});
