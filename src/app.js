import { gzipSync, gunzipSync } from 'fflate';
import { parseSchematic, position, validateModel } from './schematic.js';
import {
  boxOf,
  buildPlan,
  defaultSettings,
  inBox,
  sumItems,
  validateRegions,
  validateSettings,
  decode,
} from './planner.js';
import { demoSchematic } from './demo.js';
import { defaultMaterials, importMaterials, packMaterials, unpackMaterials } from './materials.js';
import { Viewer } from './viewer.js';
const $ = (id) => document.getElementById(id),
  esc = (v) =>
    String(v).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
const names = {
  stone_bricks: '石砖',
  mossy_stone_bricks: '苔石砖',
  cracked_stone_bricks: '裂纹石砖',
  stone_brick_slab: '石砖台阶',
  stone_brick_stairs: '石砖楼梯',
  oak_planks: '橡木木板',
  oak_log: '橡木原木',
  oak_door: '橡木门',
  deepslate_tiles: '深板岩瓦',
  chest: '箱子',
  crafting_table: '工作台',
  glass: '玻璃',
  cobblestone: '圆石',
  spruce_planks: '云杉木板',
  dark_oak_planks: '深色橡木木板',
  polished_andesite: '磨制安山岩',
  lantern: '灯笼',
  soul_lantern: '灵魂灯笼',
  ladder: '梯子',
  iron_bars: '铁栏杆',
  flower_pot: '花盆',
};
const itemName = (id) => names[id.split(':').pop()] || id;
let model = null,
  plan = null,
  settings = null,
  regions = [],
  done = new Set(),
  history = [],
  taskIndex = 0,
  groupIndex = 0,
  materials = null,
  viewer = null,
  picked = null,
  mapFrame = null,
  mapSelection = null,
  playing = false,
  timer = null,
  jobWorker = null,
  jobReject = null,
  saveTimer = null;
