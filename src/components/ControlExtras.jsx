import { useEffect, useMemo, useRef, useState } from 'react';
import { assetUrl } from '../lib/api.js';
import { initials, money, POSITIONS } from '../lib/format.js';
import { MoneyInput } from './ui.jsx';
import { POS_META } from './Positions.jsx';
import '../control-extras.css';

/**
 * Control room: the queue as a slidable strip of player cards, grouped by position with coloured markers.
 * Drag / swipe / scroll sideways; the position chips jump to that group. Tap a card to pick it, then load it.
 */
export function PlayerSlider({ state, busy, canLoad, onLoad }) {
  const queue = state?.upcoming || [];
  const unsold = state?.unsold || [];
  const [picked, setPicked] = useState('');
  const [open, setOpen] = useState(() => localStorage.getItem('fedcup.ctl.slider') !== 'off');
  const toggle = () => setOpen((o) => { localStorage.setItem('fedcup.ctl.slider', o ? 'off' : 'on'); return !o; });
  const track = useRef(null);
  const groups = useMemo(() => {
    const out = [];
    for (const p of queue) {
      const g = out[out.length - 1];
      if (g && g.pos === p.position) g.list.push(p); else out.push({ pos: p.position, list: [p] });
    }
    if (unsold.length) out.push({ pos: 'Unsold', list: unsold });
    return out;
  }, [queue, unsold]);
  useEffect(() => { if (picked && ![...queue, ...unsold].some((p) => p.id === picked)) setPicked(''); }, [queue, unsold, picked]);

  // mouse drag-to-scroll (touch and trackpads scroll natively)
  const drag = useRef(null);
  const down = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag.current = { x: e.clientX, left: track.current.scrollLeft, moved: false };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 4) d.moved = true;
    track.current.scrollLeft = d.left - dx;
  };
  const up = () => { setTimeout(() => { drag.current = null; }, 0); };
  const jump = (key) => {
    const el = track.current?.querySelector(`[data-group="${key}"]`);
    if (el) track.current.scrollTo({ left: el.offsetLeft - track.current.offsetLeft, behavior: 'smooth' });
  };
  const by = (dir) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.8, behavior: 'smooth' });
  const pickedP = [...queue, ...unsold].find((p) => p.id === picked);

  if (!queue.length && !unsold.length) return null;
  return (
    <section className={`card pslider ${open ? '' : 'closed'}`} aria-label="Players in the queue">
      <div className="ps-head">
        <button type="button" className="ps-toggle" onClick={toggle} aria-expanded={open} title={open ? 'Hide the player slider' : 'Show the player slider'}>
          <span className="ps-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
          Players <span className="muted">· {queue.length} queue{unsold.length ? ` · ${unsold.length} unsold` : ''}</span>
        </button>
        {open && (
          <div className="ps-jumps" role="group" aria-label="Jump to a position">
            {groups.map((g, i) => {
              const m = POS_META[g.pos];
              return (
                <button key={`${g.pos}-${i}`} type="button" className="ps-jump" style={{ '--c': m?.color || '#9ca3af' }} onClick={() => jump(`${g.pos}-${i}`)}>
                  {m?.short || 'UNSOLD'} <b>{g.list.length}</b>
                </button>
              );
            })}
          </div>
        )}
        {open && (
          <span className="ps-actions">
            {pickedP && <span className="ps-picked ellipsis" title={pickedP.name}>{pickedP.name}</span>}
            <button type="button" className="btn primary sm" disabled={busy || !picked || !canLoad} onClick={() => { onLoad(picked); setPicked(''); }}>Load picked</button>
            <button type="button" className="btn sm ghost ps-arrow" onClick={() => by(-1)} aria-label="Slide left">{'‹'}</button>
            <button type="button" className="btn sm ghost ps-arrow" onClick={() => by(1)} aria-label="Slide right">{'›'}</button>
          </span>
        )}
        <button type="button" className="btn sm ghost ps-hide" onClick={toggle}>{open ? 'Hide' : 'Show'}</button>
      </div>
      {open && (
        <div className="ps-track" ref={track} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}>
          {groups.map((g, gi) => {
            const m = POS_META[g.pos];
            return (
              <div key={`${g.pos}-${gi}`} className="ps-group" data-group={`${g.pos}-${gi}`} style={{ '--c': m?.color || '#9ca3af' }}>
                <span className="ps-glabel">{m?.word || 'Unsold'} · {g.list.length}</span>
                <div className="ps-cards">
                  {g.list.map((p, i) => {
                    const url = assetUrl(p.thumbUrl || p.photoUrl);
                    const first = gi === 0 && i === 0 && g.pos !== 'Unsold';
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`ps-card ${picked === p.id ? 'on' : ''} ${first ? 'next' : ''}`}
                        onClick={() => { if (!drag.current?.moved) setPicked(picked === p.id ? '' : p.id); }}
                        title={`${p.name} · ${p.position}${p.tier ? ` · ${p.tier}` : ''}`}
                      >
                        <span className="ps-ph">{url ? <img src={url} alt="" loading="lazy" draggable={false} /> : <span>{initials(p.name)}</span>}</span>
                        {first && <span className="ps-next">Next</span>}
                        <span className="ps-nm">{p.name}</span>
                        <span className="ps-meta">{POS_META[p.position]?.short}{p.tier ? ` · ${p.tier}` : ''}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Type-to-search player picker (filters as you type; arrows + Enter or click to pick). */
function PlayerSearch({ players, value, onPick }) {
  const cur = players.find((x) => x.id === value);
  const [q, setQ] = useState(cur ? cur.name : '');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const l = !t || (cur && q === cur.name) ? players : players.filter((x) => x.name.toLowerCase().includes(t));
    return l.slice(0, 60);
  }, [q, players, cur]);
  const pick = (x) => { onPick(x.id); setQ(x.name); setOpen(false); };
  const keys = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && open && list[hi]) { e.preventDefault(); pick(list[hi]); }
    else if (e.key === 'Escape') setOpen(false);
  };
  return (
    <div className="psearch">
      <input
        className="input"
        value={q}
        placeholder="Type a name…"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label="Search player"
        onFocus={(e) => { setOpen(true); e.target.select(); }}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); if (value) onPick(''); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={keys}
      />
      {open && (
        <ul className="psearch-list" role="listbox">
          {list.length ? list.map((x, i) => (
            <li
              key={x.id}
              role="option"
              aria-selected={i === hi}
              className={i === hi ? 'on' : ''}
              onMouseDown={(e) => { e.preventDefault(); pick(x); }}
              onMouseEnter={() => setHi(i)}
              style={{ '--c': POS_META[x.position]?.color || '#9ca3af' }}
            >
              <span className="psr-pos">{POS_META[x.position]?.short || '—'}</span>
              <span className="psr-name">{x.name}</span>
              <span className="psr-tier">{x.status === 'unsold' ? 'Unsold' : 'Not auctioned'}{x.tier ? ` · ${x.tier}` : ''}</span>
            </li>
          )) : <li className="psr-none">No player matches “{q}”</li>}
        </ul>
      )}
    </div>
  );
}

/**
 * After the auction (or between lots): hand an unsold player straight to a team. The server applies every
 * buying rule (purse, squad size, GK rule, position limits, base price).
 */
export function AssignPanel({ state, busy, act }) {
  const players = useMemo(() => {
    const list = [...(state?.unsold || []), ...(state?.status === 'ended' ? state?.upcoming || [] : [])];
    const seen = new Set();
    return list.filter((p) => (seen.has(p.id) ? false : seen.add(p.id)));
  }, [state?.unsold, state?.upcoming, state?.status]);
  const [playerId, setPlayerId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [amount, setAmount] = useState(0);
  const [pickKey, setPickKey] = useState(0); // remounts the search box (clears it) after each assignment
  const p = players.find((x) => x.id === playerId);
  useEffect(() => { if (p) setAmount(0); }, [playerId]); // eslint-disable-line react-hooks/exhaustive-deps -- unsold players are free by default
  useEffect(() => { if (playerId && !p) setPlayerId(''); }, [p, playerId]);
  if (!players.length) return null;
  const team = state.teams.find((t) => t.id === teamId);
  const sorted = [...players].sort((a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position) || a.name.localeCompare(b.name));
  const assign = async () => {
    const done = await act('assignPlayer', { playerId, teamId, amount: Number(amount) }, {
      confirm: { title: 'Assign this player?', message: `${p.name} → ${team.name} ${Number(amount) === 0 ? 'for FREE (nothing deducted from the purse)' : `for ${money(amount, state.currency)}`}.`, confirmLabel: 'Assign' },
      ok: `${p.name} → ${team.name}`,
    });
    if (done) { setPlayerId(''); setAmount(0); setPickKey((k) => k + 1); }
  };
  return (
    <section className="card assign-panel">
      <h2 style={{ marginTop: 0 }}>Assign unsold players</h2>
      <p className="muted small" style={{ marginTop: -4 }}>For the unsold auction in the room: give a player to a team. Unsold players are <b>free</b> (price 0, nothing deducted); type a price to charge one. Squad size and the goalkeeper rule still apply. Works after the auction has ended too.</p>
      <div className="assign-grid">
        <div className="field"><span className="label">Player · type to search ({players.length})</span>
          <PlayerSearch key={pickKey} players={sorted} value={playerId} onPick={setPlayerId} />
        </div>
        <label className="field"><span className="label">Team</span>
          <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">Choose team…</option>
            {state.teams.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.count} players · max {money(t.maxBid, state.currency)}</option>)}
          </select>
        </label>
        <label className="field"><span className="label">Price · 0 = free</span><MoneyInput value={amount} onChange={setAmount} /></label>
      </div>
      <div className="row wrap" style={{ marginTop: 10, gap: 10, alignItems: 'center' }}>
        <button type="button" className="btn ok" disabled={busy || !p || !team || amount === '' || amount == null || Number(amount) < 0} onClick={assign}>{Number(amount) === 0 ? '✓ Assign FREE to team' : '✓ Assign to team'}</button>
        {team && p && Number(amount) > team.maxBid && <span className="small" style={{ color: 'var(--amber)' }}>Above the {team.name} max ({money(team.maxBid, state.currency)}): the server will refuse it.</span>}
      </div>
    </section>
  );
}
