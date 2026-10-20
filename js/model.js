import * as THREE from 'three';

/* ============================================================
   程序化竹材纹理
   ============================================================ */

const rand = (a, b) => a + Math.random() * (b - a);

function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function noiseSpeckle(ctx, w, h, amount, alpha) {
  for (let i = 0; i < amount; i++) {
    const v = Math.random() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
  }
}

/**
 * 竹片贴图：纤维沿 u（竹片长度方向），竹节横跨竹片（沿 v）
 */
export function makeSlipTexture() {
  const W = 512, H = 512;
  const [c, ctx] = canvas2d(W, H);

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0.00, '#9b6f2e');
  g.addColorStop(0.14, '#c99a53');
  g.addColorStop(0.38, '#e0bd7e');
  g.addColorStop(0.52, '#d5ad68');
  g.addColorStop(0.72, '#bb8d45');
  g.addColorStop(0.90, '#a07633');
  g.addColorStop(1.00, '#87602a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 纵向（沿长度）的竹纤维 —— 画布上为水平线
  for (let i = 0; i < 900; i++) {
    const y = Math.random() * H;
    const x0 = rand(-40, W);
    const len = rand(30, 260);
    const dark = Math.random() > 0.45;
    const a = rand(0.02, 0.11);
    ctx.strokeStyle = dark ? `rgba(96,64,24,${a})` : `rgba(255,240,205,${a * 0.9})`;
    ctx.lineWidth = rand(0.4, 1.7);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.bezierCurveTo(x0 + len * 0.35, y + rand(-1.6, 1.6), x0 + len * 0.7, y + rand(-1.6, 1.6), x0 + len, y + rand(-1.2, 1.2));
    ctx.stroke();
  }

  // 竹节（横跨竹片的深色环带 + 高光）
  const nodes = [0.22, 0.58, 0.86];
  nodes.forEach((nx, idx) => {
    const x = nx * W;
    const wdt = idx === 1 ? 5 : 3.4;

    const ng = ctx.createLinearGradient(x - wdt * 4, 0, x + wdt * 4, 0);
    ng.addColorStop(0, 'rgba(90,60,22,0)');
    ng.addColorStop(0.34, 'rgba(90,60,22,0.30)');
    ng.addColorStop(0.48, 'rgba(70,45,14,0.55)');
    ng.addColorStop(0.54, 'rgba(255,244,216,0.42)');
    ng.addColorStop(0.62, 'rgba(90,60,22,0.26)');
    ng.addColorStop(1, 'rgba(90,60,22,0)');
    ctx.fillStyle = ng;
    ctx.fillRect(x - wdt * 4, 0, wdt * 8, H);

    ctx.strokeStyle = 'rgba(64,42,12,0.42)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - wdt * 0.2, 0);
    ctx.lineTo(x - wdt * 0.2, H);
    ctx.stroke();
  });

  // 局部色斑
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    const r = rand(14, 70);
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(${Math.random() > 0.5 ? '120,84,34' : '255,235,190'},${rand(0.03, 0.09)})`);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  noiseSpeckle(ctx, W, H, 2600, 0.06);

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * 竹签贴图：纤维沿 v（杆长方向），竹节为横向环
 */
export function makeStickTexture() {
  const W = 256, H = 1024;
  const [c, ctx] = canvas2d(W, H);

  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0.00, '#8f6629');
  g.addColorStop(0.22, '#c69a52');
  g.addColorStop(0.42, '#ddb981');
  g.addColorStop(0.58, '#cfa968');
  g.addColorStop(0.78, '#ab8140');
  g.addColorStop(1.00, '#875e26');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 竖向纤维
  for (let i = 0; i < 420; i++) {
    const x = Math.random() * W;
    const dark = Math.random() > 0.45;
    ctx.strokeStyle = dark
      ? `rgba(92,62,22,${rand(0.03, 0.14)})`
      : `rgba(255,242,208,${rand(0.03, 0.12)})`;
    ctx.lineWidth = rand(0.5, 2.2);
    ctx.beginPath();
    ctx.moveTo(x, -20);
    for (let y = 0; y <= H + 20; y += 40) {
      ctx.lineTo(x + rand(-1.4, 1.4), y);
    }
    ctx.stroke();
  }

  // 竹节环
  [0.30, 0.52, 0.78].forEach((ny, i) => {
    const y = ny * H;
    const h = i === 1 ? 16 : 11;

    const ng = ctx.createLinearGradient(0, y - h, 0, y + h);
    ng.addColorStop(0, 'rgba(88,58,20,0)');
    ng.addColorStop(0.32, 'rgba(88,58,20,0.34)');
    ng.addColorStop(0.48, 'rgba(58,36,10,0.62)');
    ng.addColorStop(0.56, 'rgba(255,246,220,0.40)');
    ng.addColorStop(0.72, 'rgba(88,58,20,0.22)');
    ng.addColorStop(1, 'rgba(88,58,20,0)');
    ctx.fillStyle = ng;
    ctx.fillRect(0, y - h, W, h * 2);

    ctx.strokeStyle = 'rgba(52,32,8,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, y + 1);
    ctx.lineTo(W, y + 1);
    ctx.stroke();
  });

  noiseSpeckle(ctx, W, H, 1500, 0.05);

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ============================================================
   竹知了本体
   ============================================================ */

export const BLADE = {
  LEN: 2.66,
  WID: 0.68,
  THICK: 0.038,
  PITCH: 0.23,
  Y: 0.56
};

function createBladeMesh() {
  const { LEN, WID, THICK, PITCH } = BLADE;
  const hx = LEN / 2, hy = WID / 2;

  const shape = new THREE.Shape();
  shape.moveTo(-hx, 0);
  shape.bezierCurveTo(-hx * 0.66, hy, hx * 0.66, hy, hx, 0);
  shape.bezierCurveTo(hx * 0.66, -hy, -hx * 0.66, -hy, -hx, 0);

  // 两处发声长孔
  [0.29, -0.29].forEach((k) => {
    const p = new THREE.Path();
    p.absellipse(hx * k, 0, 0.15, 0.072, 0, Math.PI * 2, true);
    shape.holes.push(p);
  });

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: THICK,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.007,
    bevelSegments: 2,
    curveSegments: 30
  });
  geo.translate(0, 0, -THICK / 2);
  geo.rotateX(-Math.PI / 2);

  // 螺旋桨式扭转 + 中段微拱
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = THREE.MathUtils.clamp(x / hx, -1, 1);
    const ang = t * PITCH;
    const cs = Math.cos(ang), sn = Math.sin(ang);
    const y2 = y * cs - z * sn;
    const z2 = y * sn + z * cs;
    const arch = (1 - t * t) * 0.026;
    pos.setXYZ(i, x, y2 + arch, z2);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  const map = makeSlipTexture();
  map.repeat.set(1 / LEN, 1 / (WID * 0.86));
  map.offset.set(0.5, 0.5);

  const mat = new THREE.MeshStandardMaterial({
    map,
    color: 0xffffff,
    roughness: 0.55,
    metalness: 0.02,
    side: THREE.DoubleSide,
    envMapIntensity: 0.7
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * 返回 { root, spinner }
 * root: 整体（竹签 + 竹片），spinner: 绕 Y 轴旋转的组
 */
export function createBambooToy() {
  const root = new THREE.Group();

  // ——— 竹签 ———
  const stickMap = makeStickTexture();
  stickMap.repeat.set(1, 1.6);

  const stickMat = new THREE.MeshStandardMaterial({
    map: stickMap,
    roughness: 0.6,
    metalness: 0.02,
    envMapIntensity: 0.6
  });

  const stickH = 2.62;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.052, stickH, 20, 1), stickMat);
  stick.position.y = 0;
  stick.castShadow = true;
  stick.receiveShadow = true;
  root.add(stick);

  // 上下尖头（竹签削尖）
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 0.62 });
  const tipTop = new THREE.Mesh(new THREE.ConeGeometry(0.046, 0.2, 20), tipMat);
  tipTop.position.y = stickH / 2 + 0.09;
  tipTop.castShadow = true;
  root.add(tipTop);

  const tipBottom = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.16, 20), tipMat);
  tipBottom.position.y = -stickH / 2 - 0.07;
  tipBottom.rotation.x = Math.PI;
  root.add(tipBottom);

  // 竹片上的小竹环（固定片）
  const collarMat = new THREE.MeshStandardMaterial({ color: 0x9c7838, roughness: 0.5 });
  [BLADE.Y - 0.06, BLADE.Y + 0.06].forEach((y) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.02, 8, 20), collarMat);
    ring.position.y = y;
    ring.rotation.x = Math.PI / 2;
    ring.castShadow = true;
    root.add(ring);
  });

  // ——— 旋转组（竹片 + 残影）———
  const spinner = new THREE.Group();
  spinner.position.y = BLADE.Y;

  const blade = createBladeMesh();
  spinner.add(blade);

  const trail = createTrail(blade);
  trail.forEach((g) => spinner.add(g.mesh));

  root.add(spinner);

  return { root, spinner, blade, trail };
}

/* ============================================================
   旋转残影（运动模糊）
   ============================================================ */

const TRAIL_COUNT = 15;

function createTrail(blade) {
  const list = [];
  for (let i = 0; i < TRAIL_COUNT; i++) {
    const mat = blade.material.clone();
    mat.transparent = true;
    mat.opacity = 0;
    mat.depthWrite = false;
    mat.emissive = new THREE.Color(0xffd79a);
    mat.emissiveIntensity = 0;
    mat.blending = THREE.AdditiveBlending;
    mat.map = blade.material.map;

    const mesh = new THREE.Mesh(blade.geometry, mat);
    mesh.renderOrder = 2;
    mesh.matrixAutoUpdate = true;
    list.push({
      mesh,
      mat,
      delay: 0.0075 * (i + 1) * 1.15,
      weight: 1 - i / TRAIL_COUNT
    });
  }
  return list;
}

/**
 * 根据角速度更新残影
 * @param {Array} trail
 * @param {number} omega rad/s
 */
export function updateTrail(trail, omega) {
  const speed = Math.abs(omega);
  // 低速几乎不显示，高速才拉出明显的拖影
  const k = THREE.MathUtils.smoothstep(speed, 22, 185);
  const spread = THREE.MathUtils.clamp(speed * 0.0042, 0, 0.62);

  for (let i = 0; i < trail.length; i++) {
    const g = trail[i];
    const ang = -Math.sign(omega) * spread * (0.25 + (i / trail.length) * 0.9);
    g.mesh.rotation.y = ang;
    g.mat.opacity = k * 0.05 * g.weight;
    g.mat.emissiveIntensity = k * 0.36 * g.weight;
  }
}

/* ============================================================
   环境：地面 + 尘埃
   ============================================================ */

export function createGround() {
  const group = new THREE.Group();

  const geo = new THREE.CircleGeometry(9, 64);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0d1a15,
    roughness: 0.42,
    metalness: 0.35,
    transparent: true,
    opacity: 0.92
  });
  const floor = new THREE.Mesh(geo, mat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.34;
  floor.receiveShadow = true;
  group.add(floor);

  // 地面上的柔和光斑
  const [cc, cg] = canvas2d(256, 256);
  const rg = cg.createRadialGradient(128, 128, 0, 128, 128, 128);
  rg.addColorStop(0.0, 'rgba(120,235,205,0.42)');
  rg.addColorStop(0.34, 'rgba(96,205,180,0.16)');
  rg.addColorStop(0.7, 'rgba(70,160,140,0.05)');
  rg.addColorStop(1.0, 'rgba(0,0,0,0)');
  cg.fillStyle = rg;
  cg.fillRect(0, 0, 256, 256);

  const glowTex = new THREE.CanvasTexture(cc);
  glowTex.colorSpace = THREE.SRGBColorSpace;

  const glowMat = new THREE.MeshBasicMaterial({
    map: glowTex,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -1.332;
  group.add(glow);

  return { group, glow };
}

export function createDust() {
  const COUNT = 420;
  const positions = new Float32Array(COUNT * 3);
  const seeds = new Float32Array(COUNT);

  for (let i = 0; i < COUNT; i++) {
    const r = Math.pow(Math.random(), 0.6) * 5.2;
    const a = Math.random() * Math.PI * 2;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = -1.2 + Math.random() * 4.2;
    positions[i * 3 + 2] = Math.sin(a) * r;
    seeds[i] = Math.random() * Math.PI * 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color: 0xd8c49a,
    size: 0.022,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });

  const points = new THREE.Points(geo, mat);
  points.userData.seeds = seeds;
  points.userData.baseY = positions.slice();
  return points;
}

export function updateDust(points, t, omega) {
  const pos = points.geometry.attributes.position;
  const base = points.userData.baseY;
  const seeds = points.userData.seeds;
  const swirl = Math.min(Math.abs(omega) / 260, 1.4);

  for (let i = 0; i < pos.count; i++) {
    const s = seeds[i];
    const x0 = base[i * 3];
    const y0 = base[i * 3 + 1];
    const z0 = base[i * 3 + 2];

    const ang = t * (0.05 + swirl * 0.55) + s;
    const r = Math.hypot(x0, z0);
    pos.setX(i, Math.cos(ang + Math.atan2(z0, x0)) * r);
    pos.setZ(i, Math.sin(ang + Math.atan2(z0, x0)) * r);
    pos.setY(i, y0 + Math.sin(t * 0.6 + s * 2.2) * 0.08);
  }
  pos.needsUpdate = true;
}