const storageKey = () => 'schem-teacher:v1:' + model.hash;
const task = () => plan?.tasks[Math.max(0, Math.min(taskIndex, plan.tasks.length - 1))];
const activeOps = () => {
  const t = task();
  return !t ? [] : $('granularity').value === 'group' ? t.runs[groupIndex] || [] : t.ops;
};
const pendingOps = () => activeOps().filter((i) => !done.has(plan.ops[i].id));
const say = (s, error = false) => {
  $('status').textContent = s;
  $('status').style.color = error ? '#8c3f35' : '';
};
function download(name, body, type) {
  const url = URL.createObjectURL(new Blob([body], { type })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function serialize() {
  return {
    format: 'schem-teacher',
    version: 1,
    model,
    settings,
    regions,
    done: [...done],
    taskIndex,
    groupIndex,
    assets: packMaterials(materials),
    view: {
      cut: Number($('cut').value),
      granularity: $('granularity').value,
      refs: $('showReferences').checked,
      future: $('showFuture').checked,
    },
  };
}
function localSnapshot() {
  return { settings, regions, done: [...done], taskIndex, groupIndex };
}
function flush() {
  clearTimeout(saveTimer);
  if (!model) return;
  try {
    localStorage.setItem(storageKey(), JSON.stringify(localSnapshot()));
    $('storageStatus').textContent = '进度已保存在本机；导入同一图纸可恢复';
  } catch {
    $('storageStatus').textContent = '本机存储已满，请保存项目或导出网页';
  }
}
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 180);
}
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stop();
    flush();
  }
});
async function job(data, transfer = []) {
  if (jobWorker) throw Error('请等待当前任务或先取消');
  $('busy').hidden = false;
  $('busyText').textContent = '正在本地计算…';
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' })),
      worker = new Worker(url);
    jobWorker = worker;
    jobReject = reject;
    const finish = () => {
      worker.terminate();
      URL.revokeObjectURL(url);
      jobWorker = null;
      jobReject = null;
      $('busy').hidden = true;
    };
    worker.onmessage = ({ data }) => {
      if (data.progress) {
        $('busyText').textContent = data.progress;
        return;
      }
      finish();
      data.error ? reject(Error(data.error)) : resolve(data.result);
    };
    worker.onerror = (e) => {
      finish();
      reject(Error(e.message || '本地计算失败'));
    };
    worker.postMessage(data, transfer);
  });
}
$('cancelJob').onclick = () => {
  jobWorker?.terminate();
  jobWorker = null;
  jobReject?.(Error('已取消，本次导入未应用'));
  jobReject = null;
  $('busy').hidden = true;
};
async function replan() {
  if (!model) return;
  stop();
  validateSettings(settings, model);
  validateRegions(regions, model);
  plan = await job({ type: 'plan', model, settings, regions });
  const valid = new Set(plan.ops.map((o) => o.id));
  done = new Set([...done].filter((x) => valid.has(x)));
  taskIndex = Math.min(taskIndex, plan.tasks.length - 1);
  groupIndex = 0;
  update();
  save();
}
function readSettings() {
  for (const id of [
    'strategy',
    'band',
    'groundY',
    'sourceX',
    'sourceZ',
    'worldX',
    'worldY',
    'worldZ',
    'rotation',
  ])
    $(id).value = settings[id];
  $('deferBasement').checked = settings.deferBasement;
}
function restoreProgress(raw) {
  if (!raw) return;
  validateSettings(raw.settings, model);
  validateRegions(raw.regions || [], model);
  if (
    !Array.isArray(raw.done) ||
    raw.done.length > model.cells.length ||
    raw.done.some((x) => typeof x !== 'string')
  )
    throw Error('进度列表无效');
  settings = { ...raw.settings };
  regions = raw.regions;
  done = new Set(raw.done);
  taskIndex = Number.isInteger(raw.taskIndex) ? Math.max(0, raw.taskIndex) : 0;
  groupIndex = 0;
}
async function acceptModel(m, snapshot) {
  validateModel(m);
  stop();
  model = m;
  settings = defaultSettings(m);
  regions = [];
  done = new Set();
  history = [];
  taskIndex = groupIndex = 0;
  picked = null;
  mapSelection = null;
  if (snapshot) restoreProgress(snapshot);
  else
    try {
      const raw = localStorage.getItem(storageKey());
      if (raw) restoreProgress(JSON.parse(raw));
    } catch {
      say('旧本机进度无法读取；图纸已正常导入', true);
    }
  materials = snapshot?.assets ? await unpackMaterials(snapshot.assets) : defaultMaterials(model);
  readSettings();
  $('cut').max = model.dimensions[1] - 1;
  $('cut').value = model.dimensions[1] - 1;
  $('boxY0').value = 0;
  $('boxY1').value = model.dimensions[1] - 1;
  $('boxX0').value = $('boxZ0').value = 0;
  $('boxX1').value = model.dimensions[0] - 1;
  $('boxZ1').value = model.dimensions[2] - 1;
  const previous = $('scene'),
    clone = previous.cloneNode();
  previous.replaceWith(clone);
  if (viewer?.renderer) {
    viewer.renderer.renderer.dispose();
    viewer.renderer.atlas?.dispose();
  }
  viewer = new Viewer(clone, inspect);
  viewer.setMaterials(materials);
  viewer.onDraw = drawDimensions;
  $('welcome').hidden = true;
  $('workspace').hidden = false;
  await replan();
  if (snapshot?.view) {
    const v = snapshot.view;
    $('cut').value = Math.max(0, Math.min(model.dimensions[1] - 1, Number(v.cut)));
    $('granularity').value = ['group', 'package'].includes(v.granularity) ? v.granularity : 'package';
    $('showReferences').checked = v.refs !== false;
    $('showFuture').checked = v.future === true;
    update();
  }
  say('图纸已载入，先确认地面与朝向，再调整分区。文件仅在本机处理。');
}
async function loadFile(file) {
  if (!file) return;
  try {
    const buffer = await file.arrayBuffer(),
      result = await job({ type: 'import', name: file.name, buffer }, [buffer]);
    await acceptModel(result.model);
  } catch (e) {
    say(e.message, true);
  }
}
const guard =
  (fn) =>
  async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      say(e.message || String(e), true);
    }
  };
for (const id of ['openFile', 'welcomeFile']) $(id).onclick = () => $('schemFile').click();
$('schemFile').onchange = () => loadFile($('schemFile').files[0]);
for (const [id, kind] of [
  ['demoHouse', 'house'],
  ['demoTower', 'tower'],
  ['demoBasement', 'basement'],
])
  $(id).onclick = guard(async () => {
    const bytes = demoSchematic(kind),
      buffer = bytes.buffer,
      result = await job(
        {
          type: 'import',
          buffer,
          name:
            kind === 'house' ? '工坊小屋.schem' : kind === 'tower' ? '工坊塔楼.schem' : '带地下室小屋.schem',
        },
        [buffer],
      );
    await acceptModel(result.model);
  });
