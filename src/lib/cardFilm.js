/**
 * Player card FILM (imported by components/CardStudio.jsx): a ~7.5 s 9:16 or square video with music.
 *   0.0 s  FED Cup crest sting (glow ring, light sweep)
 *   1.4 s  whoosh — the card flips in, white flash + impact on the music drop (2.1 s)
 *   2.3 s  hold: foil shine, slow push-in, float, rising sparks
 *   6.6 s  out to the FED Cup lockup
 * Everything is a pure function of time; recorded live from a canvas with MediaRecorder (MP4 where the
 * browser can, WebM otherwise). Music: /audio/card-film.mp3, hits are synthesised with Web Audio.
 */
import { CARD_H, CARD_W, drawCard, loadCardAssets, loadImage } from './cards.js';

const DISPLAY = '"Big Shoulders Display", "Arial Narrow", Impact, sans-serif';
const MONO = '"JetBrains Mono", "IBM Plex Mono", Consolas, monospace';
export const FILM_SECONDS = 7.5;

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (k) => 1 - (1 - k) ** 3;
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const backOut = (k) => { const c = 1.70158; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; };
const hexRgb = (hex) => { const m = /^#?([a-f\d]{6})$/i.exec(hex || ''); const n = m ? parseInt(m[1], 16) : 0xe3123f; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;
// deterministic pseudo-random (no Math.random: the same frame always looks the same)
const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** Best recording format this browser offers — MP4 first. */
export function filmMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  return [
    'video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4',
    'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm',
  ].find((m) => MediaRecorder.isTypeSupported?.(m)) || null;
}

