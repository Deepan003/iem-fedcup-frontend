import { useEffect, useState } from 'react';
import { explain } from '../../lib/api.js';
import { money, teamById, POS_SHORT } from '../../lib/format.js';
import LotStage from '../../components/LotStage.jsx';
import { PurseStrip } from '../../components/Teams.jsx';
import {
  Field, Spinner, TeamLogo, useToast,
} from '../../components/ui.jsx';
import { useAdmin } from './AdminApp.jsx';

export default function Control() {
  const { auction } = useAdmin();
  const {
    state, connected, viewers, now, emit,
  } = auction;
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [teamId, setTeamId] = useState('');
  const [amount, setAmount] = useState('');
  const [pick, setPick] = useState('');

  const lot = state?.lot;
  useEffect(() => {
    // Pre-fill the amount box with the next valid bid.
    if (lot?.phase === 'bidding' || lot?.phase === 'reveal') setAmount(String(lot.nextAmount ?? ''));
  }, [lot?.seq, lot?.nextAmount, lot?.phase]);

  if (!state) return <Spinner />;

  const act = async (action, args = {}, { confirm, ok } = {}) => {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    const res = await emit('admin', { action, args });
    setBusy(false);
    if (!res?.ok) toast(explain(res?.code), 'error', 5000);
    else if (ok) toast(ok, 'ok');
  };

  const leader = teamById(state, lot?.leaderId);
  const phase = lot?.phase;
  const open = ['reveal', 'bidding', 'awaiting'].includes(phase);
  const live = state.status === 'live';
  const queue = state.upcoming || [];

  return (
    <>
      <h1>Control room</h1>
      <div className="status-bar">
        <span className="chip" style={{ color: connected ? '#86efac' : '#fca5a5' }}><span className="dot" />{connected ? 'Connected' : 'Disconnected'}</span>
        <span className="chip">Status: <b>{state.status}</b>{state.paused ? ' (paused)' : ''}</span>
        <span className="chip">Mode: <b>{state.mode}</b></span>
        <span className="chip">Round {state.round}</span>
        <span className="chip">{state.stats.sold} sold · {state.stats.unsold} unsold · {state.stats.available} left</span>
        {viewers && <span className="chip">👁 {viewers.public} viewers · {viewers.captains} captains</span>}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="ctl-actions">
          {!live && <button type="button" className="btn ok" disabled={busy} onClick={() => act('start', {}, { ok: 'Auction is live' })}>▶ Start auction</button>}
          {live && !state.paused && <button type="button" className="btn" disabled={busy} onClick={() => act('pause')}>❚❚ Pause</button>}
          {live && state.paused && <button type="button" className="btn ok" disabled={busy} onClick={() => act('resume')}>▶ Resume</button>}
          <button type="button" className="btn" disabled={busy || phase === 'bidding'} onClick={() => act('setMode', { mode: state.mode === 'online' ? 'manual' : 'online' })}>
            Switch to {state.mode === 'online' ? 'manual (offline) bidding' : 'online bidding'}
          </button>
          <button type="button" className="btn" disabled={busy || open || !state.recentSales.length} onClick={() => act('undoLastSale', {}, { confirm: 'Undo the most recent sale? The player goes back to the pool and the money is returned.', ok: 'Sale undone' })}>↶ Undo last sale</button>
          <button type="button" className="btn" disabled={busy || open || !state.stats.unsold} onClick={() => act('startUnsoldRound', {}, { confirm: 'Put all unsold players back in the queue for a new round?' })}>↻ Unsold round</button>
          {live && <button type="button" className="btn danger" disabled={busy || open} onClick={() => act('end', {}, { confirm: 'End the auction?' })}>■ End auction</button>}
        </div>
      </div>

      <div className="cols-2">
        <div className="stack">
          <div className="card stack">
            <LotStage state={state} now={now} />

            {/* Phase-specific controls */}
            {live && !open && (
              <div className="ctl-actions">
                <button type="button" className="btn primary big-confirm" disabled={busy || !queue.length} onClick={() => act('loadLot')}>
                  Next player{queue[0] ? `: ${queue[0].name}` : ''}
                </button>
                <select className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">…or pick a player</option>
                  {queue.map((p) => <option key={p.id} value={p.id}>{POS_SHORT[p.position]} · {p.name}</option>)}
                  {(state.unsold || []).map((p) => <option key={p.id} value={p.id}>UNSOLD · {p.name}</option>)}
                </select>
                <button type="button" className="btn" disabled={busy || !pick} onClick={() => { act('loadLot', { playerId: pick }); setPick(''); }}>Load picked player</button>
              </div>
            )}

            {phase === 'reveal' && (
              <div className="ctl-actions">
                <button type="button" className="btn primary big-confirm" disabled={busy || state.paused} onClick={() => act('openBidding')}>🔨 Open bidding</button>
                <button type="button" className="btn" disabled={busy} onClick={() => act('markUnsold', {}, { confirm: 'Mark this player unsold without bidding?' })}>Mark unsold</button>
                <button type="button" className="btn ghost" disabled={busy} onClick={() => act('withdrawLot')}>Withdraw (back to queue)</button>
              </div>
            )}

            {phase === 'bidding' && (
              <div className="ctl-actions">
                <button type="button" className="btn gold big-confirm" disabled={busy} onClick={() => act('closeBidding')}>🔨 Close bidding</button>
                <button type="button" className="btn" disabled={busy} onClick={() => act('extend', { seconds: 10 })}>+10 seconds</button>
                <button type="button" className="btn" disabled={busy || !lot.bidCount} onClick={() => act('undoLastBid', {}, { confirm: 'Remove the latest bid?' })}>↶ Undo last bid</button>
                <button type="button" className="btn ghost" disabled={busy} onClick={() => act('withdrawLot', {}, { confirm: 'Withdraw this player? All bids on this lot are discarded.' })}>Withdraw lot</button>
              </div>
            )}

            {phase === 'awaiting' && (
              <div className="stack">
                <div className="ctl-actions">
                  <button type="button" className="btn ok big-confirm" disabled={busy || !leader} onClick={() => act('confirmSale', {}, { ok: 'Sold!' })}>
                    ✓ Confirm SOLD{leader ? ` to ${leader.shortName || leader.name} for ${money(lot.amount, state.currency)}` : ''}
                  </button>
                  <button type="button" className="btn" disabled={busy} onClick={() => act('reopenBidding')}>Reopen bidding</button>
                  <button type="button" className="btn" disabled={busy || !lot.bidCount} onClick={() => act('undoLastBid', {}, { confirm: 'Remove the latest bid?' })}>↶ Undo last bid</button>
                  <button type="button" className="btn danger" disabled={busy} onClick={() => act('markUnsold', {}, { confirm: 'Mark this player UNSOLD?' })}>✕ Mark unsold</button>
                </div>
                {!leader && <p className="muted small" style={{ margin: 0 }}>No bids were placed. Mark the player unsold or reopen bidding.</p>}
              </div>
            )}

            {(phase === 'bidding' || phase === 'awaiting' || (phase === 'reveal' && state.mode === 'manual')) && (
              <div className="card" style={{ background: 'var(--bg-2)' }}>
                <h2>{state.mode === 'manual' ? 'Record result from the room' : 'Bid on behalf of a team'}</h2>
                <div className="form-grid">
                  <Field label="Team">
                    <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                      <option value="">Choose team…</option>
                      {state.teams.map((t) => <option key={t.id} value={t.id}>{t.name} (max {money(t.maxBid, state.currency)})</option>)}
                    </select>
                  </Field>
                  <Field label="Amount"><input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} /></Field>
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
                      act('manualSale', { teamId, amount: Number(amount) }, { confirm: `Confirm SOLD: ${lot.player?.name} → ${t?.name} for ${amount}?`, ok: 'Sold!' });
                    }}
                  >
                    ✓ Confirm sold to this team
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h2>Teams</h2>
            <div className="table-wrap" style={{ maxHeight: 'none' }}>
              <table className="table">
                <thead><tr><th>Team</th><th>Players</th><th>Purse</th><th>Max bid</th></tr></thead>
                <tbody>
                  {state.teams.map((t) => (
                    <tr key={t.id} style={{ outline: lot?.leaderId === t.id && open ? `2px solid ${t.color}` : undefined }}>
                      <td><span className="row"><TeamLogo team={t} size={24} /><span className="ellipsis">{t.shortName || t.name}</span>{t.frozen && <span className="chip">frozen</span>}</span></td>
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
                  <TeamLogo team={t} size={22} />
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
    </>
  );
}