$('projectOpen').onclick = () => $('projectFile').click();
$('projectFile').onchange = guard(async () => {
  const file = $('projectFile').files[0];
  if (!file) return;
  if (file.size > 128 * 1024 * 1024) throw Error('项目文件过大');
  const s = JSON.parse(await file.text());
  if (s.format !== 'schem-teacher' || s.version !== 1) throw Error('不是本工具的项目文件');
  await acceptModel(s.model, s);
});
$('saveProject').onclick = () => {
  if (!model) return say('请先导入图纸');
  flush();
  download(model.name + '-教学项目.json', JSON.stringify(serialize()), 'application/json');
};
$('importResources').onclick = () => $('resourcesFile').click();
$('resourcesFile').onchange = guard(async () => {
  const f = $('resourcesFile').files[0];
  if (!f || !model) return;
  const buffer = await f.arrayBuffer(),
    files = await job({ type: 'resources', buffer }, [buffer]);
  $('busy').hidden = false;
  $('busyText').textContent = '处理方块模型与材质…';
  let next;
  try {
    next = await importMaterials(model, files);
  } finally {
    $('busy').hidden = true;
  }
  materials = next;
  const previous = $('scene'),
    clone = previous.cloneNode();
  previous.replaceWith(clone);
  if (viewer.renderer) {
    viewer.renderer.renderer.dispose();
    viewer.renderer.atlas?.dispose();
  }
  viewer = new Viewer(clone, inspect);
  viewer.setMaterials(materials);
  viewer.onDraw = drawDimensions;
  update();
  say('本机材质已载入；' + materials.missing.length + '种状态仍使用示意模型。');
});
function switchTask(i) {
  stop();
  taskIndex = Math.max(0, Math.min(plan.tasks.length - 1, i));
  groupIndex = 0;
  mapSelection = null;
  viewer.reset();
  update();
  save();
}
function stop() {
  playing = false;
  clearInterval(timer);
  $('playPreview').textContent = '预演 ▶';
}
function setGroup(i) {
  groupIndex = Math.max(0, Math.min(task().runs.length - 1, i));
  update();
  save();
}
$('prevTask').onclick = () => model && switchTask(taskIndex - 1);
$('nextTask').onclick = () => model && switchTask(taskIndex + 1);
$('prevGroup').onclick = () => {
  stop();
  setGroup(groupIndex - 1);
};
$('nextGroup').onclick = () => {
  stop();
  setGroup(groupIndex + 1);
};
$('groupSeek').oninput = () => {
  stop();
  setGroup(Number($('groupSeek').value));
};
$('granularity').onchange = () => {
  stop();
  groupIndex = 0;
  update();
};
$('playPreview').onclick = () => {
  if (!model) return;
  if (playing) {
    stop();
    update();
    return;
  }
  $('granularity').value = 'group';
  playing = true;
  $('playPreview').textContent = '停止预演 ❚❚';
  update();
  timer = setInterval(() => {
    if (groupIndex >= task().runs.length - 1) {
      stop();
      update();
    } else {
      groupIndex++;
      update();
    }
  }, 1100);
};
for (const id of ['strategy', 'band', 'deferBasement'])
  $(id).onchange = guard(async () => {
    if (!model) return;
    settings.strategy = $('strategy').value;
    settings.band = Number($('band').value);
    settings.deferBasement = $('deferBasement').checked;
    await replan();
  });
for (const id of ['groundY', 'sourceX', 'sourceZ', 'worldX', 'worldY', 'worldZ', 'rotation'])
  $(id).onchange = guard(async () => {
    if (!model) return;
    const next = { ...settings, [id]: $(id).value === '' ? '' : Number($(id).value) };
    validateSettings(next, model);
    settings = next;
    if (id === 'groundY') await replan();
    else {
      update();
      save();
    }
  });
