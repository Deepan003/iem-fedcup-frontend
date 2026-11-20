/**
 * Squad downloads for the captain room (imported by components/SquadBuilder.jsx):
 *   lineupCanvas → the lineup as a 1080×1350 image (PNG, and the same image as a PDF page)
 *   xlsxBlob     → a real Excel workbook (.xlsx, no library: a tiny zip writer)
 *   squadPdf     → printable squad sheet with photos (Save as PDF)
 */
import { loadImage } from './cards.js';
import { assetUrl } from './api.js';

const DISPLAY = '"Big Shoulders Display", "Arial Narrow", Impact, sans-serif';
const MONO = '"JetBrains Mono", "IBM Plex Mono", Consolas, monospace';
const POS_SHORT = { Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Forward: 'FWD' };
const short = (name = '') => { const w = name.trim().split(/\s+/); return w.length === 1 ? w[0] : `${w[0]} ${w[w.length - 1][0]}.`; };
const initials = (name = '') => name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

function circleImage(ctx, img, x, y, r, fallback, color) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = '#1b1b1f';
  ctx.fill();
  ctx.clip();
  if (img) {
    const s = Math.max((2 * r) / img.width, (2 * r) / img.height);
    const w = img.width * s; const h = img.height * s;
    ctx.drawImage(img, x - w / 2, y - r - (h - 2 * r) * 0.22, w, h);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.font = `900 ${Math.round(r * 0.8)}px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fallback, x, y + 2);
  }
  ctx.restore();
  ctx.lineWidth = Math.max(3, r * 0.08);
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function pill(ctx, text, x, y, font, bg, fg, padX = 10, h = 30) {
  ctx.font = font;
  const w = ctx.measureText(text).width + padX * 2;
  ctx.fillStyle = bg;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, 4); else ctx.rect(x - w / 2, y - h / 2, w, h);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 1);
}

/**
 * The lineup as an image. slots: [{id, position, x, y}] (percent), lineup: {slotId: playerId},
 * byId: {playerId: player}, bench: [player].
 */
export async function lineupCanvas({ team, formation, slots, lineup, byId, bench }) {
  const W = 1080; const H = 1350;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  try { await Promise.all([document.fonts?.load(`900 80px ${DISPLAY}`), document.fonts?.load(`700 20px ${MONO}`)]); } catch { /* fallback fonts */ }
  const color = team?.color || '#e3123f';
  const onPitch = slots.map((s) => byId[lineup[s.id]]).filter(Boolean);
  const imgs = new Map(await Promise.all([...onPitch, ...bench].map(async (p) => [p.id, await loadImage(p.thumbUrl || p.photoUrl)])));
  const [logo, crest] = await Promise.all([loadImage(team?.logoUrl), loadImage(`${window.location.origin}/brand/crest.webp`)]);

  // backdrop
  ctx.fillStyle = '#0a0a0c';
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(120, 60, 0, 120, 60, 760);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(10,10,12,0)');
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  // header: team crest, name, formation
  if (logo) ctx.drawImage(logo, 56, 44, 120, 120 * (logo.height / logo.width));
  ctx.fillStyle = '#f2efe8';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const name = (team?.name || '').toUpperCase();
  let fs = 92;
  do { ctx.font = `900 ${fs}px ${DISPLAY}`; fs -= 4; } while (ctx.measureText(name).width > W - 300 && fs > 40);
  ctx.fillText(name, 200, 128);
  ctx.font = `700 22px ${MONO}`;
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.letterSpacing = '4px';
  ctx.fillText(`STARTING XI  ·  ${formation}`, 202, 170);
  ctx.letterSpacing = '0px';
  if (crest) { ctx.globalAlpha = 0.9; ctx.drawImage(crest, W - 120, 52, 64, 64 * (crest.height / crest.width)); ctx.globalAlpha = 1; }

  // pitch
  const px = 60; const py = 210; const pw = W - 120; const ph = 860;
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = i % 2 ? '#15572f' : '#186335';
    ctx.fillRect(px, py + (i * ph) / 10, pw, ph / 10 + 1);
  }
  const vg = ctx.createRadialGradient(W / 2, py + ph / 2, 100, W / 2, py + ph / 2, 700);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,.45)');
  ctx.fillStyle = vg;
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.lineWidth = 3;
  const X = (u) => px + (u / 68) * pw; const Y = (v) => py + (v / 100) * ph;
  ctx.strokeRect(X(1.5), Y(1.5), X(66.5) - X(1.5), Y(98.5) - Y(1.5));
  ctx.beginPath(); ctx.moveTo(X(1.5), Y(50)); ctx.lineTo(X(66.5), Y(50)); ctx.stroke();
  ctx.beginPath(); ctx.arc(X(34), Y(50), (9 / 68) * pw, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeRect(X(14), Y(1.5), X(54) - X(14), Y(16.5) - Y(1.5));
  ctx.strokeRect(X(24), Y(1.5), X(44) - X(24), Y(7) - Y(1.5));
  ctx.strokeRect(X(14), Y(83.5), X(54) - X(14), Y(98.5) - Y(83.5));
  ctx.strokeRect(X(24), Y(93), X(44) - X(24), Y(98.5) - Y(93));

  // players
  const r = 50;
  for (const s of slots) {
    const p = byId[lineup[s.id]];
    const x = px + (s.x / 100) * pw; const y = py + (s.y / 100) * ph - 14;
    if (!p) {
      ctx.setLineDash([8, 8]);
      ctx.strokeStyle = 'rgba(255,255,255,.45)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      pill(ctx, POS_SHORT[s.position] || '', x, y + r + 12, `700 18px ${MONO}`, 'rgba(0,0,0,.4)', 'rgba(255,255,255,.7)', 8, 26);
      continue;
    }
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    circleImage(ctx, imgs.get(p.id), x, y, r, initials(p.name), color);
    const pos = POS_SHORT[p.position] || '';
    if (pos) pill(ctx, pos, x - r * 0.62, y - r * 0.78, `800 15px ${MONO}`, p.position !== s.position ? '#f59e0b' : '#f5c542', '#111', 6, 22);
    if (p.isCaptain) pill(ctx, 'C', x + r * 0.72, y - r * 0.72, `900 17px ${MONO}`, color, '#fff', 7, 26);
    pill(ctx, short(p.name), x, y + r + 16, `800 21px ${MONO}`, 'rgba(8,8,10,.88)', '#fff', 10, 32);
  }

  // bench
  const by = py + ph + 34;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 20px ${MONO}`;
  ctx.fillStyle = 'rgba(255,255,255,.6)';
  ctx.letterSpacing = '4px';
  ctx.fillText(`BENCH · ${bench.length}`, 60, by + 6);
  ctx.letterSpacing = '0px';
  const max = 9;
  bench.slice(0, max).forEach((p, i) => {
    const x = 92 + i * 104; const y = by + 74;
    circleImage(ctx, imgs.get(p.id), x, y, 34, initials(p.name), 'rgba(255,255,255,.35)');
    ctx.font = `700 15px ${MONO}`;
    ctx.fillStyle = '#e8e4dc';
    ctx.textAlign = 'center';
    const n = short(p.name);
    ctx.fillText(n.length > 11 ? `${n.slice(0, 10)}…` : n, x, y + 58);
  });
  if (bench.length > max) {
    ctx.font = `900 34px ${DISPLAY}`;
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.textAlign = 'center';
    ctx.fillText(`+${bench.length - max}`, 92 + max * 104 - 20, by + 86);
  }
  if (!bench.length) { ctx.font = `600 18px ${MONO}`; ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillText('Everyone is on the pitch', 60, by + 60); }

  // footer
  ctx.textAlign = 'right';
  ctx.font = `700 16px ${MONO}`;
  ctx.fillStyle = 'rgba(255,255,255,.4)';
  ctx.letterSpacing = '3px';
  ctx.fillText('IEM FED CUP · SEASON 5', W - 60, H - 26);
  ctx.letterSpacing = '0px';
  return cv;
}

