import { unzipSync } from 'fflate';
export function readResourceArchive(bytes) {
  if (bytes.length > 192 * 1024 * 1024) throw Error('资源文件超过192 MB');
  let total = 0,
    count = 0;
  const files = unzipSync(bytes, {
    filter: (e) => {
      if (
        !/^assets\/[a-z0-9_.-]+\/(?:blockstates\/.*\.json|models\/.*\.json|textures\/(?:block\/.*|entity\/(?:bed\/.*|chest\/.*|banner\/.*|banner_base))\.png)$/.test(
          e.name,
        )
      )
        return false;
      if (e.originalSize > 4 * 1024 * 1024 || ++count > 20000 || (total += e.originalSize) > 96 * 1024 * 1024)
        throw Error('资源包解压体积超出限制');
      return true;
    },
  });
  if (!Object.keys(files).length) throw Error('没有找到Java版 assets 方块资源；请导入客户端.jar或资源包.zip');
  return files;
}
