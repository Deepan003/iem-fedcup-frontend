import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  api, assetUrl, explain, session,
} from '../lib/api.js';
import { useAuction } from '../lib/auction.js';
import { money, POS_SHORT, teamById } from '../lib/format.js';
import LotStage, { SoldOverlay } from '../components/LotStage.jsx';
import { PurseStrip, SquadCard } from '../components/Teams.jsx';
import {
  Avatar, Field, MiniPlayer, Spinner, TeamLogo, useAction, useToast,
} from '../components/ui.jsx';
import { RollingNumber } from '../components/fx.jsx';
import { SoundDock, useAuctionSound } from '../components/Sound.jsx';
import { ShortcutHelp, useShortcuts } from '../lib/shortcuts.jsx';

/* --------------------------------- login --------------------------------- */
function CaptainLogin({ onLogin }) {
  const [teams, setTeams] = useState(null);
  // Links from the admin Links page carry ?team=<id>: preselect it so the captain only types the password.
  const [teamId, setTeamId] = useState(() => new URLSearchParams(window.location.search).get('team') || '');
  const [password, setPassword] = useState('');
  const [run, busy] = useAction();
  const { state: live } = useAuction(); // live: new/renamed teams appear without a refresh
  useEffect(() => {
    api('/teams').then((list) => {
      setTeams(list);
      setTeamId((id) => (list.some((t) => t.id === id) ? id : '')); // ignore links to deleted teams
    }).catch(() => setTeams((t) => t || []));
  }, [live?.dataV]);
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const r = await api('/auth/captain', { method: 'POST', body: { teamId, password } });
      session.set('captain', { token: r.token, team: r.team });
      onLogin();
    });
  };
  return (
    <div className="auth-wrap">
      <form className="auth-card stack" style={{ gap: 18 }} onSubmit={submit}>
        <span className="idx">Restricted · Captains only</span>
        <h1 className="display"><span className="mask"><span>Captain</span></span><span className="mask"><span className="grad-text" style={{ animationDelay: '0.08s' }}>room</span></span></h1>
        <p className="muted">Choose your club and enter the password from the organisers.</p>
        {!teams ? <Spinner /> : (
          <div className="team-pick">
            {teams.map((t) => (
              <button type="button" key={t.id} className={teamId === t.id ? 'on' : ''} style={{ '--c': t.color }} onClick={() => setTeamId(t.id)}>
                <TeamLogo team={t} size={44} />
                <span className="ellipsis" style={{ maxWidth: '100%' }}>{t.name}</span>
              </button>
            ))}
          </div>
        )}
        <Field label="Password">
          <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="e.g. falcon-volley-1234" autoCapitalize="none" />
        </Field>
        <button className="btn primary lg" disabled={!teamId || !password || busy}>{busy ? 'Signing in…' : 'Enter captain room'}</button>
      </form>
    </div>
  );
}

/* ----------------------------- squad builder ----------------------------- */
const LINE_POS = (i, n) => (i === 0 ? 'Defender' : i === n - 1 ? 'Forward' : 'Midfielder');

// Formations by format (the backend accepts the same list)
const FORMATION_GROUPS = [
  ['11-a-side', ['4-4-2', '4-3-3', '4-2-3-1', '4-5-1', '4-4-1-1', '4-1-4-1', '4-1-2-1-2', '4-2-2-2', '4-3-2-1', '3-5-2', '3-4-3', '3-4-1-2', '3-4-2-1', '5-3-2', '5-4-1', '5-2-3']],
  ['9-a-side', ['3-3-2', '3-4-1', '4-3-1', '3-2-3']],
  ['7-a-side', ['2-3-1', '3-2-1', '3-1-2', '2-2-2']],
];

function formationSlots(formation) {
  const lines = formation.split('-').map(Number);
  const slots = [{ id: 'gk', position: 'Goalkeeper', x: 50, y: 90 }];
  lines.forEach((count, li) => {
    const y = 74 - (li * (56 / Math.max(1, lines.length - 1)));
    for (let k = 0; k < count; k += 1) {
      slots.push({
        id: `l${li}s${k}`, position: LINE_POS(li, lines.length), x: ((k + 1) * 100) / (count + 1), y,
      });
    }
  });
  return slots;
}

