# 方块工坊 · Schem Teacher

**把 Minecraft 图纸变成可以编排、跟建、打印和带走的离线教学网页。**

[在线使用](https://zhan27.github.io/schem-teacher/) · [源码](https://github.com/Zhan27/schem-teacher) · [使用说明](docs/guide.md)

导入 `.schem` → 确认地面与朝向 → 调整建筑分区 → 逐段/逐组施工 → 导出离线 HTML。

图纸、资源包和进度都在浏览器本机处理，不需要账号，也没有上传文件的服务器。GitHub Pages 仅托管工具本身；访问站点仍遵循 GitHub 的隐私规则。导出的单 HTML 可以复制到其他电脑离线打开。

## 已有功能

- **中文 / English** 即时切换，记住语言偏好；打印、材料CSV、项目和离线网页跟随所选语言。
- 读取 **Sponge Schematic v3**：尺寸、调色板、方块状态、偏移与版本信息；明确拒绝不支持或损坏的文件。
- 先主体后细节，或按高度递进；将相同材质连续长方体合成施工组，石砖/苔石砖可一起分组而保留每格原材质。
- 在俯视图框选建筑部位，命名、合并、移动施工顺序；重叠区域每个目标格仍只归属一次。
- WebGL 模型、缩放、旋转、剖切、格数与当前目标金边；无 WebGL 自动切二维备用视图。
- **默认内置 Java 1.20.1 原版方块纹理与模型**，导入图纸即可显示，无需添加资源包、联网或安装游戏。可选 `.jar` / `.zip` 自定义材质叠加到原版基础资源，随时恢复原版。
- 主体、前置虚影和实际已确认结构分开显示；预演不会登记真实进度。
- 门/床两格合并一次放置，双层半砖按两个物品统计；材料 CSV、完成/撤回、本机进度保存。
- 项目 JSON、含当前图纸/资源/进度的离线 HTML，及 Ctrl+P / 打印施工图。
- 文件解析和施工分组在 Web Worker 运行，可取消任务。

## 快速体验

打开在线工具，点击「体验小屋示例」或「塔楼示例」。示例图纸由本项目原创，可以自由复用，也可在 [`examples/`](examples/) 下载。

导入自己的图纸后，先确认「地面与游戏坐标」。游戏 Y 填**地面方块 Y**，不是玩家站立时的脚部 Y；若从 F3 读取脚部 Y，减 1 后填写。

初始目录按高度与用途分组，并不会自动理解每栋建筑的“左塔”“城墙”。复杂建筑请用俯视图框选分区后命名。保持原图空位，不要把外接范围全部填满。

## 格式与实现边界

- v0.3 支持 `.schem v3`。`.schem v2`、旧 `.schematic`、`.litematic` 尚未适配；可先用可信编辑器转换。图片/截图不能代替精确图纸。
- 创造模式优先。依赖提示是规则检查，不是玩家可达性、碰撞、红石或全部 Minecraft 物理过程模拟。复杂支撑请在游戏内确认。
- 内置资源固定为 Java 1.20.1；其他版本新增或模组方块，以及床/箱子等内置动态模型，会保留方块 ID 并使用示意外形，数量显示在材质说明中。自定义包的缺失资源自动用内置原版补齐；一次选择一个自定义档案。
- 项目保留方块实体和实体元数据供查阅，但不会重建物品容器内容、执行 NBT、命令或自动导入游戏世界。
- 首版限制：64 MB 图纸、128 MB 解压数据、800 万空间格、25 万非空气目标格；复杂图纸在旧设备上可能较慢。
- 本工具与既有城堡专用教学工程独立，当前进度格式不导入专用版的旧 JSON。原工程不受修改。

## 本地开发

需要 Node.js 22 或更新版本。

```sh
npm ci
npm test
npm run build
npm run dev
```

打开终端显示的 `http://127.0.0.1:4173`。构建得到 `dist/index.html`，不需要 CDN，即可双击使用。

浏览器回归：

```sh
npx playwright install --with-deps chromium
npm run test:e2e
```

如本机使用已安装 Chrome，可设置环境变量 `PW_CHANNEL=chrome`。CI 对源码运行单元测试和真实浏览器测试，通过后部署 Pages。测试生成的小屋、塔楼和资源包都属于本项目自制测试数据。

## 目录

```text
src/schematic.js       .schem v3 解压与解析
src/nbt.js             有长度/深度边界的 NBT 读取器
src/planner.js         方块操作、材料、分区与施工组
src/worker.js          可取消的本地计算
src/materials.js       原始模型适配与不支持方块的示意外形
src/vanilla.js         内置原版资源与自定义包叠加
assets/               压缩的原版方块资源、版本/哈希和独立权利声明
src/viewer*.js         WebGL 与二维备用模型
src/app.js             编辑、进度、打印与离线导出
examples/             原创 .schem 示例
tests/                单元与浏览器回归
scripts/              构建与本地预览
```

## 开源和素材

程序代码与原创示例采用 [MIT](LICENSE)。[第三方依赖说明](THIRD_PARTY_NOTICES.md)。

内置原版方块资源约 451 KiB（gzip），含 3,949 个方块渲染资源，来源与哈希见 [`assets/`](assets/NOTICE.md)。这些 Minecraft 素材的权利属于 Mojang / Microsoft，**不属于 MIT 授权**。仅应用程序代码与原创示例开源。其他导入/导出的素材同样保留原有授权。

仓库不包含游戏可执行代码、声音、他人城堡图纸、抓包文件或个人进度。维护者可用 `node scripts/pack-vanilla.mjs <local-client.jar>` 从本机对应客户端重建资源库；普通使用者无需执行。

这是非官方 Minecraft 工具，与 Mojang / Microsoft 没有关联或官方背书。Minecraft 名称、素材等权利属于其各自权利人。

## English

Schem Teacher is a client-side, reusable building lesson editor for Sponge Schematic v3. Import a local schematic, edit construction regions, follow material-aware groups, track progress, and export a self-contained offline HTML lesson. Vanilla Java 1.20.1 block textures and JSON models are built in: no resource import or network connection is required. Optional custom resources override this base. Unsupported blocks and built-in entity models use clearly labelled illustrative geometry. The code and original examples are MIT; Minecraft assets retain Mojang / Microsoft's rights. No schematic upload, account, backend or CDN is required. The tool offers rule-based grouping with manual correction, not universal architectural recognition or a Minecraft physics simulator.
