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
import SquadBuilder from '../components/SquadBuilder.jsx';
import PlayerPool from '../components/PlayerPool.jsx';
import { JoinMoment, JoinedStrip } from '../components/Presence.jsx';
import { AuctionProgress } from '../components/Live.jsx';

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
/* ---------------------------------- room --------------------------------- */
function CaptainRoom({ auth, onLogout }) {
  const toast = useToast();
  const {
    state, connected, now, emit, mergeLot, presence, joinEvent,
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

  const keys = useShortcuts(); // B = bid, P = player pool, ? = list
  const [poolOpen, setPoolOpen] = useState(false);
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
  else if (!lot || lot.phase === 'reveal') { // the player card already says 'opens shortly': say something useful instead
    reason = !lot ? 'Waiting for next player' : state.me?.blockReason ? explain(state.me.blockReason) : `Get ready · your max for this player ${money(state.me?.maxBidForLot, state.currency)}`;
  }
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
  const capName = (me?.captainName || '').trim().toLowerCase();
  const capListed = mySquad.some((p) => p.isCaptain || (capName && p.name.trim().toLowerCase() === capName));
  const captainOnly = me?.captainPosition && !capListed;
  // the full squad for the list, captain first (even when the captain is only a name on the team)
  const squadList = capName && !capListed
    ? [{
      id: 'captain', name: me.captainName, position: me.captainPosition || null, isCaptain: true, photoUrl: me.captainPhotoUrl, price: null,
    }, ...mySquad]
    : mySquad.map((p) => (capName && !p.isCaptain && p.name.trim().toLowerCase() === capName ? { ...p, isCaptain: true } : p))
      .sort((a, b) => (b.isCaptain - a.isCaptain) || ((b.price || 0) - (a.price || 0)));
  const posCount = (pos) => mySquad.filter((p) => p.position === pos).length + (captainOnly && me.captainPosition === pos ? 1 : 0);
  const slotsTotal = me?.slotsLeft != null ? (me.count ?? mySquad.length) + me.slotsLeft : null;
  const table = [...state.teams].sort((a, b) => (b.purse ?? 0) - (a.purse ?? 0));
  // Warnings that matter while bidding: squad (almost) full, positions you still have nobody for
  const alerts = [];
  if (me?.slotsLeft === 0) alerts.push({ tone: 'bad', text: `Squad full (${me.count}/${slotsTotal ?? me.count}). You can't bid any more.` });
  else if (me?.slotsLeft != null && me.slotsLeft <= 2) alerts.push({ tone: 'warn', text: `Squad almost full: only ${me.slotsLeft} slot${me.slotsLeft === 1 ? '' : 's'} left.` });
  if (me?.slotsLeft > 0) {
    for (const pos of ['Goalkeeper', 'Defender', 'Midfielder', 'Forward']) {
      if (posCount(pos) > 0) continue;
      const b = state.stats?.byPosition?.[pos];
      const remaining = b ? b.left + b.unsold : null;
      if (remaining == null) continue;
      const word = pos === 'Forward' ? 'forward' : pos.toLowerCase();
      if (remaining === 0) alerts.push({ tone: 'bad', text: `No ${word} in your squad, and none left in the pool.` });
      else if (remaining <= Math.max(4, state.teams.length)) alerts.push({ tone: 'warn', text: `No ${word} yet: only ${remaining} left in the pool.` });
    }
  }
  if (state.me?.blockReason === 'GK_RULE' && lot && ['reveal', 'bidding'].includes(lot.phase)) {
    alerts.unshift({ tone: 'warn', text: "Goalkeeper rule: you already have a goalkeeper, so you can't bid on this one until every team has a goalkeeper." });
  }
  if (me?.slotsLeft > 0 && state.me?.maxBidForLot != null && lot?.nextAmount != null && state.me.maxBidForLot < lot.nextAmount && !leading) {
    alerts.push({ tone: 'warn', text: `Your max bid (${money(state.me.maxBidForLot, state.currency)}) is below the next bid. You need to keep money for your remaining slots.` });
  }

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
      <div className="cs-block cs-list">
          <div className="cs-list-head">
            <span className="label">Your squad</span>
            <b className="cs-count">{me?.count ?? mySquad.length}{slotsTotal != null && <small>/{slotsTotal}</small>}</b>
            {me?.slotsLeft != null && <span className="tiny">{me.slotsLeft} slot{me.slotsLeft === 1 ? '' : 's'} left</span>}
          </div>
          <div className="cs-pos">
            {['Goalkeeper', 'Defender', 'Midfielder', 'Forward'].map((p) => (
              <span key={p} className={posCount(p) ? '' : 'zero'}><b>{posCount(p)}</b>{POS_SHORT[p]}</span>
            ))}
          </div>
          {squadList.map((p) => (
            <div key={p.id} className="cs-row">
              <Avatar player={p} size={26} />
              <span className="ellipsis">{p.name}{p.isCaptain ? ' (C)' : ''}</span>
              <span className="tiny">{POS_SHORT[p.position]}</span>
              <b className="mono small">{p.isCaptain && !p.price ? 'C' : money(p.price, state.currency)}</b>
            </div>
          ))}
          {squadList.length === 0 && <span className="tiny">No players yet</span>}
      </div>
    </aside>
  );
  const rightRail = (
    <aside className="cap-side cap-right" aria-label="Other teams">
      <div className="cs-block cs-presence"><JoinedStrip state={state} presence={presence} label="In the room" /></div>
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
      <JoinMoment state={state} joinEvent={joinEvent} presence={presence} compact />
      {poolOpen && <PlayerPool load={() => api('/captain/pool', { token: auth.token })} teams={state.teams} currency={state.currency} version={`${state.dataV}-${state.stats?.sold}-${state.stats?.unsold}-${state.stats?.retained}`} onClose={() => setPoolOpen(false)} />}
      <div className="studio-bg" />
      <div className="cap-head" style={{ borderBottom: `2px solid ${me?.color || 'var(--rule)'}` }}>
        <TeamLogo team={me} size={48} />
        <div style={{ minWidth: 0 }}>
          <div className="display ellipsis" style={{ fontSize: 30 }}>{me?.name}</div>
          <span className="tiny">{me?.count} player{me?.count === 1 ? '' : 's'} · max bid {money(state.me?.maxBidForLot ?? me?.maxBid, state.currency)}</span>
        </div>
        <div className="cap-head-purse" style={{ textAlign: 'right' }}>
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
      <div className="cap-progress"><span className="label">Still to come</span><AuctionProgress state={state} compact /></div>
      <div className="row cap-tools" style={{ justifyContent: 'space-between' }}>
        {connected ? <span className="tiny" style={{ color: 'var(--go)' }}>● Connected</span> : <span className="tiny" style={{ color: 'var(--amber)' }}>● Reconnecting</span>}
        <span className="row" style={{ gap: 8 }}>
          <SoundDock state={state} sound={snd} surface="captain" inline />
          <button type="button" className="btn sm ghost kbd-hint-btn hide-touch" onClick={() => keys.setHelp(true)} title="Keyboard shortcuts">⌨ <kbd>B</kbd> bids</button>
          <button type="button" className="btn sm ghost" onClick={onLogout}>Sign out</button>
        </span>
      </div>
      </div>

      <div className="cap-grid">
      {leftRail}
      <div className="cap-center">
      {alerts.length > 0 && (
        <div className="cap-alerts" role="status">
          {alerts.slice(0, 3).map((a) => <div key={a.text} className={`cap-alert ${a.tone}`}><span aria-hidden="true">{a.tone === 'bad' ? '⛔' : '⚠'}</span>{a.text}</div>)}
        </div>
      )}
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
        <button type="button" data-kbd="p" data-kbd-label="P" data-kbd-name="Player pool" onClick={() => setPoolOpen(true)}>Player pool</button>
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
