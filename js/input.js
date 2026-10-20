/* ============================================================
   输入：鼠标 / 触摸搓动、键盘、摇一摇
   ============================================================ */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * 拖拽搓动：把横向滑动的速度换算成一次角速度冲量
 */
export class StrokeInput {
  constructor(el, onStroke) {
    this.el = el;
    this.onStroke = onStroke;
    this.enabled = true;

    this.ptrs = new Map();
    this.lastStroke = 0;

    this.minSpeed = 0.30;   // 屏宽 / 秒
    this.gain = 17;
    this.maxPush = 72;
    this.cooldown = 42;     // ms

    this._down = this._down.bind(this);
    this._move = this._move.bind(this);
    this._up = this._up.bind(this);

    el.addEventListener('pointerdown', this._down, { passive: true });
    window.addEventListener('pointermove', this._move, { passive: true });
    window.addEventListener('pointerup', this._up, { passive: true });
    window.addEventListener('pointercancel', this._up, { passive: true });
    window.addEventListener('blur', () => this.ptrs.clear());
  }

  _down(e) {
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
  }

  _up(e) {
    this.ptrs.delete(e.pointerId);
  }

  _move(e) {
    if (!this.enabled) return;
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;

    const now = performance.now();
    const dt = now - p.t;
    if (dt < 2) return;

    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    p.t = now;

    // 多指 = 转视角 / 缩放，不搓
    if (this.ptrs.size > 1) return;
    // 右键 / Shift = 转视角
    if (e.pointerType === 'mouse' && ((e.buttons & 2) || e.shiftKey)) return;

    const dist = Math.hypot(dx, dy);
    const speed = dist / window.innerWidth / (dt / 1000);
    if (speed < this.minSpeed) return;
    if (now - this.lastStroke < this.cooldown) return;

    this.lastStroke = now;
    this.onStroke(clamp(speed * this.gain, 4, this.maxPush));
  }
}

/**
 * 摇一摇：用加速度计的水平抖动驱动
 */
export class ShakeInput {
  constructor(onKick) {
    this.onKick = onKick;
    this.active = false;
    this.last = 0;
    this.received = false;
    this.gx = 0; this.gy = 0;

    this._handler = this._handler.bind(this);
  }

  static get supported() {
    return typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
  }

  /** iOS 13+ 需要在用户手势里申请权限 */
  async enable() {
    if (this.active) return true;

    if (typeof DeviceMotionEvent !== 'undefined' &&
        typeof DeviceMotionEvent.requestPermission === 'function') {
      const res = await DeviceMotionEvent.requestPermission();
      if (res !== 'granted') throw new Error('未获得运动传感器权限');
    }

    this.received = false;
    window.addEventListener('devicemotion', this._handler, { passive: true });
    this.active = true;
    return true;
  }

  disable() {
    window.removeEventListener('devicemotion', this._handler);
    this.active = false;
  }

  _handler(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    this.received = true;

    // 低通估计重力方向
    this.gx = this.gx * 0.88 + a.x * 0.12;
    this.gy = this.gy * 0.88 + a.y * 0.12;

    const ax = a.x - this.gx;
    const ay = a.y - this.gy;
    const mag = Math.hypot(ax, ay);

    const now = performance.now();
    if (mag > 5.5 && now - this.last > 130) {
      this.last = now;
      this.onKick(clamp(mag * 3.6, 10, 88));
    }
  }
}

/**
 * 键盘：空格 / ↑ 连按也能搓
 */
export class KeyInput {
  constructor(onStroke) {
    this.onStroke = onStroke;
    this.last = 0;
    this.held = new Set();

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key;
      if (k === ' ' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') {
        e.preventDefault();
        this._push();
        this.held.add(k);
      }
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.key));

    // 按住连续搓
    this._timer = setInterval(() => {
      if (this.held.size) this._push();
    }, 90);
  }

  _push() {
    const now = performance.now();
    if (now - this.last < 60) return;
    this.last = now;
    this.onStroke(26);
  }
}
