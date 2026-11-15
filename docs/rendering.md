# Rendering corrections and resource boundaries

## Translucent surface occlusion

The reported workbench looked like disconnected vertical panels. Its source
model was intact: clockwise quads were rendered double-sided in one transparent
batch, with no per-surface depth ordering. The batch's input order changed the
visible result. Three.js sorts meshes, not the triangles batched inside them
([Three.js transparency manual](https://threejs.org/manual/pages/transparency.html)).

The renderer now emits outward triangles, culls back faces and draws confirmed
structure in the opaque pass. Translucent target/reference quads are sorted by
camera-space depth on camera updates. Index buffers are reused; picking IDs are
reordered alongside triangles. The 2D fallback also uses rotated view depth and
per-face UVs rather than the entire texture on each face.

The regression reverses source faces and block order at three camera angles.
It allows only a 0.1% edge-rasterization difference, not changes across surfaces.
It requires an actual WebGL context; explicit no-WebGL fallback tests run too.

## Beds, chests and banners

Original PNGs were already present in the local Java 1.20.1 client, but absent
from the old resource subset. Static adapters now cover beds, single/double/
trapped/ender chests and banners. Box dimensions and UV origins were checked
against the local client's BedRenderer, ChestRenderer and BannerRenderer layer
definitions; no game code is executed or distributed. Native image sizes are
preserved (logical entity UV sheets are 64x64 even in HD texture packs).

The bed-head top UV direction is corrected so pillows occupy the outer head end;
red surfaces meet the foot. A pixel regression checks all four block facings.
These are static models: no opening animation, waving, NBT banner patterns or
container contents are simulated.

## Farmer's Delight

The three kitchen blocks use original blockstate/model/PNG resources from
[vectorwing/FarmersDelight](https://github.com/vectorwing/FarmersDelight), pinned
to `e854d56d4eea8dc120650d43da0d1472711797ad`. The metadata and author's MIT notice
are in `assets/`; the default library and offline exports contain the resources.
The recipe/gameplay mod is not installed or run.

The reference schematic stores only bare IDs for these blocks, without any state
properties. The display therefore explicitly reports upstream defaults (north,
stove unlit, cutting board not waterlogged, pot support none / not waterlogged).
Source IDs and data remain unchanged. Other incomplete/custom blocks are not
silently assigned architectural or placement information.
