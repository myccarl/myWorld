// 声音（D11）：全部用 Web Audio 现场合成，不需要下载任何音频文件，文字模式和 3D 模式都生效。
//
//   环境声：海浪（一起一伏）、风（风暴时大）、雨（风暴）、白天偶尔的鸟叫；在屋里时外面的声音变闷。
//   音效：脚步、信号箱的"滴"、收音机的"嗡——"、冰柜的"咔哒"、断断续续的广播、浪拍上来、雷声、风铃、敲键盘。
//   主旋律（原创）三个版本：light 轻快（上午的旧街）、night 钢琴慢版（深夜）、full 完整版（读信和片尾）。
//
// 剧情里怎么用：
//   场景：music: 'light' | 'night' | 'full'（不写 = 停）；indoor: true（文字模式下当作在屋里）
//   节点：sfx: 'beep' | 'hum' | 'click' | 'static' | 'typing'；music: 同上（进入节点时换音乐）
// 浏览器规定：要等玩家第一次点击 / 按键之后才能出声（iOS 尤其严格）。切到后台时自动暂停。
// 暂停菜单里可以关掉声音（设置 sound）。
//
// 以后想换成录好的声音：放到 assets/audio/ 下，用 loadFile() 加载（预留，暂未使用）。

import * as state from '../state.js';

const VOL = { master: 0.85, music: 0.3, amb: 0.55, sfx: 0.7 };