/**
 * The captain's private lineup planner: formation, drag & drop (or tap to swap), any player in any
 * position (flagged "out of position"), the captain included with an armband, and a PDF of the lineup.
 */
function SquadBuilder({
  team, currency, plan, formations, onChange,
}) {
  // the captain is part of the squad even if they were only entered as a name on the team
  const squad = useMemo(() => {
    const list = [...(team?.squad || [])];
    if (team?.captainName && !list.some((p) => p.isCaptain)) {
      list.unshift({
        id: 'captain', name: team.captainName, position: null, isCaptain: true, thumbUrl: team.captainPhotoUrl, price: 0,
      });
    }
    return list;
  }, [team]);
  const slots = useMemo(() => formationSlots(plan.formation), [plan.formation]);
  const [sel, setSel] = useState(null); // { kind: 'slot' | 'bench', id }
  const [drag, setDrag] = useState(null);

  // Effective lineup: saved choices first, then auto-fill empty slots by position.
  const lineup = useMemo(() => {
    const ids = new Set(squad.map((p) => p.id));
    const out = {};
    const used = new Set();
    for (const s of slots) {
      const pid = plan.lineup?.[s.id];
      if (pid && ids.has(pid) && !used.has(pid)) {
        out[s.id] = pid;
        used.add(pid);
      }
    }
    if (!plan.manual) {
      for (const s of slots) {
        if (out[s.id]) continue;
        const p = squad.find((x) => x.position === s.position && !used.has(x.id));
        if (p) {
          out[s.id] = p.id;
          used.add(p.id);
        }
      }
    }
    return out;
  }, [slots, squad, plan.lineup, plan.manual]);

  const onPitch = new Set(Object.values(lineup));
  const bench = squad.filter((p) => !onPitch.has(p.id));
  const byId = Object.fromEntries(squad.map((p) => [p.id, p]));
  const save = (next) => onChange({ ...plan, lineup: next, manual: true });

  // put a player in a slot (whoever was there goes to the bench or to the player's old slot)
  const place = (slotId, playerId) => {
    const next = { ...lineup };
    const from = Object.keys(next).find((k) => next[k] === playerId);
    const there = next[slotId];
    if (from) delete next[from];
    if (playerId) next[slotId] = playerId;
    else delete next[slotId];
    if (from && there && there !== playerId) next[from] = there; // swap
    save(next);
    setSel(null);
  };
  const toBench = (slotId) => {
    const next = { ...lineup };
    delete next[slotId];
    save(next);
    setSel(null);
  };
  const tapSlot = (slotId) => {
    if (!sel) { setSel({ kind: 'slot', id: slotId }); return; }
    if (sel.kind === 'slot') {
      if (sel.id === slotId) { setSel(null); return; }
      const a = lineup[sel.id];
      if (a) place(slotId, a); else if (lineup[slotId]) place(sel.id, lineup[slotId]); else setSel({ kind: 'slot', id: slotId });
      return;
    }
    place(slotId, sel.id);
  };
  const tapBench = (playerId) => {
    if (sel?.kind === 'slot') place(sel.id, playerId);
    else setSel(sel?.id === playerId ? null : { kind: 'bench', id: playerId });
  };
  const onDropSlot = (slotId) => { if (drag) place(slotId, drag); setDrag(null); };
  const onDropBench = () => {
    const from = Object.keys(lineup).find((k) => lineup[k] === drag);
    if (from) toBench(from);
    setDrag(null);
  };

  const counts = squad.reduce((m, p) => (p.position ? { ...m, [p.position]: (m[p.position] || 0) + 1 } : m), {});
  const printPdf = () => {
    document.body.classList.add('print-squad');
    const done = () => { document.body.classList.remove('print-squad'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 50);
  };
  const groups = FORMATION_GROUPS.map(([g, list]) => [g, list.filter((f) => !formations?.length || formations.includes(f))]).filter(([, l]) => l.length);

  return (
    <div className="stack squad-print">
      <div className="sb-head">
        <TeamLogo team={team} size={40} />
        <div className="grow">
          <b className="display" style={{ fontSize: 24, display: 'block', lineHeight: 1 }}>{team?.name}</b>
          <span className="tiny">Lineup plan · {plan.formation}</span>
        </div>
        <label className="sb-formation no-print-sb">
          <span className="tiny">Formation</span>
          <select className="input" value={plan.formation} onChange={(e) => onChange({ ...plan, formation: e.target.value })}>
            {groups.map(([g, list]) => (
              <optgroup key={g} label={g}>{list.map((f) => <option key={f} value={f}>{f}</option>)}</optgroup>
            ))}
          </select>
        </label>
        <button type="button" className="btn sm no-print-sb" onClick={printPdf}>⬇ PDF</button>
      </div>
      <div className="row wrap no-print-sb">
        {['Goalkeeper', 'Defender', 'Midfielder', 'Forward'].map((p) => <span key={p} className="chip">{POS_SHORT[p]} {counts[p] || 0}</span>)}
        <span className="chip">{squad.length} player{squad.length === 1 ? '' : 's'}</span>
        {plan.manual && <button type="button" className="btn sm ghost" onClick={() => onChange({ ...plan, lineup: {}, manual: false })}>Auto-fill by position</button>}
      </div>
      <div className="pitch">
        <span className="box" style={{ top: 0, borderTop: 0 }} />
        <span className="box" style={{ bottom: 0, borderBottom: 0 }} />
        {slots.map((s) => {
          const p = byId[lineup[s.id]];
          const oop = p && p.position && p.position !== s.position;
          return (
            <button
              type="button"
              key={s.id}
              className={`slot ${p ? '' : 'empty'} ${sel?.kind === 'slot' && sel.id === s.id ? 'sel' : ''} ${oop ? 'oop' : ''}`}
              style={{ left: `${s.x}%`, top: `${s.y}%` }}
              draggable={!!p}
              onDragStart={() => p && setDrag(p.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDropSlot(s.id)}
              onDragEnd={() => setDrag(null)}
              onClick={() => tapSlot(s.id)}
              title={p ? `${p.name}${oop ? ` (plays ${p.position}, here as ${s.position})` : ''}` : `Empty ${s.position} spot`}
            >
              <span className="face">
                {p?.thumbUrl ? <img src={assetUrl(p.thumbUrl)} alt="" /> : (p ? p.name.split(' ').map((w) => w[0]).slice(0, 2).join('') : POS_SHORT[s.position])}
                {p?.isCaptain && <span className="armband">C</span>}
              </span>
              <span className="nm">{p ? p.name.split(' ')[0] : 'Empty'}</span>
              <span className="sp">{POS_SHORT[s.position]}{oop ? ' · OOP' : ''}</span>
            </button>
          );
        })}
      </div>
      <p className="muted small no-print-sb">
        {sel ? 'Now tap another spot to swap, or a bench player to bring them on (tap again to cancel).' : 'Drag players around, or tap a spot then another spot (or a bench player) to move them. Anyone can play anywhere. Only you can see this.'}
      </p>
      <div onDragOver={(e) => e.preventDefault()} onDrop={onDropBench} className={`sb-bench ${drag ? 'drop' : ''}`}>
        <div className="label" style={{ marginBottom: 4 }}>Bench {drag ? '· drop here to bench' : ''}</div>
        {bench.length === 0 && <div className="tiny" style={{ padding: '10px 0' }}>No bench players</div>}
        {bench.map((p) => (
          <button
            type="button"
            key={p.id}
            draggable
            onDragStart={() => setDrag(p.id)}
            onDragEnd={() => setDrag(null)}
            className={`bench-row ${sel?.kind === 'bench' && sel.id === p.id ? 'sel' : ''}`}
            onClick={() => tapBench(p.id)}
          >
            <span className="label">{p.isCaptain ? 'C' : POS_SHORT[p.position] || '—'}</span>
            <span className="ellipsis sq-who"><Avatar player={p} size={28} />{p.name}{p.isCaptain ? ' · Captain' : p.retained ? ' · R' : ''}</span>
            <span className="mono small muted">{p.isCaptain ? '' : money(p.price, currency)}</span>
          </button>
        ))}
        {sel?.kind === 'slot' && lineup[sel.id] && <button type="button" className="btn sm ghost no-print-sb" onClick={() => toBench(sel.id)}>Move to bench</button>}
      </div>
    </div>
  );
}

/* ---------------------------------- room --------------------------------- */
function CaptainRoom({ auth, onLogout }) {
  const toast = useToast();
  const {
    state, connected, now, emit, mergeLot,
  } = useAuction({
    token: auth.token,
    onSessionEnded: () => {
      toast('You were signed out (password changed by the organisers).', 'error', 6000);
      onLogout();
    },
  });
  const snd = useAuctionSound(state, now, { surface: 'captain', teamId: auth.team.id });
  const [tab, setTab] = useState('squad');
  const [pending, setPending] = useState(false);
  const [planData, setPlanData] = useState(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    api('/captain/plan', { token: auth.token }).then(setPlanData).catch(() => {});
  }, [auth.token]);

  const updatePlan = useCallback((plan) => {
    setPlanData((d) => ({ ...d, plan }));
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api('/captain/plan', { method: 'PUT', body: plan, token: auth.token }).catch((e) => toast(e.message, 'error'));
    }, 600);
  }, [auth.token, toast]);

  // When the price moves, hold the button for a beat (so nobody taps a price they haven't seen)
  const nextAmt = state?.lot?.nextAmount;
  const [bumped, setBumped] = useState(false);
  const [notice, setNotice] = useState(null);
  const firstAmt = useRef(true);
  useEffect(() => {
    if (firstAmt.current) { firstAmt.current = false; return undefined; }
    if (nextAmt == null) return undefined;
    setBumped(true);
    const t = setTimeout(() => setBumped(false), 450);
    return () => clearTimeout(t);
  }, [nextAmt]);
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 2800);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => { setNotice(null); }, [state?.lot?.seq]);

  const keys = useShortcuts(); // B = bid, ? = list
  if (!state) return <div className="auth-wrap"><Spinner /></div>;

  const me = teamById(state, auth.team.id);
  const lot = state.lot;
  const cv = state.captainView || {};
  const watch = planData?.plan?.watchlist || [];
  const watched = (pid) => watch.find((w) => w.playerId === pid);
  const toggleWatch = (pid) => {
    const plan = planData.plan;
    const list = watched(pid) ? plan.watchlist.filter((w) => w.playerId !== pid) : [...plan.watchlist, { playerId: pid, maxPrice: null, note: '' }];
    updatePlan({ ...plan, watchlist: list });
  };

  // Why can't I bid? (the server checks again anyway)
  let reason = null;
  if (!connected) reason = 'Reconnecting…';
  else if (state.status !== 'live') reason = state.status === 'ended' ? 'Auction finished' : 'Auction not started';
  else if (state.paused) reason = 'Paused by auctioneer';
  else if (state.mode !== 'online' || !cv.biddingEnabled) reason = 'Bidding happens in the room';
  else if (!lot || lot.phase === 'reveal') reason = lot ? 'Bidding opens soon' : 'Waiting for next player';
  else if (lot.phase === 'awaiting') reason = 'Bidding closed';
  else if (lot.phase !== 'bidding') reason = lot.phase === 'sold' ? 'Sold' : 'Unsold';
  else if (state.me?.blockReason) reason = explain(state.me.blockReason);
  else if (lot.nextAmount > (state.me?.maxBidForLot ?? 0)) reason = `Max you can bid: ${money(state.me?.maxBidForLot, state.currency)}`;
  const leading = lot?.leaderId === auth.team.id && ['bidding', 'awaiting'].includes(lot?.phase);


  const placeBid = async () => {
    if (!lot || pending || bumped) return;
    setPending(true);
    navigator.vibrate?.(25);
    const res = await emit('bid', { lotSeq: lot.seq, amount: lot.nextAmount });
    setPending(false);
    if (res?.lot) mergeLot(res.lot, res.v);
    if (!res?.ok) {
      if (res?.code === 'STALE_AMOUNT') {
        // a race, not a mistake: someone bid a split second earlier
        navigator.vibrate?.([40, 40, 40]);
        setNotice(`Beaten to it by a split second. Price is now ${money(res?.lot?.amount ?? lot.amount, state.currency)}.`);
      } else toast(explain(res?.code), 'error');
    } else setNotice(null);
  };

  const others = state.teams.filter((t) => t.id !== auth.team.id);
  const rivals = lot && ['bidding', 'awaiting', 'reveal'].includes(lot.phase) && others.some((t) => t.maxBid != null)
    ? others
      .filter((t) => t.id === lot.leaderId || (t.maxBid ?? 0) >= (lot.nextAmount ?? 0))
      .sort((a, b) => (b.id === lot.leaderId) - (a.id === lot.leaderId) || (b.maxBid ?? 0) - (a.maxBid ?? 0))
      .slice(0, 4)
    : [];

  // Live "what's left if this bid wins": the current bid if you lead, else the bid you'd place next
  const purse = me?.purse ?? 0;
  const live = lot && ['bidding', 'awaiting'].includes(lot.phase);
  const afterAmount = !live ? null : leading ? lot.amount : (!reason ? lot.nextAmount : null);
  const after = afterAmount != null ? purse - afterAmount : null;
  const budget = me?.budget || purse;
  const tight = after != null && budget > 0 && after < budget * 0.2;

  // Wide screens: use the space either side. Left = your team, right = the competition.
  const budgetTotal = me?.budgetTotal ?? ((me?.purse ?? 0) + (me?.spent ?? 0) + (me?.penalty ?? 0));
  const mySquad = [...(me?.squad || [])].sort((a, b) => (b.isCaptain - a.isCaptain) || ((b.price || 0) - (a.price || 0)));
  const posCount = (pos) => mySquad.filter((p) => p.position === pos).length;
  const slotsTotal = me?.slotsLeft != null ? (me.count ?? mySquad.length) + me.slotsLeft : null;
  const table = [...state.teams].sort((a, b) => (b.purse ?? 0) - (a.purse ?? 0));
  const leftRail = (
    <aside className="cap-side cap-left" aria-label="Your team">
      <div className="cs-block">
        <span className="label">Your purse</span>
        <div className="cs-big"><RollingNumber value={me?.purse ?? 0} money /> <small>{state.currency}</small></div>
        {budgetTotal > 0 && <div className="cs-bar"><i style={{ transform: `scaleX(${Math.max(0, Math.min(1, (me?.purse ?? 0) / budgetTotal))})` }} /></div>}
        {after != null && (
          <div className={`cs-after ${leading ? 'lead' : ''} ${tight ? 'tight' : ''}`}>
            <span className="tiny">{leading ? 'If you win' : `After bidding ${money(afterAmount, state.currency)}`}</span>
            <b><RollingNumber value={after} money /> <small>{state.currency}</small></b>
          </div>
        )}
        <div className="cs-kv"><span>Budget</span><b>{money(budgetTotal, state.currency)}</b></div>
        {me?.spent != null && <div className="cs-kv"><span>Spent</span><b>{money(me.spent, state.currency)}</b></div>}
        <div className="cs-kv"><span>Max bid now</span><b>{money(state.me?.maxBidForLot ?? me?.maxBid, state.currency)}</b></div>
        {me?.penalty > 0 && <div className="cs-kv"><span>Penalties</span><b className="pen-tag">−{money(me.penalty, state.currency)}</b></div>}
      </div>
      <div className="cs-block">
        <span className="label">Squad</span>
        <div className="cs-big">{me?.count ?? mySquad.length}{slotsTotal != null && <small>/{slotsTotal}</small>}</div>
        {me?.slotsLeft != null && <span className="tiny">{me.slotsLeft} slot{me.slotsLeft === 1 ? '' : 's'} left</span>}
        <div className="cs-pos">
          {['Goalkeeper', 'Defender', 'Midfielder', 'Forward'].map((p) => (
            <span key={p} className={posCount(p) ? '' : 'zero'}><b>{posCount(p)}</b>{POS_SHORT[p]}</span>
          ))}
        </div>
      </div>
      {mySquad.length > 0 && (
        <div className="cs-block cs-list">
          <span className="label">Your players</span>
          {mySquad.map((p) => (
            <div key={p.id} className="cs-row">
              <Avatar player={p} size={26} />
              <span className="ellipsis">{p.name}{p.isCaptain ? ' (C)' : ''}</span>
              <span className="tiny">{POS_SHORT[p.position]}</span>
              <b className="mono small">{p.isCaptain ? 'C' : money(p.price, state.currency)}</b>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
  const rightRail = (
    <aside className="cap-side cap-right" aria-label="Other teams">
      {rivals.length > 0 && (
        <div className="cs-block">
          <span className="label">Can outbid you</span>
          {rivals.map((t) => (
            <div key={t.id} className={`rival ${t.id === lot.leaderId ? 'lead' : ''}`} style={{ '--tc': t.color }}>
              <TeamLogo team={t} size={30} />
              <b className="ellipsis">{t.shortName || t.name}</b>
              {t.id === lot.leaderId && <span className="rival-tag">Leading</span>}
              <span className="mono small">max {money(t.maxBid, state.currency)}</span>
            </div>
          ))}
        </div>
      )}
      {table.some((t) => t.purse != null) && (
        <div className="cs-block">
          <span className="label">All teams · purse / max bid</span>
          {table.map((t) => (
            <div key={t.id} className={`cs-team ${t.id === auth.team.id ? 'me' : ''} ${lot?.leaderId === t.id ? 'lead' : ''}`} style={{ '--tc': t.color }}>
              <TeamLogo team={t} size={22} />
              <b className="ellipsis">{t.shortName || t.name}</b>
              <span className="mono small">{money(t.purse, state.currency)}</span>
              <span className="mono small muted">{money(t.maxBid, state.currency)}</span>
            </div>
          ))}
        </div>
      )}
      {cv.showUpcoming && state.upcoming.length > 0 && (
        <div className="cs-block">
          <span className="label">Up next</span>
          {state.upcoming.slice(0, 6).map((p) => (
            <button type="button" key={p.id} className="cs-row cs-next" onClick={() => toggleWatch(p.id)} title="Add to / remove from your watchlist">
              <Avatar player={p} size={26} />
              <span className="ellipsis">{p.name}</span>
              <span className="tiny">{POS_SHORT[p.position]}</span>
              <b className="small">{watched(p.id) ? '★' : '☆'}</b>
            </button>
          ))}
        </div>
      )}
    </aside>
  );

  return (
    <main className="container studio cap-wide" style={{ paddingBottom: 0, paddingTop: 80 }}>
      <ShortcutHelp open={keys.help} onClose={() => keys.setHelp(false)} />
      <div className="studio-bg" />
      <div className="cap-head" style={{ borderBottom: `2px solid ${me?.color || 'var(--rule)'}` }}>
        <TeamLogo team={me} size={48} />
        <div style={{ minWidth: 0 }}>
          <div className="display ellipsis" style={{ fontSize: 30 }}>{me?.name}</div>
          <span className="tiny">{me?.count} player{me?.count === 1 ? '' : 's'} · max bid {money(state.me?.maxBidForLot ?? me?.maxBid, state.currency)}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="money"><RollingNumber value={me?.purse ?? 0} money /></div>
          <span className="tiny">{state.currency} left</span>
          {after != null && (
            <div className={`after-bid ${leading ? 'lead' : ''} ${tight ? 'tight' : ''}`} aria-live="polite">
              <span className="tiny">{leading ? 'If you win' : `After bidding ${money(afterAmount, state.currency)}`}</span>
              <b><RollingNumber value={after} money /> <small>{state.currency}</small></b>
            </div>
          )}
          {me?.penalty > 0 && <span className="pen-tag" style={{ display: 'block' }} title={(me.penalties || []).map((p) => `−${p.amount}: ${p.remark}`).join(' · ')}>incl. −{money(me.penalty, state.currency)} penalty</span>}
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: -14 }}>
        {connected ? <span className="tiny" style={{ color: 'var(--go)' }}>● Connected</span> : <span className="tiny" style={{ color: 'var(--amber)' }}>● Reconnecting</span>}
        <span className="row" style={{ gap: 8 }}>
          <SoundDock state={state} sound={snd} surface="captain" inline />
          <button type="button" className="btn sm ghost kbd-hint-btn hide-touch" onClick={() => keys.setHelp(true)} title="Keyboard shortcuts">⌨ <kbd>B</kbd> bids</button>
          <button type="button" className="btn sm ghost" onClick={onLogout}>Sign out</button>
        </span>
      </div>

      <div className="cap-grid">
      {leftRail}
      <div className="cap-center">
      {lot && watched(lot.playerId) && ['reveal', 'bidding'].includes(lot.phase) && (
        <div className="watch-banner">★ A player on your watchlist is on the block</div>
      )}

      <LotStage state={state} now={now} showHistory={cv.showBidHistory !== false} />

      <div className="bid-bar">
        {notice && <div className="bid-notice" role="status">{notice}</div>}
        {leading ? (
          <div className="bid-btn holding" style={{ '--tc': me?.color }} role="status" aria-live="polite">
            <span className="hold-ring" aria-hidden="true" />
            <TeamLogo team={me} size={46} />
            <span className="hold-text">
              <span className="k2">Top bid is yours</span>
              <span className="tiny">Others can still raise it</span>
            </span>
            <span className="v"><RollingNumber value={lot.amount} money /> <span className="mono" style={{ fontSize: 13, letterSpacing: '0.1em' }}>{state.currency}</span></span>
          </div>
        ) : (
          <button type="button" data-kbd="b" data-kbd-label="B" data-kbd-name="Bid" className={`bid-btn ${bumped ? 'bumped' : ''}`} disabled={!!reason || pending || bumped} onClick={placeBid}>
            {pending ? 'Sending…' : reason || (
              <>
                <span className="k">{bumped ? 'New price' : 'Bid'}</span>
                <span className="v"><RollingNumber value={lot.nextAmount} money /> <span className="mono" style={{ fontSize: 13, letterSpacing: '0.1em' }}>{state.currency}</span></span>
              </>
            )}
          </button>
        )}
      </div>

      {rivals.length > 0 && (
        <div className="rivals narrow-only" aria-label="Teams that can outbid you">
          <span className="label">Can outbid you</span>
          {rivals.map((t) => (
            <div key={t.id} className={`rival ${t.id === lot.leaderId ? 'lead' : ''}`} style={{ '--tc': t.color }}>
              <TeamLogo team={t} size={30} />
              <b className="ellipsis">{t.shortName || t.name}</b>
              {t.id === lot.leaderId && <span className="rival-tag">Leading</span>}
              <span className="mono small">max {money(t.maxBid, state.currency)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="tabs">
        {cv.showSquadBuilder !== false && <button type="button" className={tab === 'squad' ? 'on' : ''} onClick={() => setTab('squad')}>My squad</button>}
        <button type="button" className={tab === 'teams' ? 'on' : ''} onClick={() => setTab('teams')}>Other teams</button>
        {cv.showUpcoming && <button type="button" className={tab === 'next' ? 'on' : ''} onClick={() => setTab('next')}>Up next</button>}
      </div>

      {tab === 'squad' && cv.showSquadBuilder !== false && (
        planData ? <SquadBuilder team={me} currency={state.currency} plan={planData.plan} formations={planData.formations} onChange={updatePlan} /> : <Spinner />
      )}
      {tab === 'teams' && (
        <div className="stack">
          <PurseStrip state={{ ...state, teams: others }} />
          {others.some((t) => t.squad) && (
            <div className="purse-strip">{others.map((t) => <SquadCard key={t.id} team={t} currency={state.currency} />)}</div>
          )}
        </div>
      )}
      {tab === 'next' && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
          {state.upcoming.length === 0 && <span className="muted">Nothing in the queue.</span>}
          {state.upcoming.map((p) => (
            <button type="button" key={p.id} style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => toggleWatch(p.id)}>
              <MiniPlayer player={p} extra={watched(p.id) ? ' ★' : ''} />
            </button>
          ))}
          <p className="muted small" style={{ gridColumn: '1 / -1' }}>Tap a player to add them to your watchlist (★). You will get a heads-up when they come up.</p>
        </div>
      )}
      </div>
      {rightRail}
      </div>
      <div style={{ height: 30 }} />
      <SoldOverlay state={state} />
    </main>
  );
}

export default function Captain() {
  const [auth, setAuth] = useState(() => session.get('captain'));
  const logout = () => {
    session.clear('captain');
    setAuth(null);
  };
  if (!auth) return <CaptainLogin onLogin={() => setAuth(session.get('captain'))} />;
  return <CaptainRoom key={auth.token} auth={auth} onLogout={logout} />;
}
