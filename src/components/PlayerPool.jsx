import { useEffect, useMemo, useRef, useState } from 'react';
import { money, POSITIONS, POS_SHORT } from '../lib/format.js';
import { Avatar, Spinner, TeamLogo } from './ui.jsx';
import '../pool.css';

const STATUS = {
  available: 'In the pool', sold: 'Sold', retained: 'Retained', unsold: 'Unsold',
};
const FILTERS = [['all', 'Everyone'], ['available', 'Still to come'], ['sold', 'Sold'], ['unsold', 'Unsold']];

/**
 * The whole player pool, A–Z: search, position and status filters, letter headers with a jump bar.
 * load() returns a list of players; teams come from the caller (for logos / names of buyers).
 */
export default function PlayerPool({
  load, teams = [], currency, onClose,
}) {
  const [players, setPlayers] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [pos, setPos] = useState('All');
  const [status, setStatus] = useState('all');
  const listRef = useRef(null);

  useEffect(() => {
    load().then(setPlayers).catch((e) => setErr(e.message || 'Could not load the players.'));
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const teamMap = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);
  const list = useMemo(() => {
    if (!players) return [];
    const needle = q.trim().toLowerCase();
    return players
      .filter((p) => (pos === 'All' || p.position === pos)
        && (status === 'all' || p.status === status || (status === 'sold' && p.status === 'retained'))
        && (!needle || p.name.toLowerCase().includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [players, q, pos, status]);
  const letters = useMemo(() => {
    const m = new Map();
    for (const p of list) {
      const L = (p.name[0] || '#').toUpperCase();
      if (!m.has(L)) m.set(L, []);
      m.get(L).push(p);
    }
    return [...m];
  }, [list]);
  const jump = (L) => listRef.current?.querySelector(`[data-letter="${L}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });

  return (
    <div className="pool" role="dialog" aria-label="Player pool" onClick={onClose}>
      <div className="pool-card" onClick={(e) => e.stopPropagation()}>
        <div className="pool-head">
          <div>
            <span className="label">Player pool · A–Z</span>
            <b className="display pool-title">{players ? `${list.length} player${list.length === 1 ? '' : 's'}` : 'Players'}</b>
          </div>
          <button type="button" className="btn sm ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <input className="input pool-search" placeholder="Search a name…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <div className="pool-filters">
          <div className="pool-chips">
            {['All', ...POSITIONS].map((p) => <button type="button" key={p} className={pos === p ? 'on' : ''} onClick={() => setPos(p)}>{p === 'All' ? 'All' : POS_SHORT[p]}</button>)}
          </div>
          <div className="pool-chips">
            {FILTERS.map(([k, l]) => <button type="button" key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{l}</button>)}
          </div>
        </div>
        {letters.length > 6 && (
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
              <h4 className="pool-letter">{L}</h4>
              {ps.map((p) => {
                const t = p.teamId ? teamMap[p.teamId] : null;
                return (
                  <div key={p.id} className={`pool-row st-${p.status}`}>
                    <Avatar player={p} team={t} size={34} />
                    <span className="pool-name">
                      <b className="ellipsis">{p.name}</b>
                      <span className="tiny">{[POS_SHORT[p.position], p.tier, p.department, p.year].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="pool-st">
                      {t ? <span className="row tiny" style={{ gap: 5 }}><TeamLogo team={t} size={16} />{t.shortName || t.name}</span> : <span className="tiny">{STATUS[p.status] || p.status}</span>}
                      {p.price != null && <b className="mono small">{money(p.price, currency)}</b>}
                    </span>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