// ---------- 主旋律（原创，G 大调，8 小节）----------
// [MIDI 音高 或 null（休止）, 拍数]
const THEME = [
  [71, 1], [74, 1], [76, 2], [74, 1], [71, 1], [69, 2],
  [67, 1], [69, 1], [71, 1], [74, 1], [71, 3], [null, 1],
  [71, 1], [74, 1], [76, 1], [79, 1], [76, 1], [74, 1], [71, 2],
  [69, 1], [71, 1], [67, 1], [64, 1], [67, 3], [null, 1]
];
// 每小节的和弦（根音 + 三和弦）：G D Em G C G D G
const CHORDS = [
  [43, [55, 59, 62]], [38, [54, 57, 62]], [40, [55, 59, 64]], [43, [55, 59, 62]],
  [36, [55, 60, 64]], [43, [55, 59, 62]], [38, [54, 57, 62]], [43, [55, 59, 67]]
];
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.mood = 'day';
    this.indoorScene = false;
    this.indoor3d = null; // 3D 模式下由世界告诉我们在不在屋里
    this.wantMusic = null;
    this.musicName = null;
    this.seq = null;
    this.typing = false;
    this.chime = 0;
    this.t = 0;
  }

  // ---------- 启动 ----------
  init() {
    const unlock = () => this.start();
    ['pointerdown', 'keydown', 'touchend'].forEach((ev) => window.addEventListener(ev, unlock, { passive: true }));
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else if (this.enabled()) this.ctx.resume();
    });
    window.addEventListener('fengting:silence', (e) => { if (e.detail === 'pause') this.typing = false; });
  }

  enabled() { return state.getSetting('sound') !== false; }

  setEnabled(on) {
    state.setSetting('sound', on);
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(on ? VOL.master : 0, this.ctx.currentTime, 0.1);
    if (on) this.ctx.resume();
  }

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && this.enabled() && !document.hidden) this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch { return; }
    const c = this.ctx;

    this.master = c.createGain();
    this.master.gain.value = this.enabled() ? VOL.master : 0;
    this.master.connect(c.destination);

    // 混响：用衰减的噪声做一个约 2.8 秒的房间
    this.reverb = c.createConvolver();
    this.reverb.buffer = this.impulse(2.8);
    this.reverbOut = c.createGain();
    this.reverbOut.gain.value = 0.5;
    this.reverb.connect(this.reverbOut).connect(this.master);

    this.music = c.createGain();
    this.music.gain.value = VOL.music;
    this.music.connect(this.master);
    this.musicSend = c.createGain();
    this.musicSend.gain.value = 0.55;
    this.music.connect(this.musicSend).connect(this.reverb);

    this.sfx = c.createGain();
    this.sfx.gain.value = VOL.sfx;
    this.sfx.connect(this.master);
    const sfxSend = c.createGain();
    sfxSend.gain.value = 0.18;
    this.sfx.connect(sfxSend).connect(this.reverb);

    // 环境声：经过一个低通（在屋里时变闷）
    this.ambFilter = c.createBiquadFilter();
    this.ambFilter.type = 'lowpass';
    this.ambFilter.frequency.value = 16000;
    this.amb = c.createGain();
    this.amb.gain.value = VOL.amb;
    this.ambFilter.connect(this.amb).connect(this.master);

    this.noise = this.noiseBuffer(3);
    const branch = (type, freq, q) => {
      const src = c.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.start(0, Math.random() * 2.5);
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.ambFilter);
      return { f, g };
    };
    this.sea = branch('lowpass', 520, 0.7);
    this.wind = branch('bandpass', 600, 0.8);
    this.rain = branch('highpass', 2200, 0.5);

    this.timer = setInterval(() => this.tick(0.1), 100);
    if (this.wantMusic) this.playMusic(this.wantMusic, true);
  }

  noiseBuffer(sec) {
    const c = this.ctx;
    const b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  impulse(sec) {
    const c = this.ctx;
    const n = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2);
    }
    return b;
  }

  // ---------- 剧情事件 ----------
  onScene(scene, mood) {
    this.indoorScene = !!(scene && scene.indoor);
    this.typing = false;
    if (mood) this.mood = mood;
    this.playMusic(scene && scene.music ? scene.music : null);
  }

  setMood(m) { this.mood = m; }
  setIndoor3d(v) { this.indoor3d = v; }
  setChime(level) { this.chime = level; }

  onNode(node) {
    if (node.music !== undefined) this.playMusic(node.music);
    if (node.sfx) this.play(node.sfx);
  }

  indoor() { return this.indoor3d != null ? this.indoor3d : this.indoorScene; }

  // ---------- 每 0.1 秒：环境声的起伏 ----------
  tick(dt) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx;
    const now = c.currentTime;
    this.t += dt;
    const m = this.mood;
    const storm = m === 'storm' ? 1 : 0;
    const inside = this.indoor();

    // 海浪：大约 7 秒一个起伏，带点随机
    const wave = 0.5 + 0.5 * Math.sin(this.t * 0.9 + Math.sin(this.t * 0.23) * 1.5);
    const seaBase = storm ? 0.95 : m === 'night' ? 0.32 : 0.42;
    this.sea.g.gain.setTargetAtTime(seaBase * (0.45 + 0.55 * wave), now, 0.4);
    this.sea.f.frequency.setTargetAtTime(380 + 420 * wave + storm * 300, now, 0.4);

    const windBase = storm ? 0.75 : m === 'dusk' ? 0.28 : 0.12;
    this.wind.g.gain.setTargetAtTime(windBase * (0.6 + 0.4 * Math.sin(this.t * 0.31)), now, 0.6);
    this.wind.f.frequency.setTargetAtTime(500 + 350 * Math.sin(this.t * 0.17), now, 0.8);

    this.rain.g.gain.setTargetAtTime(storm ? 0.4 : 0, now, 1.2);
    this.ambFilter.frequency.setTargetAtTime(inside ? 700 : 16000, now, 0.3);

    // 白天在外面：偶尔的鸟叫
    if (!inside && ['dawn', 'day', 'noon', 'afternoon', 'daybreak'].includes(m) && Math.random() < dt / 6) this.chirp();
    // 风铃（3D：离杂货店越近越响）
    if (this.chime > 0.02 && Math.random() < dt * (0.6 + storm)) this.tinkle(this.chime);
    // 文字模式的风暴：偶尔打雷（3D 模式由闪电触发）
    if (storm && this.indoor3d == null && Math.random() < dt / 14) this.thunder();
    // 深夜他在敲键盘
    if (this.typing && Math.random() < dt * 7) this.key();
  }

  // ---------- 音乐 ----------
  playMusic(name, force) {
    this.wantMusic = name;
    if (!this.ctx) return;
    if (name === this.musicName && !force) return;
    this.musicName = name;
    const old = this.seq;
    if (old) old.stop(2.5);
    this.seq = name ? new Sequencer(this, name) : null;
  }

  // ---------- 乐器 ----------
  voice(dest, t, f, { type = 'sine', vel = 0.4, attack = 0.005, decay = 1, partials = null, cutoff = 0 } = {}) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    let out = g;
    if (cutoff) {
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cutoff;
      g.connect(lp);
      out = lp;
    }
    out.connect(dest);
    for (const [mult, amp, wave] of partials || [[1, 1, type]]) {
      const o = c.createOscillator();
      o.type = wave || 'sine';
      o.frequency.value = f * mult;
      const pg = c.createGain();
      pg.gain.value = amp;
      o.connect(pg).connect(g);
      o.start(t);
      o.stop(t + attack + decay + 0.05);
    }
  }

  marimba(t, m, vel = 0.32) {
    this.voice(this.music, t, hz(m), { vel, decay: 0.9, partials: [[1, 1], [4, 0.12], [10, 0.03]] });
  }

  piano(t, m, vel = 0.3, len = 2.4) {
    const f = hz(m);
    this.voice(this.music, t, f, { vel, attack: 0.006, decay: len * Math.pow(440 / f, 0.25), cutoff: 2600, partials: [[1, 1, 'triangle'], [2, 0.42], [3, 0.16], [4, 0.07]] });
  }

  bass(t, m, vel = 0.22) {
    this.voice(this.music, t, hz(m), { vel, decay: 1.1, cutoff: 600, partials: [[1, 1, 'triangle'], [2, 0.25]] });
  }

  pad(t, notes, len, vel = 0.05) {
    const c = this.ctx;
    for (const m of notes) {
      for (const det of [-6, 6]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(m);
        o.detune.value = det;
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vel, t + 1.2);
        g.gain.setValueAtTime(vel, t + Math.max(1.3, len - 1.2));
        g.gain.linearRampToValueAtTime(0.0001, t + len + 0.4);
        o.connect(lp).connect(g).connect(this.music);
        o.start(t);
        o.stop(t + len + 0.5);
      }
    }
  }

  // ---------- 音效 ----------
  play(name) {
    if (name === 'typing') { this.typing = true; return; }
    if (name === 'typing_off') { this.typing = false; return; }
    if (!this.ctx) return;
    const fn = this[name + 'Sfx'];
    if (fn) fn.call(this);
  }

  burst(t, { len = 0.08, type = 'bandpass', freq = 800, q = 1, vel = 0.3, dest = this.sfx, attack = 0.002 } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + len);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 2);
    src.stop(t + attack + len + 0.05);
    return f;
  }

  beepSfx() { // 信号箱"滴"
    const t = this.ctx.currentTime + 0.02;
    this.voice(this.sfx, t, 1760, { vel: 0.18, decay: 0.14 });
  }

  humSfx() { // 收音机"嗡——"
    const c = this.ctx;
    const t = c.currentTime + 0.02;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.5);
    g.gain.setValueAtTime(0.16, t + 1.4);
    g.gain.linearRampToValueAtTime(0.0001, t + 2.3);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    g.connect(lp).connect(this.sfx);
    for (const f of [110, 110.7, 220.4]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(g);
      o.start(t);
      o.stop(t + 2.4);
    }
  }

  clickSfx() { this.burst(this.ctx.currentTime + 0.01, { len: 0.03, freq: 2400, q: 2, vel: 0.25 }); }

  staticSfx() { // 断断续续的广播
    const t = this.ctx.currentTime + 0.02;
    for (let i = 0; i < 9; i++) this.burst(t + i * 0.22 + Math.random() * 0.1, { len: 0.12 + Math.random() * 0.15, freq: 1400, q: 0.8, vel: 0.12 + Math.random() * 0.08 });
  }

  // 脚步：地面（闷一点）/ 木头（空一点）
  step(surface = 'ground') {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    if (surface === 'wood') this.burst(t, { len: 0.07, freq: 520 + Math.random() * 120, q: 4, vel: 0.22 });
    else this.burst(t, { len: 0.06, type: 'lowpass', freq: 380 + Math.random() * 120, vel: 0.2 });
  }

  thunder() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this.burst(t, { len: 3.4, type: 'lowpass', freq: 160, q: 0.7, vel: 0.85, attack: 0.08 });
    this.burst(t + 0.3, { len: 2.2, type: 'lowpass', freq: 90, q: 0.7, vel: 0.6, attack: 0.3 });
  }

  crash() { // 浪拍上来
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const f = this.burst(t, { len: 1.4, type: 'lowpass', freq: 3200, q: 0.6, vel: 0.7, attack: 0.06 });
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(380, t + 1.3);
  }

  chirp() {
    const c = this.ctx;
    const t = c.currentTime + Math.random() * 0.2;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const o = c.createOscillator();
      const g = c.createGain();
      const s = t + i * 0.11;
      const f0 = 2600 + Math.random() * 900;
      o.frequency.setValueAtTime(f0, s);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.35, s + 0.06);
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.035, s + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.08);
      o.connect(g).connect(this.ambFilter);
      o.start(s);
      o.stop(s + 0.1);
    }
  }

  tinkle(level) {
    const notes = [88, 91, 93, 95, 98]; // 高音区的五声音阶
    const t = this.ctx.currentTime;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const m = notes[Math.floor(Math.random() * notes.length)];
      this.voice(this.sfx, t + i * 0.09, hz(m), { vel: 0.05 * level, decay: 1.8, partials: [[1, 1], [2.76, 0.4], [5.4, 0.15]] });
    }
  }

  key() {
    this.burst(this.ctx.currentTime, { len: 0.015, type: 'highpass', freq: 3200, q: 0.7, vel: 0.06 });
  }
}

