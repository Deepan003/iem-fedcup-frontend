/**
 * FED Cup sound engine: synthesized effects (no audio files, nothing to license), crowd ambience,
 * admin-uploaded music with ducking, and an announcer voice (browser speech, male/female).
 *
 * Browsers only allow sound after a user gesture, so nothing plays until unlock() runs from a click.
 */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ---------------------------- device preferences ---------------------------- */

const PREF_DEFAULTS = {
  studio: { on: true, volume: 90, music: true, voice: true, voiceName: '' },
  captain: { on: true, volume: 80, music: false, voice: false, voiceName: '' },
  admin: { on: false, volume: 70, music: false, voice: true, voiceName: '' },
};

export function loadPrefs(surface) {
  const d = PREF_DEFAULTS[surface] || PREF_DEFAULTS.studio;
  try {
    return { ...d, ...(JSON.parse(localStorage.getItem(`fedcup.sound.${surface}`) || 'null') || {}) };
  } catch {
    return { ...d };
  }
}

export function savePrefs(surface, prefs) {
  try { localStorage.setItem(`fedcup.sound.${surface}`, JSON.stringify(prefs)); } catch { /* private mode */ }
}

/* --------------------------------- voices ---------------------------------- */

const FEMALE = /female|woman|zira|samantha|victoria|karen|moira|tessa|fiona|veena|heera|neerja|aria|jenny|sonia|libby|susan|hazel|catherine|serena|allison|ava|kate|swara|kalpana|lekha|google uk english female|google us english/i;
const MALE = /\bmale\b|\bman\b|david|mark|daniel|alex|fred|rishi|ravi|guy|ryan|george|prabhat|james|thomas|oliver|arthur|aaron|google uk english male|hemant|madhur/i;

export function listVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
}

/** Best voice for a gender; prefers Indian, then British English, then any English. */
export function pickVoice(gender, preferredName = '') {
  const voices = listVoices();
  if (!voices.length) return null;
  if (preferredName) {
    const exact = voices.find((v) => v.name === preferredName);
    if (exact) return exact;
  }
  const wanted = gender === 'female' ? FEMALE : MALE;
  const other = gender === 'female' ? MALE : FEMALE;
  const score = (v) => {
    let s = 0;
    if (wanted.test(v.name)) s += 10;
    if (other.test(v.name) && !wanted.test(v.name)) s -= 10;
    if (/en-IN/i.test(v.lang)) s += 3;
    else if (/en-GB/i.test(v.lang)) s += 2;
    else if (/en-US/i.test(v.lang)) s += 1;
    if (/natural|neural|online/i.test(v.name)) s += 2;
    return s;
  };
  return [...voices].sort((a, b) => score(b) - score(a))[0];
}

