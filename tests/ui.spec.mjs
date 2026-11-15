import { test, expect } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import { zipSync } from 'fflate';
const entry = pathToFileURL(path.resolve('dist/index.html')).href;
const ready = (p) => p.waitForFunction(() => window.__teacher?.ready);
const loaded = (p) =>
  p.waitForFunction(() => window.__teacher.getState().plan && document.querySelector('#busy').hidden);
test('local import, region editing, completion, export, print and mobile', async ({
  page,
  browser,
}, info) => {
  const errors = [],
    outbound = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (/^https?:/.test(r.url())) outbound.push(r.url());
  });
  await page.goto(entry);
  await ready(page);
  await page.locator('#schemFile').setInputFiles('examples/house.schem');
  await loaded(page);
  expect(await page.evaluate(() => window.__teacher.getState().model.cells.length)).toBe(1228);
  await page.locator('#complete').click();
  const done = await page.evaluate(() => window.__teacher.getState().done.length);
  expect(done).toBeGreaterThan(100);
  await page.locator('#undo').click();
  expect(await page.evaluate(() => window.__teacher.getState().done.length)).toBe(0);
  await page.locator('#complete').click();
  await page.locator('#boxX1').fill('8');
  await page.locator('#regionName').fill('左屋');
  await page.locator('#addRegion').click();
  await page.waitForFunction(
    () => window.__teacher.getState().regions.length === 1 && document.querySelector('#busy').hidden,
  );
  expect(await page.evaluate(() => window.__teacher.getState().done.length)).toBe(done);
  await page.locator('#boxX0').fill('9');
  await page.locator('#boxX1').fill('16');
  await page.locator('#regionName').fill('右屋');
  await page.locator('#addRegion').click();
  await page.waitForFunction(
    () => window.__teacher.getState().regions.length === 2 && document.querySelector('#busy').hidden,
  );
  await page.locator('[data-action=merge]').last().click();
  await page.waitForFunction(
    () => window.__teacher.getState().regions.length === 1 && document.querySelector('#busy').hidden,
  );
  const previewBefore = await page.evaluate(() => window.__teacher.getState().done);
  await page.locator('#playPreview').click();
  await page.waitForTimeout(1250);
  await page.locator('#playPreview').click();
  expect(await page.evaluate(() => window.__teacher.getState().done)).toEqual(previewBefore);
  await page.locator('#cut').fill('5');
  await page.locator('#cut').dispatchEvent('input');
  let pending = page.waitForEvent('download');
  await page.locator('#exportHTML').click();
  const file = await pending,
    output = info.outputPath('offline.html');
  await file.saveAs(output);
  expect((await fs.stat(output)).size).toBeLessThan(4000000);
  const context = await browser.newContext({ offline: true }),
    fresh = await context.newPage();
  fresh.on('pageerror', (e) => errors.push(e.message));
  await fresh.goto(pathToFileURL(output).href);
  await ready(fresh);
  expect(await fresh.evaluate(() => window.__teacher.getState().done.length)).toBe(done);
  expect(await fresh.locator('#cut').inputValue()).toBe('5');
  await fresh.pdf({ path: info.outputPath('print.pdf'), format: 'A4' });
  expect(await fresh.locator('#printArea img').count()).toBe(1);
  expect((await fresh.locator('#printArea').textContent()).length).toBeGreaterThan(60);
  expect(await fresh.locator('#printArea tr').count()).toBeGreaterThan(1);
  await context.close();
  for (const width of [1600, 1280, 820, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  await page.screenshot({ path: info.outputPath('mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
  expect(outbound).toEqual([]);
});
test('no WebGL fallback and invalid imports do not blank the application', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    window.__attempts = 0;
    HTMLCanvasElement.prototype.getContext = function (t, ...a) {
      if (t.includes('webgl')) {
        window.__attempts++;
        return null;
      }
      return original.call(this, t, ...a);
    };
  });
  await page.goto(entry);
  await ready(page);
  await page.locator('#demoTower').click();
  await loaded(page);
  await expect(page.locator('#scene')).toHaveAttribute('data-renderer', '2d-fallback');
  await page.locator('#granularity').selectOption('group');
  await page.locator('#nextGroup').click();
  expect(
    await page.evaluate(() => Number(document.querySelector('#scene').dataset.rendered)),
  ).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__attempts)).toBe(1);
  const prior = await page.locator('#projectTitle').textContent();
  await page.locator('#schemFile').setInputFiles({
    name: 'bad.schem',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('not nbt'),
  });
  await expect(page.locator('#status')).toContainText(/NBT|文件/);
  expect(await page.locator('#projectTitle').textContent()).toBe(prior);
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('fallback.png') });
});
test('texture-only resource pack inherits vanilla models, exports and restores defaults', async ({
  page,
  browser,
}, info) => {
  await page.goto(entry);
  await ready(page);
  await page.locator('#demoTower').click();
  await loaded(page);
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d');
    g.fillStyle = '#77aa77';
    g.fillRect(0, 0, 16, 16);
    return c.toDataURL().split(',')[1];
  });
  const pack = zipSync({
    'assets/minecraft/textures/block/stone_bricks.png': new Uint8Array(Buffer.from(png, 'base64')),
  });
  await page
    .locator('#resourcesFile')
    .setInputFiles({ name: 'test-resource.zip', mimeType: 'application/zip', buffer: Buffer.from(pack) });
  await expect(page.locator('#textureNote')).toContainText('自定义材质 · 原版资源补齐');
  const pending = page.waitForEvent('download');
  await page.locator('#exportHTML').click();
  const file = await pending,
    output = info.outputPath('textured.html');
  await file.saveAs(output);
  const context = await browser.newContext({ offline: true }),
    p = await context.newPage();
  await p.goto(pathToFileURL(output).href);
  await ready(p);
  await expect(p.locator('#textureNote')).toContainText('自定义材质');
  const saving = p.waitForEvent('download');
  await p.locator('#saveProject').click();
  const saved = await saving,
    jsonFile = info.outputPath('custom.json');
  await saved.saveAs(jsonFile);
  const project = JSON.parse(await fs.readFile(jsonFile, 'utf8'));
  expect(project.assets.source).toBe('custom');
  const raw = project.assets.textures.find(([id]) => id === 'minecraft:block/stone_bricks')[1];
  expect(
    await p.evaluate(async (url) => {
      const im = new Image();
      im.src = url;
      await im.decode();
      const c = document.createElement('canvas');
      c.width = c.height = 16;
      const g = c.getContext('2d');
      g.drawImage(im, 0, 0);
      return [...g.getImageData(0, 0, 1, 1).data];
    }, raw),
  ).toEqual([119, 170, 119, 255]);
  const pose = await p.evaluate(() => window.__teacher.viewer().getPose());
  await p.locator('#resetResources').click();
  await expect(p.locator('#textureNote')).toContainText('内置原版材质');
  expect(await p.evaluate(() => window.__teacher.viewer().getPose())).toEqual(pose);
  await context.close();
});
