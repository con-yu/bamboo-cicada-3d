/* ============================================================
   旋转物理
   搓动 → 角速度冲量 → 空气阻力（线性 + 二次）自然衰减
   ============================================================ */

export class SpinPhysics {
  constructor() {
    this.omega = 0;          // rad/s
    this.maxOmega = 430;     // 约 4100 RPM 的物理上限
    this.peak = 0;           // 本次会话峰值

    this.dragLinear = 0.33;  // 轴摩擦
    this.dragQuad = 0.00035; // 空气阻力（∝ ω²）

    this._acc = 0;
    this._step = 1 / 240;
    this.recent = [];        // 最近的角度用于残影已由模型处理
  }

  /**
   * 一次「搓」的冲量
   * @param {number} amount 期望角速度增量（rad/s），会被上限饱和衰减
   */
  kick(amount) {
    const headroom = Math.max(0, 1 - this.omega / this.maxOmega);
    const eff = amount * Math.pow(headroom, 0.85);
    this.omega = Math.min(this.maxOmega, this.omega + eff);
    if (this.omega > this.peak) this.peak = this.omega;
  }

  update(dt) {
    this._acc += Math.min(dt, 0.1);
    while (this._acc >= this._step) {
      this._integrate(this._step);
      this._acc -= this._step;
    }
  }

  _integrate(h) {
    const w = this.omega;
    if (w <= 0) { this.omega = 0; return; }

    const drag = this.dragLinear * w + this.dragQuad * w * w;
    let next = w - drag * h;

    // 静摩擦：低速直接归零，避免无限长尾
    if (next < 0.6) next = 0;

    this.omega = next;
    if (next > this.peak) this.peak = next;
  }

  reset() {
    this.omega = 0;
    this.peak = 0;
    this._acc = 0;
  }

  get rpm() {
    return (this.omega * 60) / (Math.PI * 2);
  }

  get revPerSec() {
    return this.omega / (Math.PI * 2);
  }

  /** 0..1，用于各种可视化映射 */
  get load() {
    return Math.min(1, this.omega / this.maxOmega);
  }
}