// ---------- 音序器：按拍子提前安排音符，循环播放 ----------
const ARRANGE = {
  // 轻快：马林巴旋律 + 拨弦低音
  light: { bpm: 96, gain: 1, play(a, t, beat, bar, ev) {
    if (ev) a.marimba(t, ev[0], 0.3);
    if (beat % 2 === 0) a.bass(t, CHORDS[bar][0] + (beat % 4 === 2 ? 7 : 0), 0.18);
  } },
  // 钢琴慢版：低一个八度，每小节一个轻轻的和弦，留白多
  night: { bpm: 52, gain: 0.8, play(a, t, beat, bar, ev) {
    if (ev) a.piano(t, ev[0] - 12, 0.22, 3.2);
    if (beat % 4 === 0) { const ch = CHORDS[bar][1]; a.piano(t, ch[0] - 12, 0.08, 4); a.piano(t + 0.05, ch[2] - 12, 0.06, 4); }
  } },
  // 完整版：钢琴旋律 + 和弦铺底 + 低音 + 分解和弦
  full: { bpm: 70, gain: 1, play(a, t, beat, bar, ev, spb) {
    if (ev) a.piano(t, ev[0], 0.26, 2.6);
    if (beat % 4 === 0) { a.pad(t, CHORDS[bar][1], spb * 4, 0.035); a.bass(t, CHORDS[bar][0], 0.2); }
    const ch = CHORDS[bar][1];
    a.piano(t + spb * 0.5, ch[(beat + 1) % 3] - 12, 0.05, 1.2);
  } }
};