for (const id of ['cut', 'showReferences', 'showFuture']) $(id).oninput = () => model && update();
$('zoomIn').onclick = () => {
  if (viewer) {
    viewer.zoom = Math.min(8, viewer.zoom * 1.12);
    drawScene();
  }
};
$('zoomOut').onclick = () => {
  if (viewer) {
    viewer.zoom = Math.max(0.3, viewer.zoom / 1.12);
    drawScene();
  }
};
$('fitView').onclick = () => {
  viewer?.reset();
  drawScene();
};
$('expandView').onclick = () => {
  $('scene').parentElement.classList.toggle('expanded');
  drawScene();
};
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    $('scene').parentElement.classList.remove('expanded');
    drawScene();
  }
});
$('complete').onclick = () => {
  if (!model) return;
  stop();
  const added = pendingOps().map((i) => plan.ops[i].id);
  if (added.length) {
    added.forEach((id) => done.add(id));
    history.push(added);
    if (history.length > 50) history.shift();
  }
  if ($('granularity').value === 'group' && groupIndex < task().runs.length - 1) groupIndex++;
  else if (taskIndex < plan.tasks.length - 1) {
    taskIndex++;
    groupIndex = 0;
  }
  update();
  save();
};
$('undo').onclick = () => {
  stop();
  const last = history.pop();
  if (last) {
    last.forEach((id) => done.delete(id));
    const ti = plan.tasks.findIndex((t) => t.ops.some((i) => plan.ops[i].id === last[0]));
    if (ti >= 0) {
      taskIndex = ti;
      groupIndex = Math.max(
        0,
        task().runs.findIndex((run) => run.some((i) => plan.ops[i].id === last[0])),
      );
    }
  }
  update();
  save();
};
function world(b) {
  if (
    ['worldX', 'worldY', 'worldZ'].some((k) => settings[k] === '' || !Number.isInteger(Number(settings[k])))
  )
    return null;
  let x = b[0] - settings.sourceX,
    z = b[2] - settings.sourceZ;
  for (let i = 0; i < settings.rotation; i++) [x, z] = [-z, x];
  return [
    Number(settings.worldX) + x,
    Number(settings.worldY) + b[1] - settings.groundY,
    Number(settings.worldZ) + z,
  ];
}
function inspect(b) {
  picked = b;
  const s = model.palette[b[3]],
    w = world(b);
  $('inspector').hidden = false;
  $('inspector').textContent =
    itemName(s.split('[')[0]) +
    ' · 原图 ' +
    b.slice(0, 3).join(' / ') +
    (w ? ' · 游戏 ' + w.join(' / ') : '') +
    ' · ' +
    s;
  $('groundFromPick').disabled = false;
}
$('groundFromPick').onclick = guard(async () => {
  if (!picked) return;
  settings.groundY = picked[1];
  settings.sourceX = picked[0];
  settings.sourceZ = picked[2];
  readSettings();
  await replan();
  say('地面基准已设为所选方块；请填写它在游戏中的对应坐标。');
});
function table(items) {
  return (
    '<table class="table"><thead><tr><th>物品</th><th>数量</th></tr></thead><tbody>' +
    Object.entries(items)
      .sort((a, b) => b[1] - a[1])
      .map(
        ([id, n]) =>
          '<tr><td title="' +
          esc(id) +
          '">' +
          esc(itemName(id)) +
          '</td><td>' +
          n +
          (n >= 64 ? '（' + Math.floor(n / 64) + '组' + (n % 64 ? '＋' + (n % 64) : '') + '）' : '') +
          '</td></tr>',
      )
      .join('') +
    '</tbody></table>'
  );
}
function update() {
  if (!plan) return;
  const t = task(),
    ids = activeOps(),
    pending = pendingOps(),
    doneCells = plan.ops.filter((o) => done.has(o.id)).reduce((n, o) => n + o.cells.length, 0);
  $('projectTitle').textContent = model.name;
  $('modelMeta').textContent =
    model.dimensions.join(' × ') +
    ' · ' +
    model.cells.length.toLocaleString() +
    '格 · Sponge v3 · 数据版本 ' +
    model.dataVersion +
    ' · 偏移 ' +
    model.offset.join('/');
  $('progressText').textContent =
    '已确认 ' + doneCells.toLocaleString() + ' / ' + model.cells.length.toLocaleString() + ' 格';
  $('progressBar').style.width = (doneCells / model.cells.length) * 100 + '%';
  $('taskTitle').innerHTML = esc(t.title).replace(/y-?\d+–-?\d+/, '<span class="layer">$&</span>');
  $('taskPart').textContent = t.stage === 2 ? '地下部分后建' : t.stage === 1 ? '细节与内装' : '主体施工';
  $('taskPosition').textContent = taskIndex + 1 + ' / ' + plan.tasks.length;
  $('taskTotal').textContent = plan.tasks.length + ' 段';
  $('taskList').innerHTML = plan.tasks
    .map(
      (t, i) =>
        '<button data-task="' +
        i +
        '" class="' +
        (i === taskIndex ? 'active ' : '') +
        (t.ops.every((oi) => done.has(plan.ops[oi].id)) ? 'finished' : '') +
        '">' +
        esc(t.title) +
        '<small>' +
        t.count +
        '格 · ' +
        t.runs.length +
        '组</small></button>',
    )
    .join('');
  for (const e of $('taskList').querySelectorAll('[data-task]'))
    e.onclick = () => switchTask(Number(e.dataset.task));
  $('prevTask').disabled = taskIndex === 0;
  $('nextTask').disabled = taskIndex === plan.tasks.length - 1;
  $('groupControls').hidden = $('granularity').value !== 'group';
  $('groupSeek').max = t.runs.length - 1;
  $('groupSeek').value = groupIndex;
  $('groupPosition').textContent = groupIndex + 1 + ' / ' + t.runs.length + '组';
  $('prevGroup').disabled = groupIndex === 0;
  $('nextGroup').disabled = groupIndex === t.runs.length - 1;
  $('materials').innerHTML = table(sumItems(pending.map((i) => plan.ops[i])));
  const bs = ids.flatMap((i) => plan.ops[i].cells.map((ci) => model.cells[ci])),
    b = boxOf(bs.length ? bs : t.ops.flatMap((i) => plan.ops[i].cells.map((ci) => model.cells[ci])));
  $('rangeText').textContent =
    '实际目标 ' +
    bs.length +
    ' 格；外接范围 ' +
    (b[1] - b[0]) +
    ' × ' +
    (b[5] - b[4]) +
    ' 格，高 ' +
    (b[3] - b[2]) +
    ' 层。空位保持留空。';
  $('groundText').textContent =
    '地面方块：原图y' +
    settings.groundY +
    '；行走面在y' +
    (Number(settings.groundY) + 1) +
    '。' +
    (playing ? '正在预演，不登记实际完成。' : '');
  $('textureNote').textContent = materials.authentic
    ? '本机导入的原版材质；' + materials.missing.length + '种方块使用示意模型。'
    : '自制示意材质。导入本机客户端.jar或资源包.zip，可使用原始纹理与模型。';
  $('textureNote').title = materials.missing?.join('、') || '';
  $('warnings').hidden = !t.warnings.length;
  $('warnings').textContent = t.warnings.slice(0, 3).join('；');
  $('pendingText').textContent = '待放 ' + pending.length + ' 次';
  $('complete').textContent = $('granularity').value === 'group' ? '登记本组完成 →' : '登记本段完成 →';
  $('complete').disabled = !pending.length;
  $('undo').disabled = !history.length;
  $('cutValue').textContent = 'y≤' + $('cut').value;
  const ys = [...new Set(t.ops.flatMap((i) => plan.ops[i].cells.map((ci) => model.cells[ci][1])))].sort(
      (a, b) => a - b,
    ),
    previous = Number($('mapLayer').value);
  $('mapLayer').innerHTML = ys.map((y) => '<option value="' + y + '">原图 y' + y + '</option>').join('');
  if (ys.includes(previous)) $('mapLayer').value = previous;
  drawScene();
  drawMap();
  renderRegions();
}
function drawScene() {
  if (!viewer || !plan) return;
  const t = task(),
    current = new Set(pendingOps().flatMap((i) => plan.ops[i].cells)),
    actual = new Set(plan.ops.filter((o) => done.has(o.id)).flatMap((o) => o.cells)),
    ref = new Set(),
    before = plan.tasks.slice(0, taskIndex).flatMap((t) => t.ops);
  if ($('granularity').value === 'group') before.push(...t.runs.slice(0, groupIndex).flat());
  const focus = t.bounds;
  if ($('showReferences').checked)
    for (const oi of before)
      for (const ci of plan.ops[oi].cells) {
        const b = model.cells[ci];
        if (
          b[1] <= focus[3] + 1 &&
          b[0] >= focus[0] - 4 &&
          b[0] < focus[1] + 4 &&
          b[2] >= focus[4] - 4 &&
          b[2] < focus[5] + 4
        )
          ref.add(ci);
      }
  if (playing)
    for (const oi of t.runs.slice(0, groupIndex).flat()) for (const ci of plan.ops[oi].cells) actual.add(ci);
  if ($('showFuture').checked) model.cells.forEach((b, i) => ref.add(i));
  for (const ci of actual) ref.delete(ci);
  for (const ci of current) ref.delete(ci);
  const visible = model.cells.filter(
    (b, i) => (current.has(i) || actual.has(i) || ref.has(i)) && b[1] <= Number($('cut').value),
  );
  const bounds = boxOf(
    visible.length ? visible : t.ops.flatMap((i) => plan.ops[i].cells.map((ci) => model.cells[ci])),
  );
  viewer.show(
    visible,
    new Set([...current].map((i) => position(model.cells[i]))),
    new Set([...ref].map((i) => position(model.cells[i]))),
    bounds,
    focus[2] <= Number(settings.groundY) + 1 ? Number(settings.groundY) + 1 : undefined,
  );
  $('renderMode').textContent = viewer.renderer
    ? '3D · 拖动旋转 / Shift平移'
    : '二维备用 · 拖动转向 / Shift平移';
  drawDimensions();
}
function drawDimensions() {
  const c = $('dimensions'),
    scene = $('scene'),
    W = scene.clientWidth,
    H = scene.clientHeight,
    ratio = Math.min(2, devicePixelRatio || 1);
  c.width = W * ratio;
  c.height = H * ratio;
  const ctx = c.getContext('2d');
  ctx.scale(ratio, ratio);
  const bs = activeOps().flatMap((i) => plan.ops[i].cells.map((ci) => model.cells[ci]));
  if (!bs.length) return;
  const b = boxOf(bs),
    P = viewer.renderer?.project || viewer.project;
  if (!P) return;
  const line = (a, z, label) => {
    const A = P(...a),
      B = P(...z);
    ctx.strokeStyle = '#557364';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(...A);
    ctx.lineTo(...B);
    ctx.stroke();
    const x = (A[0] + B[0]) / 2,
      y = (A[1] + B[1]) / 2;
    ctx.font = 'bold 12px Microsoft YaHei';
    const w = ctx.measureText(label).width;
    ctx.fillStyle = '#fffefaee';
    ctx.fillRect(x - w / 2 - 4, y - 10, w + 8, 19);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#294e43';
    ctx.fillText(label, x, y + 4);
  };
  line([b[0], b[2] - 0.3, b[5] + 0.7], [b[1], b[2] - 0.3, b[5] + 0.7], b[1] - b[0] + '格');
  line([b[1] + 0.7, b[2] - 0.3, b[4]], [b[1] + 0.7, b[2] - 0.3, b[5]], b[5] - b[4] + '格');
  if (b[3] - b[2] > 1)
    line([b[1] + 0.5, b[2], b[5] + 0.5], [b[1] + 0.5, b[3], b[5] + 0.5], b[3] - b[2] + '层');
}
function drawMap() {
  if (!model) return;
  const c = $('map'),
    W = c.clientWidth || 300,
    H = W,
    ratio = Math.min(2, devicePixelRatio || 1);
  c.width = W * ratio;
  c.height = H * ratio;
  const ctx = c.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#eaf0e4';
  ctx.fillRect(0, 0, W, H);
  const scale = Math.min((W - 28) / model.dimensions[0], (H - 28) / model.dimensions[2]),
    ox = (W - model.dimensions[0] * scale) / 2,
    oz = (H - model.dimensions[2] * scale) / 2,
    layer = Number($('mapLayer').value),
    lookup = new Map();
  const target = new Set(task().ops.flatMap((i) => plan.ops[i].cells));
  for (let i = 0; i < model.cells.length; i++) {
    const b = model.cells[i];
    if (b[1] !== layer) continue;
    const [x, y] = [ox + b[0] * scale, oz + b[2] * scale],
      tex = materials.textures.get(materials.models[b[3]]?.faces?.[0]?.[2]);
    ctx.fillStyle = tex ? 'rgb(' + [...tex.data.slice(0, 3)].join(',') + ')' : '#a04092';
    ctx.fillRect(x, y, Math.max(1, scale), Math.max(1, scale));
    ctx.strokeStyle = target.has(i) ? '#dfa72c' : '#dce3d6';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x, y, scale, scale);
    lookup.set(b[0] + ',' + b[2], b);
  }
  if (mapSelection) {
    const b = mapSelection;
    ctx.strokeStyle = '#235d50';
    ctx.lineWidth = 2;
    ctx.strokeRect(
      ox + b[0] * scale,
      oz + b[2] * scale,
      (b[1] - b[0] + 1) * scale,
      (b[3] - b[2] + 1) * scale,
    );
  }
  mapFrame = { scale, ox, oz, lookup };
}
$('mapLayer').onchange = drawMap;
let drag = null;
const mapPoint = (e) => {
  const r = $('map').getBoundingClientRect(),
    f = mapFrame;
  return [
    Math.max(0, Math.min(model.dimensions[0] - 1, Math.floor((e.clientX - r.left - f.ox) / f.scale))),
    Math.max(0, Math.min(model.dimensions[2] - 1, Math.floor((e.clientY - r.top - f.oz) / f.scale))),
  ];
};
$('map').onpointerdown = (e) => {
  if (!mapFrame) return;
  drag = mapPoint(e);
  $('map').setPointerCapture(e.pointerId);
};
$('map').onpointermove = (e) => {
  if (!drag) return;
  const p = mapPoint(e);
  mapSelection = [
    Math.min(p[0], drag[0]),
    Math.max(p[0], drag[0]),
    Math.min(p[1], drag[1]),
    Math.max(p[1], drag[1]),
  ];
  drawMap();
};
$('map').onpointerup = (e) => {
  if (!drag) return;
  const p = mapPoint(e);
  if (p[0] === drag[0] && p[1] === drag[1]) {
    const b = mapFrame.lookup.get(p.join(','));
    $('mapInfo').textContent =
      '原图 x' +
      p[0] +
      ' / y' +
      $('mapLayer').value +
      ' / z' +
      p[1] +
      (b ? ' · ' + itemName(model.palette[b[3]].split('[')[0]) : ' · 空位，不放方块');
    if (b) inspect(b);
  } else {
    for (const [id, i] of [
      ['boxX0', 0],
      ['boxX1', 1],
      ['boxZ0', 2],
      ['boxZ1', 3],
    ])
      $(id).value = mapSelection[i];
    $('regionsPanel').open = true;
    $('mapInfo').textContent =
      '已框选 ' +
      (mapSelection[1] - mapSelection[0] + 1) +
      ' × ' +
      (mapSelection[3] - mapSelection[2] + 1) +
      ' 格；填名称后新建分区。';
  }
  drag = null;
};
$('map').onpointercancel = () => (drag = null);
$('addRegion').onclick = guard(async () => {
  if (!model) return;
  const box = [
      Number($('boxX0').value),
      Number($('boxX1').value) + 1,
      Number($('boxY0').value),
      Number($('boxY1').value) + 1,
      Number($('boxZ0').value),
      Number($('boxZ1').value) + 1,
    ],
    r = {
      id: crypto.randomUUID(),
      name: $('regionName').value.trim() || '部位 ' + (regions.length + 1),
      boxes: [box],
    };
  validateRegions([...regions, r], model);
  if (!model.cells.some((b) => inBox(b, box))) throw Error('所选范围没有方块');
  regions.push(r);
  taskIndex = 0;
  await replan();
});
function renderRegions() {
  if (!model) return;
  $('regionList').innerHTML =
    regions
      .map(
        (r, i) =>
          '<div class="region"><b>' +
          esc(r.name) +
          '</b><div class="regionActions"><button data-action="up" data-index="' +
          i +
          '" aria-label="' +
          esc(r.name) +
          '提前">↑</button><button data-action="down" data-index="' +
          i +
          '" aria-label="' +
          esc(r.name) +
          '延后">↓</button><button data-action="rename" data-index="' +
          i +
          '">改名</button><button data-action="merge" data-index="' +
          i +
          '" ' +
          (i === 0 ? 'disabled' : '') +
          '>并入上区</button><button data-action="remove" data-index="' +
          i +
          '">移除分区</button></div></div>',
      )
      .join('') || '<p class="muted">尚未划分部位，先按整座建筑的高度递进。</p>';
  for (const el of $('regionList').querySelectorAll('[data-action]'))
    el.onclick = guard(async () => {
      const i = Number(el.dataset.index),
        action = el.dataset.action;
      if (action === 'remove') regions.splice(i, 1);
      if (action === 'rename') {
        const value = prompt('分区名称', regions[i].name);
        if (value === null) return;
        regions[i].name = value.trim().slice(0, 80) || regions[i].name;
      }
      if (action === 'up' && i > 0) [regions[i - 1], regions[i]] = [regions[i], regions[i - 1]];
      if (action === 'down' && i < regions.length - 1)
        [regions[i + 1], regions[i]] = [regions[i], regions[i + 1]];
      if (action === 'merge' && i > 0) {
        regions[i - 1].boxes.push(...regions[i].boxes);
        regions.splice(i, 1);
      }
      taskIndex = 0;
      await replan();
    });
}
function csv(items) {
  return (
    '\ufeff' +
    [['物品ID', '物品', '数量'], ...Object.entries(items).map(([id, n]) => [id, itemName(id), n])]
      .map((row) => row.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(','))
      .join('\r\n')
  );
}
$('exportMaterials').onclick = () =>
  model && download(model.name + '-材料.csv', csv(plan.items), 'text/csv;charset=utf-8');
