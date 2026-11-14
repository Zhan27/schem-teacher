import { BlueprintRenderer } from './viewer-orbit.js';
import { position } from './schematic.js';
import { boxOf } from './planner.js';
let capability;
const canWebGL = () => {
  if (capability !== undefined) return capability;
  try {
    const c = document.createElement('canvas'),
      g = c.getContext('webgl2');
    capability = !!g;
    g?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    capability = false;
  }
  return capability;
};
export class Viewer {
  constructor(canvas, onPick) {
    this.canvas = canvas;
    this.onPick = onPick;
    this.yaw = 0;
    this.pitch = 0;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.data = null;
    let point;
    canvas.addEventListener('pointerdown', (e) => {
      point = { x: e.clientX, y: e.clientY, firstX: e.clientX, firstY: e.clientY, moved: false };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!point) return;
      const dx = e.clientX - point.x,
        dy = e.clientY - point.y;
      if (Math.hypot(e.clientX - point.firstX, e.clientY - point.firstY) > 4) point.moved = true;
      if (point.moved) {
        if (e.shiftKey || e.buttons === 2) {
          this.panX += dx;
          this.panY += dy;
        } else {
          this.yaw -= dx * 0.0024;
          this.pitch = Math.max(-0.9, Math.min(0.42, this.pitch + dy * 0.002));
        }
        this.draw();
      }
      point.x = e.clientX;
      point.y = e.clientY;
    });
    canvas.addEventListener('pointerup', (e) => {
      if (point && !point.moved) {
        const hit = this.renderer ? this.renderer.pick(e) : this.pick2D(e);
        if (hit) this.onPick(hit);
      }
      point = null;
    });
    canvas.addEventListener('pointercancel', () => (point = null));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom = Math.max(
          0.3,
          Math.min(8, this.zoom * Math.exp(-Math.max(-120, Math.min(120, e.deltaY)) * 0.00055)),
        );
        this.draw();
      },
      { passive: false },
    );
  }
  setMaterials(materials) {
    this.materials = materials;
    if (this.renderer) {
      for (const m of this.renderer.meshes) {
        m.geometry.dispose();
        m.material.dispose();
      }
      this.renderer.atlas?.dispose();
      this.renderer.renderer.dispose();
      this.renderer = null;
      const clone = this.canvas.cloneNode();
      this.canvas.replaceWith(clone);
      this.canvas = clone; /* caller recreates the viewer when switching material sources */
    }
    if (canWebGL())
      this.renderer = new BlueprintRenderer(this.canvas, {
        models: materials.models,
        textures: materials.textures,
        fallback: (b) => materials.models[b[3]],
      });
  }
  reset() {
    this.yaw = this.pitch = this.panX = this.panY = 0;
    this.zoom = 1;
    this.draw();
  }
  show(blocks, targets, ghosts, bounds, groundY) {
    this.data = { blocks, targets, ghosts, bounds, groundY };
    this.draw();
  }
  draw() {
    if (!this.data || !this.materials) return;
    const { blocks, targets, ghosts, bounds, groundY } = this.data,
      b = bounds.slice();
    if (groundY !== undefined) b[3] = Math.max(b[3], groundY + 1.5);
    const opts = {
      bounds: b,
      newKeys: targets,
      ghostKeys: ghosts,
      targetOpacity: 0.5,
      turn: 0,
      yaw: this.yaw,
      pitch: this.pitch,
      zoom: this.zoom,
      panX: this.panX,
      panY: this.panY,
      groundY,
    };
    if (this.renderer) {
      this.renderer.render(blocks, opts);
      this.canvas.dataset.renderer = 'webgl-3d';
    } else {
      this.draw2D(blocks, opts);
      this.canvas.dataset.renderer = '2d-fallback';
    }
    this.canvas.dataset.rendered = blocks.length;
    this.onDraw?.();
  }
  draw2D(blocks, opts) {
    const c = this.canvas,
      W = c.clientWidth || 800,
      H = c.clientHeight || 460,
      dpr = Math.min(2, devicePixelRatio || 1);
    c.width = W * dpr;
    c.height = H * dpr;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#eaf0e4';
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    const co = Math.cos(this.yaw),
      si = Math.sin(this.yaw),
      project = (x, y, z) => {
        const a = x * co - z * si,
          b = x * si + z * co;
        return [(a - b) * 0.866, (a + b) * 0.5 - y];
      };
    const b = opts.bounds,
      corners = [];
    for (const x of [b[0], b[1]])
      for (const y of [b[2], b[3]]) for (const z of [b[4], b[5]]) corners.push(project(x, y, z));
    const u = corners.map((p) => p[0]),
      v = corners.map((p) => p[1]),
      umin = Math.min(...u),
      umax = Math.max(...u),
      vmin = Math.min(...v),
      vmax = Math.max(...v),
      scale = Math.min((W - 40) / (umax - umin || 1), (H - 50) / (vmax - vmin || 1)) * this.zoom,
      P = (x, y, z) => {
        const [u, v] = project(x, y, z);
        return [
          W / 2 + (u - (umin + umax) / 2) * scale + this.panX,
          H / 2 + (v - (vmin + vmax) / 2) * scale + this.panY,
        ];
      };
    this.project = P;
    const all = new Map(blocks.map((b) => [position(b), b])),
      faces = [];
    const layer = (b) => (opts.newKeys.has(position(b)) ? 1 : opts.ghostKeys.has(position(b)) ? 2 : 0);
    for (const block of blocks)
      for (const f of this.materials.models[block[3]]?.faces || []) {
        const n = f[3],
          nx = n[0] * co - n[2] * si,
          nz = n[0] * si + n[2] * co;
        if (nx + nz + n[1] <= 0) continue;
        if (f[4]) {
          const next = all.get(
            block
              .slice(0, 3)
              .map((v, i) => v + Math.round(f[4][i]))
              .join(','),
          );
          if (next && this.materials.models[next[3]]?.full && layer(next) === layer(block)) continue;
        }
        const world = f[0].map((v) => v.map((v, i) => v + block[i])),
          depth = world.reduce((s, v) => s + (v[0] + v[2]) * (co + si) + v[1], 0) / 4;
        faces.push({ f, block, world, depth });
      }
    faces.sort((a, b) => a.depth - b.depth);
    this.hits = [];
    const cache = new Map();
    for (const { f, block, world } of faces) {
      const poly = world.map((v) => P(...v));
      if (
        poly.every((v) => v[0] < 0) ||
        poly.every((v) => v[0] > W) ||
        poly.every((v) => v[1] < 0) ||
        poly.every((v) => v[1] > H)
      )
        continue;
      const path = () => {
        ctx.beginPath();
        poly.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
        ctx.closePath();
      };
      ctx.globalAlpha = layer(block) === 1 ? 0.5 : layer(block) === 2 ? 0.62 : 1;
      const raw = this.materials.textures.get(f[2]);
      if (raw) {
        let image = cache.get(f[2]);
        if (!image) {
          image = document.createElement('canvas');
          image.width = image.height = 16;
          image.getContext('2d').putImageData(raw, 0, 0);
          cache.set(f[2], image);
        }
        const a = (poly[1][0] - poly[0][0]) / 16,
          b = (poly[1][1] - poly[0][1]) / 16,
          d = (poly[3][0] - poly[0][0]) / 16,
          e = (poly[3][1] - poly[0][1]) / 16;
        ctx.save();
        path();
        ctx.clip();
        ctx.setTransform(dpr * a, dpr * b, dpr * d, dpr * e, dpr * poly[0][0], dpr * poly[0][1]);
        ctx.drawImage(image, 0, 0);
        ctx.restore();
      } else {
        path();
        ctx.fillStyle = '#a94098';
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (layer(block) === 1) {
        path();
        ctx.strokeStyle = '#dfa72c';
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
      this.hits.push({ poly, block });
    }
  }
  pick2D(e) {
    const r = this.canvas.getBoundingClientRect(),
      x = e.clientX - r.left,
      y = e.clientY - r.top;
    for (const h of [...(this.hits || [])].reverse()) {
      let inside = false;
      for (let i = 0, j = h.poly.length - 1; i < h.poly.length; j = i++) {
        const a = h.poly[i],
          b = h.poly[j];
        if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])
          inside = !inside;
      }
      if (inside) return h.block;
    }
    return null;
  }
}
