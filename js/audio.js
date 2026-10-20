/* ============================================================
   竹知了 · 实时声学合成（Web Audio API）
   —— 无任何录音采样，全部为振荡器 / 噪声 / 滤波器实时生成
   ============================================================

   建模思路（参考真实玩具的发声机制）：
   竹片高速切割空气 → 周期性黏滑脉冲（每转一次一个「哇」）
   脉冲激励薄竹片振动 → 竹片 + 空气腔的多个共振峰塑形
   转速 ↑  → 脉冲更密（哇哇哇变急）、激励更强（更响）、
             共振腔张力变化更剧烈（音调更高）
   ============================================================ */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

function makeShaperCurve(k = 3.2) {
  const N = 2048;
  const curve = new Float32Array(N);
  const norm = Math.tanh(k);
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * k) / norm;
  }
  return curve;
}

function makeNoiseBuffer(ctx, seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.04 * white) / 1.04;   // 轻微布朗化，更接近气流
    data[i] = last * 3.2 + white * 0.35;
  }
  return buf;
}

export class BambooAudio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.started = false;
    this.lastVol = 0;
  }

  async start() {
    if (this.started) {
      if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('Web Audio API 不可用');

    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    await ctx.resume();

    /* ————— 主链路 ————— */
    const master = ctx.createGain();
    master.gain.value = 0;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 20;
    comp.ratio.value = 4.5;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;

    master.connect(comp);
    comp.connect(ctx.destination);

    const body = ctx.createGain();
    body.gain.value = 0;
    body.connect(master);

    /* ————— 激励源：声带式锯齿脉冲 ————— */
    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = 90;

    const oscB = ctx.createOscillator();
    oscB.type = 'square';
    oscB.frequency.value = 180;
    oscB.detune.value = 7;

    const oscC = ctx.createOscillator();
    oscC.type = 'triangle';
    oscC.frequency.value = 45;

    const oscBgain = ctx.createGain();
    oscBgain.gain.value = 0.42;
    const oscCgain = ctx.createGain();
    oscCgain.gain.value = 0.34;

    const oscMix = ctx.createGain();
    oscMix.gain.value = 0.32;

    oscA.connect(oscMix);
    oscB.connect(oscBgain).connect(oscMix);
    oscC.connect(oscCgain).connect(oscMix);

    // 非线性削波：制造竹片摩擦的毛糙谐波
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeShaperCurve(3.4);
    shaper.oversample = '2x';

    oscMix.connect(shaper);

    /* ————— 竹片 / 腔体：三联共振峰 ————— */
    const formants = [
      { f: 800, q: 5.0, g: 1.00 },
      { f: 1260, q: 6.5, g: 0.52 },
      { f: 2600, q: 9.0, g: 0.26 }
    ].map((cfg) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = cfg.f;
      bp.Q.value = cfg.q;
      const gn = ctx.createGain();
      gn.gain.value = cfg.g;
      shaper.connect(bp);
      bp.connect(gn);
      return { bp, gn, cfg };
    });

    const dry = ctx.createGain();
    dry.gain.value = 0.13;
    shaper.connect(dry);

    const toneSum = ctx.createGain();
    toneSum.gain.value = 1.0;
    formants.forEach((f) => f.gn.connect(toneSum));
    dry.connect(toneSum);

    /* ————— 气流噪声层 ————— */
    const noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(ctx, 2.2);
    noise.loop = true;

    const noiseBP = ctx.createBiquadFilter();
    noiseBP.type = 'bandpass';
    noiseBP.frequency.value = 1400;
    noiseBP.Q.value = 0.8;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;

    noise.connect(noiseBP).connect(noiseGain);
    noiseGain.connect(body);

    /* ————— 周期调制（每转一圈一个「哇」）————— */
    const amLfo = ctx.createOscillator();
    amLfo.type = 'sine';
    amLfo.frequency.value = 4;

    // 振幅调制
    const amGain = ctx.createGain();
    amGain.gain.value = 0.62;

    const amDepth = ctx.createGain();
    amDepth.gain.value = 0.38;
    amLfo.connect(amDepth);
    amDepth.connect(amGain.gain);

    // 音高微摆（黏滑张力变化）
    const pitchDepth = ctx.createGain();
    pitchDepth.gain.value = 6;
    amLfo.connect(pitchDepth);
    pitchDepth.connect(oscA.frequency);
    pitchDepth.connect(oscC.frequency);

    const pitchDepthB = ctx.createGain();
    pitchDepthB.gain.value = 12;
    amLfo.connect(pitchDepthB);
    pitchDepthB.connect(oscB.frequency);

    toneSum.connect(amGain);
    amGain.connect(body);

    /* ————— 启动 ————— */
    const t0 = ctx.currentTime;
    oscA.start(t0);
    oscB.start(t0);
    oscC.start(t0);
    amLfo.start(t0);
    noise.start(t0);

    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(0.9, t0 + 0.6);

    Object.assign(this, {
      master, body, oscA, oscB, oscC, formants, amLfo,
      amGain, amDepth, pitchDepth, pitchDepthB,
      noiseBP, noiseGain
    });

    this.started = true;
    this.ready = true;
  }

  /**
   * 每帧根据角速度刷新所有声学参数
   * @param {number} omega 角速度 rad/s
   */
  update(omega) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const T = 0.055;   // 平滑时间常数

    const r = Math.abs(omega) / (Math.PI * 2);   // 转/秒

    const gate = smoothstep(2.0, 5.6, r);
    const norm = clamp(r / 46, 0, 1);

    // —— 响度：低速几乎无声，高速逼近满响 ——
    const vol = gate * Math.pow(norm, 0.72) * 0.86;
    this.lastVol = vol;

    this.body.gain.setTargetAtTime(vol, now, T);

    if (vol < 0.0006) {
      this.noiseGain.gain.setTargetAtTime(0, now, T);
      return;
    }

    // —— 基频：转速越高，调子越高 ——
    const f0 = 74 + 3.7 * r;                 // 74 → 约 244 Hz
    this.oscA.frequency.setTargetAtTime(f0, now, T);
    this.oscB.frequency.setTargetAtTime(f0 * 2.006, now, T);
    this.oscC.frequency.setTargetAtTime(f0 * 0.5, now, T);

    // —— 每转一次一个「哇」 ——
    const fAm = clamp(r * 0.95, 2.8, 34);
    this.amLfo.frequency.setTargetAtTime(fAm, now, T);

    const depthAmp = lerp(0.66, 0.16, clamp(r / 40, 0, 1));
    this.amDepth.gain.setTargetAtTime(depthAmp, now, T);
    this.amGain.gain.setTargetAtTime(1 - depthAmp * 0.62, now, T);

    // —— 黏滑张力带来的音高摆动 ——
    this.pitchDepth.gain.setTargetAtTime(f0 * 0.055 * (0.55 + depthAmp * 0.6), now, T);
    this.pitchDepthB.gain.setTargetAtTime(f0 * 0.11 * (0.55 + depthAmp * 0.6), now, T);

    // —— 共振峰随转速上升收拢（哇 → 呜 → 嘶）——
    const x = clamp(r / 38, 0, 1);
    const fs = [lerp(820, 560, x), lerp(1280, 1010, x), 2500 + 9 * r];
    this.formants.forEach((f, i) => {
      f.bp.frequency.setTargetAtTime(fs[i], now, 0.12);
    });

    // —— 气流噪声 ——
    this.noiseBP.frequency.setTargetAtTime(1200 + 62 * r, now, T);
    this.noiseGain.gain.setTargetAtTime(vol * 0.24, now, T);
  }

  /** 达成成就时的合成提示音（同样不用任何采样） */
  chime(kind = 'ok') {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const base = kind === 'ok' ? 660 : 880;
    [1, 1.5, 2.25].forEach((mul, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = base * mul;
      g.gain.setValueAtTime(0, now + i * 0.055);
      g.gain.linearRampToValueAtTime(0.16 / (i + 1), now + i * 0.055 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.055 + 0.75);
      o.connect(g).connect(this.master);
      o.start(now + i * 0.055);
      o.stop(now + i * 0.055 + 0.85);
    });
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
}
