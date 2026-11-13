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
  Field, MiniPlayer, Spinner, TeamLogo, useAction, useToast,
} from '../components/ui.jsx';
import { RollingNumber } from '../components/fx.jsx';

/* --------------------------------- login --------------------------------- */
function CaptainLogin({ onLogin }) {
  const [teams, setTeams] = useState(null);
  const [teamId, setTeamId] = useState('');
  const [password, setPassword] = useState('');
  const [run, busy] = useAction();
  useEffect(() => {
    api('/teams').then(setTeams).catch(() => setTeams([]));
  }, []);
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

function SquadBuilder({ team, currency, plan, formations, onChange }) {
  const squad = team?.squad || [];
  const slots = useMemo(() => formationSlots(plan.formation), [plan.formation]);
  const [sel, setSel] = useState(null);

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
    for (const s of slots) {
      if (out[s.id]) continue;
      const p = squad.find((x) => x.position === s.position && !used.has(x.id));
      if (p) {
        out[s.id] = p.id;
        used.add(p.id);
      }
    }
    return out;
  }, [slots, squad, plan.lineup]);

  const onPitch = new Set(Object.values(lineup));
  const bench = squad.filter((p) => !onPitch.has(p.id));
  const byId = Object.fromEntries(squad.map((p) => [p.id, p]));

  const assign = (slotId, playerId) => {
    const next = { ...lineup };
    for (const [k, v] of Object.entries(next)) if (v === playerId) delete next[k];
    if (playerId) next[slotId] = playerId;
    onChange({ ...plan, lineup: next });
    setSel(null);
  };

  const counts = squad.reduce((m, p) => ({ ...m, [p.position]: (m[p.position] || 0) + 1 }), {});

  return (
    <div className="stack">
      <div className="row wrap">
        <select className="input" style={{ width: 'auto' }} value={plan.formation} onChange={(e) => onChange({ ...plan, formation: e.target.value })}>
          {formations.map((f) => <option key={f}>{f}</option>)}
        </select>
        {['Goalkeeper', 'Defender', 'Midfielder', 'Forward'].map((p) => <span key={p} className="chip">{POS_SHORT[p]} {counts[p] || 0}</span>)}
        <span className="chip">{squad.length} player{squad.length === 1 ? '' : 's'}</span>
      </div>
      <div className="pitch">
        <span className="box" style={{ top: 0, borderTop: 0 }} />
        <span className="box" style={{ bottom: 0, borderBottom: 0 }} />
        {slots.map((s) => {
          const p = byId[lineup[s.id]];
          return (
            <button type="button" key={s.id} className={`slot ${p ? '' : 'empty'} ${sel === s.id ? 'sel' : ''}`} style={{ left: `${s.x}%`, top: `${s.y}%`, background: 'none', border: 0, color: 'inherit' }} onClick={() => setSel(sel === s.id ? null : s.id)}>
              <span className="face">{p?.thumbUrl ? <img src={assetUrl(p.thumbUrl)} alt="" /> : POS_SHORT[s.position]}</span>
              <span className="nm">{p ? p.name.split(' ')[0] : 'Empty'}</span>
            </button>
          );
        })}
      </div>
      <p className="muted small">{sel ? 'Now tap a bench player to put them in this spot (or tap the spot again to cancel).' : 'Tap a spot on the pitch, then a bench player, to change your lineup. Only you can see this.'}</p>
      <div>
        <div className="label" style={{ marginBottom: 4 }}>Bench</div>
        {bench.length === 0 && <div className="tiny" style={{ padding: '10px 0' }}>No bench players</div>}
        {bench.map((p) => (
          <button type="button" key={p.id} className="bench-row" style={{ cursor: sel ? 'pointer' : 'default', color: sel ? 'var(--bone)' : undefined }} onClick={() => sel && assign(sel, p.id)}>
            <span className="label">{POS_SHORT[p.position]}</span>
            <span className="ellipsis">{p.name}{p.retained ? ' · R' : ''}</span>
            <span className="mono small muted">{money(p.price, currency)}</span>
          </button>
        ))}
        {sel && lineup[sel] && <button type="button" className="btn sm ghost" onClick={() => assign(sel, null)}>Move to bench</button>}
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
    if (!lot || pending) return;
    setPending(true);
    navigator.vibrate?.(25);
    const res = await emit('bid', { lotSeq: lot.seq, amount: lot.nextAmount });
    setPending(false);
    if (res?.lot) mergeLot(res.lot, res.v);
    if (!res?.ok) toast(explain(res?.code), 'error');
  };

  const others = state.teams.filter((t) => t.id !== auth.team.id);

  return (
    <main className="container studio" style={{ paddingBottom: 0, paddingTop: 80 }}>
      <div className="studio-bg" />
      <div className="cap-head" style={{ borderBottom: `2px solid ${me?.color || 'var(--rule)'}` }}>
        <TeamLogo team={me} size={48} />
        <div style={{ minWidth: 0 }}>
          <div className="display ellipsis" style={{ fontSize: 30 }}>{me?.name}</div>
          <span className="tiny">{me?.count} player{me?.count === 1 ? '' : 's'} · max bid {money(state.me?.maxBidForLot ?? me?.maxBid, state.currency)}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="money"><RollingNumber value={me?.purse ?? 0} /></div>
          <span className="tiny">{state.currency} left</span>
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: -14 }}>
        {connected ? <span className="tiny" style={{ color: 'var(--go)' }}>● Connected</span> : <span className="tiny" style={{ color: 'var(--amber)' }}>● Reconnecting</span>}
        <button type="button" className="btn sm ghost" onClick={onLogout}>Sign out</button>
      </div>

      {lot && watched(lot.playerId) && ['reveal', 'bidding'].includes(lot.phase) && (
        <div className="watch-banner">★ A player on your watchlist is on the block</div>
      )}

      <LotStage state={state} now={now} showHistory={cv.showBidHistory !== false} />

      <div className="bid-bar">
        <button type="button" className={`bid-btn ${leading ? 'leading' : ''}`} disabled={!!reason || leading || pending} onClick={placeBid}>
          {leading ? '✓ You lead' : pending ? 'Sending…' : reason || (
            <>
              <span className="k">Bid</span>
              <span className="v"><RollingNumber value={lot.nextAmount} /> <span className="mono" style={{ fontSize: 13, letterSpacing: '0.1em' }}>{state.currency}</span></span>
            </>
          )}
        </button>
      </div>

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
