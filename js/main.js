import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { BambooAudio } from './audio.js';
import { SpinPhysics } from './physics.js';
import { StrokeInput, ShakeInput, KeyInput } from './input.js';
import { HandsController } from './hands.js';
import {
  createBambooToy, updateTrail,
  createGround, createDust, updateDust
} from './model.js';

/* ============================================================
   常量
   ============================================================ */

const SING_RPM = 900;          // 判定「鸣叫中」的转速阈值
const REAL_MAX_RPM = 4100;     // 仪表满量程
const GRACE = 0.28;            // 跌破阈值的宽容时间
const STORE_KEY = 'bamboo-cicada-3d:best:v1';

const CHALLENGE = {
  long: { title: '长鸣挑战', unit: 's', target: 15, tip: '转速高于 900 RPM 才算「鸣叫中」' },
  speed: { title: '极速挑战', unit: 'RPM', target: 3200, tip: '一口气把转速推到极限' }
};

/* ============================================================
   工具
   ============================================================ */

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function loadBest() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const obj = raw ? JSON.parse(raw) : null;
    return { long: +(obj?.long ?? 0), speed: +(obj?.speed ?? 0) };
  } catch {
    return { long: 0, speed: 0 };
  }
}

function saveBest(b) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(b)); } catch {}
}

/* ============================================================
   场景
   ============================================================ */

const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance'
});

// 某些合成事件 / 旧版浏览器下 setPointerCapture 可能抛错，做一层保护
const _capture = canvas.setPointerCapture.bind(canvas);
canvas.setPointerCapture = (id) => { try { _capture(id); } catch (e) { /* noop */ } };

let dpr = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(dpr);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070f0c);
scene.fog = new THREE.FogExp2(0x071009, 0.055);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(1.05, 1.18, 3.95);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.22;

/* ——— 灯光 ——— */
scene.add(new THREE.AmbientLight(0x5c7f70, 0.42));

const keyLight = new THREE.DirectionalLight(0xffd9a4, 2.15);
keyLight.position.set(3.0, 5.2, 3.2);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 20;
keyLight.shadow.camera.left = -5;
keyLight.shadow.camera.right = 5;
keyLight.shadow.camera.top = 5;
keyLight.shadow.camera.bottom = -5;
keyLight.shadow.bias = -0.0008;
keyLight.shadow.radius = 3;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x5fe0c0, 1.9);
rimLight.position.set(-4.5, 2.2, -3.6);
scene.add(rimLight);

const warmFill = new THREE.PointLight(0xffb877, 4.5, 7, 2);
warmFill.position.set(1.6, 1.2, 2.2);
scene.add(warmFill);

// 底部反光，避免竹片下缘死黑
const underFill = new THREE.PointLight(0x3fa08a, 2.6, 6, 2);
underFill.position.set(-0.6, -1.1, 1.8);
scene.add(underFill);

/* ——— 世界 ——— */
const { group: groundGroup, glow } = createGround();
scene.add(groundGroup);

const dust = createDust();
scene.add(dust);

const toy = createBambooToy();
scene.add(toy.root);

/* ——— 背景光斑 ——— */
const halo = (() => {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  rg.addColorStop(0, 'rgba(111,227,192,.42)');
  rg.addColorStop(0.45, 'rgba(90,190,165,.12)');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.5
  });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(7.5, 7.5, 1);
  sp.position.set(-0.2, 0.9, -3.1);
  return sp;
})();
scene.add(halo);

/* ——— 控制 ——— */
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.42, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.enablePan = false;
controls.minDistance = 2.8;
controls.maxDistance = 13;
controls.minPolarAngle = 0.62;
controls.maxPolarAngle = 1.58;
controls.rotateSpeed = 0.85;
controls.zoomSpeed = 0.8;

// 左键 / 单指留给「搓」，视角用右键 / 双指 / Shift
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };

controls.update();

/**
 * 按视口比例重新构图：保证竹片始终完整入画
 */
function frameCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  const portrait = aspect < 0.95;

  const dir = camera.position.clone().sub(controls.target).normalize();
  controls.target.set(0, portrait ? -0.08 : 0.42, 0);

  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

  const distV = (3.35 / 2) / Math.tan(vFov / 2);
  const distH = (2.95 / 2) / Math.tan(hFov / 2);
  const dist = clamp(Math.max(distV, distH), 3.4, 12);

  camera.position.copy(controls.target).addScaledVector(dir, dist);
  controls.update();
}

frameCamera();

/* ============================================================
   玩法状态
   ============================================================ */

const physics = new SpinPhysics();
const audio = new BambooAudio();

const game = {
  started: false,
  mode: 'long',
  singing: 0,
  grace: 0,
  peakRpm: 0,
  best: loadBest(),
  lastBeepGoal: false
};

/* ============================================================
   输入
   ============================================================ */

const stroke = new StrokeInput(canvas, (amount) => physics.kick(amount));
const keys = new KeyInput((amount) => physics.kick(amount));

const shake = new ShakeInput((amount) => {
  physics.kick(amount);
  haptic(12);
});

