/**
 * Team cards (imported by components/TeamCards.jsx): one premium card per team, drawn on a canvas so the
 * homepage card, the PNG download and the video are the same artwork. Works for any team (uses team.logoUrl
 * and team.color), so teams added later get a card too.
 */
import { CARD_H, CARD_W, loadImage } from './cards.js';
import { cardFilm } from './cardFilm.js';

const DISPLAY = '"Big Shoulders Display", "Arial Narrow", Impact, sans-serif';
const MONO = '"JetBrains Mono", "IBM Plex Mono", Consolas, monospace';

const hexRgb = (hex) => { const m = /^#?([a-f\d]{6})$/i.exec(hex || ''); const n = m ? parseInt(m[1], 16) : 0xe3123f; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;
const mix = ([r, g, b], [r2, g2, b2], k) => [r + (r2 - r) * k, g + (g2 - g) * k, b + (b2 - b) * k].map(Math.round);
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** Team palette: very dark teams get charcoal + gold, very light ones a silver glow on slate. */
export function teamPalette(team) {
  const c = hexRgb(team?.color);
  const L = lum(c);
  if (L < 0.08) return { base: [30, 30, 36], glow: [227, 179, 65], accent: [235, 190, 80], name: 'dark' };
  if (L > 0.7) return { base: [70, 74, 84], glow: [230, 232, 238], accent: [235, 238, 245], name: 'light' };
  return { base: c, glow: c, accent: mix(c, [255, 255, 255], 0.35), name: 'colour' };
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}
function fit(ctx, text, maxW, size, min = 48) {
  let s = size;
  do { ctx.font = `900 ${s}px ${DISPLAY}`; if (ctx.measureText(text).width <= maxW) break; s -= 4; } while (s > min);
  return s;
}

export async function loadTeamCardAssets(team) {
  try { await Promise.all([document.fonts?.load(`900 120px ${DISPLAY}`), document.fonts?.load(`700 24px ${MONO}`)]); } catch { /* fallback fonts */ }
  const [logo, crest] = await Promise.all([loadImage(team?.logoUrl), loadImage(`${window.location.origin}/brand/crest.webp`)]);
  return { logo, crest };
}

/** Draw the card at CARD_W×CARD_H. t (0..1) = foil sweep position, null = still. */
export function drawTeamCard(ctx, team, assets, { index = 0, t = null } = {}) {
  const W = CARD_W; const H = CARD_H;
  const pal = teamPalette(team);
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  rr(ctx, 0, 0, W, H, 54);
  ctx.clip();
  const bg = ctx.createLinearGradient(0, 0, W * 0.3, H);
  bg.addColorStop(0, rgba(mix(pal.base, [0, 0, 0], 0.25), 1));
  bg.addColorStop(0.55, rgba(mix(pal.base, [6, 6, 8], 0.78), 1));
  bg.addColorStop(1, '#050507');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 600, 20, W / 2, 600, 640);
  glow.addColorStop(0, rgba(pal.glow, pal.name === 'colour' ? 0.75 : 0.45));
  glow.addColorStop(0.5, rgba(pal.glow, 0.16));
  glow.addColorStop(1, rgba(pal.glow, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, 600);
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 16; i++) {
    ctx.rotate((Math.PI * 2) / 16);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-46, -900); ctx.lineTo(46, -900); ctx.fill();
  }
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  for (let x = -H; x < W + H; x += 34) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H * 0.5, H); ctx.stroke(); }
  ctx.restore();
  const short = (team?.shortName || team?.name || '').toUpperCase().slice(0, 4);
  ctx.save();
  ctx.translate(W / 2, 640);
  ctx.rotate(-0.12);
  ctx.font = `900 520px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.strokeText(short, 0, 0);
  ctx.restore();

  const lg = assets?.logo;
  if (lg) {
    const box = 620;
    const s = Math.min(box / lg.width, box / lg.height);
    const lw = lg.width * s; const lh = lg.height * s;
    ctx.save();
    ctx.shadowColor = rgba(pal.glow, 0.9);
    ctx.shadowBlur = 90;
    ctx.drawImage(lg, (W - lw) / 2, 600 - lh / 2, lw, lh);
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 24;
    ctx.drawImage(lg, (W - lw) / 2, 600 - lh / 2, lw, lh);
    ctx.restore();
  } else {
    ctx.fillStyle = rgba(pal.accent, 0.9);
    ctx.font = `900 300px ${DISPLAY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(short, W / 2, 600);
  }

  const crest = assets?.crest;
  if (crest) ctx.drawImage(crest, 76, 70, 74, 74 * (crest.height / crest.width));
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f2efe8';
  ctx.font = `900 46px ${DISPLAY}`;
  ctx.fillText('FED CUP', 166, 122);
  ctx.textAlign = 'right';
  ctx.font = `700 26px ${MONO}`;
  ctx.fillStyle = rgba(pal.accent, 1);
  ctx.letterSpacing = '6px';
  ctx.fillText(`CLUB ${String(index + 1).padStart(2, '0')}`, W - 76, 118);
  ctx.letterSpacing = '0px';

  const name = (team?.name || '').toUpperCase();
  const shade = ctx.createLinearGradient(0, H - 420, 0, H);
  shade.addColorStop(0, 'rgba(5,5,7,0)');
  shade.addColorStop(1, 'rgba(5,5,7,.92)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, H - 420, W, 420);
  ctx.textAlign = 'center';
  const fs = fit(ctx, name, W - 150, 150);
  const ng = ctx.createLinearGradient(0, 1090 - fs, 0, 1090);
  ng.addColorStop(0, '#ffffff');
  ng.addColorStop(1, rgba(mix(pal.accent, [255, 255, 255], 0.4), 1));
  ctx.fillStyle = ng;
  ctx.font = `900 ${fs}px ${DISPLAY}`;
  ctx.fillText(name, W / 2, 1110);
  ctx.fillStyle = rgba(pal.accent, 1);
  ctx.fillRect(W / 2 - 60, 1150, 120, 5);
  ctx.font = `700 26px ${MONO}`;
  ctx.fillStyle = 'rgba(255,255,255,.72)';
  ctx.letterSpacing = '8px';
  ctx.fillText('SEASON 5 · PLAYER AUCTION', W / 2, 1218);
  ctx.letterSpacing = '0px';

  if (t != null) {
    const x = -W + t * W * 3;
    const foil = ctx.createLinearGradient(x, 0, x + W * 0.7, H);
    foil.addColorStop(0, 'rgba(255,255,255,0)');
    foil.addColorStop(0.45, 'rgba(255,255,255,0)');
    foil.addColorStop(0.5, 'rgba(255,255,255,.28)');
    foil.addColorStop(0.55, rgba(pal.accent, 0.12));
    foil.addColorStop(0.6, 'rgba(255,255,255,0)');
    foil.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = foil;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.22)';
  ctx.lineWidth = 2;
  rr(ctx, 28, 28, W - 56, H - 56, 34);
  ctx.stroke();
  ctx.strokeStyle = rgba(pal.accent, 1);
  ctx.lineWidth = 6;
  const L = 90; const m = 28;
  for (const [x, y, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x, y + dy * L); ctx.lineTo(x, y + dy * 20); ctx.quadraticCurveTo(x, y, x + dx * 20, y); ctx.lineTo(x + dx * L, y); ctx.stroke();
  }
  ctx.restore();
}

/** PNG of the card. */
export async function teamCardBlob(team, index) {
  const cv = document.createElement('canvas');
  cv.width = CARD_W; cv.height = CARD_H;
  const assets = await loadTeamCardAssets(team);
  drawTeamCard(cv.getContext('2d'), team, assets, { index });
  return new Promise((res) => cv.toBlob(res, 'image/png'));
}

/** The card film: crest sting → card flips in → foil hold → lockup, with music. */
export async function teamCardFilm(team, index, { ratio = '9x16', onProgress } = {}) {
  const assets = await loadTeamCardAssets(team);
  const pal = teamPalette(team);
  const color = `#${pal.glow.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  return cardFilm({ team, player: {} }, {
    ratio, onProgress, color, renderCard: (cctx, foil) => drawTeamCard(cctx, team, assets, { index, t: foil }),
  });
}
