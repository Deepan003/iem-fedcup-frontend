/**
 * Player card renderer: draws a 1080×1350 collectible card on a canvas (no libraries), so it can be
 * downloaded as PNG / JPG, or recorded as a short animated clip (foil sweep).
 */
import { API_URL, assetUrl } from './api.js';

export const CARD_W = 1080;
export const CARD_H = 1350;
const DISPLAY = '"Big Shoulders Display", "Arial Narrow", Impact, sans-serif';
const MONO = '"JetBrains Mono", "IBM Plex Mono", Consolas, monospace';

const imgCache = new Map();
/** Load an image for canvas use (CORS-clean). Resolves null instead of failing. */
function loadOne(src) {
  return new Promise((resolve) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.decoding = 'async';
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

/**
 * Photos and logos on R2 come from another site that sends no CORS header, so a canvas can't use
 * them directly. Load those through the backend (same image, CORS allowed, cached in memory).
 */
function proxied(src) {
  try {
    const u = new URL(src, window.location.href);
    const api = new URL(API_URL);
    if (u.origin === window.location.origin || u.origin === api.origin) return null;
    return `${API_URL}/api/media/${u.pathname.replace(/^\/+/, '')}`;
  } catch { return null; }
}

export function loadImage(url) {
  if (!url) return Promise.resolve(null);
  const src = assetUrl(url);
  if (imgCache.has(src)) return imgCache.get(src);
  const via = proxied(src);
  const p = (via ? loadOne(via) : Promise.resolve(null)).then((im) => im || loadOne(src));
  imgCache.set(src, p);
  return p;
}

export async function loadCardAssets(player, team) {
  try { await document.fonts?.load(`900 120px ${DISPLAY}`); } catch { /* fallback font */ }
  const [photo, logo, crest] = await Promise.all([
    loadImage(player.photoUrl || player.thumbUrl),
    loadImage(team?.logoUrl),
    loadImage(`${window.location.origin}/brand/crest.webp`), // a site asset, not a backend media URL
  ]);
  return { photo, logo, crest };
}

const hexToRgb = (hex) => {
  const m = /^#?([a-f\d]{6})$/i.exec(hex || '');
  if (!m) return [227, 18, 63];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;
const mix = ([r, g, b], [r2, g2, b2], k) => [r + (r2 - r) * k, g + (g2 - g) * k, b + (b2 - b) * k].map(Math.round);

function coverDraw(ctx, img, x, y, w, h, zoom = 1) {
  const s = Math.max(w / img.width, h / img.height) * zoom;
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) * 0.3, dw, dh);
}

function fitText(ctx, text, maxW, size, weight = 900, family = DISPLAY) {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= maxW) break;
    s -= 4;
  } while (s > 40);
  return s;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Draw one frame. t (0..1) drives the foil sweep and a slow push-in; null = still card.
 * info: { player, team, priceText, roleText, tierColor, title }
 */
