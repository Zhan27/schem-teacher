import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { encodeSchematic } from '../src/demo.js';

test('vanilla resources are automatic, pixel accurate and portable without a network', async ({
  browser,
}, info) => {
  const context = await browser.newContext({ offline: true });
  const page = await context.newPage(),
    requests = [],
    errors = [];
  page.on('request', (r) => {
    if (/^https?:/.test(r.url())) requests.push(r.url());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
  await page.waitForFunction(() => window.__teacher?.ready);
  await page.locator('#demoTower').click();
  await expect(page.locator('#textureNote')).toContainText('内置原版材质 · Java 1.20.1');
  await page.locator('#complete').click();
  const done = await page.evaluate(() => window.__teacher.getState().done.length);
  const pending = page.waitForEvent('download');
  await page.locator('#saveProject').click();
  const project = await pending,
    file = info.outputPath('vanilla-project.json');
  await project.saveAs(file);
  const saved = JSON.parse(await fs.readFile(file, 'utf8'));
  expect(saved.assets.source).toBe('vanilla');
  expect(saved.assets.version).toBe('1.20.1');
  const actual = saved.assets.textures.find(([id]) => id === 'minecraft:block/stone_bricks')?.[1];
  expect(actual).toMatch(/^data:image\/png;base64,/);
  const files = JSON.parse(gunzipSync(await fs.readFile('assets/vanilla-1.20.1.json.gz')));
  const expected = 'data:image/png;base64,' + files['assets/minecraft/textures/block/stone_bricks.png'];
  expect(
    await page.evaluate(
      async ([a, b]) => {
        async function pixels(url) {
          const image = new Image();
          image.src = url;
          await image.decode();
          const c = document.createElement('canvas');
          c.width = c.height = 16;
          const g = c.getContext('2d');
          g.drawImage(image, 0, 0);
          return [...g.getImageData(0, 0, 16, 16).data];
        }
        return JSON.stringify(await pixels(a)) === JSON.stringify(await pixels(b));
      },
      [actual, expected],
    ),
  ).toBe(true);
  await page.locator('#language').selectOption('en');
  await expect(page.locator('#textureNote')).toContainText('Built-in vanilla resources · Java 1.20.1');
  const exporting = page.waitForEvent('download');
  await page.locator('#exportHTML').click();
  const download = await exporting,
    output = info.outputPath('vanilla-offline.html');
  await download.saveAs(output);
  const reopened = await context.newPage();
  await reopened.goto(pathToFileURL(output).href);
  await reopened.waitForFunction(() => window.__teacher?.ready);
  await expect(reopened.locator('#textureNote')).toContainText('Built-in vanilla resources · Java 1.20.1');
  expect(await reopened.evaluate(() => window.__teacher.getState().done.length)).toBe(done);
  // The exported tool also retains its default library for a different schematic.
  await reopened.locator('#schemFile').setInputFiles('examples/house.schem');
  await expect(reopened.locator('#projectTitle')).toHaveText('house');
  await expect(reopened.locator('#textureNote')).toContainText('Built-in vanilla resources');
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
  await context.close();
});

test('vanilla slab UVs and ladder geometry follow source models; unknown blocks stay labelled', async ({
  page,
}) => {
  await page.goto(pathToFileURL(path.resolve('dist/index.html')).href);
  await page.waitForFunction(() => window.__teacher?.ready);
  const bytes = encodeSchematic({
    dimensions: [4, 3, 4],
    blocks: new Map([
      ['0,0,0', 'minecraft:stone_brick_slab[type=bottom,waterlogged=false]'],
      ['1,0,0', 'minecraft:ladder[facing=north,waterlogged=false]'],
      ['2,0,0', 'example:unknown_block'],
    ]),
  });
  await page
    .locator('#schemFile')
    .setInputFiles({
      name: 'model-shapes.schem',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(bytes),
    });
  await expect(page.locator('#textureNote')).toContainText('1种方块使用示意模型');
  const geometry = await page.evaluate(() => {
    const { model } = window.__teacher.getState(),
      materials = window.__teacher.viewer().materials;
    const find = (start) =>
      materials.models[Object.entries(model.palette).find(([, s]) => s.startsWith(start))[0]];
    return {
      slab: find('minecraft:stone_brick_slab'),
      ladder: find('minecraft:ladder'),
      missing: materials.missing,
    };
  });
  expect(geometry.ladder.faces).toHaveLength(2);
  expect(geometry.ladder.faces.every((f) => f[0].every((p) => Math.abs(p[2] - 0.95) < 1e-6))).toBe(true);
  const side = geometry.slab.faces.find((f) => f[3][2] === -1);
  expect(side[1]).toEqual([
    [0, 8],
    [16, 8],
    [16, 16],
    [0, 16],
  ]);
  expect(geometry.missing).toEqual(['example:unknown_block']);
});
