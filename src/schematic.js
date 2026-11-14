import { Gunzip } from 'fflate';
import { readNBT } from './nbt.js';
export const LIMITS = {
  file: 64 * 1024 * 1024,
  unpacked: 128 * 1024 * 1024,
  volume: 8000000,
  occupied: 250000,
};
export const position = (b) => b.slice(0, 3).join(',');
export function inflateBounded(bytes) {
  if (bytes[0] !== 31 || bytes[1] !== 139) return bytes;
  const chunks = [];
  let total = 0;
  const inflater = new Gunzip((chunk) => {
    total += chunk.length;
    if (total > LIMITS.unpacked) throw Error('解压数据超过128 MB');
    chunks.push(chunk);
  });
  for (let i = 0; i < bytes.length; i += 65536)
    inflater.push(bytes.subarray(i, i + 65536), i + 65536 >= bytes.length);
  const result = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    result.set(chunk, at);
    at += chunk.length;
  }
  return result;
}
export async function parseSchematic(bytes, name = '未命名图纸') {
  if (!bytes.length || bytes.length > LIMITS.file) throw Error('图纸为空或超过64 MB');
  const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
  const root = readNBT(inflateBounded(bytes)).value,
    n = root.Schematic || root;
  if (n.Version !== 3)
    throw Error(
      '首版支持 Sponge .schem v3；当前版本为 ' + (n.Version ?? '未知') + '。请先在可信编辑器中转换格式。',
    );
  const dimensions = ['Width', 'Height', 'Length'].map((k) => n[k]);
  if (
    !dimensions.every((v) => Number.isInteger(v) && v > 0 && v <= 1024) ||
    dimensions.reduce((a, b) => a * b, 1) > LIMITS.volume
  )
    throw Error('图纸尺寸无效或超过800万空间格');
  if (!n.Blocks?.Palette || !(n.Blocks.Data instanceof Uint8Array))
    throw Error('缺少 v3 Blocks/Palette/Data');
  const palette = Object.create(null);
  for (const [state, id] of Object.entries(n.Blocks.Palette)) {
    if (
      !Number.isInteger(id) ||
      id < 0 ||
      id > 65535 ||
      Object.hasOwn(palette, id) ||
      typeof state !== 'string' ||
      state.length > 4096
    )
      throw Error('调色板条目无效');
    palette[id] = state;
  }
  const [w, h, d] = dimensions,
    raw = n.Blocks.Data,
    cells = [];
  let p = 0;
  for (let i = 0; i < w * h * d; i++) {
    let value = 0,
      shift = 0,
      byte;
    do {
      if (p >= raw.length || shift >= 35) throw Error('方块索引VarInt截断或越界');
      byte = raw[p++];
      value += (byte & 127) * 2 ** shift;
      shift += 7;
    } while (byte & 128);
    const state = palette[value];
    if (state === undefined) throw Error('方块索引不在调色板中');
    if (!['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air'].includes(state.split('[')[0])) {
      cells.push([i % w, Math.floor(i / (w * d)), Math.floor(i / w) % d, value]);
      if (cells.length > LIMITS.occupied) throw Error('首版最多25万个非空气方块');
    }
  }
  if (p !== raw.length) throw Error('方块数据长度与图纸尺寸不一致');
  if (!cells.length) throw Error('图纸没有可建造方块');
  return {
    schema: 1,
    name: String(name).replace(/\.schem$/i, ''),
    hash: sha,
    dimensions,
    palette,
    cells,
    offset: Array.isArray(n.Offset) ? n.Offset : [0, 0, 0],
    dataVersion: n.DataVersion ?? null,
    blockEntities: n.Blocks.BlockEntities || [],
    entities: n.Entities || [],
    metadata: n.Metadata || {},
  };
}
export function validateModel(m) {
  if (
    !m ||
    m.schema !== 1 ||
    !Array.isArray(m.cells) ||
    m.cells.length < 1 ||
    m.cells.length > LIMITS.occupied ||
    !Array.isArray(m.dimensions) ||
    m.dimensions.length !== 3 ||
    !m.dimensions.every((x) => Number.isInteger(x) && x > 0 && x <= 1024) ||
    m.dimensions.reduce((a, b) => a * b, 1) > LIMITS.volume ||
    !m.palette ||
    typeof m.hash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(m.hash)
  )
    throw Error('项目图纸数据无效');
  const seen = new Set();
  for (const b of m.cells) {
    if (
      !Array.isArray(b) ||
      b.length !== 4 ||
      !b.every(Number.isInteger) ||
      b[0] < 0 ||
      b[0] >= m.dimensions[0] ||
      b[1] < 0 ||
      b[1] >= m.dimensions[1] ||
      b[2] < 0 ||
      b[2] >= m.dimensions[2] ||
      typeof m.palette[b[3]] !== 'string' ||
      seen.has(position(b))
    )
      throw Error('项目包含越界、重复或未知方块');
    seen.add(position(b));
  }
  return m;
}
