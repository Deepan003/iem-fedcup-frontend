import {
  useEffect, useMemo, useRef, useState,
} from 'react';
import { assetUrl } from '../lib/api.js';
import { initials, money, POS_SHORT } from '../lib/format.js';
import { TeamLogo } from './ui.jsx';
import '../squad.css';

/* --------------------------------- formations --------------------------------- */

export const FORMATION_GROUPS = [
  ['11-a-side', ['4-4-2', '4-3-3', '4-2-3-1', '4-5-1', '4-4-1-1', '4-1-4-1', '4-1-2-1-2', '4-2-2-2', '4-3-2-1', '3-5-2', '3-4-3', '3-4-1-2', '3-4-2-1', '5-3-2', '5-4-1', '5-2-3']],
  ['9-a-side', ['3-3-2', '3-4-1', '4-3-1', '3-2-3']],
  ['7-a-side', ['2-3-1', '3-2-1', '3-1-2', '2-2-2']],
];
const POS_ORDER = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'];
const linePos = (i, n) => (i === 0 ? 'Defender' : i === n - 1 ? 'Forward' : 'Midfielder');

/** Slots for a formation: GK at the bottom, lines spread up the pitch, players spread across each line. */
export function formationSlots(formation) {
  const lines = formation.split('-').map(Number);
  const slots = [{ id: 'gk', position: 'Goalkeeper', x: 50, y: 91 }];
  const top = 14;
  const bottom = 72;
  lines.forEach((count, li) => {
    const y = bottom - (li * ((bottom - top) / Math.max(1, lines.length - 1)));
    for (let k = 0; k < count; k += 1) {
      const spread = count === 1 ? 50 : 12 + (k * 76) / (count - 1);
      slots.push({ id: `l${li}s${k}`, position: linePos(li, lines.length), x: spread, y });
    }
  });
  return slots;
}

const shortName = (name = '') => {
  const w = name.trim().split(/\s+/);
  if (w.length === 1) return w[0];
  return `${w[0]} ${w[w.length - 1][0]}.`;
};

/** Best XI for the formation: players in their own positions first, then anyone left fills the gaps. */
function autoPick(slots, squad) {
  const out = {};
  const used = new Set();
  const ranked = [...squad].sort((a, b) => (b.isCaptain - a.isCaptain) || ((b.price || 0) - (a.price || 0)));
  for (const s of slots) {
    const p = ranked.find((x) => x.position === s.position && !used.has(x.id));
    if (p) { out[s.id] = p.id; used.add(p.id); }
  }
  for (const s of slots) {
    if (out[s.id]) continue;
    const p = ranked.find((x) => !used.has(x.id) && x.position !== 'Goalkeeper') || ranked.find((x) => !used.has(x.id));
    if (p) { out[s.id] = p.id; used.add(p.id); }
  }
  return out;
}

/* ------------------------------------ token ------------------------------------ */

function Token({
  p, slotPos, selected, onPointerDown, team, small = false,
}) {
  const url = assetUrl(p?.thumbUrl || p?.photoUrl);
  const oop = p && slotPos && p.position && p.position !== slotPos;
  return (
    <span className={`sb-token ${small ? 'sm' : ''} ${selected ? 'sel' : ''} ${p ? '' : 'empty'}`} style={{ '--tc': team?.color }} onPointerDown={onPointerDown}>
      <span className="sb-face">
        {p ? (url ? <img src={url} alt="" draggable={false} /> : <span className="sb-ini">{initials(p.name)}</span>) : <span className="sb-plus">+</span>}
        {p?.isCaptain && <span className="sb-arm" title="Captain">C</span>}
        {p && <span className={`sb-pos ${oop ? 'oop' : ''}`} title={oop ? `Plays ${p.position}` : p.position}>{POS_SHORT[p.position] || '—'}</span>}
      </span>
      <span className="sb-name">{p ? shortName(p.name) : POS_SHORT[slotPos]}</span>
    </span>
  );
}

/* ------------------------------------ builder ------------------------------------ */

/**
 * Captain's lineup planner. Drag (mouse or touch) or tap-to-select, then tap/drop on a spot to place or swap.
 * Anyone can play anywhere ("out of position" is shown in amber). Only this captain can see it.
 */