export function drawFilmFrame(ctx, W, H, t, s) {
  const { c, card, crest, info } = s;
  const cx = W / 2;
  const tall = W / H < 0.7;
  ctx.save();
  // ---- backdrop: near-black, team-colour bloom that breathes, slow rays, sparks
  ctx.fillStyle = '#060607';
  ctx.fillRect(0, 0, W, H);
  const breathe = 0.5 + 0.12 * Math.sin(t * 1.7);
  const bloom = ctx.createRadialGradient(cx, H * 0.5, 0, cx, H * 0.5, Math.max(W, H) * 0.75);
  bloom.addColorStop(0, rgba(c, 0.55 * breathe + 0.1 * seg(t, 1.9, 2.4)));
  bloom.addColorStop(0.55, rgba(c, 0.12));
  bloom.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(cx, H * 0.5);
  ctx.rotate(t * 0.08);
  ctx.globalAlpha = 0.07 + 0.05 * seg(t, 1.9, 2.6);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 18; i++) {
    ctx.rotate((Math.PI * 2) / 18);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-W * 0.06, -Math.max(W, H));
    ctx.lineTo(W * 0.06, -Math.max(W, H));
    ctx.fill();
  }
  ctx.restore();
  for (let i = 0; i < 46; i++) { // sparks rising
    const sp = 0.05 + rnd(i) * 0.08;
    const y = H - (((t * sp + rnd(i + 9)) % 1) * (H + 80)) + 40;
    const x = rnd(i + 3) * W + Math.sin(t * 1.3 + i) * 14;
    const a = (0.25 + rnd(i + 5) * 0.55) * seg(t, 0.2, 1.2);
    ctx.fillStyle = i % 3 ? rgba(c, a) : `rgba(255,220,150,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, 1.2 + rnd(i + 7) * 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- crest sting (0 – 1.9 s), returns for the end lockup (6.75 s →)
  const cardW = tall ? W * 0.84 : (H * 0.8) * (CARD_W / CARD_H);
  const cardH = cardW * (CARD_H / CARD_W);
  const stingIn = backOut(seg(t, 0.1, 0.8));
  const stingOut = easeInOut(seg(t, 1.3, 1.9));
  const endIn = easeOut(seg(t, 6.75, 7.25));
  const crestA = t < 4 ? seg(t, 0.05, 0.4) * (1 - stingOut) : endIn;
  if (crestA > 0 && crest) {
    const base = Math.min(W, H) * 0.42;
    const sz = base * (t < 4 ? (0.55 + 0.45 * stingIn) * (1 - 0.5 * stingOut) : 0.8 + 0.2 * endIn);
    const ch = sz * (crest.height / crest.width);
    const cy = H * (t < 4 ? 0.45 - 0.05 * stingOut : 0.42);
    ctx.save();
    ctx.globalAlpha = crestA;
    const ring = seg(t < 4 ? t : t - 6.7, 0.1, 1.0); // ring burst
    ctx.strokeStyle = rgba(c, (1 - ring) * 0.9);
    ctx.lineWidth = 6 * (1 - ring) + 1;
    ctx.beginPath();
    ctx.arc(cx, cy, sz * (0.5 + ring * 0.9), 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowColor = rgba(c, 0.9);
    ctx.shadowBlur = 60;
    ctx.drawImage(crest, cx - sz / 2, cy - ch / 2, sz, ch);
    ctx.shadowBlur = 0;
    const k = t < 4 ? seg(t, 0.45, 1.0) : endIn; // wordmark
    ctx.globalAlpha = crestA * k;
    ctx.fillStyle = '#efebe3';
    ctx.textAlign = 'center';
    ctx.font = `900 ${Math.round(Math.min(W, H) * 0.11)}px ${DISPLAY}`;
    ctx.fillText('FED CUP', cx, cy + ch / 2 + Math.min(W, H) * 0.12);
    ctx.font = `700 ${Math.round(Math.min(W, H) * 0.026)}px ${MONO}`;
    ctx.letterSpacing = `${Math.round(16 * (1 - k) + 6)}px`;
    ctx.fillStyle = rgba(c, 1);
    ctx.fillText(t < 4 ? 'SEASON 5 · AUCTION 2027' : 'SEE YOU ON THE PITCH', cx, cy + ch / 2 + Math.min(W, H) * 0.18);
    ctx.letterSpacing = '0px';
    ctx.restore();
  }

  // ---- the card (1.45 → 6.95 s)
  if (t > 1.45 && t < 7.0) {
    const enter = seg(t, 1.45, 2.15);
    const flip = Math.cos((1 - easeOut(enter)) * Math.PI * 0.5); // 0 edge-on → 1 face-on
    const lift = (1 - easeOut(enter)) * H * 0.18;
    const exit = easeInOut(seg(t, 6.45, 6.95));
    const push = 1 + 0.045 * seg(t, 2.2, 6.4);
    const bob = Math.sin((t - 2.2) * 1.6) * 8 * seg(t, 2.2, 2.8);
    const sc = push * (1 - 0.25 * exit);
    const w = cardW * sc;
    const h = cardH * sc;
    const cy = H * 0.5 + lift + bob - exit * H * 0.05;
    const foil = t < 2.2 ? null : ((t - 2.2) / 2.1) % 1; // still on entry, then sweeping
    s.cctx.clearRect(0, 0, CARD_W, CARD_H);
    drawCard(s.cctx, info, s.assets, foil);
    const fx = Math.max(0.02, flip);
    ctx.save();
    ctx.globalAlpha = seg(t, 1.45, 1.7) * (1 - exit);
    ctx.translate(cx, cy);
    ctx.transform(fx, (1 - flip) * 0.18, 0, 1, 0, 0); // fake Y-rotation: squash + shear
    ctx.shadowColor = 'rgba(0,0,0,.75)';
    ctx.shadowBlur = 80;
    ctx.shadowOffsetY = 40;
    ctx.drawImage(card, -w / 2, -h / 2, w, h);
    ctx.shadowColor = 'transparent';
    if (flip < 0.98) { ctx.fillStyle = `rgba(255,255,255,${(1 - flip) * 0.5})`; ctx.fillRect(-w / 2, -h / 2, w, h); }
    ctx.restore();
    if (tall) { // floor reflection: there is room under the card in 9:16
      const fy = cy + h / 2 + 6;
      ctx.save();
      ctx.globalAlpha = 0.16 * seg(t, 2.1, 2.6) * (1 - exit);
      ctx.translate(cx, fy);
      ctx.scale(fx, -1);
      ctx.drawImage(card, 0, CARD_H * 0.72, CARD_W, CARD_H * 0.28, -w / 2, -h * 0.28, w, h * 0.28);
      ctx.restore();
      const fade = ctx.createLinearGradient(0, fy, 0, fy + h * 0.3);
      fade.addColorStop(0, 'rgba(6,6,7,0)');
      fade.addColorStop(1, 'rgba(6,6,7,1)');
      ctx.fillStyle = fade;
      ctx.fillRect(0, fy, W, h * 0.32);
    }
  }

  // ---- impact flash on the drop, grain, vignette
  const flash = t > 2.05 ? Math.max(0, 1 - (t - 2.05) / 0.35) : 0;
  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * 0.55})`; ctx.fillRect(0, 0, W, H); }
  ctx.globalAlpha = 0.06;
  const f = Math.floor(t * 24);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = rnd(i + f * 7) > 0.5 ? '#fff' : '#000';
    ctx.fillRect(rnd(i * 3 + f) * W, rnd(i * 5 + f * 3) * H, 2, 2);
  }
  ctx.globalAlpha = 1;
  const vig = ctx.createRadialGradient(cx, H / 2, Math.min(W, H) * 0.35, cx, H / 2, Math.max(W, H) * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,.7)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** Music + synthesised hits, routed only into the recording (silent for the user). */
