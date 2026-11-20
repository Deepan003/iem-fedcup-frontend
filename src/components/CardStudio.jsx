import { useEffect, useRef, useState } from 'react';
import {
  CARD_H, CARD_W, cardBlob, drawCard, loadCardAssets,
} from '../lib/cards.js';
import { cardFilm } from '../lib/cardFilm.js';
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
  const [prog, setProg] = useState(0);
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
  const film = async (ratio) => {
    setBusy(`film-${ratio}`);
    setErr('');
    setProg(0);
    try {
      const r = await cardFilm(info, { ratio, onProgress: setProg });
      if (!r) throw new Error('Video cards need Chrome, Edge or Safari 14.1+.');
      save(r.blob, `${file}-fedcup-card-${ratio === '1x1' ? 'square' : 'story'}.${r.ext}`);
    } catch (e) {
      setErr(e.message || 'Could not make the video.');
    } finally {
      setBusy('');
    }
  };
  const recording = busy.startsWith('film');

  return (
    <div className="card-studio" role="dialog" aria-label={`${info.player.name} card`} onClick={onClose}>
      <div className="cs-inner" onClick={(e) => e.stopPropagation()}>
        <canvas ref={canvasRef} width={CARD_W} height={CARD_H} className="cs-canvas" />
        <div className="cs-side">
          <span className="label">Player card</span>
          <h2 className="display">{info.player.name}</h2>
          <p className="muted small">Share it anywhere. The video is a 7-second reveal with music, made for Instagram stories and posts.</p>
          <div className="cs-dl">
            <span className="cs-dl-k">Image</span>
            <div className="cs-btns">
              <button type="button" className="btn primary" disabled={!!busy} onClick={() => still('image/png', 'png')}>{busy === 'png' ? 'Making…' : '⬇ PNG'}</button>
              <button type="button" className="btn" disabled={!!busy} onClick={() => still('image/jpeg', 'jpg')}>{busy === 'jpg' ? 'Making…' : '⬇ JPG'}</button>
            </div>
            <span className="cs-dl-k">Video · with music</span>
            <div className="cs-btns">
              <button type="button" className="btn primary" disabled={!!busy} onClick={() => film('9x16')}>▶ MP4 · Story 9:16</button>
              <button type="button" className="btn" disabled={!!busy} onClick={() => film('1x1')}>▶ MP4 · Post 1:1</button>
            </div>
            {recording && (
              <div className="cs-prog" role="progressbar" aria-valuenow={Math.round(prog * 100)} aria-valuemin={0} aria-valuemax={100}>
                <i style={{ width: `${Math.round(prog * 100)}%` }} />
                <span>Recording your video… {Math.round(prog * 100)}% · keep this tab open</span>
              </div>
            )}
          </div>
          {err && <p className="small" style={{ color: 'var(--signal)' }}>{err}</p>}
          <button type="button" className="btn ghost sm" onClick={onClose}>✕ Close</button>
        </div>
      </div>
    </div>
  );
}
