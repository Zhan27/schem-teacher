import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import english from '../src/locales/en.json' with { type: 'json' };
import { setLocale, t, message, unit } from '../src/i18n.js';
test('translations preserve user values and localize errors and units', () => {
  setLocale('en', false);
  assert.equal(t('导入图纸'), 'Import schematic');
  assert.equal(t('{name}提前', { name: '我的左塔' }), 'Move 我的左塔 earlier');
  assert.equal(unit(1), '1 block');
  assert.equal(unit(3, 'layers'), '3 layers');
  assert.equal(message('分区范围越界'), 'Region bounds are outside the schematic');
  assert.equal(message('不支持的 NBT 标签 90'), 'Unsupported NBT tag 90');
  setLocale('zh', false);
  assert.equal(t('导入图纸'), '导入图纸');
  assert.equal(unit(3, 'layers'), '3层');
});
test('all marked UI text and core validation messages have English translations', async () => {
  const html = await fs.readFile('src/index.html', 'utf8');
  for (const match of html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g))
    assert(Object.hasOwn(english, match[1]), 'Missing translation: ' + match[1]);
  for (const file of ['nbt', 'schematic', 'planner', 'resources', 'worker']) {
    const source = await fs.readFile('src/' + file + '.js', 'utf8');
    for (const match of source.matchAll(/(?:Error|push)\('([^']*[\u3400-\u9fff][^']*)'\)/g))
      assert(Object.hasOwn(english, match[1]), 'Missing validation translation: ' + match[1]);
  }
});
