import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { encodeSchematic } from '../src/demo.js';
const entry = pathToFileURL(path.resolve('dist/index.html')).href;

test('translucent workbench surfaces remain correct when face order and camera change', async ({
  page,
}, info) => {
  await page.goto(entry);
  await page.waitForFunction(() => window.__teacher?.ready);
  const bytes = encodeSchematic({
    dimensions: [3, 2, 3],
    blocks: new Map([
      ['0,0,0', 'minecraft:crafting_table'],
      ['1,0,1', 'minecraft:oak_planks'],
    ]),
  });
  await page
    .locator('#schemFile')
    .setInputFiles({
      name: 'occlusion.schem',
      buffer: Buffer.from(bytes),
      mimeType: 'application/octet-stream',
    });
  await page.waitForFunction(
    () => window.__teacher.getState().plan && document.querySelector('#busy').hidden,
  );
  const hasGPU = await page.evaluate(() => !!window.__teacher.viewer().renderer);
  test.skip(!hasGPU, 'A WebGL context is required for the transparency pixel regression');
  const results = await page.evaluate(() => {
    const v = window.__teacher.viewer(),
      cells = window.__teacher.getState().model.cells;
    const targets = new Set(cells.map((b) => b.slice(0, 3).join(','))),
      bounds = [0, 2, 0, 1, 0, 2],
      pairs = [];
    const pixels = () => {
      const c = document.createElement('canvas');
      c.width = v.canvas.width;
      c.height = v.canvas.height;
      const g = c.getContext('2d');
      g.drawImage(v.canvas, 0, 0);
      return g.getImageData(0, 0, c.width, c.height).data;
    };
    for (const yaw of [0, 1.2, 2.7]) {
      v.setPose({ yaw });
      v.show(cells, targets, new Set(), bounds);
      const before = pixels();
      for (const m of Object.values(v.materials.models)) m.faces.reverse();
      v.renderer.signature = '';
      v.show([...cells].reverse(), targets, new Set(), bounds);
      const after = pixels();
      let diff = 0;
      for (let p = 0; p < before.length; p += 4)
        if ([0, 1, 2].some((c) => Math.abs(before[p + c] - after[p + c]) > 5)) diff++;
      pairs.push(diff / (before.length / 4));
    }
    return pairs;
  });
  await page.locator('#scene').screenshot({ path: info.outputPath('translucent-workbench.png') });
  for (const changedFraction of results) expect(changedFraction).toBeLessThan(0.001);
});
