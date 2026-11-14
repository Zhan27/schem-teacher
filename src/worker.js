import { parseSchematic } from './schematic.js';
import { buildPlan } from './planner.js';
import { readResourceArchive } from './resources.js';
self.onmessage = async ({ data }) => {
  try {
    let result;
    if (data.type === 'import') {
      self.postMessage({ progress: '读取并验证图纸…' });
      const model = await parseSchematic(new Uint8Array(data.buffer), data.name);
      self.postMessage({ progress: '生成初始施工方案…' });
      result = { model };
    } else if (data.type === 'plan') result = buildPlan(data.model, data.settings, data.regions);
    else if (data.type === 'resources') {
      self.postMessage({ progress: '读取本地方块资源…' });
      result = readResourceArchive(new Uint8Array(data.buffer));
    } else throw Error('未知计算任务');
    self.postMessage({ result });
  } catch (e) {
    self.postMessage({ error: e.message || String(e) });
  }
};