/* --------------------------------- engine ---------------------------------- */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.unlocked = false;
    this.settings = {};
    this.prefs = PREF_DEFAULTS.studio;
    this.surface = 'studio';
    this.music = {}; // slot -> HTMLAudioElement
    this.trackUrls = {};
    this.bedWanted = false;
    this.bedLevel = 1; // 0..1, lowered during bidding
    this.speaking = false;
    this.voiceQueue = [];
    this.voiceGen = 0; // bumps on interrupt so stale onend events are ignored
    this.crowdNode = null;
    this.listeners = new Set();
  }

  /* ---------- state ---------- */

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() { this.listeners.forEach((fn) => fn()); }

  configure({ settings, prefs, surface }) {
    this.settings = settings || {};
    this.prefs = prefs || this.prefs;
    this.surface = surface || this.surface;
    this.syncTracks(this.settings.tracks || {});
    this.applyLevels();
  }

  /** Effective switches: admin settings AND this device's preferences. */
  get active() {
    const s = this.settings;
    if (!this.unlocked || !s.enabled || !this.prefs.on) return false;
    if (this.surface === 'studio') return s.studioSound !== false;
    if (this.surface === 'captain') return s.captainSound !== false;
    return true;
  }

  get voiceOn() { return this.active && this.settings.voice !== false && this.prefs.voice; }

  get musicOn() { return this.active && this.settings.music !== false && this.prefs.music; }

  get crowdOn() { return this.active && this.settings.crowd !== false; }

  level(kind) {
    const master = clamp(this.prefs.volume ?? 80, 0, 100) / 100;
    const map = { sfx: this.settings.sfxVolume, music: this.settings.musicVolume, voice: this.settings.voiceVolume };
    return master * (clamp(map[kind] ?? 80, 0, 100) / 100);
  }

  /** Must be called from a click/tap. Creates the audio context and wakes speech. */
  async unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.sfxBus = this.ctx.createGain();
        this.sfxBus.connect(this.master);
        this.crowdBus = this.ctx.createGain();
        this.crowdBus.gain.value = 0;
        this.crowdBus.connect(this.master);
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      if (window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        window.speechSynthesis.speak(u);
      }
      this.unlocked = true;
      this.applyLevels();
      this.emit();
      return true;
    } catch {
      return false;
    }
  }

  applyLevels() {
    if (this.sfxBus) this.sfxBus.gain.value = this.active ? this.level('sfx') : 0;
    this.updateMusicVolume();
    if (!this.crowdOn) this.crowd(false);
  }

  /* ---------- synth helpers ---------- */

  get t() { return this.ctx.currentTime; }

  can() { return this.active && this.ctx; }

  env(gainNode, start, attack, peak, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, start);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + attack);
    g.exponentialRampToValueAtTime(0.0001, start + attack + decay);
  }

  osc(type, freq, start, dur, peak, { attack = 0.005, to = null, dest = null, detune = 0 } = {}) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (to) o.frequency.exponentialRampToValueAtTime(to, start + dur);
    o.detune.value = detune;
    this.env(g, start, attack, peak, dur);
    o.connect(g).connect(dest || this.sfxBus);
    o.start(start);
    o.stop(start + attack + dur + 0.05);
    return o;
  }

  noiseBuffer(seconds = 2) {
    if (this.nb && this.nb.duration >= seconds) return this.nb;
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0; let b1 = 0; let b2 = 0;
    for (let i = 0; i < len; i += 1) { // soft pink-ish noise
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
    }
    this.nb = buf;
    return buf;
  }

  noise(start, dur, peak, { type = 'bandpass', freq = 1000, q = 1, to = null, attack = 0.005, dest = null } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(Math.max(2, dur + 0.5));
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, start);
    if (to) f.frequency.exponentialRampToValueAtTime(to, start + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, start, attack, peak, dur);
    src.connect(f).connect(g).connect(dest || this.sfxBus);
    src.start(start);
    src.stop(start + attack + dur + 0.05);
  }

  /* ---------- effects ---------- */

  /** Bid tick: pitch climbs with how far the price is above base. */
  bid(multiple = 1) {
    if (!this.can()) return;
    const t = this.t;
    const step = clamp(Math.log2(Math.max(1, multiple)), 0, 2.5);
    const f = 520 * 2 ** (step * 0.5);
    this.osc('triangle', f, t, 0.12, 0.35);
    this.osc('sine', f * 2, t, 0.08, 0.12);
    this.noise(t, 0.03, 0.25, { type: 'highpass', freq: 3500 });
  }

  /** Countdown beep for the last seconds (higher for the final three). */
  beep(final = false) {
    if (!this.can()) return;
    const t = this.t;
    this.osc('sine', final ? 1320 : 880, t, final ? 0.16 : 0.11, final ? 0.32 : 0.22);
  }

  /** Time up: a short, soft stadium buzzer. */
  buzzer() {
    if (!this.can()) return;
    const t = this.t;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.connect(this.sfxBus);
    this.osc('sawtooth', 110, t, 0.55, 0.22, { dest: lp });
    this.osc('sawtooth', 116, t, 0.55, 0.18, { dest: lp });
  }

  /** Auctioneer's gavel: a wooden knock with a low thump. */
  gavel(times = 1) {
    if (!this.can()) return;
    for (let i = 0; i < times; i += 1) {
      const t = this.t + i * 0.22;
      this.noise(t, 0.09, 0.9, { freq: 1100, q: 1.4 });
      this.osc('sine', 160, t, 0.18, 0.8, { to: 55 });
    }
  }

  /** New player: an airy whoosh. */
  whoosh() {
    if (!this.can()) return;
    this.noise(this.t, 0.7, 0.4, { freq: 300, to: 3200, q: 0.8, attack: 0.25 });
  }

  /** Referee whistle (auction start). */
  whistle() {
    if (!this.can()) return;
    [0, 0.38].forEach((offset, i) => {
      const t = this.t + offset;
      const o = this.ctx.createOscillator();
      const lfo = this.ctx.createOscillator();
      const depth = this.ctx.createGain();
      const g = this.ctx.createGain();
      o.frequency.value = 2900;
      lfo.frequency.value = 32;
      depth.gain.value = 140;
      lfo.connect(depth).connect(o.frequency);
      const dur = i === 0 ? 0.22 : 0.55;
      this.env(g, t, 0.01, 0.16, dur);
      o.connect(g).connect(this.sfxBus);
      o.start(t); lfo.start(t);
      o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
      this.noise(t, dur, 0.05, { type: 'highpass', freq: 5000 });
    });
  }

  /** Bidding open: a short brass-like stadium horn. */
  horn() {
    if (!this.can()) return;
    const t = this.t;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.exponentialRampToValueAtTime(2400, t + 0.15);
    lp.frequency.exponentialRampToValueAtTime(700, t + 0.7);
    lp.connect(this.sfxBus);
    [220, 277.18, 329.63].forEach((f) => {
      this.osc('sawtooth', f, t, 0.7, 0.14, { attack: 0.04, dest: lp });
      this.osc('sawtooth', f, t, 0.7, 0.1, { attack: 0.04, dest: lp, detune: 9 });
    });
  }

  /** Synth "SOLD" sting (used when no sold track is uploaded). */
  soldSting() {
    if (!this.can()) return;
    const t = this.t + 0.12;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + 1.2);
    lp.connect(this.sfxBus);
    [261.63, 329.63, 392, 523.25].forEach((f, i) => {
      this.osc('sawtooth', f, t, 1.1, 0.12, { attack: 0.02, dest: lp });
      this.osc('triangle', f * 2, t + i * 0.05, 0.9, 0.06, { attack: 0.01, dest: lp });
    });
    this.osc('sine', 65.41, t, 0.9, 0.5, { attack: 0.01 });
  }

  /** Record broken: rising chime arpeggio. */
  chime() {
    if (!this.can()) return;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      this.osc('sine', f, this.t + i * 0.09, 0.6, 0.18);
      this.osc('triangle', f * 2, this.t + i * 0.09, 0.3, 0.05);
    });
  }

  /** Unsold: a soft descending tone. */
  unsold() {
    if (!this.can()) return;
    this.osc('sine', 330, this.t, 0.6, 0.3, { to: 140 });
    this.osc('triangle', 220, this.t + 0.05, 0.6, 0.12, { to: 98 });
  }

  /** Captain: you have been outbid. */
  outbid() {
    if (!this.can()) return;
    this.osc('square', 988, this.t, 0.12, 0.12);
    this.osc('square', 740, this.t + 0.14, 0.18, 0.12);
    try { navigator.vibrate?.([120, 60, 120]); } catch { /* not supported */ }
  }

  /** Captain: your bid is leading. */
  leading() {
    if (!this.can()) return;
    this.osc('sine', 660, this.t, 0.1, 0.18);
    this.osc('sine', 990, this.t + 0.09, 0.14, 0.18);
  }

  /** Crowd cheer burst (sold / record). */
  cheer(big = false) {
    if (!this.can() || !this.crowdOn) return;
    const t = this.t;
    const dur = big ? 3.4 : 2.2;
    const peak = (big ? 0.55 : 0.35) * this.level('sfx');
    for (const [freq, q, p] of [[600, 0.7, 1], [1400, 1.1, 0.7], [2600, 1.6, 0.35]]) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer(4);
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = q;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak * p, t + 0.35);
      g.gain.setValueAtTime(peak * p, t + dur * 0.45);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(this.master);
      src.start(t, Math.random());
      src.stop(t + dur + 0.1);
    }
  }

  /** Low stadium murmur under the whole show. */
  crowd(on) {
    if (!this.ctx) return;
    if (on && this.crowdOn) {
      if (!this.crowdNode) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer(4);
        src.loop = true;
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 700;
        f.Q.value = 0.6;
        const lfo = this.ctx.createOscillator();
        const depth = this.ctx.createGain();
        lfo.frequency.value = 0.13;
        depth.gain.value = 0.25;
        const amp = this.ctx.createGain();
        amp.gain.value = 0.75;
        lfo.connect(depth).connect(amp.gain);
        src.connect(f).connect(amp).connect(this.crowdBus);
        src.start();
        lfo.start();
        this.crowdNode = { src, lfo };
      }
      this.crowdBus.gain.setTargetAtTime(0.09 * this.level('sfx'), this.t, 1.2);
    } else if (this.crowdNode) {
      this.crowdBus.gain.setTargetAtTime(0, this.t, 0.6);
    }
  }

  /* ---------- music ---------- */

  syncTracks(tracks) {
    for (const slot of ['intro', 'bed', 'sold']) {
      const url = tracks[slot]?.url || '';
      if (this.trackUrls[slot] === url) continue;
      this.trackUrls[slot] = url;
      this.music[slot]?.pause();
      if (!url) { delete this.music[slot]; continue; }
      const el = new Audio();
      el.src = url;
      el.preload = slot === 'bed' ? 'auto' : 'metadata';
      el.loop = slot === 'bed';
      el.volume = 0;
      this.music[slot] = el;
    }
    if (this.bedWanted) this.bed(true);
  }

  hasTrack(slot) { return !!this.music[slot]; }

  musicTarget(slot) {
    if (!this.musicOn) return 0;
    const base = this.level('music');
    const duck = this.speaking ? 0.35 : 1;
    return clamp(base * duck * (slot === 'bed' ? this.bedLevel : 1), 0, 1);
  }

  updateMusicVolume() {
    for (const [slot, el] of Object.entries(this.music)) {
      if (el.paused) continue;
      this.fade(el, this.musicTarget(slot), 0.5);
    }
    if (!this.musicOn) this.music.bed?.pause();
  }

  fade(el, to, seconds) {
    clearInterval(el._fade);
    const from = el.volume;
    const steps = Math.max(1, Math.round(seconds * 20));
    let i = 0;
    el._fade = setInterval(() => {
      i += 1;
      el.volume = clamp(from + ((to - from) * i) / steps, 0, 1);
      if (i >= steps) clearInterval(el._fade);
    }, 50);
  }

  play(slot) {
    const el = this.music[slot];
    if (!el || !this.musicOn) return false;
    try {
      el.currentTime = 0;
      el.volume = this.musicTarget(slot);
      el.play().catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  /** Background music bed: on while the auction is live, quieter during bidding. */
  bed(on, level = this.bedLevel) {
    this.bedWanted = on;
    this.bedLevel = level;
    const el = this.music.bed;
    if (!el) return;
    if (on && this.musicOn) {
      if (el.paused) {
        el.volume = 0;
        el.play().catch(() => {});
      }
      this.fade(el, this.musicTarget('bed'), 1.2);
    } else if (!el.paused) {
      this.fade(el, 0, 1);
      setTimeout(() => { if (!this.bedWanted) el.pause(); }, 1100);
    }
  }

  /* ---------- voice ---------- */

  /**
   * Speak a line. kind: 'bid' lines replace each other (only the latest bid is called);
   * 'urgent' interrupts everything (sold, new player); others queue.
   */
  say(text, kind = 'info') {
    if (!this.voiceOn || !window.speechSynthesis || !text) return;
    if (kind === 'urgent') {
      this.voiceGen += 1;
      this.voiceQueue = [];
      window.speechSynthesis.cancel();
      this.speaking = false;
    } else if (kind === 'bid') {
      // a new bid resets the clock: drop older bid calls and any pending 'going once / twice'
      this.voiceQueue = this.voiceQueue.filter((q) => q.kind !== 'bid' && q.kind !== 'going');
    }
    this.voiceQueue.push({ text, kind });
    if (!this.speaking) this.nextLine();
  }

  nextLine() {
    const item = this.voiceQueue.shift();
    if (!item) {
      this.speaking = false;
      this.updateMusicVolume();
      return;
    }
    const u = new SpeechSynthesisUtterance(item.text);
    const voice = pickVoice(this.settings.voiceGender, this.prefs.voiceName);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    }
    u.rate = clamp((this.settings.voiceRate ?? 100) / 100, 0.6, 1.4);
    u.pitch = this.settings.voiceGender === 'female' ? 1.05 : 0.95;
    u.volume = this.level('voice');
    const gen = this.voiceGen;
    let done = false;
    const finish = () => {
      if (done || gen !== this.voiceGen) return;
      done = true;
      this.nextLine();
    };
    u.onend = finish;
    u.onerror = finish;
    setTimeout(finish, 9000); // some browsers never fire onend
    this.speaking = true;
    this.updateMusicVolume();
    window.speechSynthesis.speak(u);
  }

  stopVoice() {
    this.voiceGen += 1;
    this.voiceQueue = [];
    window.speechSynthesis?.cancel();
    this.speaking = false;
  }
}

export const sound = new SoundEngine();
