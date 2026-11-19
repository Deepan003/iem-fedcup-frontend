/**
 * FED Cup sound engine: synthesized effects (no audio files, nothing to license), crowd ambience,
 * admin-uploaded music with ducking, and an announcer voice (browser speech, male/female).
 *
 * Browsers only allow sound after a user gesture, so nothing plays until unlock() runs from a click.
 */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const AMB_GAIN = 1.45; // built-in music level: show bed ~-20 dB RMS under the announcer, screensaver ~-15 dB (measured)

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

const ACCENT_LANG = {
  in: /en[-_]IN/i, gb: /en[-_]GB/i, us: /en[-_]US/i, au: /en[-_]AU/i,
};

/** Best voice for a gender and accent; natural (neural) voices first. */
export function pickVoice(gender, preferredName = '', accent = 'auto') {
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
    const want = ACCENT_LANG[accent];
    if (want) {
      if (want.test(v.lang)) s += 9; // the chosen accent beats everything except gender
    } else if (/en-IN/i.test(v.lang)) s += 3;
    else if (/en-GB/i.test(v.lang)) s += 2;
    else if (/en-US/i.test(v.lang)) s += 1;
    if (/natural|neural|online/i.test(v.name)) s += 6; // e.g. Edge "… Online (Natural)"
    else if (/google/i.test(v.name)) s += 3; // Chrome's network voices
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
    this.suppressed = false; // another tab on this computer is the one playing
    this.speechBlocked = false; // music allowed without a click, but the browser still blocks the voice
    if (typeof window !== 'undefined') setTimeout(() => this.initTabs(), 0);
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
  /* ---------- one tab plays ---------- */

  /**
   * Several tabs of the site on one computer (studio + control room + home page…) would all play
   * the same voice and music on top of each other. Tabs talk over a BroadcastChannel and only the
   * best one plays: the studio, then public pages, then captain, then the control room; the oldest tab breaks a tie.
   */
  initTabs() {
    if (this.bc || typeof BroadcastChannel === 'undefined') return;
    this.tabId = Math.random().toString(36).slice(2);
    this.tabSince = Date.now();
    this.peers = new Map();
    this.bc = new BroadcastChannel('fedcup-sound');
    this.bc.onmessage = (e) => {
      const m = e.data;
      if (!m || m.id === this.tabId) return;
      if (m.bye) this.peers.delete(m.id);
      else this.peers.set(m.id, { ...m, seen: Date.now() });
      this.electTab();
    };
    const beat = () => {
      try { this.bc.postMessage(this.tabInfo()); } catch { /* closed */ }
      this.electTab();
    };
    this.tabTimer = setInterval(beat, 1500);
    beat();
    window.addEventListener('pagehide', () => { try { this.bc.postMessage({ id: this.tabId, bye: true }); } catch { /* closed */ } });
  }

  tabPriority() {
    if (window.location.pathname.startsWith('/studio')) return 4;
    if (this.surface === 'studio') return 3; // home page / portal during the live show
    if (this.surface === 'captain') return 2;
    return 1; // control room
  }

  tabInfo() {
    return { id: this.tabId, since: this.tabSince, prio: this.tabPriority(), ready: this.rawActive };
  }

  electTab() {
    if (!this.peers) return;
    const now = Date.now();
    for (const [id, p] of this.peers) if (now - p.seen > 4500) this.peers.delete(id);
    const me = this.tabInfo();
    const better = [...this.peers.values()].some((p) => p.ready && (p.prio > me.prio || (p.prio === me.prio && p.since < me.since)));
    if (better === this.suppressed) return;
    this.suppressed = better;
    if (better) this.silenceAll();
    this.applyLevels();
    this.emit();
  }

  /** Stop everything this tab is playing (another tab took over). */
  silenceAll() {
    this.stopVoice();
    for (const el of Object.values(this.music)) { clearInterval(el._fade); el.pause(); }
    this.ambientStop();
    this.screensEl = null;
    if (this.crowdBus) this.crowdBus.gain.setTargetAtTime(0, this.t, 0.2);
  }

  /** Effective switches: admin settings AND this device's preferences (ignoring other tabs). */
  get rawActive() {
    const s = this.settings;
    if (!this.unlocked || !s.enabled || !this.prefs.on) return false;
    if (this.surface === 'studio') return s.studioSound !== false;
    if (this.surface === 'captain') return s.captainSound !== false;
    return true;
  }

  get active() { return !this.suppressed && this.rawActive; }

  get voiceOn() { return this.active && this.settings.voice !== false && this.prefs.voice; }

  get musicOn() { return this.active && this.settings.music !== false && this.prefs.music; }

  get crowdOn() { return this.active && this.settings.crowd !== false; }

  level(kind) {
    const master = clamp(this.prefs.volume ?? 80, 0, 100) / 100;
    const map = { sfx: this.settings.sfxVolume, music: this.settings.musicVolume, voice: this.settings.voiceVolume };
    return master * (clamp(map[kind] ?? 80, 0, 100) / 100);
  }

  /** Audio graph: master (compressor) <- sfx bus (+ reverb send) and crowd bus. */
  buildGraph() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor(); // glue + no clipping when everything fires at once
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    const limiter = this.ctx.createDynamicsCompressor(); // brickwall: nothing ever clips the speakers
    limiter.threshold.value = -1.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    this.master.connect(comp).connect(limiter).connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);
    // effects go through a "stadium" reverb send so they sound like they're in a big room
    this.fx = this.ctx.createGain();
    this.fx.connect(this.sfxBus);
    this.verb = this.ctx.createConvolver();
    this.verb.buffer = this.impulse();
    this.verbIn = this.ctx.createGain();
    this.verbIn.gain.value = 0.28;
    this.fx.connect(this.verbIn);
    this.verbIn.connect(this.verb);
    this.verb.connect(this.sfxBus);
    this.crowdBus = this.ctx.createGain();
    this.crowdBus.gain.value = 0;
    this.crowdBus.connect(this.master);
    return true;
  }

  /**
   * After a refresh the browser forgets the click that allowed sound. If the browser allows sound
   * without a click (Edge "media autoplay: allow", Chrome "sound: allow" for the site, a kiosk shortcut),
   * turn it straight back on; otherwise wait for the first click as usual.
   */
  tryAutoUnlock() {
    if (this.unlocked || this.autoTried || typeof window === 'undefined') return;
    this.autoTried = true;
    try {
      if (!this.ctx && !this.buildGraph()) return;
      const ok = () => {
        if (this.unlocked || this.ctx.state !== 'running') return;
        this.unlocked = true;
        this.applyLevels();
        this.emit();
        this.probeSpeech();
      };
      if (this.ctx.state === 'running') ok();
      else this.ctx.resume().then(ok).catch(() => {}); // resolves straight away only when autoplay is allowed
    } catch { /* stays locked until a click */ }
  }

  /**
   * Sound came on without a click (autoplay allowed): browsers like Chrome still block speech
   * until the page is clicked. Find out, so the page can ask for that one click.
   */
  probeSpeech() {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    u.onerror = (e) => {
      if (e.error === 'not-allowed' && !this.speechBlocked) { this.speechBlocked = true; this.emit(); }
    };
    window.speechSynthesis.speak(u);
  }

  /** Must be called from a click/tap. Creates the audio context and wakes speech. */
  async unlock() {
    try {
      if (!this.ctx && !this.buildGraph()) return false;
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      if (window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        window.speechSynthesis.speak(u);
      }
      this.speechBlocked = false; // a click/tap: the voice is allowed from now on
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
    this.refreshScreens();
  }

  /** Screensaver already on when sound gets unlocked / music switched: start or stop its music to match. */
  refreshScreens() {
    if (!this.screensOn) return;
    const playing = this.screensPlaying();
    if (this.musicOn && !playing) this.screensSwap(this.screensTheme || 'calm');
    else if (!this.musicOn && playing) this.screensStopCurrent();
  }

  /* ---------- synth helpers ---------- */

  get t() { return this.ctx.currentTime; }

  can() {
    // the browser can suspend audio (device change, power saving): wake it back up
    if (this.ctx?.state === 'suspended' && this.unlocked) this.ctx.resume().catch(() => {});
    return this.active && this.ctx;
  }

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
    o.connect(g).connect(dest || this.fx || this.sfxBus);
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
    src.connect(f).connect(g).connect(dest || this.fx || this.sfxBus);
    src.start(start);
    src.stop(start + attack + dur + 0.05);
  }

  /* ---------- effects ---------- */

  /** Stereo "stadium" impulse response for the reverb (decaying noise, no audio file needed). */
  impulse(seconds = 2.4, decay = 2.8) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch += 1) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
    }
    return buf;
  }

  /** A stereo-panned destination (for applause, card flicks, sweeps). */
  panned(pan, dest = null) {
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : this.ctx.createGain();
    if (p.pan) p.pan.value = clamp(pan, -1, 1);
    p.connect(dest || this.fx);
    return p;
  }

  /** Bid: paddle slap + a tone that climbs with the price; the room gets louder as bidding heats up. */
  bid(multiple = 1, heat = 0) {
    if (!this.can()) return;
    if (this.clip('bid', 0.9)) { this.swell(heat); return; }
    const t = this.t;
    const step = clamp(Math.log2(Math.max(1, multiple)), 0, 3);
    const f = 440 * 2 ** (step * 0.42);
    this.noise(t, 0.07, 0.55, { type: 'lowpass', freq: 520, dest: this.sfxBus }); // paddle thump (dry)
    this.noise(t, 0.025, 0.3, { type: 'highpass', freq: 4200 }); // slap
    this.osc('triangle', f, t, 0.16, 0.3);
    this.osc('sine', f * 1.5, t + 0.035, 0.16, 0.14); // a fifth above: "ding-ding"
    this.osc('sine', f * 2, t + 0.035, 0.1, 0.06);
    if (multiple >= 3) this.osc('sine', 82, t, 0.3, 0.45, { to: 50 }); // weight for big money
    this.swell(heat);
  }

  /** Crowd reaction to a bid: an "ooh" that grows with the heat (0..1). */
  swell(heat = 0) {
    if (!this.can() || !this.crowdOn || heat <= 0.05) return;
    const t = this.t;
    const g = 0.12 + heat * 0.32;
    this.noise(t, 0.9 + heat, g, { type: 'bandpass', freq: 520 + heat * 380, q: 1.6, attack: 0.18, dest: this.master });
    this.noise(t + 0.05, 0.7 + heat, g * 0.5, { type: 'bandpass', freq: 1100 + heat * 600, q: 2, attack: 0.2, dest: this.master });
    this.heat(heat);
  }

  /** Room tension: the crowd murmur rises with the heat and settles back down. */
  heat(level = 0) {
    if (!this.crowdBus || !this.crowdOn) return;
    this.heatLevel = clamp(level, 0, 1);
    this.crowdBus.gain.setTargetAtTime(this.crowdLevel(), this.t, 0.4);
    if (this.crowdFilter) this.crowdFilter.frequency.setTargetAtTime(700 + this.heatLevel * 500, this.t, 0.5);
  }

  /** Countdown beep for the last seconds (higher for the final three), with a heartbeat under it. */
  beep(final = false) {
    if (!this.can()) return;
    const t = this.t;
    this.osc('sine', final ? 1320 : 880, t, final ? 0.16 : 0.11, final ? 0.3 : 0.2);
    this.heartbeat(final ? 1 : 0.7);
  }

  /** Two low thumps, like a heartbeat. */
  heartbeat(level = 1) {
    if (!this.can()) return;
    const t = this.t;
    this.osc('sine', 62, t, 0.16, 0.7 * level, { to: 40, dest: this.sfxBus });
    this.osc('sine', 58, t + 0.2, 0.2, 0.5 * level, { to: 38, dest: this.sfxBus });
  }

  /** Rising tension sweep (going once / twice, screensaver reveals). */
  riser(seconds = 1.6, peak = 0.22) {
    if (!this.can()) return;
    const t = this.t;
    this.noise(t, seconds, peak, { type: 'bandpass', freq: 250, to: 5200, q: 2.2, attack: seconds * 0.85 });
    this.osc('sawtooth', 110, t, seconds, peak * 0.25, { to: 440, attack: seconds * 0.8 });
  }

  /** Time up: a short, soft stadium buzzer. */
  buzzer() {
    if (!this.can()) return;
    const t = this.t;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.connect(this.fx);
    this.osc('sawtooth', 110, t, 0.55, 0.22, { dest: lp });
    this.osc('sawtooth', 116, t, 0.55, 0.18, { dest: lp });
  }

  /** Soft-clip curve: adds punch and weight to the gavel without harsh distortion. */
  softClip() {
    if (this.clipCurve) return this.clipCurve;
    const n = 2048;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const x = (i * 2) / n - 1;
      c[i] = Math.tanh(2.4 * x) / Math.tanh(2.4);
    }
    this.clipCurve = c;
    return c;
  }

  /**
   * Auctioneer's gavel. Layers: the swish of the swing, a sharp crack, the ringing hardwood block,
   * a chest-thumping sub drop, a deep boom and a slap echo off the back wall.
   * power: 1 = normal strike, 1.3+ = the SOLD strike. The hit lands ~0.08s after the call (the swing comes first).
   */
  gavel(times = 1, power = 1) {
    if (!this.can()) return;
    if (this.clip('hammer')) return;
    for (let i = 0; i < times; i += 1) {
      const last = i === times - 1;
      const p = clamp(power * (last ? 1 : 0.78), 0.2, 1.6);
      const t = this.t + 0.08 + i * 0.34;
      // the swing: a short rising swish into the hit
      this.noise(t - 0.08, 0.08, 0.16 * p, { freq: 700, to: 3800, q: 1.3, attack: 0.07 });
      // punch bus: soft clipping makes the strike dense and loud
      const shaper = this.ctx.createWaveShaper();
      shaper.curve = this.softClip();
      shaper.oversample = '2x';
      const drive = this.ctx.createGain();
      drive.gain.value = 1.4;
      const out = this.ctx.createGain();
      out.gain.value = 0.75;
      drive.connect(shaper).connect(out).connect(this.fx);
      // crack: the very first milliseconds of wood on wood
      this.noise(t, 0.016, 1.3 * p, { type: 'highpass', freq: 2600, attack: 0.0008, dest: drive });
      this.noise(t, 0.03, 0.95 * p, { freq: 3400, q: 3, attack: 0.0008, dest: drive });
      // the hardwood sound block ringing (inharmonic partials, quick decay)
      [[410, 0.2, 0.75], [1010, 0.12, 0.45], [1680, 0.08, 0.3], [2730, 0.05, 0.18]].forEach(([f, d, a]) => {
        this.osc('sine', f, t, d * (0.8 + p * 0.2), a * p, { attack: 0.0008, to: f * 0.965, dest: drive });
      });
      this.noise(t, 0.1, 0.65 * p, { freq: 720, q: 2.6, attack: 0.0008, dest: drive });
      // weight: sub drop and boom, dry so they hit the chest
      this.osc('sine', 170, t, 0.45 + p * 0.15, 1.05 * p, { to: 36, attack: 0.0015, dest: this.sfxBus });
      this.osc('triangle', 95, t, 0.28, 0.45 * p, { to: 44, attack: 0.0015, dest: this.sfxBus });
      if (p >= 1.2) this.noise(t, 0.6, 0.45, { type: 'lowpass', freq: 380, to: 90, attack: 0.002, dest: this.sfxBus }); // extra boom on SOLD
      // the room: a slap echo off the back wall, panned off-centre
      const echo = this.panned(0.35);
      this.noise(t + 0.115, 0.05, 0.24 * p, { freq: 1200, q: 1.6, attack: 0.002, dest: echo });
      this.osc('sine', 410, t + 0.115, 0.12, 0.16 * p, { attack: 0.001, dest: echo });
      this.noise(t + 0.23, 0.04, 0.08 * p, { freq: 1000, q: 1.4, attack: 0.002, dest: this.panned(-0.35) });
    }
  }

  /** New player: an airy whoosh that flies across the room. */
  whoosh() {
    if (!this.can()) return;
    if (this.clip('newPlayer')) return;
    const t = this.t;
    const p = this.panned(-0.8);
    if (p.pan) p.pan.linearRampToValueAtTime(0.8, t + 0.8);
    this.noise(t, 0.75, 0.45, { freq: 260, to: 3600, q: 0.8, attack: 0.3, dest: p });
    this.osc('sine', 90, t + 0.6, 0.5, 0.35, { to: 45 });
  }

  /** Short swoosh between screens. */
  swoosh(dir = 1) {
    if (!this.can()) return;
    const t = this.t;
    const p = this.panned(-0.7 * dir);
    if (p.pan) p.pan.linearRampToValueAtTime(0.7 * dir, t + 0.4);
    this.noise(t, 0.4, 0.32, { freq: 1800, to: 500, q: 1.1, attack: 0.12, dest: p });
  }

  /** A card being dealt (retained players flipping in). */
  deal(i = 0) {
    if (!this.can()) return;
    const t = this.t;
    const p = this.panned(((i % 5) - 2) * 0.3);
    this.noise(t, 0.05, 0.45, { type: 'highpass', freq: 2600, dest: p });
    this.osc('sine', 300 + i * 40, t + 0.02, 0.08, 0.12, { dest: p });
  }

  /** Bright sparkle (records, reveals). */
  shimmer() {
    if (!this.can()) return;
    [1568, 2093, 2637, 3136, 2349, 2794].forEach((f, i) => {
      const t = this.t + i * 0.06;
      this.osc('sine', f, t, 0.5, 0.06, { dest: this.panned((i % 3) - 1) });
    });
  }

  /** Snare-style drumroll that builds, then (optionally) a cymbal. */
  drumroll(seconds = 1.6, crash = true) {
    if (!this.can()) return;
    const n = Math.floor(seconds * 22);
    for (let i = 0; i < n; i += 1) {
      const t = this.t + (i / n) * seconds;
      this.noise(t, 0.05, 0.08 + (i / n) * 0.35, { freq: 1900, q: 0.9, dest: this.panned(Math.sin(i) * 0.2) });
    }
    if (crash) setTimeout(() => this.cymbal(), seconds * 1000);
  }

  /** Crash cymbal with a long shimmer tail. */
  cymbal(peak = 0.45) {
    if (!this.can()) return;
    const t = this.t;
    this.noise(t, 2.2, peak, { type: 'highpass', freq: 5200, attack: 0.004 });
    this.noise(t, 0.9, peak * 0.6, { freq: 8000, q: 0.7, attack: 0.004 });
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
      o.connect(g).connect(this.fx);
      o.start(t); lfo.start(t);
      o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
      this.noise(t, dur, 0.05, { type: 'highpass', freq: 5000 });
    });
  }

  /** Brass stab chord (fanfares). */
  brass(freqs, start, dur, peak = 0.12) {
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, start);
    lp.frequency.exponentialRampToValueAtTime(3200, start + 0.06);
    lp.frequency.exponentialRampToValueAtTime(900, start + dur);
    lp.connect(this.fx);
    freqs.forEach((f) => {
      this.osc('sawtooth', f, start, dur, peak, { attack: 0.03, dest: lp });
      this.osc('sawtooth', f, start, dur, peak * 0.8, { attack: 0.03, dest: lp, detune: 11 });
      this.osc('sawtooth', f, start, dur, peak * 0.8, { attack: 0.03, dest: lp, detune: -9 });
    });
  }

  /** Bidding open: a short stadium horn. */
  horn() {
    if (!this.can()) return;
    this.brass([220, 277.18, 329.63], this.t, 0.7, 0.1);
  }

  /** SOLD: impact, cymbal, a two-hit brass fanfare and sparkle (used when no sold track is uploaded). */
  soldSting(big = false) {
    if (!this.can()) return;
    this.impact();
    this.cymbal(big ? 0.55 : 0.4);
    const t = this.t + 0.1;
    this.brass([261.63, 329.63, 392], t, 0.16, 0.11); // da-
    this.brass([349.23, 440, 523.25, 698.46], t + 0.2, big ? 1.6 : 1.1, 0.11); // DAAA (up a fourth)
    this.osc('sine', 87.31, t + 0.2, 1.2, 0.5, { attack: 0.01 });
    if (big) setTimeout(() => this.shimmer(), 450);
  }

  /** Deep stadium impact: sub boom + air burst. */
  impact() {
    if (!this.can()) return;
    const t = this.t;
    this.osc('sine', 120, t, 1, 1, { to: 30, attack: 0.004, dest: this.sfxBus });
    this.osc('triangle', 220, t, 0.25, 0.25, { to: 60 });
    this.noise(t, 0.45, 0.6, { type: 'lowpass', freq: 1800, to: 200 });
    this.noise(t + 0.02, 1.4, 0.18, { type: 'highpass', freq: 3000, attack: 0.05 });
  }

  /** Record broken: rising chime arpeggio with sparkle. */
  chime() {
    if (!this.can()) return;
    if (this.clip('record')) return;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      this.osc('sine', f, this.t + i * 0.09, 0.6, 0.18);
      this.osc('triangle', f * 2, this.t + i * 0.09, 0.3, 0.05);
    });
    setTimeout(() => this.shimmer(), 500);
  }

  /** Unsold: a soft descending tone and a disappointed crowd "aww". */
  unsold() {
    if (!this.can()) return;
    this.heat(0);
    if (this.clip('unsold')) return;
    this.osc('sine', 330, this.t, 0.6, 0.3, { to: 140 });
    this.osc('triangle', 220, this.t + 0.05, 0.6, 0.12, { to: 98 });
    if (this.crowdOn) this.noise(this.t + 0.1, 1.3, 0.22, { freq: 600, to: 300, q: 1.4, attack: 0.25, dest: this.master });
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

  /** Crowd cheer burst (sold / record), with applause and, for big moments, whistles. */
  cheer(big = false) {
    if (!this.can() || !this.crowdOn) return;
    const t = this.t;
    const dur = big ? 3.8 : 2.4;
    const peak = (big ? 0.55 : 0.38) * this.level('sfx');
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
    this.applause(dur + 0.6, big ? 1 : 0.7);
    if (big) [0.4, 1.1, 1.9].forEach((o) => this.whistleCall(t + o));
    setTimeout(() => this.heat(0), dur * 1000);
  }

  /** Applause: lots of individual claps scattered across the stereo field. */
  applause(seconds = 2.5, intensity = 1) {
    if (!this.can() || !this.crowdOn) return;
    const n = Math.floor(seconds * 38 * intensity);
    for (let i = 0; i < n; i += 1) {
      const k = i / n;
      const t = this.t + 0.15 + k * seconds + Math.random() * 0.05;
      const level = 0.22 * intensity * (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8);
      this.noise(t, 0.025 + Math.random() * 0.02, Math.max(0.01, level), {
        freq: 900 + Math.random() * 1800, q: 1.4, attack: 0.002, dest: this.panned(Math.random() * 1.8 - 0.9, this.master),
      });
    }
  }

  /** A fan's two-finger whistle. */
  whistleCall(t) {
    const up = Math.random() < 0.5;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(up ? 1900 : 2900, t);
    o.frequency.exponentialRampToValueAtTime(up ? 2900 : 1700, t + 0.45);
    this.env(g, t, 0.03, 0.05 * this.level('sfx'), 0.45);
    o.connect(g).connect(this.panned(Math.random() * 1.6 - 0.8, this.master));
    o.start(t);
    o.stop(t + 0.55);
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
        this.crowdFilter = f;
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
      this.crowdBus.gain.setTargetAtTime(this.crowdLevel(), this.t, 1.2);
    } else if (this.crowdNode) {
      this.crowdBus.gain.setTargetAtTime(0, this.t, 0.6);
    }
  }

  /* ---------- screensaver music ---------- */

  /**
   * Music for the studio screensavers, matched to what is on screen:
   * proud (retained players), epic (top 3), tense (bid replays), groove (team sheets), calm (custom slides).
   * Each mood uses its uploaded track if there is one, else the general "screens" upload, else a generated theme.
   * Crossfades only when the mood changes; the show music pauses meanwhile.
   */
  screensMusic(on, theme = 'calm') {
    if (!on) {
      if (!this.screensOn) return;
      this.screensOn = false;
      this.screensTheme = null;
      this.screensStopCurrent();
      if (this.bedWanted) setTimeout(() => this.bed(true), 600);
      return;
    }
    if (!this.screensOn) {
      this.screensOn = true;
      this.stop('intro', 1); // never under the intro
      const bedEl = this.music.bed;
      if (bedEl && !bedEl.paused) { this.fade(bedEl, 0, 1); setTimeout(() => { if (this.screensOn) bedEl.pause(); }, 1100); }
    }
    if (theme === this.screensTheme && this.screensPlaying()) return;
    this.screensTheme = theme;
    this.screensSwap(theme);
  }

  screensPlaying() {
    return !!this.amb || !!(this.screensEl && !this.screensEl.paused);
  }

  screensStopCurrent() {
    const el = this.screensEl;
    if (el && !el.paused) { this.fade(el, 0, 1.2); setTimeout(() => { if (this.screensEl !== el || !this.screensOn) el.pause(); }, 1300); }
    this.screensEl = null;
    this.ambientStop();
  }

  screensSwap(theme) {
    const SLOT = {
      proud: 'screensRetained', epic: 'screensTop', tense: 'screensReplay', groove: 'screensTeams',
    };
    const el = this.music[SLOT[theme]] || this.music.screens || null;
    if (el && el === this.screensEl && !el.paused) return; // same uploaded track covers this mood too: keep playing
    this.screensStopCurrent();
    if (!this.musicOn) return;
    if (el) {
      el.loop = true;
      el.currentTime = 0;
      el.volume = 0;
      el.play().catch(() => {});
      this.fade(el, this.musicTarget('screens'), 1.5);
      this.screensEl = el;
    } else if (this.ctx) {
      this.ambientStart(theme);
    }
  }

  /* ---------- built-in music: instruments ---------- */

  /** Punchy kick: fast pitch drop + click + sub tail. */
  kick(t, dest, p = 0.9) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(165, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.09);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(p, t + 0.003);
    g.gain.exponentialRampToValueAtTime(p * 0.5, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.45);
    this.noise(t, 0.012, p * 0.45, { type: 'highpass', freq: 3500, attack: 0.001, dest });
  }

  snare(t, dest, p = 0.35) {
    this.noise(t, 0.16, p, { freq: 2000, q: 0.8, attack: 0.001, dest });
    this.noise(t, 0.05, p * 0.6, { type: 'highpass', freq: 5000, attack: 0.001, dest });
    this.osc('triangle', 200, t, 0.09, p * 0.7, { to: 150, attack: 0.001, dest });
  }

  clap(t, dest, p = 0.4) {
    for (let i = 0; i < 3; i += 1) this.noise(t + i * 0.011, 0.018, p, { freq: 1500, q: 1.3, attack: 0.001, dest });
    this.noise(t + 0.033, 0.2, p * 0.75, { freq: 1300, q: 0.9, attack: 0.001, dest });
  }

  hat(t, dest, p = 0.08, open = false) {
    this.noise(t, open ? 0.22 : 0.035, p, { type: 'highpass', freq: open ? 6500 : 8000, attack: 0.001, dest });
  }

  tom(t, f, dest, p = 0.5) {
    this.osc('sine', f, t, 0.45, p, { to: f * 0.55, attack: 0.001, dest });
    this.noise(t, 0.06, p * 0.25, { type: 'lowpass', freq: 700, attack: 0.001, dest });
  }

  crash(t, dest, p = 0.25) {
    this.noise(t, 2, p, { type: 'highpass', freq: 5200, attack: 0.002, dest });
  }

  /** Sweep up into the next section. */
  sweep(t, dur, dest, p = 0.16) {
    this.noise(t, dur, p, { type: 'bandpass', freq: 300, to: 7000, q: 1.8, attack: dur * 0.9, dest });
  }

  /** Snare roll that builds over one bar (into a drop). */
  roll(t, beat, dest) {
    for (let i = 0; i < 16; i += 1) this.snare(t + i * beat / 4, dest, 0.08 + (i / 16) * 0.3);
  }

  /** Bass note: saw + sub through a closing low-pass (a plucky, moving bass). */
  bassNote(m, t, dur, dest, p = 0.22, cut = 700) {
    const f = 440 * 2 ** ((m - 69) / 12);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 4;
    lp.frequency.setValueAtTime(cut * 2.2, t);
    lp.frequency.exponentialRampToValueAtTime(cut * 0.5, t + dur);
    lp.connect(dest);
    this.osc('sawtooth', f, t, dur, p, { attack: 0.004, dest: lp });
    this.osc('sine', f / 2, t, dur, p * 1.1, { attack: 0.004, dest });
  }

  /** Bright plucked lead / arp note. */
  pluck(m, t, dur, dest, p = 0.1, type = 'sawtooth') {
    const f = 440 * 2 ** ((m - 69) / 12);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 3;
    lp.frequency.setValueAtTime(4200, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + dur);
    lp.connect(dest);
    this.osc(type, f, t, dur, p, { attack: 0.003, dest: lp, detune: 6 });
    this.osc(type, f, t, dur, p * 0.7, { attack: 0.003, dest: lp, detune: -6 });
  }

  /** Short chord stab (house / anthem stabs). */
  stab(midis, t, dur, dest, p = 0.06) {
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + dur);
    lp.connect(dest);
    midis.forEach((m) => {
      const f = 440 * 2 ** ((m - 69) / 12);
      this.osc('sawtooth', f, t, dur, p, { attack: 0.004, dest: lp, detune: 9 });
      this.osc('sawtooth', f, t, dur, p, { attack: 0.004, dest: lp, detune: -9 });
    });
  }

  pad(midis, t, dur, dest, {
    cut = 1200, peak = 0.045, attack = 0.8, type = 'sawtooth', oct = 0,
  } = {}) {
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cut;
    lp.connect(dest);
    midis.forEach((m) => {
      const f = 440 * 2 ** ((m + oct - 69) / 12);
      this.osc(type, f, t, dur, peak, { attack, dest: lp, detune: 7 });
      this.osc(type, f, t, dur, peak, { attack, dest: lp, detune: -7 });
    });
  }

  /** "Pumping": the music ducks on every kick and swells back, like a dance track. */
  pump(gainNode, t, beat, depth = 0.65) {
    const g = gainNode.gain;
    g.setValueAtTime(1 - depth, t);
    g.linearRampToValueAtTime(1, t + beat * 0.7);
  }

  /* ---------- built-in music: themes ---------- */

  ambientStart(theme = 'calm', slot = 'screens') {
    if (this.amb) return;
    const bus = this.ctx.createGain();
    bus.gain.value = 0;
    bus.connect(this.master);
    const verbSend = this.ctx.createGain();
    verbSend.gain.value = 0.22;
    bus.connect(verbSend).connect(this.verbIn || this.master);
    bus.gain.setTargetAtTime(this.ambLevel(slot), this.t, 1);
    // drums go straight to the bus; everything else through a "pump" that ducks on the kick
    const drums = this.ctx.createGain();
    drums.connect(bus);
    const syn = this.ctx.createGain();
    syn.connect(bus);

    // Each theme: tempo, 4 chords (MIDI), bass roots, hook (MIDI), and a bar() that writes one bar.
    // Bars run in 8-bar phrases: 0-3 groove, 4-6 the hook comes in, 7 a build (roll + sweep), then a crash on 0.
    const THEMES = {
      // live auction bed: driving 124 bpm house in A minor
      show: {
        bpm: 124,
        chords: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]],
        roots: [45, 41, 48, 43],
        hook: [76, 74, 72, 69, 72, 74, 76, 79],
        bar: (t, ch, n, b, root, hook) => {
          const ph = n % 8;
          for (let i = 0; i < 4; i += 1) { this.kick(t + i * b, drums, 0.7); this.pump(syn, t + i * b, b, 0.6); }
          [1, 3].forEach((i) => this.clap(t + i * b, drums, 0.28));
          for (let i = 0; i < 4; i += 1) { this.hat(t + (i + 0.5) * b, drums, 0.09, true); this.hat(t + i * b, drums, 0.04); }
          for (let i = 0; i < 4; i += 1) this.bassNote(root, t + (i + 0.5) * b, b * 0.45, syn, 0.16, 520);
          this.pad(ch, t, b * 4, syn, { cut: 1400, peak: 0.022, attack: 0.05, oct: -12 });
          if (ph >= 4 && ph < 7) for (let i = 0; i < 8; i += 1) this.pluck(hook[(i + n) % 8], t + i * b / 2, b * 0.4, syn, 0.05);
          if (ph === 7) { this.roll(t, b, drums); this.sweep(t, b * 4, drums, 0.12); }
          if (ph === 0) this.crash(t, drums, 0.18);
        },
      },
      // retained players: 128 bpm festival anthem in D major, big stabs and a heroic hook
      proud: {
        bpm: 128,
        chords: [[62, 66, 69], [61, 64, 69], [59, 62, 66], [55, 59, 62]],
        roots: [38, 45, 47, 43],
        hook: [74, 76, 78, 81, 78, 76, 74, 73],
        bar: (t, ch, n, b, root, hook) => {
          const ph = n % 8;
          for (let i = 0; i < 4; i += 1) { this.kick(t + i * b, drums, 0.8); this.pump(syn, t + i * b, b, 0.7); }
          [1, 3].forEach((i) => { this.clap(t + i * b, drums, 0.32); this.snare(t + i * b, drums, 0.15); });
          for (let i = 0; i < 8; i += 1) this.hat(t + i * b / 2, drums, i % 2 ? 0.1 : 0.05, i % 2 === 1);
          for (let i = 0; i < 8; i += 1) this.bassNote(root + (i % 4 === 3 ? 12 : 0), t + i * b / 2, b * 0.42, syn, 0.15, 650);
          [0.5, 1.5, 2.5, 3.5].forEach((x) => this.stab(ch, t + x * b, b * 0.4, syn, 0.035));
          if (ph >= 4 && ph < 7) hook.forEach((m, i) => this.pluck(m, t + i * b / 2, b * 0.48, syn, 0.07));
          if (ph === 7) { this.roll(t, b, drums); this.sweep(t, b * 4, drums, 0.14); }
          if (ph === 0) this.crash(t, drums, 0.22);
        },
      },
      // top 3: 96 bpm hybrid trailer — taiko + kit, braams, staccato strings, hits
      epic: {
        bpm: 96,
        chords: [[60, 63, 67], [56, 60, 63], [63, 67, 70], [58, 62, 65]],
        roots: [36, 32, 39, 34],
        hook: [72, 75, 74, 72, 70, 72, 67, 70],
        bar: (t, ch, n, b, root, hook) => {
          const ph = n % 8;
          this.kick(t, drums, 0.95);
          this.kick(t + 2.5 * b, drums, 0.75);
          [1, 3].forEach((i) => this.snare(t + i * b, drums, 0.4));
          [[0, 95, 0.55], [0.75, 80, 0.35], [1.5, 95, 0.45], [2, 70, 0.4], [2.75, 80, 0.35], [3.25, 95, 0.4], [3.5, 70, 0.45]].forEach(([x, f, p]) => this.tom(t + x * b, f, drums, p));
          for (let i = 0; i < 16; i += 1) this.hat(t + i * b / 4, drums, i % 4 === 2 ? 0.07 : 0.035);
          for (let i = 0; i < 8; i += 1) this.pluck(ch[i % 3] + (i % 2 ? 12 : 0), t + i * b / 2, b * 0.3, syn, 0.045); // staccato strings
          if (n % 2 === 0) this.pad(ch, t, b * 4, syn, { cut: 900, peak: 0.05, attack: 0.02, oct: -12 }); // braam
          this.osc('sine', 440 * 2 ** ((root - 69) / 12), t, b * 4, 0.3, { attack: 0.01, dest: syn });
          if (ph >= 4 && ph < 7) hook.forEach((m, i) => this.pluck(m, t + i * b / 2, b * 0.48, syn, 0.06, 'square'));
          if (ph === 7) { this.roll(t, b, drums); this.sweep(t, b * 4, drums, 0.15); }
          if (ph === 0) { this.crash(t, drums, 0.25); this.tom(t, 60, drums, 0.8); }
        },
      },
      // bid replays: 140 bpm thriller — breakbeat, rolling bass, 16th ostinato
      tense: {
        bpm: 140,
        chords: [[64, 67, 71], [60, 64, 67], [57, 60, 64], [59, 63, 66]],
        roots: [40, 36, 33, 35],
        hook: [76, 79, 78, 76, 74, 76, 71, 74],
        bar: (t, ch, n, b, root, hook) => {
          const ph = n % 8;
          [0, 1.5, 2.5].forEach((x) => { this.kick(t + x * b, drums, 0.8); this.pump(syn, t + x * b, b, 0.5); });
          [1, 3].forEach((i) => this.snare(t + i * b, drums, 0.42));
          for (let i = 0; i < 16; i += 1) this.hat(t + i * b / 4, drums, i % 2 ? 0.035 : 0.06);
          this.bassNote(root, t, b * 1.4, syn, 0.17, 380);
          this.bassNote(root, t + 1.5 * b, b * 0.9, syn, 0.15, 380);
          this.bassNote(root + 3, t + 2.5 * b, b * 1.4, syn, 0.15, 380);
          const seq = [ch[0], ch[0] + 12, ch[1], ch[0] + 12, ch[2], ch[0] + 12, ch[1], ch[2] + 12];
          for (let i = 0; i < 16; i += 1) this.pluck(seq[i % 8], t + i * b / 4, b * 0.22, syn, 0.032, 'square');
          if (ph >= 4 && ph < 7) hook.forEach((m, i) => this.pluck(m, t + i * b / 2, b * 0.45, syn, 0.06));
          if (ph === 7) { this.roll(t, b, drums); this.sweep(t, b * 4, drums, 0.14); }
          if (ph === 0) this.crash(t, drums, 0.2);
        },
      },
      // team sheets / the table: 112 bpm funk — syncopated bass, chord chops, swung hats
      groove: {
        bpm: 112,
        chords: [[62, 65, 69, 72], [59, 65, 67, 71], [60, 64, 67, 71], [57, 60, 64, 67]],
        roots: [38, 43, 36, 45],
        hook: [74, 72, 69, 72, 74, 77, 76, 74],
        bar: (t, ch, n, b, root, hook) => {
          const ph = n % 8;
          [0, 0.75, 2, 2.5].forEach((x) => this.kick(t + x * b, drums, 0.7));
          [1, 3].forEach((i) => { this.clap(t + i * b, drums, 0.3); this.snare(t + i * b, drums, 0.12); });
          for (let i = 0; i < 16; i += 1) this.hat(t + i * b / 4 + (i % 2 ? b * 0.06 : 0), drums, i % 4 === 2 ? 0.08 : 0.035, i === 14);
          [[0, 0], [0.75, 12], [1.5, 0], [2, 7], [2.5, 0], [3.25, 10]].forEach(([x, k]) => this.bassNote(root + k, t + x * b, b * 0.3, syn, 0.17, 900));
          [0.5, 1.75, 2.5, 3.5].forEach((x) => this.stab(ch, t + x * b, b * 0.22, syn, 0.026));
          if (ph >= 4 && ph < 7) hook.forEach((m, i) => this.pluck(m, t + i * b / 2, b * 0.4, syn, 0.055, 'square'));
          if (ph === 7) this.sweep(t, b * 4, drums, 0.1);
          if (ph === 0) this.crash(t, drums, 0.15);
        },
      },
      // your own slides: 88 bpm chill-hop — soft kit, warm keys, lazy bass
      calm: {
        bpm: 88,
        chords: [[57, 60, 64, 67], [53, 57, 60, 64], [60, 64, 67, 71], [55, 59, 62, 65]],
        roots: [45, 41, 48, 43],
        hook: [76, 72, 74, 71, 72, 67, 69, 72],
        bar: (t, ch, n, b, root, hook) => {
          const ph = n % 8;
          [0, 1.75, 2.5].forEach((x) => this.kick(t + x * b, drums, 0.55));
          [1, 3].forEach((i) => this.snare(t + i * b, drums, 0.2));
          for (let i = 0; i < 8; i += 1) this.hat(t + i * b / 2 + (i % 2 ? b * 0.09 : 0), drums, i % 2 ? 0.03 : 0.05);
          this.pad(ch, t, b * 4, syn, { cut: 1600, peak: 0.03, attack: 0.08, type: 'triangle' });
          [0, 2.5].forEach((x) => this.bassNote(root, t + x * b, b * 1.2, syn, 0.14, 450));
          if (ph >= 4) hook.slice(0, 4).forEach((m, i) => this.pluck(m, t + i * b, b * 0.8, syn, 0.04, 'triangle'));
        },
      },
    };
    const th = THEMES[theme] || THEMES.calm;
    const beat = 60 / th.bpm;
    const barSec = beat * 4;
    let n = 0;
    const play = () => {
      if (!this.ctx || !this.amb || this.amb.bus !== bus) return;
      const i = n % th.chords.length;
      th.bar(this.t + 0.06, th.chords[i], n, beat, th.roots[i], th.hook);
      n += 1;
    };
    this.amb = {
      bus, iv: setInterval(play, barSec * 1000), theme, slot,
    };
    play();
  }

  ambientStop() {
    if (!this.amb) return;
    const { bus, iv } = this.amb;
    this.amb = null;
    clearInterval(iv);
    bus.gain.setTargetAtTime(0, this.t, 0.45); // fades while the next theme fades in: a crossfade
    setTimeout(() => bus.disconnect(), 3500);
  }

  /* ---------- music ---------- */

  syncTracks(tracks) {
    for (const slot of ['intro', 'bed', 'sold', 'end', 'bid', 'newPlayer', 'hammer', 'record', 'unsold', 'screens', 'screensRetained', 'screensTop', 'screensReplay', 'screensTeams']) {
      const url = tracks[slot]?.url || '';
      if (this.trackUrls[slot] === url) continue;
      this.trackUrls[slot] = url;
      this.music[slot]?.pause();
      if (!url) { delete this.music[slot]; continue; }
      const el = new Audio();
      el.src = url;
      el.preload = ['intro', 'end'].includes(slot) ? 'metadata' : 'auto';
      if (slot === 'intro') el.addEventListener('ended', () => this.introDone());
      el.loop = slot === 'bed' || slot.startsWith('screens');
      el.volume = 0;
      this.music[slot] = el;
    }
    if (this.bedWanted) this.bed(true);
  }

  hasTrack(slot) { return !!this.music[slot]; }

  /** Built-in music level: the screensaver (no announcer over it) sits ~4 dB above the show bed. */
  ambLevel(slot) {
    return this.musicTarget(slot) * AMB_GAIN * (slot === 'screens' ? 2.2 : 1);
  }

  musicTarget(slot) {
    if (!this.musicOn) return 0;
    const base = this.level('music');
    const duck = this.speaking ? 0.22 : 1;
    return clamp(base * duck * (slot === 'bed' ? this.bedLevel : 1), 0, 1);
  }

  updateMusicVolume() {
    for (const [slot, el] of Object.entries(this.music)) {
      if (el.paused) continue;
      this.fade(el, this.musicTarget(slot.startsWith('screens') ? 'screens' : slot), 0.35);
    }
    if (!this.musicOn) this.music.bed?.pause();
    if (this.amb && this.ctx) this.amb.bus.gain.setTargetAtTime(this.ambLevel(this.amb.slot), this.t, 0.15);
    if (this.crowdNode && this.crowdOn) this.crowdBus.gain.setTargetAtTime(this.crowdLevel(), this.t, 0.25);
  }

  /** Crowd murmur level: rises with the heat, dips under the announcer. */
  crowdLevel() {
    return (0.09 + (this.heatLevel || 0) * 0.16) * this.level('sfx') * (this.speaking ? 0.45 : 1);
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
    if (slot === 'intro' || slot === 'end') {
      // a featured track: the background music and any screensaver music step aside
      const bedEl = this.music.bed;
      if (bedEl && !bedEl.paused) { this.fade(bedEl, 0, 0.8); setTimeout(() => bedEl.pause(), 900); }
      if (this.screensEl || this.amb) this.screensStopCurrent();
    }
    try {
      clearTimeout(el._stop);
      el.currentTime = 0;
      el.volume = this.musicTarget(slot);
      el.play().catch(() => {});
      if (slot === 'intro') {
        this.introPlaying = true;
        const max = Number(this.settings.introSeconds ?? 25);
        if (max > 0) {
          el._stop = setTimeout(() => {
            this.fade(el, 0, 1.5);
            setTimeout(() => { el.pause(); this.introDone(); }, 1600);
          }, Math.max(0, max * 1000 - 1500));
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  /** Stop music in a slot with a short fade (e.g. intro when the first player comes up). */
  stop(slot, seconds = 1) {
    const el = this.music[slot];
    if (!el || el.paused) return;
    clearTimeout(el._stop);
    this.fade(el, 0, seconds);
    setTimeout(() => { el.pause(); if (slot === 'intro') this.introDone(); }, seconds * 1000 + 100);
  }

  introDone() {
    if (!this.introPlaying) return;
    this.introPlaying = false;
    if (this.bedWanted) this.bed(true);
  }

  /** A short uploaded effect clip (overlapping allowed). Returns false when no clip is uploaded. */
  clip(slot, vol = 1) {
    const el = this.music[slot];
    if (!el || !this.active) return false;
    try {
      const a = el.cloneNode(true);
      a.volume = clamp(this.level('sfx') * vol, 0, 1);
      a.play().catch(() => {});
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
    if (!el) {
      // no uploaded background track: the built-in show music
      if (this.screensOn || (this.amb && this.amb.slot !== 'bed')) return; // the screensaver has the music now
      if (on && this.musicOn && !this.introPlaying && this.ctx) {
        if (!this.amb) this.ambientStart('show', 'bed');
        else this.amb.bus.gain.setTargetAtTime(this.ambLevel('bed'), this.t, 0.6);
      } else if (this.amb?.slot === 'bed') this.ambientStop();
      return;
    }
    if (on && (this.introPlaying || this.screensOn)) return; // starts when the intro / screensaver ends
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
  say(text, kind = 'info', mood = 'normal') {
    if (!this.voiceOn || !window.speechSynthesis || !text) return;
    if (kind === 'urgent') {
      this.voiceGen += 1;
      this.voiceQueue = [];
      window.speechSynthesis.cancel();
      this.speaking = false;
    } else if (kind === 'bid') {
      // a new bid resets the clock: drop older bid calls and any pending 'going once / twice'
      this.voiceQueue = this.voiceQueue.filter((q) => q.kind !== 'bid' && q.kind !== 'going');
      // ...and cut off a bid call that is still being spoken: it is already out of date
      if (this.speaking && this.currentKind !== 'urgent') {
        this.voiceGen += 1;
        window.speechSynthesis.cancel();
        this.voiceQueue.push({ text, kind, mood });
        this.speaking = true;
        setTimeout(() => this.nextLine(), 30); // Chrome drops a speak() issued in the same tick as cancel()
        return;
      }
    }
    this.voiceQueue.push({ text, kind, mood });
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
    const voice = pickVoice(this.settings.voiceGender, this.prefs.voiceName, this.settings.voiceAccent || 'auto');
    this.currentKind = item.kind;
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    }
    // Emotion: excitement speeds up and lifts the voice; disappointment slows and lowers it.
    const MOODS = {
      calm: [0.95, -0.02, 0.9], normal: [1, 0, 1], excited: [1.07, 0.08, 1], hype: [1.13, 0.16, 1], tense: [1.05, 0.05, 1], sad: [0.9, -0.1, 0.9], rapid: [1.24, 0.12, 1],
    };
    const [r, p, v] = MOODS[item.mood] || MOODS.normal;
    // a touch of random variation per line so it never sounds like the same recording
    const wobble = () => (Math.random() - 0.5) * 0.06;
    u.rate = clamp(((this.settings.voiceRate ?? 100) / 100) * r * (1 + wobble()), 0.6, 1.7);
    u.pitch = clamp((this.settings.voiceGender === 'female' ? 1.05 : 0.95) + p + wobble(), 0.5, 1.6);
    u.volume = clamp(this.level('voice') * v, 0, 1);
    const gen = this.voiceGen;
    let done = false;
    const finish = () => {
      if (done || gen !== this.voiceGen) return;
      done = true;
      this.nextLine();
    };
    u.onend = finish;
    u.onerror = (e) => {
      if (e?.error === 'not-allowed' && !this.speechBlocked) { this.speechBlocked = true; this.emit(); } // needs a click
      finish();
    };
    setTimeout(finish, 9000); // some browsers never fire onend
    this.speaking = true;
    this.updateMusicVolume();
    if (window.speechSynthesis.paused) window.speechSynthesis.resume(); // Chrome sometimes leaves speech stuck paused
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
