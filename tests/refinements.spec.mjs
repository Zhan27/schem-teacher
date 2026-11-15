import { test, expect } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const entry = pathToFileURL(path.resolve('dist/index.html')).href;
const ready = (p) => p.waitForFunction(() => window.__teacher?.ready);
const loaded = (p) =>
  p.waitForFunction(() => window.__teacher.getState().plan && document.querySelector('#busy').hidden);
test('English covers lessons and print, survives offline export without losing current group', async ({
  page,
  browser,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(entry);
  await ready(page);
  await page.locator('#language').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#openFile')).toHaveText('Import schematic');
  await page.locator('#demoHouse').click();
  await loaded(page);
  await expect(page.locator('#taskTitle')).toContainText('Structure');
  await expect(page.locator('#materials')).toContainText('Stone Bricks');
  await page.locator('#complete').click();
  const done = await page.evaluate(() => window.__teacher.getState().done);
  await page.locator('#granularity').selectOption('group');
  await page.locator('#nextGroup').click();
  await page.locator('#nextGroup').click();
  const group = await page.evaluate(() => window.__teacher.getState().groupIndex);
  await page.locator('#zoomIn').click();
  const pose = await page.evaluate(() => window.__teacher.viewer().getPose());
  await page.locator('#language').selectOption('zh');
  expect(await page.evaluate(() => window.__teacher.getState().done)).toEqual(done);
  expect(await page.evaluate(() => window.__teacher.getState().groupIndex)).toBe(group);
  await page.locator('#language').selectOption('en');
  const pending = page.waitForEvent('download');
  await page.locator('#exportHTML').click();
  const download = await pending,
    out = info.outputPath('english.html');
  await download.saveAs(out);
  const c = await browser.newContext({ offline: true }),
    p = await c.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(pathToFileURL(out).href);
  await ready(p);
  await expect(p.locator('html')).toHaveAttribute('lang', 'en');
  expect(await p.evaluate(() => window.__teacher.getState().groupIndex)).toBe(group);
  expect(await p.evaluate(() => window.__teacher.getState().done)).toEqual(done);
  expect(await p.evaluate(() => window.__teacher.viewer().getPose())).toEqual(pose);
  await p.pdf({ path: info.outputPath('english.pdf'), format: 'A4' });
  await expect(p.locator('#printArea')).toContainText('Schem Teacher');
  await expect(p.locator('#printArea')).toContainText('Quantity');
  await c.close();
  for (const width of [1600, 820, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(140);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  await page.screenshot({ path: info.outputPath('english-mobile.png'), fullPage: true });
  await page
    .locator('#schemFile')
    .setInputFiles({ name: 'bad.schem', mimeType: 'application/octet-stream', buffer: Buffer.from('bad') });
  await expect(page.locator('#status')).toContainText(/NBT|file/i);
  expect(await page.locator('#status').textContent()).not.toMatch(/[\u3400-\u9fff]/);
  expect(errors).toEqual([]);
});
test('rejecting an invalid project preserves the loaded model, plan and progress', async ({ page }) => {
  await page.goto(entry);
  await ready(page);
  await page.locator('#demoHouse').click();
  await loaded(page);
  await page.locator('#complete').click();
  const before = await page.evaluate(() => window.__teacher.getState());
  const invalid = {
    format: 'schem-teacher',
    version: 1,
    model: { ...before.model, name: 'Should not replace current project' },
    settings: before.settings,
    regions: [{ id: 'bad', name: 'Broken', boxes: [[0, 999, 0, 999, 0, 999]] }],
    done: [],
    taskIndex: 0,
  };
  await page
    .locator('#projectFile')
    .setInputFiles({
      name: 'bad-project.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(invalid)),
    });
  await expect(page.locator('#status')).toContainText(/分区|region/i);
  const after = await page.evaluate(() => window.__teacher.getState());
  expect(after.model).toEqual(before.model);
  expect(after.plan).toEqual(before.plan);
  expect(after.done).toEqual(before.done);
});
test('language preference, user region names and reference geometry survive switches', async ({ page }) => {
  await page.goto(entry + '?lang=en');
  await ready(page);
  await expect(page.locator('#language')).toHaveValue('en');
  await page.locator('#demoHouse').click();
  await loaded(page);
  await page.locator('#boxX1').fill('8');
  await page.locator('#regionName').fill('我的左塔');
  await page.locator('#addRegion').click();
  await page.waitForFunction(
    () => window.__teacher.getState().regions.length === 1 && document.querySelector('#busy').hidden,
  );
  await page.locator('#language').selectOption('zh');
  await expect(page.locator('#regionList')).toContainText('我的左塔');
  await page.locator('#language').selectOption('en');
  await expect(page.locator('#regionList')).toContainText('我的左塔');
  await page.evaluate(() => window.__teacher.selectTask(1));
  expect(
    await page.evaluate(() => {
      const { model, plan, taskIndex } = window.__teacher.getState(),
        allowed = new Set(
          plan.tasks
            .slice(0, taskIndex)
            .flatMap((t) =>
              t.ops.flatMap((i) => plan.ops[i].cells.map((ci) => model.cells[ci].slice(0, 3).join(','))),
            ),
        ),
        keys = [...window.__teacher.viewer().data.ghosts];
      return keys.length > 0 && keys.every((k) => allowed.has(k));
    }),
  ).toBe(true);
  await page.goto(entry);
  await ready(page);
  await expect(page.locator('#language')).toHaveValue('en');
});
