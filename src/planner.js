import { position } from './schematic.js';
export const stateOf = (m, b) => m.palette[b[3]];
export function decode(s) {
  const [id, tail = ''] = s.split('[');
  return {
    id,
    props: Object.fromEntries(
      tail
        .replace(']', '')
        .split(',')
        .filter(Boolean)
        .map((p) => p.split('=')),
    ),
  };
}
export function boxOf(bs) {
  const box = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  for (const b of bs)
    for (let i = 0; i < 3; i++) {
      box[i * 2] = Math.min(box[i * 2], b[i]);
      box[i * 2 + 1] = Math.max(box[i * 2 + 1], b[i] + 1);
    }
  return box;
}
export const inBox = (b, q) =>
  b[0] >= q[0] && b[0] < q[1] && b[1] >= q[2] && b[1] < q[3] && b[2] >= q[4] && b[2] < q[5];
export function itemFor(id) {
  return id
    .replace(/_wall_(banner|sign|hanging_sign)$/, '_$1')
    .replace('minecraft:wall_torch', 'minecraft:torch')
    .replace('minecraft:soul_wall_torch', 'minecraft:soul_torch')
    .replace('minecraft:redstone_wall_torch', 'minecraft:redstone_torch')
    .replace('minecraft:tripwire', 'minecraft:string');
}
const detail = (id) =>
  /(_door|_bed|ladder|vine|torch|lantern|chain|banner|button|carpet|potted_|flower_pot|chest|barrel|bookshelf|furnace|crafting_table|iron_bars|glass_pane|bell)/.test(
    id,
  );
const family = (s) =>
  /^minecraft:(stone_bricks|mossy_stone_bricks|cracked_stone_bricks)$/.test(s) ? 'brick-family' : s;
