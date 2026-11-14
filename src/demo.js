import { gzipSync } from 'fflate';
// Original example authored for this repository; no external schematics/assets.
export function demoSchematic(kind = 'house') {
  const w = kind === 'tower' ? 11 : 17,
    h = kind === 'tower' ? 22 : 14,
    d = 15,
    blocks = new Map();
  const put = (x, y, z, s) => blocks.set([x, y, z].join(','), s),
    fill = (x0, x1, y0, y1, z0, z1, s) => {
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) put(x, y, z, s);
    };
  if (kind === 'tower') {
    fill(2, 8, 0, 0, 3, 11, 'minecraft:stone_bricks');
    for (let y = 1; y <= 16; y++)
      for (let z = 3; z <= 11; z++)
        for (let x = 2; x <= 8; x++)
          if (x === 2 || x === 8 || z === 3 || z === 11) {
            if (x === 5 && z === 11 && y <= 3) continue;
            put(x, y, z, (x + y + z) % 11 === 0 ? 'minecraft:mossy_stone_bricks' : 'minecraft:stone_bricks');
          }
    for (let q = 0; q < 5; q++)
      fill(1 + q, 9 - q, 17 + q, 17 + q, 2 + q, 12 - q, 'minecraft:deepslate_tiles');
  } else {
    fill(2, 14, 0, 0, 2, 12, 'minecraft:stone_bricks');
    for (let y = 1; y <= 6; y++)
      for (let z = 2; z <= 12; z++)
        for (let x = 2; x <= 14; x++)
          if (x === 2 || x === 14 || z === 2 || z === 12) {
            if (x === 8 && z === 12 && y <= 2) continue;
            const corner = (x === 2 || x === 14) && (z === 2 || z === 12);
            put(
              x,
              y,
              z,
              corner
                ? 'minecraft:oak_log[axis=y]'
                : y === 3 && (x === 5 || x === 11) && z === 12
                  ? 'minecraft:glass'
                  : 'minecraft:oak_planks',
            );
          }
    for (let q = 0; q <= 6; q++) fill(1 + q, 15 - q, 7 + q, 7 + q, 1, 13, 'minecraft:deepslate_tiles');
    put(8, 1, 12, 'minecraft:oak_door[facing=south,half=lower,hinge=left,open=false,powered=false]');
    put(8, 2, 12, 'minecraft:oak_door[facing=south,half=upper,hinge=left,open=false,powered=false]');
    put(5, 1, 5, 'minecraft:crafting_table');
    put(6, 1, 5, 'minecraft:chest[facing=south,type=single,waterlogged=false]');
  }
  if (kind === 'basement') {
    const old = [...blocks];
    blocks.clear();
    for (const [k, s] of old) {
      const [x, y, z] = k.split(',').map(Number);
      put(x, y + 3, z, s);
    }
    fill(2, 14, 0, 0, 2, 12, 'minecraft:cobblestone');
    for (let y = 1; y < 3; y++)
      for (let z = 2; z <= 12; z++)
        for (let x = 2; x <= 14; x++)
          if (x === 2 || x === 14 || z === 2 || z === 12) put(x, y, z, 'minecraft:stone_bricks');
    return encodeSchematic({ dimensions: [w, h + 3, d], blocks });
  }
  return encodeSchematic({ dimensions: [w, h, d], blocks });
}
export function encodeSchematic({ dimensions: [w, h, d], blocks }) {
  const palette = ['minecraft:air', ...new Set(blocks.values())],
    ids = new Map(palette.map((s, i) => [s, i])),
    data = [];
  for (let y = 0; y < h; y++)
    for (let z = 0; z < d; z++)
      for (let x = 0; x < w; x++) {
        let value = ids.get(blocks.get([x, y, z].join(',')) || 'minecraft:air');
        do {
          const byte = value & 127;
          value >>>= 7;
          data.push(byte | (value ? 128 : 0));
        } while (value);
      }
  const out = [],
    u8 = (n) => out.push(n & 255),
    u16 = (n) => {
      u8(n >> 8);
      u8(n);
    },
    i32 = (n) => {
      u8(n >> 24);
      u8(n >> 16);
      u8(n >> 8);
      u8(n);
    },
    text = (s) => {
      const a = new TextEncoder().encode(s);
      u16(a.length);
      out.push(...a);
    },
    field = (t, k) => {
      u8(t);
      text(k);
    };
  field(10, 'Schematic');
  field(3, 'Version');
  i32(3);
  field(3, 'DataVersion');
  i32(3465);
  for (const [k, n] of [
    ['Width', w],
    ['Height', h],
    ['Length', d],
  ]) {
    field(2, k);
    u16(n);
  }
  field(11, 'Offset');
  i32(3);
  i32(0);
  i32(0);
  i32(0);
  field(10, 'Blocks');
  field(10, 'Palette');
  for (let i = 0; i < palette.length; i++) {
    field(3, palette[i]);
    i32(i);
  }
  u8(0);
  field(7, 'Data');
  i32(data.length);
  for (const b of data) u8(b);
  u8(0);
  u8(0);
  return gzipSync(new Uint8Array(out), { level: 9, mtime: 0 });
}
