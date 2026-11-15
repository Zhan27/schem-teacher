// Closed, static Java 1.20.1 block-entity models. Dimensions/box UV offsets were
// checked against the local client's Bed/Chest/BannerRenderer layer definitions.
// Animation, banner patterns and container contents are outside this adapter.
export async function entityModel(id, props, { cubeFaces, rotate, loadTexture, textures }) {
  const faces = [];
  function box(from, size, uv, tex, transform = (v) => v) {
    const [x, y, z] = size,
      [u, v] = uv;
    const rect = {
      down: [u + z, v, u + z + x, v + z],
      up: [u + z + x, v + z, u + z + 2 * x, v],
      west: [u, v + z, u + z, v + z + y],
      north: [u + z, v + z, u + z + x, v + z + y],
      east: [u + z + x, v + z, u + 2 * z + x, v + z + y],
      south: [u + 2 * z + x, v + z, u + 2 * z + 2 * x, v + z + y],
    };
    const dirs = ['up', 'down', 'north', 'south', 'west', 'east'];
    for (const [i, f] of cubeFaces(
      from,
      from.map((a, k) => a + size[k]),
      { all: tex },
    ).entries()) {
      const r = rect[dirs[i]],
        coords = [
          [r[0], r[1]],
          [r[2], r[1]],
          [r[2], r[3]],
          [r[0], r[3]],
        ];
      // Java entity UVs use a logical 64x64 sheet, even for HD resource packs.
      f[1] = coords.map((p) => [p[0] / 4, p[1] / 4]);
      f[0] = f[0].map((p) => transform(p).map((n) => n / 16));
      const zero = transform([0, 0, 0]),
        end = transform(f[3]);
      f[3] = end.map((n, k) => n - zero[k]);
      f[4] = null;
      faces.push(f);
    }
  }
  let angle = 0;
  if (/^minecraft:(?:chest|trapped_chest|ender_chest)$/.test(id)) {
    const type = id.endsWith('ender_chest') ? 'single' : props.type || 'single';
    const kind = id.endsWith('ender_chest') ? 'ender' : id.endsWith('trapped_chest') ? 'trapped' : 'normal';
    const tex = 'minecraft:entity/chest/' + kind + (type === 'single' ? '' : '_' + type);
    await loadTexture(tex);
    const x = type === 'right' ? 0 : 1,
      width = type === 'single' ? 14 : 15;
    box([x, 0, 1], [width, 10, 14], [0, 19], tex);
    box([x, 9, 1], [width, 5, 14], [0, 0], tex);
    box(
      [type === 'left' ? 15 : type === 'right' ? 0 : 7, 7, 15],
      [type === 'single' ? 2 : 1, 4, 1],
      [0, 0],
      tex,
    );
    angle = { south: 0, east: 90, north: 180, west: 270 }[props.facing] || 0;
  } else if (/^minecraft:[a-z_]+_bed$/.test(id)) {
    const color = id.slice(10, -4),
      tex = 'minecraft:entity/bed/' + color;
    await loadTexture(tex);
    const head = props.part === 'head';
    const world = (p) => {
      const q = rotate(p, 'x', 90, [0, 0, 0]);
      return [q[0], q[1] + 9, q[2]];
    };
    box([0, 0, 0], [16, 16, 6], [0, head ? 0 : 22], tex, world);
    if (head) {
      // The north-facing head's pillow is at z=0, away from its foot at z=1.
      // Box UV order runs in the other direction after the bed's X rotation.
      const top = faces.find((f) => f[3][1] > 0.9);
      const v0 = top[1][0][1],
        v1 = top[1][2][1];
      top[1] = top[1].map(([u, v]) => [u, v0 + v1 - v]);
    }
    const legs = head
      ? [
          [[0, 6, 0], [50, 6], 90],
          [[-16, 6, 0], [50, 18], 180],
        ]
      : [
          [[0, 6, -16], [50, 0], 0],
          [[-16, 6, -16], [50, 12], 270],
        ];
    for (const [p, uv, z] of legs)
      box(p, [3, 3, 3], uv, tex, (v) => world(rotate(rotate(v, 'x', 90, [0, 0, 0]), 'z', z, [0, 0, 0])));
    angle = { north: 0, east: 270, south: 180, west: 90 }[props.facing] || 0;
  } else if (/^minecraft:[a-z_]+_(?:wall_)?banner$/.test(id)) {
    const wall = id.endsWith('_wall_banner'),
      color = id.slice(10).replace(/_(?:wall_)?banner$/, '');
    const base = 'minecraft:entity/banner_base',
      cloth = 'minecraft:entity/banner/base';
    await loadTexture(base);
    await loadTexture(cloth);
    const dye = {
      white: 0xffffff,
      orange: 0xd87f33,
      magenta: 0xb24cd8,
      light_blue: 0x6699d8,
      yellow: 0xe5e533,
      lime: 0x7fcc19,
      pink: 0xf27fa5,
      gray: 0x4c4c4c,
      light_gray: 0x999999,
      cyan: 0x4c7f99,
      purple: 0x7f3fb2,
      blue: 0x334cb2,
      brown: 0x664c33,
      green: 0x667f33,
      red: 0x993333,
      black: 0x191919,
    }[color];
    if (dye === undefined) return null;
    const tinted = cloth + '#' + color;
    if (!textures.has(tinted)) {
      const src = textures.get(cloth),
        data = new Uint8ClampedArray(src.data);
      for (let i = 0; i < data.length; i += 4)
        for (let k = 0; k < 3; k++) data[i + k] *= ((dye >> (16 - 8 * k)) & 255) / 255;
      textures.set(tinted, new ImageData(data, src.width, src.height));
    }
    // Banner cloth hangs from its top attachment and extends below a wall block.
    const transform = (p) => [
      8 + (p[0] * 2) / 3,
      (wall ? -23 / 3 : 8) - (p[1] * 2) / 3,
      (wall ? 1 : 8) - (p[2] * 2) / 3,
    ];
    box([-10, -32, -2], [20, 40, 1], [0, 0], tinted, transform);
    box([-10, -32, -1], [20, 2, 2], [0, 42], base, transform);
    if (!wall) box([-1, -30, -1], [2, 42, 2], [44, 0], base, transform);
    angle = wall
      ? { south: 0, east: 90, north: 180, west: 270 }[props.facing] || 0
      : -(Number(props.rotation) || 0) * 22.5;
  } else return null;
  if (angle)
    for (const f of faces) {
      f[0] = f[0].map((p) => rotate(p, 'y', angle));
      f[3] = rotate(f[3], 'y', angle, [0, 0, 0]);
    }
  return { faces, full: false, staticEntity: true };
}
