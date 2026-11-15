import * as THREE from 'three';

// The local client's quad vertices and UVs are used directly, including stairs.
export class BlueprintRenderer {
  constructor(canvas, source) {
    this.canvas = canvas;
    this.source = source;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.renderer.setClearColor(0xeaf0e4);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 2000);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.ray = new THREE.Raycaster();
    this.signature = '';
    this.meshes = [];
    this.atlas = null;
    this.initReferenceOutline();
  }
  initReferenceOutline() {
    this.maskScene = new THREE.Scene();
    this.referenceCount = 0;
    this.targetCount = 0;
    this.referenceMask = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    const vertex =
        'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragment =
        'uniform sampler2D atlas;uniform vec3 value;varying vec2 vUv;void main(){if(texture2D(atlas,vUv).a<0.12)discard;gl_FragColor=vec4(value,1.0);}';
    const material = (value) =>
      new THREE.ShaderMaterial({
        uniforms: { atlas: { value: null }, value: { value: new THREE.Vector3(...value) } },
        vertexShader: vertex,
        fragmentShader: fragment,
        side: THREE.DoubleSide,
      });
    this.referenceMaskMaterial = material([1, 0, 0]);
    this.targetMaskMaterial = material([0, 0, 0]);
    this.pendingMaskMaterial = material([0, 1, 0]);
    this.outlineScene = new THREE.Scene();
    this.outlineCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.outlineMaterial = new THREE.ShaderMaterial({
      uniforms: { mask: { value: this.referenceMask.texture }, stepSize: { value: new THREE.Vector2(1, 1) } },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
      fragmentShader: `uniform sampler2D mask;uniform vec2 stepSize;varying vec2 vUv;void main(){vec2 c=texture2D(mask,vUv).rg;vec2 m=vec2(0.0);for(int x=-1;x<=1;x++){for(int y=-1;y<=1;y++){m=max(m,texture2D(mask,vUv+vec2(float(x),float(y))*stepSize).rg);}}vec2 edge=max(vec2(0.0),m-c);float gold=edge.g;gl_FragColor=vec4(mix(vec3(0.12,0.22,0.25),vec3(1.0,0.70,0.12),gold),max(edge.r,gold)*0.90);}`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.outlineScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.outlineMaterial));
  }
  drawReferenceOutline(W, H) {
    if (!this.referenceCount && !this.targetCount) return;
    const ratio = this.renderer.getPixelRatio(),
      width = Math.round(W * ratio),
      height = Math.round(H * ratio);
    this.referenceMask.setSize(width, height);
    this.outlineMaterial.uniforms.stepSize.value.set((1.3 * ratio) / width, (1.3 * ratio) / height);
    this.renderer.setRenderTarget(this.referenceMask);
    this.renderer.setClearColor(0x000000);
    this.renderer.render(this.maskScene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(0xeaf0e4);
    const previous = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.renderer.render(this.outlineScene, this.outlineCamera);
    this.renderer.autoClear = previous;
  }
  makeAtlas() {
    if (this.atlas) return;
    const atlas = document.createElement('canvas');
    const tileSize = Math.max(
        16,
        ...[...this.source.textures.values()].map((raw) => Math.max(raw.width, raw.height)),
      ),
      stride = tileSize + 4;
    this.tileCols = Math.ceil(Math.sqrt(this.source.textures.size));
    this.atlasSize = 2 ** Math.ceil(Math.log2(Math.max(256, this.tileCols * stride + 4)));
    atlas.width = atlas.height = this.atlasSize;
    const g = atlas.getContext('2d');
    g.imageSmoothingEnabled = false;
    this.tiles = new Map();
    let i = 0;
    for (const [id, raw] of this.source.textures) {
      const x = (i % this.tileCols) * stride + 2,
        y = Math.floor(i / this.tileCols) * stride + 2,
        w = raw.width,
        h = raw.height;
      g.putImageData(raw, x, y);
      g.drawImage(atlas, x, y, 1, h, x - 2, y, 2, h);
      g.drawImage(atlas, x + w - 1, y, 1, h, x + w, y, 2, h);
      g.drawImage(atlas, x - 2, y, w + 4, 1, x - 2, y - 2, w + 4, 2);
      g.drawImage(atlas, x - 2, y + h - 1, w + 4, 1, x - 2, y + h, w + 4, 2);
      this.tiles.set(id, [x, y, w, h]);
      i++;
    }
    this.atlasPixels = g.getImageData(0, 0, this.atlasSize, this.atlasSize);
    const tx = new THREE.CanvasTexture(atlas);
    tx.magFilter = THREE.NearestFilter;
    // Mip levels blend neighbouring atlas tiles when the castle is zoomed out.
    // Keep the source's pixel colours instead of bleeding wood into stone roofs.
    tx.minFilter = THREE.NearestFilter;
    tx.generateMipmaps = false;
    tx.colorSpace = THREE.SRGBColorSpace;
    this.atlas = tx;
    this.referenceMaskMaterial.uniforms.atlas.value = tx;
    this.targetMaskMaterial.uniforms.atlas.value = tx;
    this.pendingMaskMaterial.uniforms.atlas.value = tx;
  }
  rebuild(blocks, opts) {
    this.makeAtlas();
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      child.geometry?.dispose();
      child.material?.dispose();
    }
    this.meshes = [];
    this.maskScene.clear();
    this.referenceCount = 0;
    this.targetCount = 0;
    const all = new Map(blocks.map((b) => [b.slice(0, 3).join(','), b])),
      buckets = [0, 1, 2, 3].map(() => ({ p: [], uv: [], c: [], ids: [], centers: [] }));
    let quads = 0;
    const layerFor = (b) =>
      opts.newKeys?.has(b.slice(0, 3).join(','))
        ? 1
        : opts.ghostKeys?.has(b.slice(0, 3).join(','))
          ? 2
          : opts.contextKeys?.has(b.slice(0, 3).join(',')) && b[1] > opts.referenceFloorY
            ? 3
            : 0;
    for (const b of blocks) {
      const k = b.slice(0, 3).join(','),
        fresh = opts.newKeys?.has(k),
        ghost = opts.ghostKeys?.has(k),
        bucket = buckets[layerFor(b)],
        model = this.source.models[b[3]]?.faces?.length ? this.source.models[b[3]] : this.source.fallback(b);
      for (const f of model.faces) {
        const [verts, uv, id, n, cull, tint] = f;
        if (cull) {
          const nb = all.get(
            [b[0] + Math.round(cull[0]), b[1] + Math.round(cull[1]), b[2] + Math.round(cull[2])].join(','),
          );
          if (nb && this.source.models[nb[3]]?.full && layerFor(nb) === layerFor(b)) continue;
        }
        const tile = this.tiles.get(id);
        const shade = n[1] > 0.5 ? 1 : n[1] < -0.5 ? 0.58 : Math.abs(n[0]) > 0.5 ? 0.76 : 0.88;
        let rgb = tile ? [1, 1, 1] : [0.8, 0.15, 0.75];
        if (tint) rgb = [0.569, 0.741, 0.349];
        rgb = rgb.map((c, i) =>
          Math.min(1, c * shade * (fresh ? 1.03 : 1) + (fresh ? [0.04, 0.025, 0][i] : 0)),
        );
        // Source quads are clockwise viewed from their outward normal.
        for (const vi of [0, 2, 1, 0, 3, 2]) {
          const v = verts[vi],
            u = uv[vi];
          bucket.p.push(v[0] + b[0], v[1] + b[1], v[2] + b[2]);
          bucket.uv.push(
            tile ? (tile[0] + (Math.max(0.01, Math.min(15.99, u[0])) * tile[2]) / 16) / this.atlasSize : 0,
            tile
              ? 1 - (tile[1] + (Math.max(0.01, Math.min(15.99, u[1])) * tile[3]) / 16) / this.atlasSize
              : 0,
          );
          bucket.c.push(...rgb);
        }
        bucket.ids.push(b, b);
        bucket.centers.push(verts[0].map((_, i) => b[i] + verts.reduce((s, v) => s + v[i], 0) / 4));
        quads++;
      }
    }
    buckets.forEach((data, i) => {
      if (!data.p.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(data.p, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(data.c, 3));
      geo.computeBoundingSphere();
      const material = new THREE.MeshBasicMaterial({
        map: this.atlas,
        vertexColors: true,
        side: THREE.FrontSide,
        transparent: i !== 0,
        opacity: i === 1 ? (opts.targetOpacity ?? 1) : i >= 2 ? 0.62 : 1,
        alphaTest: 0.12,
        depthWrite: i < 2 && (i !== 1 || (opts.targetOpacity ?? 1) === 1),
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      const mesh = new THREE.Mesh(geo, material);
      mesh.userData.cells = [...data.ids];
      mesh.userData.baseCells = data.ids;
      mesh.userData.centers = data.centers;
      mesh.userData.faceOrder = data.centers.map((_, i) => i);
      mesh.userData.depths = new Float64Array(data.centers.length);
      if (i !== 0) geo.setIndex(new THREE.Uint32BufferAttribute(new Uint32Array(data.p.length / 3), 1));
      mesh.userData.reference = i >= 2;
      mesh.userData.layer = i;
      mesh.renderOrder = i === 1 ? 3 : i >= 2 ? 2 : 0;
      this.group.add(mesh);
      this.meshes.push(mesh);
      const silhouetteMesh = new THREE.Mesh(
        geo,
        i === 1 ? this.pendingMaskMaterial : i >= 2 ? this.referenceMaskMaterial : this.targetMaskMaterial,
      );
      this.maskScene.add(silhouetteMesh);
      if (i >= 2) this.referenceCount += data.ids.length / 2;
      if (i === 1) this.targetCount += data.ids.length / 2;
    });
    this.canvas.dataset.referenceOutline = this.referenceCount ? 'silhouette' : 'none';
    const bound = opts.bounds;
    if (Number.isFinite(opts.groundY)) {
      const y = opts.groundY,
        x0 = bound[0],
        x1 = bound[1],
        z0 = bound[4],
        z1 = bound[5],
        g = new THREE.BufferGeometry();
      g.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          [x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0],
          3,
        ),
      );
      const frame = new THREE.LineSegments(
        g,
        new THREE.LineDashedMaterial({
          color: 0x297c86,
          transparent: true,
          opacity: 0.8,
          dashSize: 0.9,
          gapSize: 0.5,
          depthTest: false,
        }),
      );
      frame.name = 'gate-ground-level';
      frame.computeLineDistances();
      frame.renderOrder = 5;
      this.group.add(frame);
    }
    const groundY = bound[2] - 0.03;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(bound[1] - bound[0] + 2, bound[5] - bound[4] + 2),
      new THREE.MeshBasicMaterial({ color: 0xd5dfc7, side: THREE.DoubleSide }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.set((bound[0] + bound[1]) / 2, groundY, (bound[4] + bound[5]) / 2);
    this.group.add(plane);
    const targetBlocks = blocks.filter((b) => opts.newKeys?.has(b.slice(0, 3).join(','))),
      targetSet = new Set(targetBlocks.map((b) => b.slice(0, 3).join(','))),
      lines = [];
    for (const b of targetBlocks)
      for (const [dx, dz, edge] of [
        [-1, 0, 0],
        [1, 0, 1],
        [0, -1, 2],
        [0, 1, 3],
      ]) {
        if (opts.detail || targetSet.has([b[0] + dx, b[1], b[2] + dz].join(','))) continue;
        const x = b[0],
          z = b[2],
          mesh = this.source.models[b[3]]?.faces?.length ? this.source.models[b[3]] : this.source.fallback(b),
          y = b[1] + Math.max(...mesh.faces.flatMap((f) => f[0].map((v) => v[1]))) + 0.015;
        const a =
            edge === 0 ? [x, y, z] : edge === 1 ? [x + 1, y, z] : edge === 2 ? [x, y, z] : [x, y, z + 1],
          c =
            edge === 0
              ? [x, y, z + 1]
              : edge === 1
                ? [x + 1, y, z + 1]
                : edge === 2
                  ? [x + 1, y, z]
                  : [x + 1, y, z + 1];
        lines.push(...a, ...c);
      }
    if (lines.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
      this.group.add(
        new THREE.LineSegments(
          geo,
          new THREE.LineBasicMaterial({ color: 0xffbb32, transparent: true, opacity: 0.85 }),
        ),
      );
    }
    this.canvas.dataset.texturedFaces = String(quads);
    this.canvas.dataset.rendered = String(blocks.length);
    this.canvas.dataset.renderer = 'webgl-3d';
  }
  render(blocks, opts) {
    if (!this.source.textures.size) return;
    const signature =
      blocks.map((b) => b.join(',')).join('|') +
      '#' +
      [...(opts.newKeys || [])].join('|') +
      '#' +
      [...(opts.ghostKeys || [])].join('|') +
      '#' +
      [...(opts.contextKeys || [])].join('|') +
      '#' +
      opts.targetOpacity +
      '#' +
      opts.groundY +
      '#' +
      opts.bounds.join(',') +
      '#' +
      Boolean(opts.detail) +
      '#' +
      opts.referenceFloorY;
    if (signature !== this.signature) {
      this.rebuild(blocks, opts);
      this.signature = signature;
    }
    const W = this.canvas.clientWidth || 600,
      H = this.canvas.clientHeight || 400;
    this.renderer.setSize(W, H, false);
    this.camera.aspect = W / H;
    const b = opts.bounds,
      target = new THREE.Vector3((b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2),
      radius = Math.max(2, Math.hypot(b[1] - b[0], b[3] - b[2], b[5] - b[4]) / 2);
    const theta = ((opts.turn || 0) * Math.PI) / 2 + Math.PI / 4 + (opts.yaw || 0),
      phi = Math.max(0.04, Math.min(Math.PI - 0.04, Math.PI / 3 + (opts.pitch || 0))),
      distance = (radius / Math.sin(THREE.MathUtils.degToRad(19)) / Math.min(1, this.camera.aspect)) * 1.05;
    this.camera.position
      .copy(target)
      .add(
        new THREE.Vector3(
          Math.sin(theta) * Math.sin(phi),
          Math.cos(phi),
          Math.cos(theta) * Math.sin(phi),
        ).multiplyScalar(distance),
      );
    this.camera.zoom = opts.zoom || 1;
    this.camera.far = distance + radius * 8 + 100;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0),
      up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1),
      panScale = (2 * distance * Math.tan(THREE.MathUtils.degToRad(19))) / (H * (opts.zoom || 1));
    this.camera.position
      .addScaledVector(right, -(opts.panX || 0) * panScale)
      .addScaledVector(up, (opts.panY || 0) * panScale);
    target
      .addScaledVector(right, -(opts.panX || 0) * panScale)
      .addScaledVector(up, (opts.panY || 0) * panScale);
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
    // Three sorts meshes, not the quads batched inside a mesh. Order ghost/target
    // surfaces back-to-front on every camera draw; keep picking in the same order.
    const view = this.camera.matrixWorldInverse.elements;
    for (const mesh of this.meshes) {
      if (!mesh.material.transparent) continue;
      const centers = mesh.userData.centers;
      const depth = mesh.userData.depths,
        order = mesh.userData.faceOrder,
        index = mesh.geometry.index;
      for (let i = 0; i < centers.length; i++) {
        const p = centers[i];
        depth[i] = view[2] * p[0] + view[6] * p[1] + view[10] * p[2];
      }
      order.sort((a, b) => depth[a] - depth[b]);
      for (let i = 0; i < order.length; i++) {
        const source = order[i];
        for (let j = 0; j < 6; j++) index.array[i * 6 + j] = source * 6 + j;
        mesh.userData.cells[i * 2] = mesh.userData.baseCells[source * 2];
        mesh.userData.cells[i * 2 + 1] = mesh.userData.baseCells[source * 2 + 1];
      }
      index.needsUpdate = true;
    }
    this.renderer.render(this.scene, this.camera);
    this.drawReferenceOutline(W, H);
    this.canvas.dataset.orbit = JSON.stringify([theta, phi]);
    this.project = (x, y, z) => {
      const p = new THREE.Vector3(x, y, z).project(this.camera);
      return [((p.x + 1) * W) / 2, ((1 - p.y) * H) / 2];
    };
  }
  pick(event) {
    const r = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - r.left) / r.width) * 2 - 1,
        1 - ((event.clientY - r.top) / r.height) * 2,
      ),
      this.camera,
    );
    for (const hit of this.ray
      .intersectObjects(this.meshes)
      .sort(
        (a, b) =>
          Number(!!a.object.userData.reference) - Number(!!b.object.userData.reference) ||
          a.distance - b.distance,
      )) {
      if (hit.uv && this.atlasPixels) {
        const x = Math.max(0, Math.min(this.atlasSize - 1, Math.floor(hit.uv.x * this.atlasSize))),
          y = Math.max(0, Math.min(this.atlasSize - 1, Math.floor((1 - hit.uv.y) * this.atlasSize)));
        if (this.atlasPixels.data[(y * this.atlasSize + x) * 4 + 3] < 32) continue;
      }
      return hit.object.userData.cells[hit.faceIndex];
    }
    return null;
  }
}
