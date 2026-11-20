/**
 * A player's BIDDING WAR film (imported by components/PlayerStory.jsx): 9:16 or 1:1 video with music.
 *   0.0 s  FED Cup crest sting
 *   1.5 s  the player: photo, name, position, tier, base price
 *   3.4 s  the war: every bid ticks the price up in the bidding team's colour, a ladder of the latest bids
 *   …      the hammer: SOLD (or UNSOLD) — winning team's logo, colour and price, gavel + boom
 *   end    FED Cup lockup
 * Deterministic (a pure function of time), drawn on a canvas and recorded with MediaRecorder.
 */
import { loadImage } from './cards.js';
import { filmMime } from './cardFilm.js';

const DISPLAY = '"Big Shoulders Display", "Arial Narrow", Impact, sans-serif';
const MONO = '"JetBrains Mono", "IBM Plex Mono", Consolas, monospace';
const SANS = 'Archivo, "Segoe UI", Arial, sans-serif';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (k) => 1 - (1 - k) ** 3;
const backOut = (k) => { const c = 1.70158; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; };
const hexRgb = (hex) => { const m = /^#?([a-f\d]{6})$/i.exec(hex || ''); const n = m ? parseInt(m[1], 16) : 0xe3123f; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;
const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function fit(ctx, text, maxW, size, weight = 900, family = DISPLAY, min = 30) {
  let s = size;
  do { ctx.font = `${weight} ${s}px ${family}`; if (ctx.measureText(text).width <= maxW) break; s -= 4; } while (s > min);
  return s;
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}
function cover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s; const dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) * 0.25, dw, dh);
}

/** Build the timeline from one lot's bids (oldest first). */
export function bidPlan({ player, lot, teamMap, sold }) {
  const all = (lot?.bids || []).filter((b) => b && b.amount != null);
  const shown = all.slice(-18);
  const per = shown.length ? Math.min(0.6, Math.max(0.28, 6.5 / shown.length)) : 0;
  const T0 = 3.6;
  const times = shown.map((_, i) => T0 + i * per);
  const tHammer = T0 + Math.max(1.2, shown.length * per) + 0.4;
  const total = tHammer + 3.6;
  const winner = sold && player.teamId ? teamMap[player.teamId] : null;
  return {
    all, shown, times, per, T0, tHammer, total, teamCount: new Set(all.map((b) => b.teamId)).size, skipped: all.length - shown.length, winner, sold: !!sold,
  };
}

