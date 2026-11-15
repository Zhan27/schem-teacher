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
  await page.locator('#schemFile').setInputFiles({
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

test('default library renders beds, chests, banners and the castle kitchen without placeholder models', async ({
  page,
}, info) => {
  await page.goto(entryURL());
  await page.waitForFunction(() => window.__teacher?.ready);
  const states = [
    'minecraft:chest[facing=south,type=single,waterlogged=false]',
    'minecraft:red_bed[facing=north,part=head,occupied=false]',
    'minecraft:red_bed[facing=north,part=foot,occupied=false]',
    'minecraft:red_wall_banner[facing=north]',
    'farmersdelight:stove[facing=north,lit=true]',
    'farmersdelight:cutting_board[facing=east]',
    'farmersdelight:cooking_pot[facing=north,support=tray,waterlogged=false]',
    'farmersdelight:stove',
  ];
  const positions = ['0,0,1', '2,0,1', '2,0,2', '4,1,1', '6,0,1', '7,0,1', '8,0,1', '9,0,3'];
  const bytes = encodeSchematic({
    dimensions: [10, 3, 4],
    blocks: new Map(states.map((s, i) => [positions[i], s])),
  });
  await page.locator('#schemFile').setInputFiles({
    name: 'entity-fixture.schem',
    buffer: Buffer.from(bytes),
    mimeType: 'application/octet-stream',
  });
  await expect(page.locator('#textureNote')).not.toContainText('示意模型');
  await page.waitForFunction(
    () => window.__teacher.getState().plan && document.querySelector('#busy').hidden,
  );
  const data = await page.evaluate(() => {
    const v = window.__teacher.viewer(),
      m = window.__teacher.getState().model;
    const get = (id) => v.materials.models[Object.entries(m.palette).find(([, s]) => s.startsWith(id))[0]];
    return {
      missing: v.materials.missing,
      chest: get('minecraft:chest'),
      bed: get('minecraft:red_bed'),
      entityTextureSize: v.materials.textures.get('minecraft:entity/bed/red')?.width,
      assumptions: v.materials.assumptions,
      sourceStates: Object.values(m.palette),
    };
  });
  expect(data.missing).toEqual([]);
  expect(data.sourceStates).toContain('farmersdelight:stove');
  expect(data.assumptions).toContainEqual({
    id: 'farmersdelight:stove',
    properties: { facing: 'north', lit: 'false' },
  });
  expect(data.entityTextureSize).toBe(64);
  expect(data.chest.faces.length).toBeGreaterThan(6);
  expect(Math.max(...data.bed.faces.flatMap((f) => f[0].map((p) => p[1])))).toBeCloseTo(9 / 16);
  await page.locator('#complete').click();
  await page.locator('#scene').screenshot({ path: info.outputPath('entity-fixture.png') });
  const pending = page.waitForEvent('download');
  await page.locator('#exportHTML').click();
  const download = await pending,
    output = info.outputPath('entities-offline.html');
  await download.saveAs(output);
  await page.context().setOffline(true);
  await page.goto(pathToFileURL(output).href);
  await page.waitForFunction(() => window.__teacher?.ready);
  expect(
    await page.evaluate(
      () => window.__teacher.viewer().materials.textures.get('minecraft:entity/bed/red').width,
    ),
  ).toBe(64);
  expect(await page.evaluate(() => window.__teacher.viewer().materials.missing)).toEqual([]);
  // Old default snapshots must gain the corrected built-in models on import.
  const saving = page.waitForEvent('download');
  await page.locator('#saveProject').click();
  const file = await saving,
    jsonPath = info.outputPath('old-default.json');
  await file.saveAs(jsonPath);
  const snapshot = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
  snapshot.assets.missing = ['minecraft:chest'];
  snapshot.assets.models = {};
  await page.locator('#projectFile').setInputFiles({
    name: 'old-default.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(snapshot)),
  });
  await page.waitForFunction(
    () =>
      window.__teacher.viewer().materials.missing.length === 0 &&
      Object.keys(window.__teacher.viewer().materials.models).length > 0,
  );
});
function entryURL() {
  return pathToFileURL(path.resolve('dist/index.html')).href;
}

test('bed pillows stay at the outer head end and red surfaces meet the foot in every direction', async ({
  page,
}) => {
  await page.goto(entryURL());
  await page.waitForFunction(() => window.__teacher?.ready);
  const directions = ['north', 'east', 'south', 'west'];
  const bytes = encodeSchematic({
    dimensions: [8, 2, 2],
    blocks: new Map(
      directions.map((f, i) => [
        i * 2 + ',0,0',
        'minecraft:red_bed[facing=' + f + ',part=head,occupied=false]',
      ]),
    ),
  });
  await page
    .locator('#schemFile')
    .setInputFiles({
      name: 'bed-directions.schem',
      buffer: Buffer.from(bytes),
      mimeType: 'application/octet-stream',
    });
  await page.waitForFunction(
    () => window.__teacher.getState().plan && document.querySelector('#busy').hidden,
  );
  const samples = await page.evaluate(() => {
    const m = window.__teacher.getState().model,
      a = window.__teacher.viewer().materials;
    return Object.entries(m.palette)
      .filter(([, s]) => s.includes('_bed'))
      .map(([pid, state]) => {
        const d = state.match(/facing=(\w+)/)[1],
          dir = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[d];
        const f = a.models[pid].faces.find(
          (f) => f[3][1] > 0.9 && f[0].every((p) => Math.abs(p[1] - 9 / 16) < 1e-6),
        );
        const raw = a.textures.get(f[2]),
          v = f[0],
          uv = f[1];
        function pixel(sign) {
          const px = 0.5 + sign * dir[0] * 0.3,
            pz = 0.5 + sign * dir[1] * 0.3;
          const ax = v[1][0] - v[0][0],
            az = v[1][2] - v[0][2],
            bx = v[3][0] - v[0][0],
            bz = v[3][2] - v[0][2],
            det = ax * bz - az * bx;
          const x = ((px - v[0][0]) * bz - (pz - v[0][2]) * bx) / det,
            y = (ax * (pz - v[0][2]) - az * (px - v[0][0])) / det;
          const u = uv[0][0] + x * (uv[1][0] - uv[0][0]) + y * (uv[3][0] - uv[0][0]),
            w = uv[0][1] + x * (uv[1][1] - uv[0][1]) + y * (uv[3][1] - uv[0][1]);
          const i = (Math.floor((w / 16) * raw.height) * raw.width + Math.floor((u / 16) * raw.width)) * 4;
          return [...raw.data.slice(i, i + 3)];
        }
        return { direction: d, pillow: pixel(1), join: pixel(-1) };
      });
  });
  for (const s of samples) {
    expect(Math.min(...s.pillow), s.direction + ' pillow').toBeGreaterThan(150);
    expect(s.join[0], s.direction + ' red join').toBeGreaterThan(s.join[1] * 2);
  }
});
