import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { assetUrl } from '../../lib/api.js';
import { TeamLogo, logoTransform } from '../../components/ui.jsx';
import '../../dialog.css';
import '../../logo-adjust.css';

const DEFAULT = { scale: 1, x: 0, y: 0 };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r2 = (v) => Math.round(v * 100) / 100;
const tidy = (f) => ({ scale: r2(clamp(f.scale, 0.3, 4)), x: r2(clamp(f.x, -100, 100)), y: r2(clamp(f.y, -100, 100)) });

/**
 * Frame a team logo inside its square: drag to move, wheel / slider to zoom.
 * The framing is stored on the team and applied everywhere the logo is shown.
 */
export default function LogoAdjust({ team, onSave, onClose }) {
  const [fit, setFitRaw] = useState(() => tidy({ ...DEFAULT, ...(team.logoFit || {}) }));
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const stageRef = useRef(null);
  const drag = useRef(null);
  const setFit = useCallback((f) => setFitRaw((cur) => tidy(typeof f === 'function' ? f(cur) : f)), []);

  const close = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(onClose, 200);
  }, [leaving, onClose]);

  // Wheel zoom needs a non-passive listener to stop the page scrolling.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      setFit((f) => ({ ...f, scale: f.scale * (e.deltaY < 0 ? 1.06 : 1 / 1.06) }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setFit]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (document.activeElement?.tagName === 'INPUT') return;
      const step = e.shiftKey ? 5 : 1;
      const moves = {
        ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
      };
      if (moves[e.key]) {
        e.preventDefault();
        const [dx, dy] = moves[e.key];
        setFit((f) => ({ ...f, x: f.x + dx, y: f.y + dy }));
      } else if (e.key === '+' || e.key === '=') setFit((f) => ({ ...f, scale: f.scale * 1.06 }));
      else if (e.key === '-') setFit((f) => ({ ...f, scale: f.scale / 1.06 }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, setFit]);

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const w = e.currentTarget.getBoundingClientRect().width;
    drag.current = {
      px: e.clientX, py: e.clientY, x: fit.x, y: fit.y, w,
    };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    // translate(%) is relative to the (unscaled) box, so pixels → % of the stage width.
    setFit((f) => ({ ...f, x: d.x + ((e.clientX - d.px) / d.w) * 100, y: d.y + ((e.clientY - d.py) / d.w) * 100 }));
  };
  const onPointerUp = () => { drag.current = null; };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(fit);
      close();
    } finally {
      setSaving(false);
    }
  };

  const url = assetUrl(team.logoUrl);
  const pct = Math.round(fit.scale * 100);

  return createPortal(
    <div className={`dlg-backdrop ${leaving ? 'out' : ''}`} onMouseDown={close}>
      <div
        className={`dlg la ${leaving ? 'out' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="la-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="dlg-line" aria-hidden="true" />
        <span className="dlg-kicker">Team logo · framing</span>
        <h3 id="la-title" className="la-title">{team.name}</h3>

        <div className="la-body">
          <div
            ref={stageRef}
            className="la-stage"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-label="Drag to move the logo, scroll to zoom"
          >
            {url && <img src={url} alt="" draggable={false} style={{ transform: logoTransform(fit) }} />}
            <span className="la-guide h" aria-hidden="true" />
            <span className="la-guide v" aria-hidden="true" />
            <span className="la-hint" aria-hidden="true">Drag · scroll to zoom</span>
          </div>

          <div className="la-side">
            <span className="tiny">How it looks</span>
            <div className="la-previews">
              {[96, 64, 44, 28].map((s) => <TeamLogo key={s} team={team} size={s} fit={fit} />)}
            </div>
            <div className="la-previews on-colour" style={{ background: team.color }}>
              {[64, 36].map((s) => <TeamLogo key={s} team={team} size={s} fit={fit} />)}
            </div>
          </div>
        </div>

        <div className="la-zoom">
          <button type="button" className="btn sm ghost" onClick={() => setFit((f) => ({ ...f, scale: f.scale / 1.1 }))} aria-label="Zoom out">−</button>
          <input
            type="range"
            min={30}
            max={400}
            value={pct}
            onChange={(e) => setFit((f) => ({ ...f, scale: Number(e.target.value) / 100 }))}
            aria-label="Zoom"
          />
          <button type="button" className="btn sm ghost" onClick={() => setFit((f) => ({ ...f, scale: f.scale * 1.1 }))} aria-label="Zoom in">+</button>
          <b className="mono la-pct">{pct}%</b>
        </div>

        <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
          <button type="button" className="btn sm" onClick={() => setFit(DEFAULT)}>Fit whole logo</button>
          <button type="button" className="btn sm" onClick={() => setFit((f) => ({ ...f, x: 0, y: 0 }))}>Centre</button>
          <span className="tiny" style={{ alignSelf: 'center' }}>Arrow keys nudge · Shift for bigger steps</span>
        </div>

        <div className="dlg-actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button type="button" className="btn primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save framing'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