function drawFrame(ctx, W, H, t, s) {
  const { plan, player, imgs, teamMap, fmt } = s;
  const u = W / 1080;
  const tall = H / W > 1.4;
  const cx = W / 2;
  let k = -1;
  for (let i = 0; i < plan.times.length; i++) if (t >= plan.times[i]) k = i;
  const cur = k >= 0 ? plan.shown[k] : null;
  const curTeam = cur ? teamMap[cur.teamId] : null;
  const hammer = seg(t, plan.tHammer, plan.tHammer + 0.5);
  const endK = seg(t, plan.total - 1.1, plan.total - 0.5);
  const tc = hexRgb((hammer > 0 && plan.winner ? plan.winner.color : curTeam?.color) || '#e3123f');

  ctx.save();
  ctx.fillStyle = '#060607';
  ctx.fillRect(0, 0, W, H);
  const bloom = ctx.createRadialGradient(cx, H * 0.42, 0, cx, H * 0.42, Math.max(W, H) * 0.8);
  bloom.addColorStop(0, rgba(tc, 0.42 + 0.18 * hammer));
  bloom.addColorStop(0.6, rgba(tc, 0.08));
  bloom.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.05 + 0.04 * hammer;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2 * u;
  const off = (t * 90 * u) % (60 * u);
  for (let x = -H; x < W + H; x += 60 * u) { ctx.beginPath(); ctx.moveTo(x + off, 0); ctx.lineTo(x + off + H * 0.5, H); ctx.stroke(); }
  ctx.restore();

  // sting
  const sting = t < 1.7 ? seg(t, 0.05, 0.35) * (1 - seg(t, 1.2, 1.6)) : 0;
  if (sting > 0 && imgs.crest) {
    const sz = 360 * u * (0.7 + 0.3 * backOut(seg(t, 0.05, 0.7)));
    const ch = sz * (imgs.crest.height / imgs.crest.width);
    ctx.save();
    ctx.globalAlpha = sting;
    ctx.shadowColor = 'rgba(227,18,63,.8)'; ctx.shadowBlur = 60 * u;
    ctx.drawImage(imgs.crest, cx - sz / 2, H * 0.42 - ch / 2, sz, ch);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#efebe3'; ctx.textAlign = 'center';
    ctx.font = `900 ${96 * u}px ${DISPLAY}`;
    ctx.fillText('BIDDING WAR', cx, H * 0.42 + ch / 2 + 100 * u);
    ctx.font = `700 ${26 * u}px ${MONO}`; ctx.fillStyle = '#f5c542';
    ctx.fillText('IEM FED CUP · SEASON 5', cx, H * 0.42 + ch / 2 + 150 * u);
    ctx.restore();
  }

  // player + war
  if (t > 1.45 && t < plan.total - 0.4) {
    const inK = easeOut(seg(t, 1.5, 2.2));
    const fade = (1 - endK) * (1 - 0.88 * hammer); // the hammer moment takes the stage
    ctx.save();
    ctx.globalAlpha = inK * fade;
    if (imgs.crest) ctx.drawImage(imgs.crest, 60 * u, 52 * u, 64 * u, 64 * u * (imgs.crest.height / imgs.crest.width));
    ctx.font = `900 ${40 * u}px ${DISPLAY}`; ctx.fillStyle = '#efebe3'; ctx.textAlign = 'left';
    ctx.fillText('FED CUP', 138 * u, 98 * u);
    ctx.font = `700 ${20 * u}px ${MONO}`; ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.textAlign = 'right';
    ctx.fillText('PLAYER AUCTION · S5', W - 60 * u, 94 * u);
    const pw = (tall ? 380 : 300) * u; const ph = pw * 1.22;
    const px = 60 * u - (1 - inK) * 120 * u; const py = (tall ? 170 : 150) * u;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 40 * u; ctx.shadowOffsetY = 18 * u;
    rr(ctx, px, py, pw, ph, 14 * u); ctx.fillStyle = '#18181b'; ctx.fill();
    ctx.restore();
    ctx.save(); rr(ctx, px, py, pw, ph, 14 * u); ctx.clip();
    if (imgs.photo) cover(ctx, imgs.photo, px, py, pw, ph);
    else { ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = `900 ${120 * u}px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.fillText((player.name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join(''), px + pw / 2, py + ph / 2 + 40 * u); }
    const shade = ctx.createLinearGradient(0, py + ph * 0.6, 0, py + ph); shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = shade; ctx.fillRect(px, py, pw, ph);
    ctx.restore();
    ctx.strokeStyle = rgba(tc, 0.9); ctx.lineWidth = 4 * u; rr(ctx, px, py, pw, ph, 14 * u); ctx.stroke();
    const nx = px + pw + 44 * u; const nw = W - nx - 60 * u;
    const words = (player.name || '').toUpperCase().split(/\s+/);
    const lines = words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : words;
    ctx.textAlign = 'left'; ctx.fillStyle = '#f2efe8';
    let ny = py + 110 * u;
    const fs = Math.min(...lines.map((l) => fit(ctx, l, nw, (tall ? 112 : 96) * u, 900, DISPLAY, 36 * u)));
    for (const l of lines) { ctx.font = `900 ${fs}px ${DISPLAY}`; ctx.fillText(l, nx + (1 - inK) * 80 * u, ny); ny += fs * 0.92; }
    ctx.font = `700 ${24 * u}px ${MONO}`; ctx.fillStyle = 'rgba(255,255,255,.75)';
    ny += 18 * u;
    ctx.fillText(`${(player.position || '').toUpperCase()}${player.tier ? `  ·  ${String(player.tier).toUpperCase()}` : ''}`, nx, ny);
    ny += 44 * u;
    if (player.basePrice != null) { ctx.fillStyle = '#f5c542'; ctx.fillText(`BASE ${fmt(player.basePrice)}`, nx, ny); ny += 44 * u; }
    if (plan.teamCount > 1) { ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillText(`${plan.all.length} BIDS · ${plan.teamCount} TEAMS`, nx, ny); }

    const by = tall ? 840 * u : 640 * u;
    const warK = seg(t, 3.0, 3.5) * (1 - hammer);
    ctx.globalAlpha = inK * fade * warK;
    ctx.textAlign = 'left';
    ctx.font = `700 ${24 * u}px ${MONO}`; ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.fillText(hammer > 0 ? (plan.sold ? 'SOLD FOR' : 'NO SALE') : cur ? 'CURRENT BID' : 'OPENING AT', 60 * u, by);
    let shownAmt = cur ? cur.amount : player.basePrice ?? 0;
    if (k > 0) { const prev = plan.shown[k - 1].amount; const r = easeOut(seg(t, plan.times[k], plan.times[k] + 0.22)); shownAmt = prev + (cur.amount - prev) * r; }
    const punch = k >= 0 ? 1 + 0.08 * (1 - seg(t, plan.times[k], plan.times[k] + 0.2)) : 1;
    ctx.save();
    ctx.translate(60 * u, by + 20 * u);
    ctx.scale(punch, punch);
    ctx.font = `900 ${(tall ? 210 : 170) * u}px ${DISPLAY}`;
    const pg = ctx.createLinearGradient(0, 0, 0, 200 * u); pg.addColorStop(0, '#ffffff'); pg.addColorStop(1, '#f2c9a8');
    ctx.fillStyle = pg; ctx.textBaseline = 'top';
    ctx.fillText(fmt(Math.round(shownAmt)), 0, 0);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
    if (curTeam && hammer === 0) {
      const ly = by + (tall ? 260 : 210) * u;
      ctx.fillStyle = rgba(hexRgb(curTeam.color), 0.9);
      rr(ctx, 60 * u, ly, W - 120 * u, 86 * u, 6 * u); ctx.fill();
      const lg = imgs.logos[curTeam.id];
      if (lg) ctx.drawImage(lg, 76 * u, ly + 9 * u, 68 * u, 68 * u * (lg.height / lg.width));
      ctx.fillStyle = '#fff'; ctx.font = `700 ${20 * u}px ${MONO}`;
      ctx.fillText('HIGHEST BIDDER', 164 * u, ly + 32 * u);
      ctx.font = `900 ${fit(ctx, curTeam.name.toUpperCase(), W - 300 * u, 46 * u)}px ${DISPLAY}`;
      ctx.fillText(curTeam.name.toUpperCase(), 164 * u, ly + 72 * u);
    }
    if (hammer === 0 && k >= 0) {
      const rows = tall ? 6 : 3;
      const ly0 = by + (tall ? 380 : 312) * u;
      const rh = (tall ? 84 : 74) * u;
      ctx.font = `700 ${20 * u}px ${MONO}`; ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.fillText(plan.skipped > 0 ? `LATEST BIDS · ${plan.skipped} EARLIER` : 'BIDS', 60 * u, ly0 - 14 * u);
      for (let r = 0; r < rows; r++) {
        const i = k - r;
        if (i < 0) break;
        const b = plan.shown[i]; const tm = teamMap[b.teamId];
        const slide = r === 0 ? easeOut(seg(t, plan.times[i], plan.times[i] + 0.25)) : 1;
        const y = ly0 + r * rh + (r === 0 ? (1 - slide) * -30 * u : 0);
        ctx.globalAlpha = inK * fade * warK * (r === 0 ? slide : 1 - r * 0.12);
        ctx.fillStyle = r === 0 ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.04)';
        rr(ctx, 60 * u, y, W - 120 * u, rh - 10 * u, 4 * u); ctx.fill();
        ctx.fillStyle = tm?.color || '#888'; ctx.fillRect(60 * u, y, 6 * u, rh - 10 * u);
        const lg = tm ? imgs.logos[tm.id] : null;
        if (lg) ctx.drawImage(lg, 84 * u, y + 10 * u, (rh - 30 * u), (rh - 30 * u) * (lg.height / lg.width));
        ctx.fillStyle = '#efebe3'; ctx.font = `700 ${(tall ? 30 : 26) * u}px ${SANS}`; ctx.textAlign = 'left';
        ctx.fillText(tm?.name || 'Team', 84 * u + rh, y + rh * 0.55);
        ctx.font = `800 ${(tall ? 32 : 28) * u}px ${MONO}`; ctx.textAlign = 'right';
        ctx.fillText(fmt(b.amount), W - 84 * u, y + rh * 0.55);
        ctx.textAlign = 'left';
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // hammer
  if (hammer > 0 && endK < 1) {
    const w = plan.winner;
    const fade = 1 - endK;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = `rgba(0,0,0,${0.55 * hammer})`; ctx.fillRect(0, 0, W, H);
    const cyy = tall ? H * 0.5 : H * 0.52;
    if (w) {
      const lg = imgs.logos[w.id];
      const sz = (tall ? 300 : 240) * u * backOut(seg(t, plan.tHammer + 0.2, plan.tHammer + 0.8));
      if (lg && sz > 1) { ctx.shadowColor = rgba(hexRgb(w.color), 0.9); ctx.shadowBlur = 60 * u; ctx.drawImage(lg, cx - sz / 2, cyy - sz - 40 * u, sz, sz * (lg.height / lg.width)); ctx.shadowBlur = 0; }
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      ctx.globalAlpha = fade * seg(t, plan.tHammer + 0.4, plan.tHammer + 0.8);
      ctx.font = `900 ${fit(ctx, w.name.toUpperCase(), W - 120 * u, (tall ? 104 : 88) * u)}px ${DISPLAY}`;
      ctx.fillText(w.name.toUpperCase(), cx, cyy + 70 * u);
      ctx.font = `900 ${(tall ? 150 : 120) * u}px ${DISPLAY}`; ctx.fillStyle = '#f5c542';
      ctx.fillText(fmt(player.price ?? plan.all[plan.all.length - 1]?.amount ?? 0), cx, cyy + (tall ? 220 : 190) * u);
    }
    const st = seg(t, plan.tHammer, plan.tHammer + 0.35);
    const sc = 1 + 1.4 * (1 - easeOut(st));
    ctx.globalAlpha = fade * st;
    ctx.save();
    ctx.translate(cx, w ? cyy - (tall ? 420 : 330) * u : cyy);
    ctx.rotate(-0.1); ctx.scale(sc, sc);
    const word = plan.sold ? 'SOLD' : 'UNSOLD';
    const col = plan.sold ? '#22c55e' : '#ef4444';
    ctx.font = `900 ${(tall ? 150 : 120) * u}px ${DISPLAY}`;
    const ww = ctx.measureText(word).width;
    ctx.strokeStyle = col; ctx.lineWidth = 10 * u;
    rr(ctx, -ww / 2 - 30 * u, -95 * u, ww + 60 * u, 170 * u, 10 * u); ctx.stroke();
    ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(word, 0, -8 * u);
    ctx.restore();
    ctx.restore();
  }
  const flash = t > plan.tHammer ? Math.max(0, 1 - (t - plan.tHammer) / 0.3) : 0;
  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * 0.6})`; ctx.fillRect(0, 0, W, H); }

  // end lockup
  if (endK > 0 && imgs.crest) {
    ctx.save();
    ctx.globalAlpha = endK;
    const sz = 280 * u; const ch = sz * (imgs.crest.height / imgs.crest.width);
    ctx.drawImage(imgs.crest, cx - sz / 2, H * 0.42 - ch / 2, sz, ch);
    ctx.textAlign = 'center'; ctx.fillStyle = '#efebe3';
    ctx.font = `900 ${100 * u}px ${DISPLAY}`; ctx.fillText('FED CUP', cx, H * 0.42 + ch / 2 + 100 * u);
    ctx.font = `700 ${24 * u}px ${MONO}`; ctx.fillStyle = '#f5c542';
    ctx.fillText('iem-fedcup.iem.edu.in', cx, H * 0.42 + ch / 2 + 150 * u);
    ctx.restore();
  }
  ctx.globalAlpha = 0.05;
  const f = Math.floor(t * 24);
  for (let i = 0; i < 220; i++) { ctx.fillStyle = rnd(i + f * 7) > 0.5 ? '#fff' : '#000'; ctx.fillRect(rnd(i * 3 + f) * W, rnd(i * 5 + f * 3) * H, 2, 2); }
  ctx.globalAlpha = 1;
  const vig = ctx.createRadialGradient(cx, H / 2, Math.min(W, H) * 0.35, cx, H / 2, Math.max(W, H) * 0.78);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,.65)');
  ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

async function score(plan, lead) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ac = new AC();
  try { await ac.resume(); } catch { /* checked below */ }
  if (ac.state !== 'running') { ac.close().catch(() => {}); return null; }
  const dest = ac.createMediaStreamDestination();
  const out = ac.createGain(); out.gain.value = 0.7;
  const lim = ac.createDynamicsCompressor(); lim.threshold.value = -6; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.2;
  out.connect(lim).connect(dest);
  let buf = null;
  try { buf = await fetch('/audio/card-film.mp3').then((r) => r.arrayBuffer()).then((b) => ac.decodeAudioData(b)); } catch { /* hits only */ }
  const at = ac.currentTime + lead;
  if (buf) {
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.5, at + 0.4);
    g.gain.setValueAtTime(0.5, at + plan.total - 1); g.gain.exponentialRampToValueAtTime(0.0001, at + plan.total);
    src.connect(g).connect(out); src.start(at); src.stop(at + plan.total + 0.1);
  }
  const noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rnd(i) * 2 - 1;
  const tick = (t0, pitch) => {
    const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(pitch, t0); o.frequency.exponentialRampToValueAtTime(pitch * 1.5, t0 + 0.06);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    o.connect(g).connect(out); o.start(t0); o.stop(t0 + 0.2);
  };
  const boom = (t0) => {
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(130, t0); o.frequency.exponentialRampToValueAtTime(36, t0 + 0.7);
    const g = ac.createGain(); g.gain.setValueAtTime(1, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1);
    o.connect(g).connect(out); o.start(t0); o.stop(t0 + 1.1);
    const n = ac.createBufferSource(); n.buffer = noise;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
    const gn = ac.createGain(); gn.gain.setValueAtTime(0.6, t0); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
    n.connect(bp).connect(gn).connect(out); n.start(t0); n.stop(t0 + 0.3);
  };
  plan.times.forEach((tt, i) => tick(at + tt, 520 + Math.min(i, 16) * 28));
  boom(at + plan.tHammer);
  if (plan.sold) {
    [1046.5, 1318.5, 1568].forEach((fq, i) => {
      const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = fq;
      const g = ac.createGain(); const s0 = at + plan.tHammer + 0.15 + i * 0.05;
      g.gain.setValueAtTime(0.0001, s0); g.gain.exponentialRampToValueAtTime(0.09, s0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s0 + 1.6);
      o.connect(g).connect(out); o.start(s0); o.stop(s0 + 1.7);
    });
  }
  return { ac, at, track: dest.stream.getAudioTracks()[0] };
}