const hands = new HandsController({
  video: $('camVideo'),
  overlay: $('camOverlay'),
  onStroke: (amount) => physics.kick(amount),
  onStatus: ({ state, message }) => {
    const dot = $('camDot');
    const label = $('camLabel');
    label.textContent = message;
    dot.classList.toggle('live', state === 'live');
    if (state === 'live') {
      $('btnHands').classList.add('is-on');
      $('btnHands').classList.remove('is-busy');
    }
  }
});

function haptic(ms) {
  if (navigator.vibrate) { try { navigator.vibrate(ms); } catch {} }
}

/* ============================================================
   HUD
   ============================================================ */

const el = {
  rpm: $('rpmValue'),
  hz: $('hzText'),
  state: $('stateText'),
  ring: document.querySelector('.ring'),
  ringFill: $('ringFill'),
  title: $('challengeTitle'),
  goal: $('challengeGoal'),
  curLabel: $('curLabel'),
  cur: $('curValue'),
  best: $('bestValue'),
  bar: $('barFill'),
  panel: $('panel'),
  tip: $('panelTip')
};

const RING_LEN = 2 * Math.PI * 52;

function stateLabel(rpm) {
  if (rpm < 25) return '静止';
  if (rpm < SING_RPM) return '轻转';
  if (rpm < 1600) return '起鸣';
  if (rpm < 2600) return '长鸣';
  return '尖啸';
}

function toast(text, jade = false, life = 2400) {
  const wrap = $('toasts');
  const node = document.createElement('div');
  node.className = 'toast' + (jade ? ' jade' : '');
  node.textContent = text;
  wrap.appendChild(node);
  setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 420);
  }, life);
  while (wrap.children.length > 3) wrap.firstChild.remove();
}

function renderHUD() {
  const rpm = physics.rpm;
  const rev = physics.revPerSec;

  el.rpm.textContent = Math.round(rpm).toLocaleString('en-US');
  el.hz.textContent = `${rev.toFixed(1)} 转/秒`;
  el.state.textContent = stateLabel(rpm);

  const load = clamp(rpm / REAL_MAX_RPM, 0, 1);
  el.ringFill.style.strokeDashoffset = String(RING_LEN * (1 - load));
  el.ring.classList.toggle('hot', rpm > 2000);

  const cfg = CHALLENGE[game.mode];

  if (game.mode === 'long') {
    el.curLabel.textContent = '本次长鸣';
    el.cur.innerHTML = `${game.singing.toFixed(1)}<em>s</em>`;
    el.best.textContent = game.best.long > 0 ? `${game.best.long.toFixed(1)}s` : '--';
    el.bar.style.width = `${clamp(game.singing / cfg.target, 0, 1) * 100}%`;
  } else {
    el.curLabel.textContent = '本次峰值';
    el.cur.innerHTML = `${Math.round(game.peakRpm).toLocaleString('en-US')}<em>RPM</em>`;
    el.best.textContent = game.best.speed > 0 ? `${Math.round(game.best.speed).toLocaleString('en-US')} RPM` : '--';
    el.bar.style.width = `${clamp(game.peakRpm / cfg.target, 0, 1) * 100}%`;
  }
}

function syncChallengeCopy() {
  const cfg = CHALLENGE[game.mode];
  el.title.textContent = cfg.title;
  el.goal.textContent = game.mode === 'long'
    ? `目标 ${cfg.target}s`
    : `目标 ${cfg.target.toLocaleString('en-US')} RPM`;
  el.tip.textContent = cfg.tip;
}

/* ============================================================
   模式切换
   ============================================================ */

document.querySelectorAll('.mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    if (mode === game.mode) return;
    game.mode = mode;
    game.lastBeepGoal = false;
    document.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
    syncChallengeCopy();
    renderHUD();
    toast(mode === 'long' ? '换成「长鸣挑战」，看你能让它叫多久' : '换成「极速挑战」，把转速推上去');
  });
});

/* ============================================================
   按钮
   ============================================================ */

$('btnReset').addEventListener('click', () => {
  physics.reset();
  game.singing = 0;
  game.grace = 0;
  game.peakRpm = 0;
  game.lastBeepGoal = false;
  renderHUD();
  toast('重新开始');
});

$('btnHands').addEventListener('click', async () => {
  const btn = $('btnHands');

  if (hands.running || hands.landmarker) {
    hands.stop();
    $('camPanel').hidden = true;
    btn.classList.remove('is-on');
    btn.classList.remove('is-busy');
    toast('已关闭手势控制');
    return;
  }

  btn.classList.add('is-busy');
  $('camPanel').hidden = false;
  $('camLabel').textContent = '正在准备…';

  try {
    await ensureAudio();
    await hands.start();
    toast('手势已开启，把手放进画面搓动', true);
  } catch (err) {
    hands.stop();
    $('camPanel').hidden = true;
    btn.classList.remove('is-busy', 'is-on');
    toast(err?.message || '摄像头不可用', false, 3200);
  }
});

