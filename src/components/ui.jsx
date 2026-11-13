import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import { assetUrl } from '../lib/api.js';
import { useTilt } from './fx.jsx';
import {
  POS_COLOR, POS_SHORT, initials, onColor,
} from '../lib/format.js';

/* --------------------------------- toasts -------------------------------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((text, kind = 'info', ms = 3200) => {
    const id = Math.random().toString(36).slice(2);
    setItems((xs) => [...xs.slice(-3), { id, text, kind }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), ms);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

/* --------------------------------- basics -------------------------------- */
export function Spinner({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 50 50" aria-label="Loading">
      <circle cx="25" cy="25" r="20" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="3" />
      <circle cx="25" cy="25" r="20" fill="none" stroke="var(--signal)" strokeWidth="3" strokeDasharray="40 150">
        <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.9s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted small">{hint}</small>}
    </label>
  );
}

export function Toggle({ label, checked, onChange, hint }) {
  return (
    <label className="toggle">
      <span>
        <b style={{ fontWeight: 600 }}>{label}</b>
        {hint && <><br /><small className="muted">{hint}</small></>}
      </span>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** Runs an async action with a busy flag and error toast. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn, okText) => {
    setBusy(true);
    try {
      const r = await fn();
      if (okText) toast(okText, 'ok');
      return r;
    } catch (err) {
      toast(err.message || 'Something went wrong', 'error', 5000);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [toast]);
  return [run, busy];
}

/* ------------------------------ scroll reveal ---------------------------- */
export function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const els = root.querySelectorAll('.reveal');
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  });
  return ref;
}

/* ------------------------------ domain bits ------------------------------ */
/** CSS transform for an admin-framed logo ({scale, x, y} with x/y in % of the box). */
export const logoTransform = (fit) => (fit ? `translate(${fit.x || 0}%, ${fit.y || 0}%) scale(${fit.scale || 1})` : undefined);

export function TeamLogo({ team, size = 36, fit }) {
  if (!team) return <div className="team-logo" style={{ width: size, height: size }} />;
  const url = assetUrl(team.logoUrl);
  const f = fit !== undefined ? fit : team.logoFit;
  return (
    <div className="team-logo" style={{ width: size, height: size, background: url ? 'transparent' : team.color, color: onColor(team.color) }}>
      {url ? <img src={url} alt="" loading="lazy" draggable={false} style={{ transform: logoTransform(f) }} /> : (team.shortName || initials(team.name))}
    </div>
  );
}

export function PosBadge({ position }) {
  return <span className="pos-badge" style={{ color: POS_COLOR[position] || 'var(--bone)' }}>{POS_SHORT[position] || position}</span>;
}

export function TierBadge({ tier, color }) {
  if (!tier) return null;
  return <span className="tier-badge" style={{ background: color ? `linear-gradient(120deg, ${color}, #fff6)` : 'var(--bone)', backgroundColor: color || 'var(--bone)' }}>{tier}</span>;
}

/** Trading-card style portrait with 3D tilt, foil sheen on entry and a tier-coloured edge. */
export function PlayerCard({ player, enter = false, showName = true }) {
  const tilt = useTilt(9);
  if (!player) return null;
  const url = assetUrl(player.photoUrl);
  return (
    <div className="pcard-wrap">
      <div ref={tilt} className={`pcard ${enter ? 'enter' : ''}`} style={{ '--tc': player.tierColor || 'var(--signal)' }}>
        {url ? <img src={url} alt={player.name} decoding="async" /> : <div className="ph">{initials(player.name)}</div>}
        <span className="pcard-edge" />
        <span className="sheen" />
        <div className="pcard-top">
          <PosBadge position={player.position} />
          <TierBadge tier={player.tier} color={player.tierColor} />
        </div>
        {showName && (
          <div className="pcard-bottom">
            <div className="pcard-name">{player.name}</div>
            <div className="tiny" style={{ marginTop: 6 }}>{player.position}{player.year ? ` · ${player.year}` : ''}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export function MiniPlayer({ player, extra }) {
  const url = assetUrl(player.thumbUrl || player.photoUrl);
  return (
    <div className="mini">
      {url ? <img src={url} alt="" loading="lazy" /> : <div className="ph">{initials(player.name)}</div>}
      <div className="cap ellipsis">{player.name}{extra}</div>
    </div>
  );
}
