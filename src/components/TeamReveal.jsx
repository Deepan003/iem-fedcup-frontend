import { useEffect, useMemo, useState } from 'react';
import { assetUrl } from '../lib/api.js';
import { money, onColor, POS_SHORT, initials } from '../lib/format.js';
import { TeamLogo } from './ui.jsx';
import { RollingNumber } from './fx.jsx';
import '../reveal.css';

const PER_TEAM_MS = 9000;
const ORDER = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'];

/**
 * Full-time team reveal: one team at a time — colour wipe, crest, kinetic name, the squad
 * walking in by position, total spent rolling up — then a closing grid of all teams.
 */
export default function TeamReveal({ state, onClose }) {
  const teams = useMemo(() => state.teams.map((t) => ({
    ...t,
    squad: [...(t.squad || [])].sort((a, b) => (b.isCaptain - a.isCaptain) || (ORDER.indexOf(a.position) - ORDER.indexOf(b.position))),
    spent: (t.squad || []).reduce((s, p) => s + (p.price || 0), 0),
  })), [state.teams]);
  const [i, setI] = useState(0);
  const [total, setTotal] = useState(0);
  const done = i >= teams.length;
  const t = teams[i];

  useEffect(() => {
    if (done) return undefined;
    setTotal(0);
    const a = setTimeout(() => setTotal(t.spent), 2200);
    const b = setTimeout(() => setI((x) => x + 1), PER_TEAM_MS);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [i, done]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') setI((x) => Math.min(teams.length, x + 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [teams.length, onClose]);

  return (
    <div className="reveal-root" onClick={() => setI((x) => Math.min(teams.length, x + 1))}>
      {!done && t && (
        <div key={t.id} className="rv-team" style={{ '--c': t.color, '--fg': onColor(t.color) }}>
          <span className="rv-wipe" />
          <span className="rv-wipe w2" />
          <div className="rv-left">
            <span className="rv-kicker">Full time · Squad {String(i + 1).padStart(2, '0')} / {String(teams.length).padStart(2, '0')}</span>
            <div className="rv-logo"><TeamLogo team={t} size={180} /></div>
            <h2 className="rv-name"><span>{t.name}</span></h2>
            {t.captainName && <span className="rv-cap">Captain · {t.captainName}</span>}
            <div className="rv-total">
              <span className="rv-kicker">Spent</span>
              <span className="rv-num"><RollingNumber value={total} /> <small>{state.currency}</small></span>
            </div>
          </div>
          <ol className="rv-squad">
            {t.squad.map((p, k) => (
              <li key={p.id} style={{ animationDelay: `${1.1 + k * 0.12}s` }}>
                <span className="rv-face">{p.thumbUrl ? <img src={assetUrl(p.thumbUrl)} alt="" /> : initials(p.name)}</span>
                <span className="rv-pos">{POS_SHORT[p.position]}</span>
                <span className="rv-pname">{p.name}{p.isCaptain ? <em> C</em> : ''}</span>
                <span className="rv-price">{p.isCaptain ? 'Captain' : p.retained ? `Ret · ${money(p.price, state.currency)}` : (p.price !== undefined ? money(p.price, state.currency) : '')}</span>
              </li>
            ))}
            {!t.squad.length && <li style={{ animationDelay: '1.1s' }}><span className="rv-pname">{t.count} players</span></li>}
          </ol>
          <div className="rv-progress"><i key={i} /></div>
        </div>
      )}
      {done && (
        <div className="rv-final">
          <span className="rv-kicker">IEM FED Cup · Season 5</span>
          <h2 className="rv-final-title">The squads are set.</h2>
          <div className="rv-grid">
            {teams.map((x, k) => (
              <div key={x.id} className="rv-tile" style={{ '--c': x.color, animationDelay: `${k * 0.08}s` }}>
                <TeamLogo team={x} size={64} />
                <b>{x.name}</b>
                <span>{x.count} players · {money(x.spent, state.currency)}</span>
              </div>
            ))}
          </div>
          <div className="row" style={{ justifyContent: 'center', gap: 10, marginTop: 26 }}>
            <button type="button" className="btn" onClick={(e) => { e.stopPropagation(); setI(0); }}>↻ Replay</button>
            {onClose && <button type="button" className="btn ghost" onClick={(e) => { e.stopPropagation(); onClose(); }}>Close</button>}
          </div>
        </div>
      )}
    </div>
  );
}