async function scoreAudio(lead) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ac = new AC();
  try { await ac.resume(); } catch { /* checked below */ }
  if (ac.state !== 'running') { ac.close().catch(() => {}); return null; } // a frozen clock would never end the film
  const dest = ac.createMediaStreamDestination();
  const out = ac.createGain();
  out.gain.value = 0.7;
  const limiter = ac.createDynamicsCompressor(); // keeps the hits from clipping
  limiter.threshold.value = -6; limiter.knee.value = 4; limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.2;
  out.connect(limiter).connect(dest);
  let buf = null;
  try { buf = await fetch('/audio/card-film.mp3').then((r) => r.arrayBuffer()).then((b) => ac.decodeAudioData(b)); } catch { /* hits only */ }
  const at = ac.currentTime + lead;
  if (buf) {
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.75, at + 0.3);
    g.gain.setValueAtTime(0.75, at + FILM_SECONDS - 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, at + FILM_SECONDS);
    src.connect(g).connect(out);
    src.start(at);
  }
  const noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = rnd(i) * 2 - 1;
  const whoosh = (t0, dur) => {
    const n = ac.createBufferSource(); n.buffer = noise;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(300, t0); bp.frequency.exponentialRampToValueAtTime(4200, t0 + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.5, t0 + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.1);
    n.connect(bp).connect(g).connect(out); n.start(t0); n.stop(t0 + dur + 0.2);
  };
  const boom = (t0) => {
    const o = ac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t0); o.frequency.exponentialRampToValueAtTime(38, t0 + 0.6);
    const g = ac.createGain(); g.gain.setValueAtTime(0.9, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
    o.connect(g).connect(out); o.start(t0); o.stop(t0 + 1);
    const n = ac.createBufferSource(); n.buffer = noise;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const gn = ac.createGain(); gn.gain.setValueAtTime(0.35, t0); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
    n.connect(hp).connect(gn).connect(out); n.start(t0); n.stop(t0 + 1.5);
  };
  const shimmer = (t0) => {
    [1318.5, 1760, 2637].forEach((fq, i) => {
      const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = fq;
      const g = ac.createGain(); const s0 = t0 + i * 0.07;
      g.gain.setValueAtTime(0.0001, s0); g.gain.exponentialRampToValueAtTime(0.07, s0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s0 + 1.2);
      o.connect(g).connect(out); o.start(s0); o.stop(s0 + 1.3);
    });
  };
  shimmer(at + 0.15);
  whoosh(at + 1.3, 0.75);
  boom(at + 2.07);
  shimmer(at + 2.3);
  whoosh(at + 6.45, 0.45);
  boom(at + 6.85);
  return { ac, track: dest.stream.getAudioTracks()[0], at };
}

/**
 * Record the film. ratio: '9x16' | '1x1'. onProgress(0..1). Returns { blob, ext } or null if this
 * browser can't record video.
 */
export async function cardFilm(info, { ratio = '9x16', onProgress } = {}) {
  const mime = filmMime();
  if (!mime) return null;
  const W = 1080;
  const H = ratio === '1x1' ? 1080 : 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  if (!canvas.captureStream) return null;
  const ctx = canvas.getContext('2d');
  const card = document.createElement('canvas');
  card.width = CARD_W; card.height = CARD_H;
  const [assets, crest] = await Promise.all([
    loadCardAssets(info.player, info.team),
    loadImage(`${window.location.origin}/brand/crest.webp`),
  ]);
  try { await document.fonts?.load(`700 30px ${MONO}`); } catch { /* fallback font */ }
  const s = { c: hexRgb(info.team?.color || info.tierColor), card, cctx: card.getContext('2d'), crest, info, assets };
  drawFilmFrame(ctx, W, H, 0, s);

  const LEAD = 0.3; // seconds between recorder start and t = 0, so the first frame is never lost
  const audio = await scoreAudio(LEAD);
  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...(audio?.track ? [audio.track] : [])]);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10_000_000, audioBitsPerSecond: 160_000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise((res) => { rec.onstop = res; });
  rec.start(250);
  // the clock: the audio context when we have one (video and music stay in step), else performance.now
  const now = audio ? () => audio.ac.currentTime - audio.at : ((p0) => () => (performance.now() - p0) / 1000)(performance.now() + LEAD * 1000);
  await new Promise((resolve) => {
    // a timer, not requestAnimationFrame: keeps drawing even if the tab loses focus
    const id = setInterval(() => {
      const t = now();
      drawFilmFrame(ctx, W, H, clamp(t, 0, FILM_SECONDS), s);
      onProgress?.(clamp(t / FILM_SECONDS));
      if (t >= FILM_SECONDS + 0.1) { clearInterval(id); resolve(); }
    }, 1000 / 30);
  });
  rec.stop();
  await stopped;
  stream.getTracks().forEach((tr) => tr.stop());
  audio?.ac.close().catch(() => {});
  return { blob: new Blob(chunks, { type: mime.split(';')[0] }), ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm' };
}
