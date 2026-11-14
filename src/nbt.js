// Bounded big-endian NBT reader. Longs are strings to retain their full value.
export function readNBT(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0,
    nodes = 0;
  const need = (n) => {
    if (!Number.isSafeInteger(n) || n < 0 || p + n > bytes.length) throw Error('NBT 数据截断或长度无效');
  };
  const number = (method, n) => {
    need(n);
    const value = view[method](p);
    p += n;
    return value;
  };
  const u8 = () => number('getUint8', 1),
    i32 = () => number('getInt32', 4);
  const length = () => {
    const n = i32();
    if (n < 0 || n > 16000000) throw Error('NBT 数组长度超出限制');
    return n;
  };
  const str = () => {
    const n = number('getUint16', 2);
    need(n);
    const s = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(p, p + n));
    p += n;
    return s;
  };
  function tag(t, depth = 0) {
    if (depth > 64 || ++nodes > 2000000) throw Error('NBT 结构过深或过大');
    if (t === 1) return number('getInt8', 1);
    if (t === 2) return number('getInt16', 2);
    if (t === 3) return i32();
    if (t === 4) return number('getBigInt64', 8).toString();
    if (t === 5) return number('getFloat32', 4);
    if (t === 6) return number('getFloat64', 8);
    if (t === 7) {
      const n = length();
      need(n);
      const a = bytes.slice(p, p + n);
      p += n;
      return a;
    }
    if (t === 8) return str();
    if (t === 9) {
      const child = u8(),
        n = length();
      if (child === 0 && n) throw Error('NBT 列表类型无效');
      if (n > 1000000) throw Error('NBT 列表过大');
      return Array.from({ length: n }, () => tag(child, depth + 1));
    }
    if (t === 10) {
      const o = Object.create(null);
      while (true) {
        const child = u8();
        if (child === 0) return o;
        const name = str();
        if (Object.hasOwn(o, name)) throw Error('NBT 字段重复');
        o[name] = tag(child, depth + 1);
      }
    }
    if (t === 11) return Array.from({ length: length() }, () => i32());
    if (t === 12) return Array.from({ length: length() }, () => number('getBigInt64', 8).toString());
    throw Error('不支持的 NBT 标签 ' + t);
  }
  if (u8() !== 10) throw Error('文件不是 NBT Compound 图纸');
  const rootName = str(),
    value = tag(10);
  if (p !== bytes.length) throw Error('NBT 末尾存在多余数据');
  return { rootName, value };
}