class Sequencer {
  constructor(audio, name) {
    this.a = audio;
    this.arr = ARRANGE[name];
    const c = audio.ctx;
    this.out = c.createGain();
    this.out.gain.setValueAtTime(0.0001, c.currentTime);
    this.out.gain.linearRampToValueAtTime(this.arr.gain, c.currentTime + 2.5);
    this.out.connect(audio.music);
    // 让乐器输出到这个序列自己的音量上（淡入淡出用）
    this.dest = this.out;
    this.spb = 60 / this.arr.bpm;
    // 把旋律展开成按拍的事件
    this.events = [];
    let beat = 0;
    for (const [m, len] of THEME) { this.events.push({ beat, ev: m == null ? null : [m, len] }); beat += len; }
    this.totalBeats = beat; // 32 拍 = 8 小节
    this.nextBeat = 0;
    this.startT = c.currentTime + 0.2;
    this.timer = setInterval(() => this.schedule(), 100);
    this.schedule();
  }

  schedule() {
    const a = this.a;
    const c = a.ctx;
    const ahead = c.currentTime + 0.4;
    const saved = a.music;
    a.music = this.dest; // 临时把乐器的输出指向本序列
    while (this.startT + this.nextBeat * this.spb < ahead) {
      const t = this.startT + this.nextBeat * this.spb;
      const inLoop = this.nextBeat % this.totalBeats;
      const bar = Math.floor(inLoop / 4);
      const hit = this.events.find((e) => e.beat === inLoop);
      this.arr.play(a, t, inLoop, bar, hit ? hit.ev : null, this.spb);
      this.nextBeat++;
    }
    a.music = saved;
  }

  stop(fade) {
    const c = this.a.ctx;
    clearInterval(this.timer);
    this.out.gain.cancelScheduledValues(c.currentTime);
    this.out.gain.setValueAtTime(this.out.gain.value, c.currentTime);
    this.out.gain.linearRampToValueAtTime(0.0001, c.currentTime + fade);
    setTimeout(() => this.out.disconnect(), (fade + 4) * 1000);
  }
}

export const audio = new AudioEngine();