/**
 * Record the bidding-war film. lot: { bids: [{ teamId, amount }] } (oldest first); teamMap: id → team;
 * fmt: amount → text. Returns { blob, ext } or null when the browser can't record video.
 */
export async function bidFilm({ player, lot, teamMap, fmt, sold, ratio = '9x16', onProgress }) {
  const mime = filmMime();
  if (!mime) return null;
  const W = 1080; const H = ratio === '1x1' ? 1080 : 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  if (!canvas.captureStream) return null;
  const ctx = canvas.getContext('2d');
  const plan = bidPlan({ player, lot, teamMap, sold });
  const teamIds = [...new Set([...plan.all.map((b) => b.teamId), player.teamId].filter(Boolean))];
  const [photo, crest, ...logoImgs] = await Promise.all([
    loadImage(player.photoUrl || player.thumbUrl),
    loadImage(`${window.location.origin}/brand/crest.webp`),
    ...teamIds.map((id) => loadImage(teamMap[id]?.logoUrl)),
  ]);
  try { await Promise.all([document.fonts?.load(`900 100px ${DISPLAY}`), document.fonts?.load(`700 24px ${MONO}`)]); } catch { /* fallback */ }
  const s = {
    plan, player, teamMap, fmt, imgs: { photo, crest, logos: Object.fromEntries(teamIds.map((id, i) => [id, logoImgs[i]])) },
  };
  drawFrame(ctx, W, H, 0, s);
  const LEAD = 0.3;
  const audio = await score(plan, LEAD);
  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...(audio?.track ? [audio.track] : [])]);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10_000_000, audioBitsPerSecond: 160_000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise((res) => { rec.onstop = res; });
  rec.start(250);
  const now = audio ? () => audio.ac.currentTime - audio.at : ((p0) => () => (performance.now() - p0) / 1000)(performance.now() + LEAD * 1000);
  await new Promise((resolve) => {
    const id = setInterval(() => {
      const t = now();
      drawFrame(ctx, W, H, clamp(t, 0, plan.total), s);
      onProgress?.(clamp(t / plan.total));
      if (t >= plan.total + 0.1) { clearInterval(id); resolve(); }
    }, 1000 / 30);
  });
  rec.stop();
  await stopped;
  stream.getTracks().forEach((tr) => tr.stop());
  audio?.ac.close().catch(() => {});
  return { blob: new Blob(chunks, { type: mime.split(';')[0] }), ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm' };
}