$('btnShake').addEventListener('click', async () => {
  const btn = $('btnShake');
  if (shake.active) {
    shake.disable();
    btn.classList.remove('is-on');
    toast('已关闭摇一摇');
    return;
  }
  try {
    await shake.enable();
    btn.classList.add('is-on');
    toast('摇一摇已开启，甩动手机吧', true);
    haptic(20);

    // 桌面环境通常没有运动传感器
    setTimeout(() => {
      if (shake.active && !shake.received) {
        toast('这个设备没有运动传感器，试试手势或拖拽吧', false, 3200);
      }
    }, 2600);
  } catch (err) {
    toast(err?.message || '此设备不支持运动传感器');
  }
});

/* ============================================================
   启动
   ============================================================ */

async function ensureAudio() {
  try {
    await audio.start();
  } catch (err) {
    toast('音频启动失败：' + (err?.message || '未知错误'));
  }
}

$('btnStart').addEventListener('click', async () => {
  $('boot').classList.add('is-gone');
  game.started = true;
  await ensureAudio();
  audio.chime('ok');
  setTimeout(() => $('boot').remove(), 900);
  toast('按住画面左右快速搓动', true, 3200);
});

// 首次任意点击也尝试解锁音频
window.addEventListener('pointerdown', function once() {
  if (!game.started) return;
  ensureAudio();
  window.removeEventListener('pointerdown', once);
}, { passive: true });

/* ============================================================
   主循环
   ============================================================ */

const clock = new THREE.Clock();
let hudTimer = 0;
let fpsAcc = 0;
let fpsFrames = 0;
let perfTimer = 0;
let saveTimer = 0;

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  /* —— 物理 —— */
  physics.update(dt);
  const omega = physics.omega;

  /* —— 竹片旋转与残影 —— */
  toy.spinner.rotation.y = (toy.spinner.rotation.y + omega * dt) % (Math.PI * 2);
  updateTrail(toy.trail, omega);

  /* —— 场景氛围 —— */
  const load = physics.load;
  glow.material.opacity = 0.14 + load * 0.16;
  warmFill.intensity = 5 + load * 6;
  halo.material.opacity = 0.35 + load * 0.3;
  updateDust(dust, t, omega);

  /* —— 声音 —— */
  audio.update(omega);

  /* —— 玩法判定 —— */
  const rpm = physics.rpm;

  if (rpm >= SING_RPM) {
    game.singing += dt;
    game.grace = GRACE;
  } else if (game.singing > 0) {
    if (game.grace > 0) {
      game.grace -= dt;
    } else {
      game.singing = 0;
    }
  }

  if (rpm > game.peakRpm) game.peakRpm = rpm;

  // 记录最佳（1s 节流写盘）
  saveTimer += dt;
  let dirty = false;
  if (game.singing > game.best.long + 0.05) {
    game.best.long = game.singing;
    dirty = true;
  }
  if (game.peakRpm > game.best.speed + 1) {
    game.best.speed = game.peakRpm;
    dirty = true;
  }
  if (dirty && saveTimer > 1) {
    saveTimer = 0;
    saveBest(game.best);
  }

  // 达成目标反馈
  const cfg = CHALLENGE[game.mode];
  const reached = game.mode === 'long'
    ? game.singing >= cfg.target
    : game.peakRpm >= cfg.target;

  if (reached && !game.lastBeepGoal) {
    game.lastBeepGoal = true;
    audio.chime('ok');
    el.panel.classList.add('is-hit');
    setTimeout(() => el.panel.classList.remove('is-hit'), 520);
    toast(game.mode === 'long'
      ? `达成 ${cfg.target}s 长鸣！`
      : `突破 ${cfg.target.toLocaleString('en-US')} RPM！`, true, 3000);
  }

  /* —— HUD —— */
  hudTimer += dt;
  if (hudTimer > 0.06) {
    hudTimer = 0;
    renderHUD();
  }

  /* —— 自适应画质 —— */
  fpsAcc += dt;
  fpsFrames++;
  perfTimer += dt;
  if (perfTimer > 2.5) {
    const fps = fpsFrames / fpsAcc;
    if (fps < 42 && dpr > 1) {
      dpr = 1;
      renderer.setPixelRatio(dpr);
    }
    perfTimer = 0;
    fpsAcc = 0;
    fpsFrames = 0;
  }

  controls.update();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(tick);

/* ============================================================
   尺寸 / 可见性
   ============================================================ */

let wasLandscape = window.innerWidth > window.innerHeight;

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  hands.running && hands._resize();

  // 横竖屏切换时重新构图，避免竹片被裁掉
  const isLandscape = w > h;
  if (isLandscape !== wasLandscape) {
    wasLandscape = isLandscape;
    frameCamera();
  }
}

window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 240));

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    audio.suspend();
  } else {
    audio.resume();
    clock.getDelta();
  }
});

/* —— 首屏同步 —— */
syncChallengeCopy();
renderHUD();

// 便于自测
window.__bamboo = { physics, game, toy, audio, scene, camera, renderer };
