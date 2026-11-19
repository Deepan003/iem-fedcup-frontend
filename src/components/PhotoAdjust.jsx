import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import '../dialog.css';
import '../logo-adjust.css';

/* Player photos are portrait cards: 4:5, stored at 720×900. */
const W = 240;
const H = 300;
const OUT_W = 720;
const OUT_H = 900;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Frame a player photo: drag to move, zoom to crop in, preview as a card.
 * `source` is a File/Blob, or an async function that returns one (an existing photo).
 * `onApply(file)` receives a 720×900 JPEG ready to upload, or the original file when
 * the browser cannot open it (e.g. some iPhone HEIC photos: the server converts those).
 */
export default function PhotoAdjust({
  source, title = 'Frame the photo', onApply, onClose,
}) {
  const [blob, setBlob] = useState(source instanceof Blob ? source : null);
  const [url, setUrl] = useState(null);
  const [img, setImg] = useState(null); // { w, h }
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const imgRef = useRef(null);
  const drag = useRef(null);
  const stageRef = useRef(null);

  // Load the source (file or async loader) into an object URL.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const b = source instanceof Blob ? source : await source();
        if (!alive) return;
        setBlob(b);
        setUrl(URL.createObjectURL(b));
      } catch (e) {
        if (alive) setError(e.message || 'Could not load the photo');
      }
    })();
    return () => { alive = false; };
  }, [source]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const base = img ? Math.max(W / img.w, H / img.h) : 1; // "cover" scale
  const dispW = img ? img.w * base * zoom : W;
  const dispH = img ? img.h * base * zoom : H;
  const limit = useCallback((p, z = zoom) => {
    if (!img) return p;
    const dw = img.w * base * z;
    const dh = img.h * base * z;
    return { x: clamp(p.x, -(dw - W) / 2, (dw - W) / 2), y: clamp(p.y, -(dh - H) / 2, (dh - H) / 2) };
  }, [img, base, zoom]);

  const setZoomClamped = (z) => {
    const nz = clamp(z, 1, 4);
    setZoom(nz);
    setPos((p) => limit(p, nz));
  };

  const close = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(onClose, 200);
  }, [leaving, onClose]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const onWheel = (e) => { e.preventDefault(); setZoomClamped(zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06)); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }); // re-bind each render: cheap, keeps the current zoom in the closure

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      const step = e.shiftKey ? 12 : 3;
      const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      if (moves[e.key]) {
        e.preventDefault();
        setPos((p) => limit({ x: p.x + moves[e.key][0], y: p.y + moves[e.key][1] }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, limit]);

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    setPos(limit({ x: d.x + (e.clientX - d.px), y: d.y + (e.clientY - d.py) }));
  };
  const onPointerUp = () => { drag.current = null; };

  const apply = async () => {
    if (!img || !imgRef.current) return;
    setBusy(true);
    try {
      const k = OUT_W / W;
      const canvas = document.createElement('canvas');
      canvas.width = OUT_W;
      canvas.height = OUT_H;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, OUT_W, OUT_H);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(imgRef.current, (W / 2 + pos.x - dispW / 2) * k, (H / 2 + pos.y - dispH / 2) * k, dispW * k, dispH * k);
      const out = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
      if (!out) throw new Error('Could not create the image');
      await onApply(new File([out], 'photo.jpg', { type: 'image/jpeg' }));
      close();
    } finally {
      setBusy(false);
    }
  };

  const useOriginal = async () => {
    setBusy(true);
    try {
      await onApply(blob instanceof File ? blob : new File([blob], 'photo', { type: blob?.type || 'application/octet-stream' }));
      close();
    } finally {
      setBusy(false);
    }
  };

  const transform = `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`;
  const cannotOpen = error && blob;

  return createPortal(
    <div className={`dlg-backdrop ${leaving ? 'out' : ''}`} onMouseDown={close}>
      <div className={`dlg la ${leaving ? 'out' : ''}`} role="dialog" aria-modal="true" aria-labelledby="pa-title" onMouseDown={(e) => e.stopPropagation()}>
        <span className="dlg-line" aria-hidden="true" />
        <span className="dlg-kicker">Player photo · framing</span>
        <h3 id="pa-title" className="la-title">{title}</h3>

        {error ? (
          <div className="stack" style={{ gap: 12 }}>
            <p className="dlg-msg" style={{ margin: 0 }}>
              {cannotOpen
                ? "This browser can't open this photo for framing (iPhone HEIC photos often do this). You can still upload it as it is: the server converts it and crops it automatically."
                : error}
            </p>
            <div className="dlg-actions">
              <button type="button" className="btn ghost" onClick={close}>Cancel</button>
              {cannotOpen && <button type="button" className="btn primary" disabled={busy} onClick={useOriginal}>Upload as it is</button>}
            </div>
          </div>
        ) : (
          <>
            <div className="la-body">
              <div
                ref={stageRef}
                className="la-stage pa-stage"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                aria-label="Drag to move the photo, scroll to zoom"
              >
                {url && (
                  <img
                    ref={imgRef}
                    src={url}
                    alt=""
                    draggable={false}
                    className="pa-img"
                    style={{ width: dispW, height: dispH, transform }}
                    onLoad={(e) => { setImg({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight }); setZoom(1); setPos({ x: 0, y: 0 }); }}
                    onError={() => setError('unsupported')}
                  />
                )}
                {!img && !error && <span className="la-hint" style={{ opacity: 1 }}>Loading…</span>}
                <span className="pa-thirds" aria-hidden="true" />
                {img && <span className="la-hint" aria-hidden="true">Drag · scroll to zoom</span>}
              </div>
              <div className="la-side">
                <span className="tiny">How the card looks</span>
                <div className="pa-preview" aria-hidden="true">
                  <div className="pa-card">
                    {url && img && <img src={url} alt="" style={{ width: dispW / 2, height: dispH / 2, transform: `translate(calc(-50% + ${pos.x / 2}px), calc(-50% + ${pos.y / 2}px))` }} />}
                  </div>
                  <div className="pa-thumb">
                    {url && img && <img src={url} alt="" style={{ width: dispW / 5, height: dispH / 5, transform: `translate(calc(-50% + ${pos.x / 5}px), calc(-50% + ${pos.y / 5}px))` }} />}
                  </div>
                </div>
                <p className="muted small" style={{ margin: 0 }}>Keep the face in the upper half: names sit over the bottom of the card.</p>
              </div>
            </div>
            <div className="la-zoom">
              <button type="button" className="btn sm ghost" onClick={() => setZoomClamped(zoom / 1.1)} aria-label="Zoom out">−</button>
              <input type="range" min={100} max={400} value={Math.round(zoom * 100)} onChange={(e) => setZoomClamped(Number(e.target.value) / 100)} aria-label="Zoom" />
              <button type="button" className="btn sm ghost" onClick={() => setZoomClamped(zoom * 1.1)} aria-label="Zoom in">+</button>
              <b className="mono la-pct">{Math.round(zoom * 100)}%</b>
            </div>
            <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
              <button type="button" className="btn sm" onClick={() => { setZoom(1); setPos({ x: 0, y: 0 }); }}>Reset</button>
              <span className="tiny" style={{ alignSelf: 'center' }}>Arrow keys nudge · Shift for bigger steps</span>
            </div>
            <div className="dlg-actions">
              <button type="button" className="btn ghost" onClick={close}>Cancel</button>
              <button type="button" className="btn primary" disabled={busy || !img} onClick={apply}>{busy ? 'Saving…' : 'Use this photo'}</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Loader for an already-stored photo (admin only), for re-framing. */
export function storedPhoto(playerId, token) {
  return async () => {
    const { API_URL } = await import('../lib/api.js');
    const res = await fetch(`${API_URL}/api/admin/players/${playerId}/photo/source`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(res.status === 404 ? 'This player has no stored photo yet. Upload one instead.' : 'Could not load the photo');
    return res.blob();
  };
}
