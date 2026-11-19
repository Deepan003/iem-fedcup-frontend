import { useEffect, useRef, useState } from 'react';
import {
  CARD_H, CARD_W, cardBlob, cardClip, drawCard, loadCardAssets,
} from '../lib/cards.js';
import { money } from '../lib/format.js';

const save = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
};

/** Card info shown on a player's card. */
export function cardInfo(player, team, currency) {
  const role = player.isCaptain ? 'Captain' : player.status === 'retained' ? 'Retained' : player.status === 'sold' ? 'Signed' : '';
  return {
    player,
    team,
    tierColor: player.tierColor,
    priceText: player.price != null && !player.isCaptain ? money(player.price, currency) : player.isCaptain ? 'CAPTAIN' : '',
    roleText: role,
  };
}

/** Full-screen preview of a player's card (live foil shine) with PNG / JPG / animated downloads. */
export default function CardStudio({ info, onClose }) {
  const canvasRef = useRef(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const file = (info.player.name || 'player').replace(/[^\w]+/g, '-').toLowerCase();

  useEffect(() => {
    let raf;
    let alive = true;
    loadCardAssets(info.player, info.team).then((assets) => {
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx || !alive) return;
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reduce) { drawCard(ctx, info, assets, null); return; }
      const t0 = performance.now();
      const loop = (now) => {
        if (!alive) return;
        drawCard(ctx, info, assets, ((now - t0) / 3200) % 1);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); };
  }, [info]); // eslint-disable-line react-hooks/exhaustive-deps

  const still = async (type, ext) => {
    setBusy(ext);
    setErr('');
    try {
      const blob = await cardBlob(info, type);
      if (!blob) throw new Error('This browser could not export the card.');
      save(blob, `${file}-fedcup-card.${ext}`);
    } catch (e) {
      setErr(e.message || 'Could not export the card (the photo may be blocked).');
    } finally {
      setBusy('');
    }
  };
  const clip = async () => {
    setBusy('clip');
    setErr('');
    try {
      const r = await cardClip(info, 3);
      if (!r) throw new Error('Animated cards need Chrome, Edge or Safari 14.1+.');
      save(r.blob, `${file}-fedcup-card.${r.ext}`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="card-studio" role="dialog" aria-label={`${info.player.name} card`} onClick={onClose}>
      <div className="cs-inner" onClick={(e) => e.stopPropagation()}>
        <canvas ref={canvasRef} width={CARD_W} height={CARD_H} className="cs-canvas" />
        <div className="cs-side">
          <span className="label">Player card</span>
          <h2 className="display">{info.player.name}</h2>
          <p className="muted small">Download it and share it. The animated version is a 3-second clip with the foil shine.</p>
          <div className="cs-btns">
            <button type="button" className="btn primary" disabled={!!busy} onClick={() => still('image/png', 'png')}>{busy === 'png' ? 'Making…' : '⬇ PNG'}</button>
            <button type="button" className="btn" disabled={!!busy} onClick={() => still('image/jpeg', 'jpg')}>{busy === 'jpg' ? 'Making…' : '⬇ JPG'}</button>
            <button type="button" className="btn" disabled={!!busy} onClick={clip}>{busy === 'clip' ? 'Recording 3 s…' : '⬇ Animated'}</button>
          </div>
          {err && <p className="small" style={{ color: 'var(--signal)' }}>{err}</p>}
          <button type="button" className="btn ghost sm" onClick={onClose}>✕ Close</button>
        </div>
      </div>
    </div>
  );
}
