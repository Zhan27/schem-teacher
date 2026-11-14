import { decode } from './planner.js';
const normals = {
  up: [0, 1, 0],
  down: [0, -1, 0],
  north: [0, 0, -1],
  south: [0, 0, 1],
  west: [-1, 0, 0],
  east: [1, 0, 0],
};
export function cubeFaces(from = [0, 0, 0], to = [1, 1, 1], textures = {}) {
  const [x, y, z] = from,
    [X, Y, Z] = to,
    vs = {
      up: [
        [x, Y, z],
        [X, Y, z],
        [X, Y, Z],
        [x, Y, Z],
      ],
      down: [
        [x, y, Z],
        [X, y, Z],
        [X, y, z],
        [x, y, z],
      ],
      north: [
        [X, Y, z],
        [x, Y, z],
        [x, y, z],
        [X, y, z],
      ],
      south: [
        [x, Y, Z],
        [X, Y, Z],
        [X, y, Z],
        [x, y, Z],
      ],
      west: [
        [x, Y, z],
        [x, Y, Z],
        [x, y, Z],
        [x, y, z],
      ],
      east: [
        [X, Y, Z],
        [X, Y, z],
        [X, y, z],
        [X, y, Z],
      ],
    };
  return Object.entries(vs).map(([k, v]) => [
    v,
    [
      [0, 0],
      [16, 0],
      [16, 16],
      [0, 16],
    ],
    textures[k] || textures.all || 'default',
    normals[k],
    from.every((q) => q === 0) && to.every((q) => q === 1) ? normals[k] : null,
    0,
  ]);
}
function rotate(v, axis, angle, origin = [0.5, 0.5, 0.5]) {
  const a = (angle * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a),
    [x, y, z] = v.map((v, i) => v - origin[i]),
    p =
      axis === 'y'
        ? [x * c + z * s, y, -x * s + z * c]
        : axis === 'x'
          ? [x, y * c - z * s, y * s + z * c]
          : [x * c - y * s, x * s + y * c, z];
  return p.map((v, i) => v + origin[i]);
}
function color(id) {
  return /moss/.test(id)
    ? [104, 120, 76]
    : /deepslate|blackstone/.test(id)
      ? [48, 54, 62]
      : /red_|brick$/.test(id)
        ? [155, 69, 58]
        : /grass|leaves/.test(id)
          ? [91, 138, 62]
          : /glass/.test(id)
            ? [163, 205, 210]
            : /oak|spruce|wood|chest|barrel|plank|log/.test(id)
              ? [140, 105, 59]
              : /sand/.test(id)
                ? [209, 192, 142]
                : /iron/.test(id)
                  ? [154, 163, 163]
                  : id.startsWith('minecraft:')
                    ? [130, 138, 142]
                    : [164, 68, 149];
}
function texture(id) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d'),
    rgb = color(id);
  let seed = [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 1);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = (seed % 19) - 9,
        joint = y % 8 === 0 || x % 8 === (Math.floor(y / 8) % 2) * 4;
      ctx.fillStyle = 'rgb(' + rgb.map((v) => Math.max(0, v + noise - (joint ? 24 : 0))).join(',') + ')';
      ctx.fillRect(x, y, 1, 1);
    }
  return ctx.getImageData(0, 0, 16, 16);
}
export function defaultMaterials(model) {
  const textures = new Map(),
    models = {};
  for (const [pid, state] of Object.entries(model.palette)) {
    const { id, props } = decode(state);
    if (id.endsWith(':air')) continue;
    if (!textures.has(id)) textures.set(id, texture(id));
    let faces;
    if (id.endsWith('_slab') && props.type !== 'double')
      faces = cubeFaces([0, props.type === 'top' ? 0.5 : 0, 0], [1, props.type === 'top' ? 1 : 0.5, 1], {
        all: id,
      });
    else if (id.endsWith('_stairs')) {
      faces = cubeFaces([0, 0, 0], [1, 0.5, 1], { all: id }).concat(
        cubeFaces([0, 0.5, 0.5], [1, 1, 1], { all: id }),
      );
      const angle = { north: 180, east: 270, west: 90, south: 0 }[props.facing] || 0;
      for (const f of faces) {
        f[0] = f[0].map((v) => rotate(v, 'y', angle));
        f[3] = rotate(f[3], 'y', angle, [0, 0, 0]);
        f[4] = null;
        if (props.half === 'top') f[0] = f[0].map((v) => [v[0], 1 - v[1], v[2]]);
      }
    } else if (/door|ladder|banner|pane|bars|vine/.test(id)) {
      const thick = id.includes('door') ? 0.1875 : 0.07;
      faces = cubeFaces([0, 0, 0.5 - thick / 2], [1, 1, 0.5 + thick / 2], { all: id });
      const angle = { north: 0, east: 90, south: 180, west: 270 }[props.facing] || 0;
      for (const f of faces) {
        f[0] = f[0].map((v) => rotate(v, 'y', angle));
        f[3] = rotate(f[3], 'y', angle, [0, 0, 0]);
        f[4] = null;
      }
    } else if (/torch|lantern|chain/.test(id))
      faces = cubeFaces([0.35, 0, 0.35], [0.65, 0.7, 0.65], { all: id });
    else if (/carpet/.test(id)) faces = cubeFaces([0, 0, 0], [1, 0.0625, 1], { all: id });
    else faces = cubeFaces([0, 0, 0], [1, 1, 1], { all: id });
    models[pid] = {
      faces,
      full:
        !/_stairs|_slab|door|ladder|banner|pane|bars|vine|torch|lantern|chain|carpet/.test(id) ||
        props.type === 'double',
    };
  }
  return { textures, models, authentic: false, missing: [] };
}
export async function importMaterials(model, files) {
  const result = defaultMaterials(model),
    decoder = new TextDecoder(),
    modelCache = new Map(),
    imageCache = new Map();
  const path = (id, type) => {
    const parts = id.includes(':') ? id.split(':') : ['minecraft', id];
    return 'assets/' + parts[0] + '/' + type + '/' + parts[1] + '.json';
  };
  const json = (p) => {
    if (!files[p]) throw Error('缺少 ' + p);
    return JSON.parse(decoder.decode(files[p]));
  };
  function loadModel(id, stack = []) {
    if (stack.length > 32 || stack.includes(id)) throw Error('模型继承循环');
    if (modelCache.has(id)) return modelCache.get(id);
    const m = json(path(id, 'models')),
      p = m.parent && !m.parent.startsWith('builtin/') ? loadModel(m.parent, [...stack, id]) : {};
    const v = {
      ...p,
      ...m,
      textures: { ...p.textures, ...m.textures },
      elements: m.elements || p.elements || [],
    };
    modelCache.set(id, v);
    return v;
  }
  async function loadTexture(id) {
    if (imageCache.has(id)) return;
    const [ns, tail] = id.includes(':') ? id.split(':') : ['minecraft', id],
      raw = files['assets/' + ns + '/textures/' + tail + '.png'];
    if (!raw) throw Error('缺少纹理 ' + id);
    const blob = new Blob([raw], { type: 'image/png' }),
      image = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(image, 0, 0, image.width, image.width, 0, 0, 16, 16);
    result.textures.set(id, g.getImageData(0, 0, 16, 16));
    image.close();
    imageCache.set(id, true);
  }
  function matches(when, props) {
    if (!when) return true;
    if (when.OR) return when.OR.some((v) => matches(v, props));
    if (when.AND) return when.AND.every((v) => matches(v, props));
    return Object.entries(when).every(([k, v]) => String(v).split('|').includes(props[k]));
  }
  for (const [pid, state] of Object.entries(model.palette)) {
    const { id, props } = decode(state);
    if (id.endsWith(':air')) continue;
    try {
      const bs = json(path(id === 'minecraft:iron_chain' ? 'minecraft:chain' : id, 'blockstates')),
        selected = [];
      if (bs.variants) {
        const choice = Object.entries(bs.variants).find(
          ([k]) =>
            !k ||
            k.split(',').every((p) => {
              const [key, value] = p.split('=');
              return props[key] === value;
            }),
        );
        if (choice) selected.push(Array.isArray(choice[1]) ? choice[1][0] : choice[1]);
      }
      if (bs.multipart)
        for (const part of bs.multipart)
          if (matches(part.when, props))
            selected.push(Array.isArray(part.apply) ? part.apply[0] : part.apply);
      const faces = [];
      let full = false;
      for (const variant of selected) {
        const m = loadModel(variant.model);
        for (const e of m.elements) {
          const from = e.from.map((v) => v / 16),
            to = e.to.map((v) => v / 16);
          if (
            from.every((v) => v === 0) &&
            to.every((v) => v === 1) &&
            Object.keys(e.faces || {}).length === 6 &&
            !e.rotation
          )
            full = true;
          for (const f of cubeFaces(from, to)) {
            const key = Object.entries(normals).find(([, n]) => n.every((v, i) => v === f[3][i]))[0],
              spec = e.faces?.[key];
            if (!spec) continue;
            let tex = spec.texture,
              seen = new Set();
            while (tex?.startsWith('#')) {
              if (seen.has(tex)) throw Error('纹理引用循环');
              seen.add(tex);
              tex = m.textures[tex.slice(1)];
            }
            if (!tex) throw Error('纹理引用缺失');
            if (!tex.includes(':')) tex = 'minecraft:' + tex;
            await loadTexture(tex);
            f[2] = tex;
            const uv = spec.uv || [0, 0, 16, 16];
            f[1] = [
              [uv[0], uv[1]],
              [uv[2], uv[1]],
              [uv[2], uv[3]],
              [uv[0], uv[3]],
            ];
            for (let i = 0; i < (spec.rotation || 0) / 90; i++) f[1].push(f[1].shift());
            f[4] = spec.cullface ? normals[spec.cullface] : null;
            f[5] = spec.tintindex !== undefined ? 1 : 0;
            if (e.rotation)
              f[0] = f[0].map((v) =>
                rotate(
                  v,
                  e.rotation.axis,
                  e.rotation.angle,
                  e.rotation.origin.map((q) => q / 16),
                ),
              );
            for (const axis of ['x', 'y'])
              if (variant[axis]) {
                f[0] = f[0].map((v) => rotate(v, axis, -variant[axis]));
                f[3] = rotate(f[3], axis, -variant[axis], [0, 0, 0]);
                if (f[4]) f[4] = rotate(f[4], axis, -variant[axis], [0, 0, 0]);
              }
            faces.push(f);
          }
        }
      }
      if (!faces.length) throw Error('动态/内置模型');
      result.models[pid] = { faces, full };
    } catch {
      result.missing.push(id);
    }
  }
  result.authentic = true;
  result.missing = [...new Set(result.missing)];
  return result;
}
export function packMaterials(materials) {
  if (!materials.authentic) return null;
  return {
    models: materials.models,
    missing: materials.missing,
    textures: [...materials.textures].map(([id, raw]) => {
      const c = document.createElement('canvas');
      c.width = c.height = 16;
      c.getContext('2d').putImageData(raw, 0, 0);
      return [id, c.toDataURL()];
    }),
  };
}
export async function unpackMaterials(data) {
  const textures = new Map();
  for (const [id, url] of data.textures) {
    if (!/^data:image\/png;base64,/.test(url)) throw Error('项目纹理格式无效');
    const image = new Image();
    image.src = url;
    await image.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    c.getContext('2d').drawImage(image, 0, 0, 16, 16);
    textures.set(id, c.getContext('2d').getImageData(0, 0, 16, 16));
  }
  return { models: data.models, textures, authentic: true, missing: data.missing || [] };
}