const dirs = { north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0] };
export function makeOperations(m) {
  const at = new Map(m.cells.map((b, i) => [position(b), i])),
    claimed = new Set(),
    ops = [];
  for (let ci = 0; ci < m.cells.length; ci++) {
    if (claimed.has(ci)) continue;
    const b = m.cells[ci],
      { id, props } = decode(stateOf(m, b)),
      cells = [ci],
      warnings = [];
    let paired = null;
    if (id.endsWith('_door')) {
      paired = at.get([b[0], b[1] + (props.half === 'upper' ? -1 : 1), b[2]].join(','));
    }
    if (id.endsWith('_bed')) {
      const delta = dirs[props.facing];
      if (delta)
        paired = at.get(
          b
            .slice(0, 3)
            .map((v, k) => v + delta[k] * (props.part === 'head' ? -1 : 1))
            .join(','),
        );
    }
    if (paired !== null) {
      if (
        paired !== undefined &&
        paired !== ci &&
        decode(stateOf(m, m.cells[paired])).id === id &&
        !claimed.has(paired)
      )
        cells.push(paired);
      else warnings.push('门/床缺少匹配的另一半，需在游戏内核对');
    }
    cells.forEach((i) => claimed.add(i));
    const anchor = cells.reduce((a, i) => (m.cells[i][1] < m.cells[a][1] ? i : a), ci),
      items = Object.create(null);
    if (id.startsWith('minecraft:potted_')) {
      items['minecraft:flower_pot'] = 1;
      items['minecraft:' + id.slice(17).replace(/_bush$/, '')] = 1;
    } else items[itemFor(id)] = props.type === 'double' && id.endsWith('_slab') ? 2 : 1;
    if (!id.startsWith('minecraft:')) warnings.push('模组方块：请确认客户端和物品ID');
    if (id === 'minecraft:water' || id === 'minecraft:lava')
      warnings.push('液体按原图占用格展示；创造模式放置，非生存桶数清单');
    ops.push({
      id: position(m.cells[anchor]),
      anchor,
      cells,
      items,
      detail: detail(id),
      warnings,
      required: [],
    });
  }
  const owner = new Map(ops.flatMap((o, i) => o.cells.map((ci) => [position(m.cells[ci]), i])));
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i],
      b = m.cells[o.anchor],
      { id, props } = decode(stateOf(m, b));
    let q = null;
    if (
      /ladder|wall_torch|wall_sign|wall_banner|wall_hanging_sign|wall_head|wall_skull/.test(id) &&
      dirs[props.facing]
    )
      q = b.slice(0, 3).map((v, k) => v - dirs[props.facing][k]);
    else if (id.includes('lantern') && props.hanging === 'true') q = [b[0], b[1] + 1, b[2]];
    else if (o.detail || id.endsWith('_sand') || id.endsWith('gravel')) q = [b[0], b[1] - 1, b[2]];
    if (q) {
      const di = owner.get(q.join(','));
      if (di !== undefined && di !== i) o.required.push(di);
      else o.warnings.push('原图未提供完整附着/支撑面，请检查');
    }
  }
  return ops;
}
export function defaultSettings(m) {
  return {
    strategy: 'shell',
    band: 3,
    deferBasement: false,
    groundY: boxOf(m.cells)[2],
    worldX: '',
    worldY: '',
    worldZ: '',
    rotation: 0,
    sourceX: 0,
    sourceZ: 0,
  };
}
export function buildPlan(m, settings, regions = []) {
  const ops = makeOperations(m),
    part = new Map();
  for (let i = 0; i < ops.length; i++) {
    const b = m.cells[ops[i].anchor];
    let selected = 'main';
    for (const r of regions) if (r.boxes.some((box) => inBox(b, box))) selected = r.id;
    part.set(i, selected);
  }
  const parts = [
      ...regions.map((r) => ({ id: r.id, name: r.name })),
      { id: 'main', name: regions.length ? '未划分部分' : '整体建筑' },
    ],
    tasks = [];
  const band = Math.max(1, Math.min(8, Math.round(Number(settings.band) || 3))),
    ground = Number(settings.groundY) || 0;
  for (const region of parts) {
    const groups = new Map();
    for (let oi = 0; oi < ops.length; oi++) {
      if (part.get(oi) !== region.id) continue;
      const o = ops[oi],
        y = m.cells[o.anchor][1],
        late = settings.deferBasement && y < ground,
        stage = late ? 2 : settings.strategy === 'shell' && o.detail ? 1 : 0,
        level = Math.floor((y - ground) / band),
        k = stage + ':' + level;
      if (!groups.has(k)) groups.set(k, { region: region.id, name: region.name, stage, level, ops: [] });
      groups.get(k).ops.push(oi);
    }
    for (const g of [...groups.values()].sort((a, b) => a.stage - b.stage || a.level - b.level)) {
      g.ops.sort(
        (a, b) =>
          m.cells[ops[a].anchor][1] - m.cells[ops[b].anchor][1] ||
          m.cells[ops[a].anchor][2] - m.cells[ops[b].anchor][2] ||
          m.cells[ops[a].anchor][0] - m.cells[ops[b].anchor][0],
      );
      const bs = g.ops.flatMap((oi) => ops[oi].cells.map((ci) => m.cells[ci]));
      g.bounds = boxOf(bs);
      g.count = bs.length;
      g.title =
        g.name +
        ' · ' +
        (g.stage === 2 ? '地下部分' : g.stage === 1 ? '细节内装' : '主体') +
        ' y' +
        g.bounds[2] +
        '–' +
        (g.bounds[3] - 1);
      tasks.push(g);
    }
  }
  const rank = new Map(tasks.flatMap((t) => t.ops).map((oi, i) => [oi, i]));
  for (const t of tasks) {
    t.warnings = [...new Set(t.ops.flatMap((oi) => ops[oi].warnings))];
    if (t.ops.some((oi) => ops[oi].required.some((di) => rank.get(di) > rank.get(oi))))
      t.warnings.push('本段依赖后面的结构：请调整分区顺序或先准备支撑');
    t.runs = makeRuns(t.ops, ops, m);
  }
  return { ops, tasks, items: sumItems(ops), coverage: tasks.reduce((s, t) => s + t.count, 0) };
}
export function sumItems(ops) {
  const items = Object.create(null);
  for (const o of ops) for (const [k, n] of Object.entries(o.items)) items[k] = (items[k] || 0) + n;
  return items;
}
function makeRuns(ids, ops, m) {
  const left = new Set(ids),
    at = new Map(
      ids.filter((i) => ops[i].cells.length === 1).map((i) => [position(m.cells[ops[i].anchor]), i]),
    ),
    runs = [];
  const ready = (i, local = new Set()) => ops[i].required.every((d) => !left.has(d) || local.has(d));
  while (left.size) {
    const seed = ids.find((i) => left.has(i) && ready(i)) ?? ids.find((i) => left.has(i)),
      a = m.cells[ops[seed].anchor];
    let best = [seed];
    if (ops[seed].cells.length === 1)
      for (const axes of [
        [1, 0, 2],
        [0, 2, 1],
        [2, 0, 1],
      ]) {
        const lo = a.slice(0, 3),
          hi = a.slice(0, 3);
        let current = [seed];
        for (const axis of axes)
          for (const sign of [-1, 1])
            while (true) {
              const l = lo.slice(),
                h = hi.slice();
              (sign < 0 ? l : h)[axis] += sign;
              const group = [];
              let valid = true;
              outer: for (let y = l[1]; y <= h[1]; y++)
                for (let z = l[2]; z <= h[2]; z++)
                  for (let x = l[0]; x <= h[0]; x++) {
                    const next = at.get([x, y, z].join(','));
                    if (
                      next === undefined ||
                      !left.has(next) ||
                      family(stateOf(m, m.cells[ops[next].anchor])) !== family(stateOf(m, a))
                    ) {
                      valid = false;
                      break outer;
                    }
                    group.push(next);
                  }
              if (!valid) break;
              group.sort((i, j) => m.cells[ops[i].anchor][1] - m.cells[ops[j].anchor][1]);
              const local = new Set();
              for (const i of group) {
                if (!ready(i, local)) {
                  valid = false;
                  break;
                }
                local.add(i);
              }
              if (!valid) break;
              lo.splice(0, 3, ...l);
              hi.splice(0, 3, ...h);
              current = group;
            }
        if (current.length > best.length) best = current;
      }
    runs.push(best);
    best.forEach((i) => left.delete(i));
  }
  return runs;
}
export function validateSettings(s, m) {
  if (
    !s ||
    !['shell', 'layers'].includes(s.strategy) ||
    !Number.isInteger(Number(s.band)) ||
    Number(s.band) < 1 ||
    Number(s.band) > 8 ||
    s.groundY === '' ||
    !Number.isInteger(Number(s.groundY)) ||
    Number(s.groundY) < 0 ||
    Number(s.groundY) >= m.dimensions[1] ||
    ![0, 1, 2, 3].includes(Number(s.rotation))
  )
    throw Error('施工设置无效');
  for (const [k, limit] of [
    ['sourceX', m.dimensions[0]],
    ['sourceZ', m.dimensions[2]],
  ])
    if (s[k] === '' || !Number.isInteger(Number(s[k])) || Number(s[k]) < 0 || Number(s[k]) >= limit)
      throw Error('原图基准坐标必须为图纸范围内的整数');
  for (const k of ['worldX', 'worldY', 'worldZ'])
    if (s[k] !== '' && !Number.isInteger(Number(s[k]))) throw Error('游戏坐标必须是整数');
  return s;
}
export function validateRegions(regions, m) {
  if (!Array.isArray(regions) || regions.length > 100) throw Error('分区列表无效');
  const ids = new Set();
  for (const r of regions) {
    if (
      !r ||
      typeof r.id !== 'string' ||
      r.id === 'main' ||
      ids.has(r.id) ||
      typeof r.name !== 'string' ||
      r.name.length > 80 ||
      !Array.isArray(r.boxes) ||
      r.boxes.length > 100
    )
      throw Error('分区无效');
    ids.add(r.id);
    for (const b of r.boxes)
      if (
        !Array.isArray(b) ||
        b.length !== 6 ||
        !b.every(Number.isInteger) ||
        [0, 1, 2].some(
          (i) =>
            b[i * 2] < 0 ||
            b[i * 2] >= b[i * 2 + 1] ||
            b[i * 2 + 1] > m.dimensions[i === 0 ? 0 : i === 1 ? 1 : 2],
        )
      )
        throw Error('分区范围越界');
  }
  return regions;
}
