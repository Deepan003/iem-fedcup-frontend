import { useEffect, useMemo, useRef, useState } from 'react';
import { assetUrl } from '../lib/api.js';
import { initials, money, POSITIONS, POS_SHORT } from '../lib/format.js';
import { Spinner, TeamLogo } from './ui.jsx';
import '../pool.css';

const FILTERS = [['all', 'Everyone'], ['available', 'Still to come'], ['sold', 'Sold'], ['unsold', 'Unsold']];
const isSold = (p) => p.status === 'sold' || p.status === 'retained';

/**
 * The whole player pool as a gallery everyone can inspect, A–Z.
 *   still to come → normal · sold / retained → darkened with a SOLD stamp, buyer + price · unsold → cut through
 * load() returns the players; `version` changes whenever the auction changes, so the pool refreshes live.
 */
export default function PlayerPool({
  load, teams = [], currency, onClose, version,
}) {
  const [players, setPlayers] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [pos, setPos] = useState('All');
  const [status, setStatus] = useState('all');
  const listRef = useRef(null);

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = prev; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let off = false;
    load().then((p) => { if (!off) { setPlayers(p); setErr(''); } }).catch((e) => { if (!off) setErr(e.message || 'Could not load the players.'); });
    return () => { off = true; };
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

  const teamMap = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);
  const counts = useMemo(() => {
    const c = { all: 0, available: 0, sold: 0, unsold: 0 };
    for (const p of players || []) { c.all += 1; if (isSold(p)) c.sold += 1; else if (p.status === 'unsold') c.unsold += 1; else c.available += 1; }
    return c;
  }, [players]);
  const list = useMemo(() => {
    if (!players) return [];
    const needle = q.trim().toLowerCase();
    return players
      .filter((p) => (pos === 'All' || p.position === pos)
        && (status === 'all' || (status === 'sold' ? isSold(p) : p.status === status))
        && (!needle || p.name.toLowerCase().includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [players, q, pos, status]);
  // A–Z headings only help on long lists; a short (filtered) list is one compact grid
  const letters = useMemo(() => {
    if (list.length <= 24) return list.length ? [['', list]] : [];
    const m = new Map();
    for (const p of list) { const L = (p.name[0] || '#').toUpperCase(); if (!m.has(L)) m.set(L, []); m.get(L).push(p); }
    return [...m];
  }, [list]);
  const jump = (L) => listRef.current?.querySelector(`[data-letter="${L}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });

  return (
    <div className="pool" role="dialog" aria-modal="true" aria-label="Player pool" onClick={onClose}>
      <div className="pool-card" onClick={(e) => e.stopPropagation()}>
        <div className="pool-head">
          <div>
            <span className="label">Player pool · A–Z</span>
            <b className="display pool-title">All players</b>
          </div>
          <button type="button" className="btn sm ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="pool-stats">
          {FILTERS.map(([k, l]) => (
            <button type="button" key={k} className={`pool-stat s-${k} ${status === k ? 'on' : ''}`} onClick={() => setStatus(k)}>
              <b>{players ? counts[k] : '–'}</b><span>{l}</span>
            </button>
          ))}
        </div>

        <div className="pool-filters">
          <input className="input pool-search" placeholder="Search a name…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="pool-chips">
            {['All', ...POSITIONS].map((p) => <button type="button" key={p} className={pos === p ? 'on' : ''} onClick={() => setPos(p)}>{p === 'All' ? 'All' : POS_SHORT[p]}</button>)}
          </div>
        </div>
        {letters.length > 6 && letters[0][0] && (
          <div className="pool-az" aria-label="Jump to letter">
            {letters.map(([L]) => <button type="button" key={L} onClick={() => jump(L)}>{L}</button>)}
          </div>
        )}

        <div className="pool-list" ref={listRef}>
          {!players && !err && <Spinner />}
          {err && <p className="muted">{err}</p>}
          {players && list.length === 0 && <p className="muted" style={{ padding: 20 }}>Nobody matches.</p>}
          {letters.map(([L, ps]) => (
            <section key={L} data-letter={L}>
              {L && <h4 className="pool-letter">{L}</h4>}
              <div className="pool-grid">
                {ps.map((p) => {
                  const t = p.teamId ? teamMap[p.teamId] : null;
                  const url = assetUrl(p.thumbUrl || p.photoUrl);
                  const kind = isSold(p) ? 'sold' : p.status === 'unsold' ? 'unsold' : 'open';
                  return (
                    <article key={p.id} className={`pc pc-${kind}`} style={t ? { '--tc': t.color } : undefined} aria-label={`${p.name}, ${kind === 'open' ? 'still to come' : kind}`}>
                      <div className="pc-photo">
                        {url ? <img src={url} alt="" loading="lazy" draggable={false} /> : <span className="pc-ini">{initials(p.name)}</span>}
                        <span className="pc-pos">{POS_SHORT[p.position] || '—'}</span>
                        {p.tier && <span className="pc-tier" style={p.tierColor ? { '--tier': p.tierColor } : undefined}>{p.tier}</span>}
                        {kind === 'sold' && <span className="pc-stamp">{p.status === 'retained' ? (p.isCaptain ? 'Captain' : 'Retained') : 'Sold'}</span>}
                        {kind === 'unsold' && <><i className="pc-cut" aria-hidden="true" /><span className="pc-stamp pc-stamp-un">Unsold</span></>}
                      </div>
                      <div className="pc-body">
                        <b className="pc-name">{p.name}</b>
                        <span className="pc-meta">{[p.department, p.year].filter(Boolean).join(' · ') || ' '}</span>
                        {kind === 'sold' && t && (
                          <span className="pc-buy"><TeamLogo team={t} size={18} /><span className="pc-team">{t.shortName || t.name}</span>{p.price != null && !p.isCaptain && <b>{money(p.price, currency)}</b>}</span>
                        )}
                        {kind === 'open' && p.basePrice != null && <span className="pc-buy pc-base">Base <b>{money(p.basePrice, currency)}</b></span>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