export function drawCard(ctx, info, assets, t = null) {
  const { player, team } = info;
  const W = CARD_W;
  const H = CARD_H;
  const c = hexToRgb(team?.color || info.tierColor || '#e3123f');
  const dark = mix(c, [8, 8, 10], 0.82);
  const gold = [245, 197, 66];
  ctx.save();
  ctx.clearRect(0, 0, W, H);

  // background: deep team colour, a glow, diagonal stripes, halftone, watermark
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, rgba(mix(c, [0, 0, 0], 0.35), 1));
  bg.addColorStop(0.55, rgba(dark, 1));
  bg.addColorStop(1, '#060607');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.3, H * 0.25, 40, W * 0.3, H * 0.25, W * 0.95);
  glow.addColorStop(0, rgba(c, 0.55));
  glow.addColorStop(1, rgba(c, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 18;
  for (let x = -H; x < W + H; x += 70) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + H * 0.6, H);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.fillStyle = rgba(c, 0.35);
  for (let yy = H * 0.55; yy < H; yy += 22) {
    for (let xx = W * 0.45; xx < W; xx += 22) {
      const k = ((xx - W * 0.45) / (W * 0.55)) * ((yy - H * 0.55) / (H * 0.45));
      ctx.beginPath();
      ctx.arc(xx, yy, 1 + k * 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  ctx.save();
  ctx.translate(W - 70, H * 0.5);
  ctx.rotate(-Math.PI / 2);
  ctx.font = `900 300px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 3;
  ctx.strokeText((team?.shortName || team?.name || 'FED CUP').toUpperCase().slice(0, 8), 0, 100);
  ctx.restore();

  // photo panel
  const px = 70;
  const py = 150;
  const pw = W - 140;
  const ph = 860;
  ctx.save();
  roundRect(ctx, px, py, pw, ph, 18);
  ctx.clip();
  ctx.fillStyle = '#111';
  ctx.fillRect(px, py, pw, ph);
  if (assets.photo) coverDraw(ctx, assets.photo, px, py, pw, ph, t == null ? 1 : 1 + 0.04 * t);
  else {
    ctx.fillStyle = rgba(c, 0.25);
    ctx.fillRect(px, py, pw, ph);
    ctx.font = `900 360px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillText((player.name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase(), W / 2, py + ph * 0.66);
  }
  const vig = ctx.createRadialGradient(W / 2, py + ph * 0.42, ph * 0.35, W / 2, py + ph * 0.5, ph * 0.85);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vig;
  ctx.fillRect(px, py, pw, ph);
  const fade = ctx.createLinearGradient(0, py + ph * 0.7, 0, py + ph);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, rgba(dark, 0.85));
  ctx.fillStyle = fade;
  ctx.fillRect(px, py + ph * 0.7, pw, ph * 0.3);
  // foil sweep
  const sweepX = t == null ? 0.32 : -0.4 + t * 1.8;
  const foil = ctx.createLinearGradient(px + pw * (sweepX - 0.25), py, px + pw * (sweepX + 0.25), py + ph);
  foil.addColorStop(0, 'rgba(255,255,255,0)');
  foil.addColorStop(0.5, 'rgba(255,255,255,0.22)');
  foil.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = foil;
  ctx.fillRect(px, py, pw, ph);
  ctx.restore();
  // frame
  ctx.save();
  roundRect(ctx, px, py, pw, ph, 18);
  ctx.lineWidth = 6;
  const fr = ctx.createLinearGradient(px, py, px + pw, py + ph);
  fr.addColorStop(0, rgba(gold, 1));
  fr.addColorStop(0.5, rgba(c, 1));
  fr.addColorStop(1, rgba(gold, 1));
  ctx.strokeStyle = fr;
  ctx.stroke();
  ctx.restore();

  // header: crest + event, position + tier
  // crest keeps its own shape (it is wider than tall) and the title starts after it, never on top of it
  let titleX = 70;
  if (assets.crest) {
    const ch = 78;
    const cw = Math.round((ch * (assets.crest.naturalWidth || 1)) / (assets.crest.naturalHeight || 1));
    ctx.drawImage(assets.crest, 70, 40, cw, ch);
    titleX = 70 + cw + 18;
  }
  ctx.fillStyle = '#fff';
  ctx.font = `700 26px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.fillText((info.title || 'IEM FED CUP · SEASON 5').toUpperCase(), titleX, 92);
  ctx.textAlign = 'right';
  ctx.font = `900 92px ${DISPLAY}`;
  ctx.fillStyle = rgba(gold, 1);
  const pos = { Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Forward: 'FWD' }[player.position] || '';
  ctx.fillText(pos, W - 70, 118);
  if (player.tier) {
    ctx.font = `800 28px ${MONO}`;
    const tw = ctx.measureText(player.tier.toUpperCase()).width + 30;
    const tc = hexToRgb(info.tierColor || '#f5c542');
    ctx.fillStyle = rgba(tc, 1);
    roundRect(ctx, px + 24, py + 24, tw, 48, 6);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.textAlign = 'left';
    ctx.fillText(player.tier.toUpperCase(), px + 39, py + 58);
  }

  // name, team, price
  const name = (player.name || '').toUpperCase();
  ctx.textAlign = 'left';
  const ns = fitText(ctx, name, W - 140, 132);
  ctx.font = `900 ${ns}px ${DISPLAY}`;
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 18;
  ctx.fillText(name, 70, py + ph + 18 + ns * 0.82);
  ctx.shadowBlur = 0;
  const rowY = H - 92;
  let x = 70;
  if (assets.logo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + 34, rowY, 34, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    ctx.drawImage(assets.logo, x + 4, rowY - 30, 60, 60);
    ctx.restore();
    x += 84;
  }
  ctx.font = `700 30px ${MONO}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText((team?.name || info.roleText || 'IEM FED CUP').toUpperCase(), x, rowY + 11);
  if (info.priceText) {
    ctx.font = `900 64px ${DISPLAY}`;
    const w = ctx.measureText(info.priceText).width;
    const g = ctx.createLinearGradient(W - 70 - w, 0, W - 70, 0);
    g.addColorStop(0, '#f5c542');
    g.addColorStop(1, '#fff1b8');
    ctx.fillStyle = g;
    ctx.textAlign = 'right';
    ctx.fillText(info.priceText, W - 70, rowY + 22);
    if (info.roleText) {
      ctx.font = `700 22px ${MONO}`;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(info.roleText.toUpperCase(), W - 70, rowY - 44);
    }
  }
  ctx.restore();
}

/** Render a still card to a Blob (image/png or image/jpeg). */
export async function cardBlob(info, type = 'image/png') {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const assets = await loadCardAssets(info.player, info.team);
  const ctx = canvas.getContext('2d');
  if (type === 'image/jpeg') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CARD_W, CARD_H); }
  drawCard(ctx, info, assets, null);
  return new Promise((res) => canvas.toBlob(res, type, 0.92));
}

/** Record a ~3 s animated clip (foil sweep + slow push-in). Returns { blob, ext } or null if unsupported. */
export async function cardClip(info, seconds = 3) {
  if (typeof MediaRecorder === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  const assets = await loadCardAssets(info.player, info.team);
  const types = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mime = types.find((m) => MediaRecorder.isTypeSupported?.(m));
  if (!mime || !canvas.captureStream) return null;
  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise((res) => { rec.onstop = res; });
  rec.start();
  const t0 = performance.now();
  await new Promise((resolve) => {
    const frame = (now) => {
      const k = Math.min(1, (now - t0) / (seconds * 1000));
      drawCard(ctx, info, assets, k);
      if (k < 1) requestAnimationFrame(frame); else resolve();
    };
    requestAnimationFrame(frame);
  });
  rec.stop();
  await done;
  return { blob: new Blob(chunks, { type: mime.split(';')[0] }), ext: mime.includes('mp4') ? 'mp4' : 'webm' };
}