/** Print a standalone HTML page from a hidden frame (the browser's "Save as PDF"). */
export function printHtml(html) {
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  Object.assign(f.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(f);
  const doc = f.contentDocument;
  doc.open(); doc.write(html); doc.close();
  const imgs = [...doc.images];
  Promise.all(imgs.map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = r; im.onerror = r; })))).then(() => {
    setTimeout(() => {
      f.contentWindow.focus();
      f.contentWindow.print();
      setTimeout(() => f.remove(), 60_000);
    }, 200);
  });
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** The lineup image as a one-page PDF (A4 portrait, image centred). */
export function lineupPdf(canvas, title) {
  printHtml(`<!doctype html><html><head><title>${esc(title)}</title><style>
    @page { size: A4 portrait; margin: 0 } html,body { margin:0; height:100%; background:#0a0a0c; -webkit-print-color-adjust:exact; print-color-adjust:exact }
    body { display:flex; align-items:center; justify-content:center } img { width:100%; height:100%; object-fit:contain }
  </style></head><body><img src="${canvas.toDataURL('image/png')}" alt=""></body></html>`);
}

/** Squad sheet (photos, positions, roles, prices) as a printable page → PDF. */
export function squadPdf({ team, squad, role, price, title = 'IEM FED Cup · Season 5' }) {
  const order = { Goalkeeper: 0, Defender: 1, Midfielder: 2, Forward: 3 };
  const list = [...squad].sort((a, b) => (b.isCaptain - a.isCaptain) || ((order[a.position] ?? 9) - (order[b.position] ?? 9)) || a.name.localeCompare(b.name));
  const counts = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'].map((p) => `${POS_SHORT[p]} ${squad.filter((x) => x.position === p).length}`).join(' · ');
  const rows = list.map((p, i) => {
    const url = assetUrl(p.thumbUrl || p.photoUrl);
    return `<tr><td class="n">${i + 1}</td><td class="ph">${url ? `<img src="${esc(url)}" alt="">` : `<span>${esc(initials(p.name))}</span>`}</td>
      <td class="nm">${esc(p.name)}${p.isCaptain ? ' <b class="c">C</b>' : ''}</td><td>${esc(p.position || '—')}</td><td>${esc(role(p))}</td><td class="pr">${esc(price(p))}</td></tr>`;
  }).join('');
  const logo = assetUrl(team?.logoUrl);
  const tc = /^#[0-9a-f]{3,8}$/i.test(team?.color || '') ? team.color : '#e3123f';
  printHtml(`<!doctype html><html><head><title>${esc(team?.name)} - squad</title><style>
    @page { size: A4 portrait; margin: 14mm } * { box-sizing: border-box } body { font: 12px/1.35 system-ui, "Segoe UI", Arial, sans-serif; color: #111; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact }
    header { display: flex; align-items: center; gap: 14px; padding: 0 0 12px; border-bottom: 4px solid ${tc}; margin-bottom: 12px }
    header img { width: 58px; height: 58px; object-fit: contain } h1 { margin: 0; font: 900 30px/1 Impact, "Arial Narrow", sans-serif; text-transform: uppercase; letter-spacing: .02em }
    header p { margin: 4px 0 0; color: #555; font-size: 11px; letter-spacing: .08em; text-transform: uppercase }
    table { width: 100%; border-collapse: collapse } th { text-align: left; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #666; padding: 6px 8px; border-bottom: 1px solid #ccc }
    td { padding: 5px 8px; border-bottom: 1px solid #eee; vertical-align: middle } tr { break-inside: avoid }
    .n { width: 28px; color: #888 } .ph { width: 44px } .ph img, .ph span { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; object-position: 50% 22%; display: grid; place-items: center; background: #ddd; font-weight: 800; font-size: 11px }
    .nm { font-weight: 700 } .c { display: inline-block; padding: 0 5px; border-radius: 3px; background: ${tc}; color: #fff; font-size: 10px } .pr { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700 }
    footer { margin-top: 14px; color: #888; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; display: flex; justify-content: space-between }
  </style></head><body>
    <header>${logo ? `<img src="${esc(logo)}" alt="">` : ''}<div><h1>${esc(team?.name)}</h1><p>Squad · ${squad.length} players · ${esc(counts)}</p></div></header>
    <table><thead><tr><th>#</th><th></th><th>Name</th><th>Position</th><th>Role</th><th style="text-align:right">Price</th></tr></thead><tbody>${rows}</tbody></table>
    <footer><span>${esc(title)}</span><span>${new Date().toLocaleDateString()}</span></footer>
  </body></html>`);
}

/* ------------------------------ minimal .xlsx writer ------------------------------ */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** Store-only zip (no compression) — enough for a small workbook. files: [[name, string]] */
function zip(files) {
  const enc = new TextEncoder();
  const parts = []; const central = []; let offset = 0;
  for (const [name, text] of files) {
    const nb = enc.encode(name); const data = enc.encode(text); const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(lh.buffer), nb, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nb);
    offset += 30 + nb.length + data.length;
  }
  const size = central.reduce((s, a) => s + a.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const colName = (i) => { let s = ''; let n = i + 1; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
// eslint-disable-next-line no-control-regex
const xesc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

/** rows: array of arrays (first row = header, bold). Numbers stay numbers. widths: column widths. */
export function xlsxBlob(sheetName, rows, widths = []) {
  const sheetRows = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
    const ref = `${colName(ci)}${ri + 1}`; const st = ri === 0 ? ' s="1"' : '';
    return typeof v === 'number' && Number.isFinite(v) ? `<c r="${ref}"${st}><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${xesc(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const safe = xesc(sheetName.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31).trim() || 'Sheet1');
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${safe}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>'],
    ['xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${sheetRows}</sheetData></worksheet>`],
  ]);
}
