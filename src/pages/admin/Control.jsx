import { SaleMoments, UnsoldMoment } from '../../components/Moments.jsx';
import { PositionIntro } from '../../components/Positions.jsx';
import { AssignPanel, PlayerSlider } from '../../components/ControlExtras.jsx';
import { JoinMoment, JoinedStrip } from '../../components/Presence.jsx';
import { useEffect, useState } from 'react';
import { explain } from '../../lib/api.js';
import { money, teamById, POS_SHORT } from '../../lib/format.js';
import LotStage from '../../components/LotStage.jsx';
import { PurseStrip } from '../../components/Teams.jsx';
import {
  Avatar, Field, Spinner, TeamLogo, useToast, MoneyInput, useAction,
} from '../../components/ui.jsx';
import { useAdmin } from './AdminApp.jsx';
import { useConfirm } from '../../components/Dialog.jsx';
import { SoundDock, useAuctionSound } from '../../components/Sound.jsx';
import { screenChoices, screensaverActive } from '../../components/Screensaver.jsx';
import { AuctionProgress } from '../../components/Live.jsx';
import { ShortcutHelp, useShortcuts } from '../../lib/shortcuts.jsx';

/** Team name cell with a quick ✎ rename (name + short name), saved for every screen at once. */
function TeamNameCell({ team }) {
  const { call } = useAdmin();
  const [run, busy] = useAction();
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(team.name);
  const [short, setShort] = useState(team.shortName || '');
  const open = () => { setName(team.name); setShort(team.shortName || ''); setEdit(true); };
  const save = () => run(async () => {
    await call(`/admin/teams/${team.id}`, { method: 'PUT', body: { name: name.trim(), shortName: short.trim() } });
    setEdit(false);
  }, 'Team name saved');
  const keys = (e) => {
    if (e.key === 'Enter' && name.trim()) save();
    if (e.key === 'Escape') setEdit(false);
  };
  if (!edit) {
    return (
      <span className="row">
        <TeamLogo team={team} size={24} />
        <span className="ellipsis" title={team.name}>{team.shortName || team.name}</span>
        {team.frozen && <span className="chip">frozen</span>}
        <button type="button" className="btn sm ghost tn-edit" onClick={open} aria-label={`Rename ${team.name}`} title="Rename team">✎ Rename</button>
      </span>
    );
  }
  return (
    <span className="tn-form">
      {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
      <input className="input" autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={keys} aria-label="Team name" placeholder="Team name" />
      <input className="input tn-short" value={short} maxLength={5} onChange={(e) => setShort(e.target.value.toUpperCase())} onKeyDown={keys} aria-label="Short name" placeholder="Short" />
      <button type="button" className="btn sm primary" disabled={busy || !name.trim()} onClick={save}>Save</button>
      <button type="button" className="btn sm ghost" onClick={() => setEdit(false)} aria-label="Cancel">✕</button>
    </span>
  );
}

/** Control-room picker: put the studio screensaver on, and choose exactly which screen it shows. */
function ScreensaverControl() {
  const { call, auction } = useAdmin();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const sc = auction.state?.screens;
  const showing = screensaverActive(auction.state);
  const choices = screenChoices(auction.state);
  const save = async (patch, msg) => {
    setBusy(true);
    try {
      const s = await call('/admin/settings');
      await call('/admin/settings/screens', { method: 'PUT', body: { ...s.screens, enabled: true, ...patch } });
      if (msg) toast(msg, 'ok');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const pick = (v) => {
    const label = choices.find(([k]) => k === v)?.[1] || 'rotation';
    // picking one screen puts it on the studio straight away; "rotate" just changes what shows
    if (v) save({ show: v, forceOn: true }, `Studio now showing: ${label}`);
    else save({ show: '' }, 'Screensaver will rotate the ticked screens');
  };
  return (
    <span className={`chip upnext-ctl ss-ctl ${showing ? 'ss-on' : ''}`} title="Which screens rotate, and how long each shows, is set in Rules & views">
      {showing ? (sc?.forceOn ? '● Screensaver on' : '● Screensaver (auto)') : 'Screensaver'}
      <select className="ss-pick" value={sc?.show || ''} disabled={busy} onChange={(e) => pick(e.target.value)} aria-label="Screen to show on the studio">
        {choices.map(([v, l]) => <option key={v || 'rotate'} value={v}>{l}</option>)}
      </select>
      <button
        type="button"
        disabled={busy}
        className={sc?.forceOn ? 'on' : ''}
        onClick={() => (sc?.forceOn ? save({ forceOn: false, show: '' }, 'Screensaver stopped') : save({ forceOn: true }, 'Screensaver is on the studio'))}
      >
        {sc?.forceOn ? 'Stop' : 'Show now'}
      </button>
      <label className="ss-auto" title="Show the screensaver automatically while the auction is paused">
        <input type="checkbox" checked={!!sc?.onPause} disabled={busy} onChange={(e) => save({ onPause: e.target.checked }, e.target.checked ? 'Screensaver will show whenever you pause' : 'Screensaver will no longer show on pause')} />
        Auto on pause
      </label>
    </span>
  );
}

/** Plays a test chime + voice on every studio / public screen that has sound on. */
function SoundCheckButton() {
  const { call } = useAdmin();
  const [run, busy] = useAction();
  return (
    <button
      type="button"
      className="chip upnext-ctl snd-check"
      disabled={busy}
      title="Every studio and public screen with sound on plays a chime and says 'Sound check'. If the projector stays silent, click once on the studio page."
      onClick={() => run(async () => {
        const s = await call('/admin/settings');
        await call('/admin/settings/audio', { method: 'PUT', body: { ...s.audio, soundCheck: Date.now() } });
      }, 'Sound check sent: listen to the studio')}
    >
      🔊 Sound check
    </button>
  );
}

/** Quick switch: how many "Up next" players the studio and captains see (Off / 1 / 2 / 3 / 5). */
function UpNextControl() {
  const { call, auction } = useAdmin();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [cur, setCur] = useState(null);
  useEffect(() => {
    call('/admin/settings').then((s) => setCur(s.studio.showUpcoming ? s.studio.upcomingCount : 0)).catch(() => {});
  }, [call, auction.state?.dataV]);
  const choose = async (n) => {
    setBusy(true);
    try {
      const s = await call('/admin/settings');
      await call('/admin/settings/studio', { method: 'PUT', body: { ...s.studio, showUpcoming: n > 0, upcomingCount: n || s.studio.upcomingCount } });
      await call('/admin/settings/captainView', { method: 'PUT', body: { ...s.captainView, showUpcoming: n > 0, upcomingCount: n || s.captainView.upcomingCount } });
      setCur(n);
      toast(n ? `Up next: showing ${n} player${n > 1 ? 's' : ''}` : 'Up next hidden', 'ok');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="chip upnext-ctl">
      Up next
      {[0, 1, 2, 3, 5].map((n) => <button key={n} type="button" disabled={busy} className={cur === n ? 'on' : ''} onClick={() => choose(n)}>{n === 0 ? 'Off' : n}</button>)}
    </span>
  );
}

export default function Control() {
  const { auction } = useAdmin();
  const {
    state, connected, viewers, now, emit, presence, joinEvent,
  } = auction;
  const snd = useAuctionSound(state, now, { surface: 'admin' }); // off by default: the auctioneer can monitor
  const toast = useToast();
  const ask = useConfirm();
  const [busy, setBusy] = useState(false);
  const [teamId, setTeamId] = useState('');
  const [amount, setAmount] = useState('');
  const [pick, setPick] = useState('');

  const lot = state?.lot;
  useEffect(() => {
    // Pre-fill the amount box with the next valid bid.
    if (lot?.phase === 'bidding' || lot?.phase === 'reveal') setAmount(lot.nextAmount ?? '');
  }, [lot?.seq, lot?.nextAmount, lot?.phase]);

  const keys = useShortcuts(); // N / O / C / T / R / P, S sold, U unsold, Z undo bid, ? = list
  if (!state) return <Spinner />;

  const act = async (action, args = {}, { confirm, ok } = {}) => {
    if (confirm && !(await ask(confirm))) return;
    setBusy(true);
    const res = await emit('admin', { action, args });
    setBusy(false);
    if (!res?.ok) toast(explain(res?.code), 'error', 5000);
    else if (ok) toast(ok, 'ok');
    return !!res?.ok;
  };

  const leader = teamById(state, lot?.leaderId);
  const phase = lot?.phase;
  const open = ['reveal', 'bidding', 'awaiting'].includes(phase);
  const live = state.status === 'live';
  const queue = state.upcoming || [];

  const ended = state.status === 'ended';
  const phaseLabel = !live ? (ended ? 'Auction ended' : 'Auction not started')
    : state.paused ? 'Paused'
      : !open ? 'Between players: load the next one'
        : phase === 'reveal' ? 'On the block: bidding not open yet'
          : phase === 'bidding' ? 'Bidding is open'
            : 'Bidding closed: confirm the result';
  const phaseTone = !live ? 'idle' : state.paused ? 'paused' : !open ? 'idle' : phase;
  const confirmUndoBid = { title: 'Undo the last bid?', message: 'The latest bid is removed and the previous bidder leads again.', tone: 'warning', confirmLabel: 'Undo bid' };
  const confirmReset = { title: 'Reset ALL bids on this player?', message: 'Every bid is wiped: the player goes back to his base price with no leader and bidding restarts with a fresh timer.', tone: 'danger', confirmLabel: 'Reset all bids' };

  return (
    <div className="ctl2">
      <ShortcutHelp
        open={keys.help}
        onClose={() => keys.setHelp(false)}
        all={[['N', 'Next player'], ['O', 'Open bidding'], ['C', 'Close bidding'], ['T', '+10 seconds'], ['R', 'Reopen bidding'], ['P', 'Pause / resume'], ['S', 'Confirm SOLD'], ['U', 'Mark unsold'], ['Z', 'Undo last bid'], ['X', 'Reset all bids']]}
      />
      <JoinMoment state={state} joinEvent={joinEvent} presence={presence} compact />
      <SaleMoments state={state} compact />
      <UnsoldMoment state={state} compact />
      <PositionIntro state={state} compact />

      {/* 1 · header: title + one status line */}
      <header className="ctl-head">
        <h1 className="ctl-h1">Control room</h1>
        <div className="ctl-status">
          <span className={`chip st-conn ${connected ? 'ok' : 'bad'}`}><span className="dot" />{connected ? 'Connected' : 'Disconnected'}</span>
          <span className={`chip st-${phaseTone}`}><b>{ended ? 'Ended' : !live ? 'Idle' : state.paused ? 'Paused' : 'Live'}</b></span>
          <span className="chip">{state.mode === 'online' ? 'Online bidding' : 'Manual (room)'}</span>
          <span className="chip">Round {state.round}</span>
          <span className="chip"><b>{state.stats.sold}</b>&nbsp;sold · <b>{state.stats.unsold}</b>&nbsp;unsold</span>
          {viewers && <span className="chip">👁 {viewers.public} viewers · {viewers.captains} captains</span>}
        </div>
        <button type="button" className="btn sm ghost kbd-hint-btn" onClick={() => keys.setHelp(true)}>⌨ Shortcuts <kbd>?</kbd></button>
      </header>

      {/* 2 · command dock: always in the same place, pinned while scrolling */}
      <section className={`ctl-dock tone-${phaseTone}`} aria-label="Auction controls">
        <div className="dock-lot">
          <div className="dock-k">
            <span className="dock-dot" aria-hidden="true" />
            <span className="dock-phase">{phaseLabel}</span>
            {lot?.player && open && <b className="dock-who">· {lot.player.name} · Lot {String(lot.seq).padStart(3, '0')}</b>}
          </div>
          <div className="dock-btns">
            {!live && !ended && <button type="button" className="btn ok dock-main" disabled={busy} onClick={() => act('start', {}, { ok: 'Auction is live' })}>▶ Start auction</button>}
            {live && !open && (
              <>
                <button type="button" data-kbd="n" data-kbd-label="N" data-kbd-name="Next player" className="btn primary dock-main" disabled={busy || !queue.length} onClick={() => act('loadLot')}>
                  Next player{queue[0] ? `: ${queue[0].name}` : ''}
                </button>
                <span className="dock-pick">
                  <select className="input" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Pick a player">
                    <option value="">…or pick a player</option>
                    {queue.map((p) => <option key={p.id} value={p.id}>{POS_SHORT[p.position]} · {p.name}</option>)}
                    {(state.unsold || []).map((p) => <option key={p.id} value={p.id}>UNSOLD · {p.name}</option>)}
                  </select>
                  <button type="button" className="btn" disabled={busy || !pick} onClick={() => { act('loadLot', { playerId: pick }); setPick(''); }}>Load</button>
                </span>
              </>
            )}
            {live && phase === 'reveal' && (
              <>
                <button type="button" data-kbd="o" data-kbd-label="O" data-kbd-name="Open bidding" className="btn primary dock-main" disabled={busy || state.paused} onClick={() => act('openBidding')}>🔨 Open bidding</button>
                <button type="button" data-kbd="shift+u" data-kbd-label="U" data-kbd-name="Mark unsold" className="btn" disabled={busy} onClick={() => act('markUnsold', {}, { confirm: { title: 'Mark unsold?', message: 'This player is marked unsold without any bidding.', tone: 'warning', confirmLabel: 'Mark unsold' } })}>✕ Mark unsold</button>
                <button type="button" className="btn ghost" disabled={busy} onClick={() => act('withdrawLot')}>Withdraw (back to queue)</button>
              </>
            )}
            {live && phase === 'bidding' && (
              <>
                <button type="button" data-kbd="c" data-kbd-label="C" data-kbd-name="Close bidding" className="btn gold dock-main" disabled={busy} onClick={() => act('closeBidding')}>🔨 Close bidding</button>
                <button type="button" data-kbd="t" data-kbd-label="T" data-kbd-name="+10 seconds" className="btn" disabled={busy} onClick={() => act('extend', { seconds: 10 })}>+10 seconds</button>
                <button type="button" data-kbd="shift+z" data-kbd-label="Z" data-kbd-name="Undo last bid" className="btn" disabled={busy || !lot.bidCount} onClick={() => act('undoLastBid', {}, { confirm: confirmUndoBid })}>↶ Undo last bid</button>
                <button type="button" data-kbd="shift+x" data-kbd-label="X" data-kbd-name="Reset all bids" className="btn" disabled={busy || !lot.bidCount} onClick={() => act('resetBids', {}, { confirm: confirmReset })}>⟲ Reset all bids</button>
                <button type="button" className="btn ghost" disabled={busy} onClick={() => act('withdrawLot', {}, { confirm: { title: 'Withdraw this player?', message: 'All bids on this lot are discarded and the player returns to the queue.', tone: 'warning', confirmLabel: 'Withdraw' } })}>Withdraw</button>
              </>
            )}
            {live && phase === 'awaiting' && (
              <>
                <button type="button" data-kbd="shift+s" data-kbd-label="S" data-kbd-name="Confirm SOLD" className="btn ok dock-main" disabled={busy || !leader} onClick={() => act('confirmSale', {}, { ok: 'Sold!' })}>
                  ✓ Confirm SOLD{leader ? ` to ${leader.shortName || leader.name} · ${money(lot.amount, state.currency)}` : ''}
                </button>
                <button type="button" data-kbd="r" data-kbd-label="R" data-kbd-name="Reopen bidding" className="btn" disabled={busy} onClick={() => act('reopenBidding')}>Reopen bidding</button>
                <button type="button" data-kbd="shift+z" data-kbd-label="Z" data-kbd-name="Undo last bid" className="btn" disabled={busy || !lot.bidCount} onClick={() => act('undoLastBid', {}, { confirm: confirmUndoBid })}>↶ Undo last bid</button>
                <button type="button" data-kbd="shift+x" data-kbd-label="X" data-kbd-name="Reset all bids" className="btn" disabled={busy || !lot.bidCount} onClick={() => act('resetBids', {}, { confirm: confirmReset })}>⟲ Reset all bids</button>
                <button type="button" data-kbd="shift+u" data-kbd-label="U" data-kbd-name="Mark unsold" className="btn danger" disabled={busy} onClick={() => act('markUnsold', {}, { confirm: { title: 'Mark unsold?', message: 'Bidding is over and this player is marked unsold.', tone: 'warning', confirmLabel: 'Mark unsold' } })}>✕ Mark unsold</button>
              </>
            )}
            {ended && <span className="dock-note">Auction ended. Use “Assign unsold players” below, or Report &amp; PDF for the results.</span>}
          </div>
          {live && phase === 'awaiting' && !leader && <p className="dock-hint">No bids were placed. Mark the player unsold or reopen bidding.</p>}
          {lot?.player && !lot.player.tier && ['reveal', 'bidding'].includes(lot.phase) && (
            <p className="dock-hint">⚠ {lot.player.name} has no tier, so he opens at the default base {money(lot.base ?? lot.player.basePrice, state.currency)}.</p>
          )}
        </div>

        <div className="dock-global">
          <div className="dock-k">Auction</div>
          <div className="dock-btns">
            {live && !state.paused && <button type="button" data-kbd="p" data-kbd-label="P" data-kbd-name="Pause" className="btn" disabled={busy} onClick={() => act('pause')}>❚❚ Pause</button>}
            {live && state.paused && <button type="button" data-kbd="p" data-kbd-label="P" data-kbd-name="Resume" className="btn ok" disabled={busy} onClick={() => act('resume')}>▶ Resume</button>}
            <button type="button" className="btn" disabled={busy || phase === 'bidding'} onClick={() => act('setMode', { mode: state.mode === 'online' ? 'manual' : 'online' })}>
              {state.mode === 'online' ? 'Go manual' : 'Go online'}
            </button>
            <button type="button" className="btn" disabled={busy || open || !state.recentSales.length} onClick={() => act('undoLastSale', {}, { confirm: { title: 'Undo the last sale?', message: 'The player goes back into the pool and the team gets its money back.', tone: 'warning', confirmLabel: 'Undo sale' }, ok: 'Sale undone' })}>↶ Undo last sale</button>
            <button type="button" className="btn" disabled={busy || open || !state.stats.unsold} onClick={() => act('startUnsoldRound', {}, { confirm: { title: 'Start an unsold round?', message: 'All unsold players go back into the queue for another round.', confirmLabel: 'Start round' } })}>↻ Unsold round</button>
            {live && <button type="button" className="btn danger dock-end" disabled={busy || open} onClick={() => act('end', {}, { confirm: { title: 'End the auction?', message: 'Bidding stops. You can still undo sales and export the results afterwards.', tone: 'danger', confirmLabel: 'End auction' } })}>■ End auction</button>}
          </div>
        </div>
      </section>

      {/* 3 · screens & sound: one tidy row */}
      <section className="ctl-tools" aria-label="Screens and sound">
        <AuctionProgress state={state} compact />
        <span className="chip ctl-presence"><JoinedStrip state={state} presence={presence} label="Teams online" /></span>
        <UpNextControl />
        <ScreensaverControl />
        <SoundCheckButton />
      </section>

      <PlayerSlider state={state} busy={busy} canLoad={live && !open} onLoad={(id) => act('loadLot', { playerId: id })} />

      {/* 4 · the player on the block + room / proxy entry | teams, sales, queue */}
      <div className="cols-2 ctl-main">
        <div className="stack">
          <div className="card ctl-lot">
            <LotStage state={state} now={now} />
          </div>

          {(phase === 'bidding' || phase === 'awaiting' || (phase === 'reveal' && state.mode === 'manual')) && (
            <div className="card ctl-proxy">
              <h2>{state.mode === 'manual' ? 'Record result from the room' : 'Bid on behalf of a team'}</h2>
              <div className="form-grid">
                <Field label="Team">
                  <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                    <option value="">Choose team…</option>
                    {state.teams.map((t) => <option key={t.id} value={t.id}>{t.name} (max {money(t.maxBid, state.currency)})</option>)}
                  </select>
                </Field>
                <Field label="Amount"><MoneyInput value={amount} onChange={setAmount} /></Field>
              </div>
              <div className="row wrap" style={{ marginTop: 10 }}>
                {phase === 'bidding' && (
                  <button type="button" className="btn" disabled={busy || !teamId || !amount} onClick={() => act('proxyBid', { teamId, amount: Number(amount), lotSeq: lot.seq }, { ok: 'Bid placed' })}>Place bid</button>
                )}
                <button
                  type="button"
                  className="btn ok"
                  disabled={busy || !teamId || !amount}
                  onClick={() => {
                    const t = teamById(state, teamId);
                    act('manualSale', { teamId, amount: Number(amount) }, { confirm: { title: 'Confirm sale', message: `${lot.player?.name} → ${t?.name} for ${money(amount, state.currency)}.`, confirmLabel: 'Confirm sold' }, ok: 'Sold!' });
                  }}
                >
                  ✓ Confirm sold to this team
                </button>
              </div>
            </div>
          )}
          {(ended || (live && !open)) && <AssignPanel state={state} busy={busy} act={act} />}
        </div>

        <div className="stack">
          <div className="card">
            <h2>Teams</h2>
            <div className="table-wrap" style={{ maxHeight: 'none' }}>
              <table className="table ctl-teams">
                <thead><tr><th>Team</th><th>Players</th><th>Purse</th><th>Max bid</th></tr></thead>
                <tbody>
                  {state.teams.map((t) => (
                    <tr key={t.id} style={{ outline: lot?.leaderId === t.id && open ? `2px solid ${t.color}` : undefined }}>
                      <td><TeamNameCell key={`${t.name}|${t.shortName}`} team={t} /></td>
                      <td>{t.count}</td>
                      <td>{money(t.purse, state.currency)}</td>
                      <td>{money(t.maxBid, state.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2>Recent sales</h2>
            {state.recentSales.length === 0 && <p className="muted small">None yet</p>}
            {state.recentSales.map((s) => {
              const t = teamById(state, s.teamId);
              return (
                <div key={s.seq} className="list-row small">
                  <Avatar player={s.player} team={t} size={30} />
                  <span className="grow ellipsis"><b>{s.player?.name}</b> → {t?.name}{s.via !== 'auction' ? ` (${s.via})` : ''}</span>
                  <b>{money(s.price, state.currency)}</b>
                </div>
              );
            })}
          </div>

          <div className="card">
            <h2>Queue ({queue.length})</h2>
            <div style={{ maxHeight: 320, overflow: 'auto' }}>
              {queue.slice(0, 60).map((p, i) => (
                <div key={p.id} className="list-row small">
                  <span className="muted" style={{ width: 22 }}>{i + 1}</span>
                  <span className="chip">{POS_SHORT[p.position]}</span>
                  <span className="grow ellipsis">{p.name}</span>
                  <span className="muted">{p.tier}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <PurseStrip state={state} />
      </div>
      <SoundDock state={state} sound={snd} surface="admin" />
    </div>
  );
}
