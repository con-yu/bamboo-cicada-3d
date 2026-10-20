/* ============================================================
   摄像头手势控制（MediaPipe Tasks Vision · HandLandmarker）
   手掌左右往复搓动 → 驱动竹片角速度
   ============================================================ */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ]);
}

const VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17]
];

export class HandsController {
  constructor({ video, overlay, onStroke, onStatus }) {
    this.video = video;
    this.overlay = overlay;
    this.ctx2d = overlay.getContext('2d');
    this.onStroke = onStroke;
    this.onStatus = onStatus || (() => {});

    this.running = false;
    this.stream = null;
    this.landmarker = null;
    this.raf = 0;

    this.prev = null;
    this.smoothV = 0;
    this.lastKick = 0;
    this.lastDetect = 0;
    this.hasHand = false;

    this._loop = this._loop.bind(this);
  }

  async start() {
    if (this.running) return;
    this.onStatus({ state: 'loading', message: '请求摄像头…' });

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('当前浏览器不支持摄像头');
    }

    this.stream = await withTimeout(
      navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      }),
      14000,
      '摄像头请求超时，请检查权限设置'
    );

    this.video.srcObject = this.stream;
    await this.video.play().catch(() => {});

    this.onStatus({ state: 'loading', message: '加载识别模型…' });

    let mod;
    try {
      mod = await import(VISION_URL);
    } catch (err) {
      throw new Error('手势模型加载失败（网络受限）');
    }
    const { HandLandmarker, FilesetResolver } = mod;

    const fileset = await withTimeout(
      FilesetResolver.forVisionTasks(WASM_URL),
      16000,
      '手势运行时加载超时'
    );

    try {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
    } catch (err) {
      // GPU 委托失败时退回 CPU
      this.landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numHands: 1
      });
    }

    this.running = true;
    this.prev = null;
    this.onStatus({ state: 'live', message: '把手放进画面搓动' });
    this._resize();
    this.raf = requestAnimationFrame(this._loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.video.srcObject = null;
    this.ctx2d && this.ctx2d.clearRect(0, 0, this.overlay.width, this.overlay.height);
    this.prev = null;
    try { this.landmarker && this.landmarker.close(); } catch (e) {}
    this.landmarker = null;
    this.hasHand = false;
  }

  _resize() {
    const c = this.overlay;
    const w = c.clientWidth || 160;
    const h = c.clientHeight || 120;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    this.dpr = dpr;
  }

  _loop() {
    if (!this.running) return;

    const v = this.video;
    const now = performance.now();

    if (this.landmarker && v.readyState >= 2 && v.videoWidth > 0) {
      if (now - this.lastDetect > 28) {
        this.lastDetect = now;
        let res = null;
        try {
          res = this.landmarker.detectForVideo(v, now);
        } catch (e) { /* 偶发丢帧，忽略 */ }
        if (res) this._handle(res, now);
      }
    }

    this.raf = requestAnimationFrame(this._loop);
  }

  _handle(res, now) {
    const lm = res.landmarks && res.landmarks[0];

    if (!lm) {
      if (this.hasHand) {
        this.hasHand = false;
        this.onStatus({ state: 'live', message: '把手放进画面搓动' });
      }
      this.prev = null;
      this.smoothV *= 0.8;
      this._draw(null);
      return;
    }

    if (!this.hasHand) {
      this.hasHand = true;
      this.onStatus({ state: 'live', message: '跟手掌节奏来回搓' });
    }
    this._draw(lm);

    // 掌心（中指根部）位置 + 掌宽归一化
    const palm = lm[9];
    const scale = Math.max(0.02, Math.hypot(lm[5].x - lm[17].x, lm[5].y - lm[17].y));

    if (!this.prev) {
      this.prev = { x: palm.x, y: palm.y, t: now };
      return;
    }

    const dt = Math.max(8, now - this.prev.t) / 1000;
    const vx = (palm.x - this.prev.x) / dt;
    this.prev = { x: palm.x, y: palm.y, t: now };

    // 平滑（掌宽 / 秒）
    const speed = Math.abs(vx) / scale;
    this.smoothV = this.smoothV * 0.55 + speed * 0.45;

    if (this.smoothV > 0.55 && now - this.lastKick > 52) {
      this.lastKick = now;
      this.onStroke(clamp(this.smoothV * 15, 4, 88));
    }
  }

  _draw(lm) {
    const c = this.overlay;
    const g = this.ctx2d;
    const dpr = this.dpr || 1;

    g.clearRect(0, 0, c.width, c.height);
    if (!lm) return;

    const v = this.video;
    const vw = v.videoWidth || 640;
    const vh = v.videoHeight || 480;
    const cw = c.width, ch = c.height;

    const s = Math.max(cw / vw, ch / vh);
    const dw = vw * s, dh = vh * s;
    const ox = (cw - dw) / 2, oy = (ch - dh) / 2;

    const P = (i) => ({
      x: ox + lm[i].x * dw,
      y: oy + lm[i].y * dh
    });

    g.lineWidth = 1.6 * dpr;
    g.strokeStyle = 'rgba(111,227,192,.75)';
    g.beginPath();
    for (const [a, b] of CONNECTIONS) {
      const p1 = P(a), p2 = P(b);
      g.moveTo(p1.x, p1.y);
      g.lineTo(p2.x, p2.y);
    }
    g.stroke();

    for (let i = 0; i < lm.length; i++) {
      const p = P(i);
      const big = [0, 5, 9, 13, 17].includes(i);
      g.beginPath();
      g.arc(p.x, p.y, (big ? 3 : 2) * dpr, 0, Math.PI * 2);
      g.fillStyle = big ? '#ffe9bd' : 'rgba(111,227,192,.9)';
      g.fill();
    }
  }
}