function preparePrint() {
  if (!model) return;
  const scene = $('scene'),
    c = document.createElement('canvas');
  c.width = scene.width;
  c.height = scene.height;
  const g = c.getContext('2d');
  g.drawImage(scene, 0, 0);
  g.drawImage($('dimensions'), 0, 0, scene.width, scene.height);
  $('printArea').innerHTML =
    '<p>方块工坊 · ' +
    esc(model.name) +
    '</p><h1>' +
    esc(task().title) +
    '</h1><img src="' +
    c.toDataURL() +
    '" alt="当前施工模型与尺寸"><p>' +
    esc($('rangeText').textContent) +
    '</p><p>' +
    esc($('groundText').textContent) +
    '</p>' +
    table(sumItems(activeOps().map((i) => plan.ops[i]))) +
    '<p>' +
    esc(task().warnings.join('；')) +
    '</p>';
}
window.addEventListener('beforeprint', preparePrint);
$('printButton').onclick = () => {
  if (!model) return say('请先导入图纸');
  preparePrint();
  window.print();
};
function toBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 32768) out += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(out);
}
$('exportHTML').onclick = guard(async () => {
  if (!model) return say('请先导入图纸');
  stop();
  flush();
  const packed = toBase64(gzipSync(new TextEncoder().encode(JSON.stringify(serialize())), { level: 6 })),
    clone = document.documentElement.cloneNode(true);
  clone.querySelector('#runtime')?.remove();
  clone.querySelector('#projectData').textContent = packed;
  clone.querySelector('#printArea').replaceChildren();
  clone.querySelector('#scene').parentElement.classList.remove('expanded');
  clone.querySelector('#busy').hidden = true;
  clone.querySelector('#status').textContent = '正在恢复离线项目…';
  download(model.name + '-离线教学.html', '<!doctype html>\n' + clone.outerHTML, 'text/html;charset=utf-8');
  say('已导出含图纸、当前材质和进度的离线网页。');
});
let resize;
window.addEventListener('resize', () => {
  clearTimeout(resize);
  resize = setTimeout(() => {
    if (model) {
      drawScene();
      drawMap();
    }
  }, 120);
});
async function init() {
  try {
    const packed = $('projectData').textContent.trim();
    if (packed) {
      const data = JSON.parse(
        new TextDecoder().decode(gunzipSync(Uint8Array.from(atob(packed), (c) => c.charCodeAt(0)))),
      );
      if (data.format !== 'schem-teacher' || data.version !== 1) throw Error('内嵌项目版本不支持');
      await acceptModel(data.model, data);
    } else say('导入本地 .schem v3，或先体验自制示例。');
    window.__teacher.ready = true;
  } catch (e) {
    say('加载失败：' + e.message, true);
  }
}
window.__teacher = {
  ready: false,
  getState: () => ({ model, settings, regions, done: [...done], taskIndex, groupIndex, plan, playing }),
  loadFile,
  loadBytes: async (bytes, name) => acceptModel(await parseSchematic(bytes, name)),
  selectTask: switchTask,
  replan,
  viewer: () => viewer,
};
init();