export default function SquadBuilder({
  team, currency, plan, formations, onChange,
}) {
  const squad = useMemo(() => {
    const cap = (team?.captainName || '').trim().toLowerCase();
    // the captain may be a squad player (same name) — mark them, don't add a duplicate
    const list = (team?.squad || []).map((p) => (cap && !p.isCaptain && p.name.trim().toLowerCase() === cap ? { ...p, isCaptain: true } : p));
    if (team?.captainName && !list.some((p) => p.isCaptain)) {
      list.unshift({
        id: 'captain', name: team.captainName, position: team.captainPosition || null, isCaptain: true, thumbUrl: team.captainPhotoUrl, price: 0,
      });
    }
    return list;
  }, [team]);
  const byId = useMemo(() => Object.fromEntries(squad.map((p) => [p.id, p])), [squad]);
  const slots = useMemo(() => formationSlots(plan.formation || '4-4-2'), [plan.formation]);

  // lineup = saved choices (valid players only); before the captain touches it, auto-pick fills it
  const lineup = useMemo(() => {
    const ids = new Set(squad.map((p) => p.id));
    const out = {};
    const used = new Set();
    for (const s of slots) {
      const pid = plan.lineup?.[s.id];
      if (pid && ids.has(pid) && !used.has(pid)) { out[s.id] = pid; used.add(pid); }
    }
    if (plan.manual) return out;
    const auto = autoPick(slots.filter((s) => !out[s.id]), squad.filter((p) => !used.has(p.id)));
    return { ...out, ...auto };
  }, [slots, squad, plan.lineup, plan.manual]);

  const onPitch = new Set(Object.values(lineup));
  const bench = squad.filter((p) => !onPitch.has(p.id));
  const filled = Object.keys(lineup).length;
  const [sel, setSel] = useState(null); // { id (player), from (slot id | 'bench') } or { slot } for an empty spot
  const [drag, setDrag] = useState(null); // { id, from, x, y }
  const dragRef = useRef(null);

  const commit = (next) => onChange({ ...plan, lineup: next, manual: true });
  const place = (playerId, slotId) => {
    const next = { ...lineup };
    const from = Object.keys(next).find((k) => next[k] === playerId);
    const there = next[slotId];
    if (from) delete next[from];
    next[slotId] = playerId;
    if (from && there && there !== playerId) next[from] = there; // swap places
    commit(next);
  };
  const toBench = (playerId) => {
    const next = { ...lineup };
    const from = Object.keys(next).find((k) => next[k] === playerId);
    if (!from) return;
    delete next[from];
    commit(next);
  };

  // tap logic: pick a player (or an empty spot), then tap where it should go
  const tapSlot = (slotId) => {
    const pid = lineup[slotId];
    if (sel?.id) {
      if (sel.id === pid) { setSel(null); return; }
      place(sel.id, slotId);
      setSel(null);
      return;
    }
    if (sel?.slot && pid == null) { setSel({ slot: slotId }); return; }
    if (sel?.slot && pid) { place(pid, sel.slot); setSel(null); return; }
    setSel(pid ? { id: pid, from: slotId } : { slot: slotId });
  };
  const tapBench = (pid) => {
    if (sel?.slot) { place(pid, sel.slot); setSel(null); return; }
    if (sel?.id && sel.from !== 'bench') { // swap a pitch player with this bench player
      place(pid, sel.from);
      setSel(null);
      return;
    }
    setSel(sel?.id === pid ? null : { id: pid, from: 'bench' });
  };

  // drag that works with mouse AND touch (pointer events), falls back to a tap if it barely moved
  // On a phone the bench is a scrolling list: a quick swipe scrolls the page, press-and-hold (250 ms) picks the player up.
  const startDrag = (e, pid, from) => {
    if (e.button != null && e.button !== 0) return;
    const holdFirst = e.pointerType === 'touch' && from === 'bench';
    const row = e.currentTarget;
    const start = {
      id: pid, from, x0: e.clientX, y0: e.clientY, moved: false, armed: !holdFirst, timer: null,
    };
    dragRef.current = start;
    // while armed, stop the browser from turning the finger's movement into a scroll
    const blockScroll = (ev) => { if (dragRef.current?.armed && ev.cancelable) ev.preventDefault(); };
    if (holdFirst) {
      start.timer = setTimeout(() => {
        if (dragRef.current !== start) return;
        start.armed = true;
        row?.classList.add('armed');
        navigator.vibrate?.(12);
      }, 250);
    }
    const cleanup = () => {
      clearTimeout(start.timer);
      row?.classList.remove('armed');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('touchmove', blockScroll);
    };
    function move(ev) {
      const d = dragRef.current;
      if (!d) return;
      const far = Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) >= 7;
      if (!d.armed) { // moved before the hold finished: it is a scroll, let the page have it
        if (far) { dragRef.current = null; cleanup(); }
        return;
      }
      if (!d.moved && !far) return;
      d.moved = true;
      ev.preventDefault();
      setDrag({ id: d.id, from: d.from, x: ev.clientX, y: ev.clientY });
    }
    function cancel() { // the browser took the touch (scroll / zoom): never treat that as a tap
      dragRef.current = null;
      cleanup();
      setDrag(null);
    }
    function up(ev) {
      cleanup();
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d) return;
      if (!d.moved) { if (d.from === 'bench') tapBench(d.id); else tapSlot(d.from); return; }
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-drop]');
      if (!target) return;
      const where = target.getAttribute('data-drop');
      if (where === 'bench') toBench(d.id);
      else place(d.id, where);
      setSel(null);
    }
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('touchmove', blockScroll, { passive: false });
  };

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') setSel(null); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  const printPdf = () => {
    document.body.classList.add('print-squad');
    const done = () => { document.body.classList.remove('print-squad'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 50);
  };
  const groups = FORMATION_GROUPS.map(([g, list]) => [g, list.filter((f) => !formations?.length || formations.includes(f))]).filter(([, l]) => l.length);
  const benchBy = [['Captain', bench.filter((p) => p.isCaptain && !p.position)], ...POS_ORDER.map((pos) => [pos, bench.filter((p) => p.position === pos)])].filter(([, l]) => l.length);
  const dragP = drag ? byId[drag.id] : null;
  const hint = sel?.id ? `Now tap a spot for ${shortName(byId[sel.id]?.name)} (or another player to swap).`
    : sel?.slot ? 'Now tap the player who should play there.'
      : 'Drag players onto the pitch, or tap a player then a spot. Tap two players to swap them.';

  return (
    <div className={`sb3 squad-print ${drag ? 'dragging' : ''}`} style={{ '--tc': team?.color }}>
      <div className="sb3-top">
        <TeamLogo team={team} size={38} />
        <div className="sb3-title">
          <b>{team?.name}</b>
          <span className="tiny">{plan.formation} · {filled}/{slots.length} on the pitch · {bench.length} on the bench</span>
        </div>
        <div className="sb3-tools no-print-sb">
          <label className="sb3-select">
            <span className="tiny">Formation</span>
            <select value={plan.formation} onChange={(e) => onChange({ ...plan, formation: e.target.value })}>
              {groups.map(([g, list]) => <optgroup key={g} label={g}>{list.map((f) => <option key={f} value={f}>{f}</option>)}</optgroup>)}
            </select>
          </label>
          <button type="button" className="btn sm" onClick={() => { commit(autoPick(slots, squad)); setSel(null); }} title="Best XI by position (fills gaps with anyone left)">✨ Auto pick</button>
          <button type="button" className="btn sm ghost" onClick={() => { commit({}); setSel(null); }}>Clear</button>
          <button type="button" className="btn sm ghost" onClick={printPdf}>⬇ PDF</button>
        </div>
      </div>

      <div className="sb3-body">
        <div className="sb3-pitch" onClick={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
          <svg className="sb3-lines" viewBox="0 0 68 100" preserveAspectRatio="none" aria-hidden="true">
            <rect x="1.5" y="1.5" width="65" height="97" />
            <line x1="1.5" y1="50" x2="66.5" y2="50" />
            <circle cx="34" cy="50" r="9" />
            <circle cx="34" cy="50" r="0.6" className="dot" />
            <rect x="14" y="1.5" width="40" height="15" /><rect x="24" y="1.5" width="20" height="5.5" />
            <rect x="14" y="83.5" width="40" height="15" /><rect x="24" y="93" width="20" height="5.5" />
            <circle cx="34" cy="11.5" r="0.6" className="dot" /><circle cx="34" cy="88.5" r="0.6" className="dot" />
          </svg>
          {slots.map((s) => {
            const p = byId[lineup[s.id]];
            const isSel = (sel?.id && sel.id === p?.id) || sel?.slot === s.id;
            return (
              <div
                key={s.id}
                data-drop={s.id}
                className={`sb3-slot ${p ? '' : 'free'} ${(sel || drag) && !isSel ? 'target' : ''} ${drag?.id === p?.id ? 'ghosted' : ''}`}
                style={{ left: `${s.x}%`, top: `${s.y}%` }}
              >
                <Token
                  p={p}
                  slotPos={s.position}
                  selected={isSel}
                  team={team}
                  onPointerDown={(e) => (p ? startDrag(e, p.id, s.id) : undefined)}
                />
                {!p && <button type="button" className="sb3-hit" onClick={() => tapSlot(s.id)} aria-label={`Empty ${s.position} spot`} />}
              </div>
            );
          })}
        </div>

        <aside className="sb3-bench" data-drop="bench">
          <div className="sb3-bench-head">
            <span className="label">Bench</span>
            <span className="tiny">{drag ? 'Drop here to take off' : `${bench.length} player${bench.length === 1 ? '' : 's'}`}</span>
          </div>
          {bench.length === 0 && <p className="tiny" style={{ margin: '8px 0' }}>Everyone is on the pitch.</p>}
          {benchBy.map(([pos, list]) => (
            <div key={pos} className="sb3-group">
              <span className="sb3-gl">{pos === 'Captain' ? 'Captain' : `${pos}s`} · {list.length}</span>
              {list.map((p) => (
                <div key={p.id} className={`sb3-brow ${sel?.id === p.id ? 'sel' : ''} ${drag?.id === p.id ? 'ghosted' : ''}`} onPointerDown={(e) => startDrag(e, p.id, 'bench')}>
                  <Token p={p} small team={team} />
                  <span className="sb3-bname ellipsis">{p.name}</span>
                  <span className="mono tiny">{p.isCaptain ? 'C' : money(p.price, currency)}</span>
                </div>
              ))}
            </div>
          ))}
          <p className="tiny sb3-hint no-print-sb">{hint}</p>
          {sel?.id && sel.from !== 'bench' && <button type="button" className="btn sm ghost no-print-sb" onClick={() => { toBench(sel.id); setSel(null); }}>Take off (to bench)</button>}
        </aside>
      </div>

      {dragP && (
        <div className="sb3-ghost" style={{ left: drag.x, top: drag.y }}>
          <Token p={dragP} team={team} />
        </div>
      )}
    </div>
  );
}
