import { useEffect, useRef, useState } from 'react';
import { useTicker } from '../lib/auction.js';
import {
  money, onColor, PHASE_LABEL, POS_SHORT, teamById,
} from '../lib/format.js';
import { PlayerCard, TeamLogo } from './ui.jsx';
import { RollingNumber } from './fx.jsx';

/** Draining broadcast timer bar, synced to the server clock. */
export function Countdown({ lot, now, paused }) {
  const running = lot?.phase === 'bidding' && lot.endsAt != null && !paused;
  useTicker(running, 100);
  const totalRef = useRef({ endsAt: null, total: 1 });
  if (lot?.phase !== 'bidding' || (lot.endsAt == null && lot.remainingMs == null)) return null;
  let remaining = 0;
  if (running) remaining = Math.max(0, lot.endsAt - now());
  else if (lot.remainingMs != null) remaining = lot.remainingMs;
  if (lot.endsAt && totalRef.current.endsAt !== lot.endsAt) {
    totalRef.current = { endsAt: lot.endsAt, total: Math.max(1000, lot.endsAt - now()) };
  }
  const frac = Math.min(1, remaining / totalRef.current.total);
  const secs = remaining / 1000;
  const cls = secs <= 3 ? 'crit' : secs <= 6 ? 'warn' : '';
  return (
    <div className={`timer ${cls}`} aria-label={`${Math.ceil(secs)} seconds left`}>
      <div className="timer-track"><div className="timer-fill" style={{ transform: `scaleX(${frac})` }} /></div>
      <div className="timer-secs">{paused ? '||' : String(Math.ceil(secs)).padStart(2, '0')}</div>
    </div>
  );
}

/** Kinetic SOLD sequence in the buying team's colour. */
export function SoldOverlay({ state }) {
  const [show, setShow] = useState(null);
  const shownSeq = useRef(undefined);
  const lot = state?.lot;
  useEffect(() => {
    if (!state) return;
    if (shownSeq.current === undefined) {
      shownSeq.current = lot?.phase === 'sold' ? lot.seq : null;
      return;
    }
    if (lot?.phase === 'sold' && shownSeq.current !== lot.seq) {
      shownSeq.current = lot.seq;
      setShow({
        team: teamById(state, lot.leaderId), amount: lot.amount, name: lot.player?.name, seq: lot.seq,
      });
    }
  }, [state, lot?.phase, lot?.seq]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!show) return undefined;
    const t = setTimeout(() => setShow(null), 4200);
    return () => clearTimeout(t);
  }, [show]);

  if (!show) return null;
  const c = show.team?.color || '#2bd576';
  const run = 'SOLD — SOLD — SOLD — SOLD — SOLD — ';
  return (
    <div className="sold-fx" style={{ '--c': c, '--fg': onColor(c) }} aria-live="assertive">
      <span className="slab s1" />
      <span className="slab s2" />
      <span className="slab s3" />
      <div className="kinetic k1">{run}{run}</div>
      <div className="kinetic k2">{run}{run}</div>
      <div className="center">
        <div>
          <div className="word"><span>Sold</span></div>
          <div className="who">
            <TeamLogo team={show.team} size={64} />
            <div style={{ textAlign: 'left' }}>
              <b style={{ display: 'block' }}>{show.name}</b>
              <span className="label" style={{ color: 'inherit', opacity: 0.85 }}>{show.team?.name} · {money(show.amount, state.currency)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LowerThird({ team, phase }) {
  if (!team) {
    return (
      <div className="lower-third idle">
        {phase === 'unsold' ? 'No bids — unsold' : phase === 'reveal' ? 'Bidding opens shortly' : 'Waiting for the first bid'}
      </div>
    );
  }
  return (
    <div key={team.id} className="lower-third" style={{ '--c': team.color, '--fg': onColor(team.color) }}>
      <span className="lt-slab" />
      <span className="lt-logo"><TeamLogo team={team} size={44} /></span>
      <span className="lt-text">
        <span className="label" style={{ color: 'inherit', opacity: 0.75 }}>{phase === 'sold' ? 'Bought by' : 'Highest bidder'}</span>
        <span className="lt-name ellipsis">{team.name}</span>
      </span>
    </div>
  );
}

const clock = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour12: false });

/** The player on the block, broadcast style. */
export default function LotStage({ state, now, showHistory = true, children }) {
  const lot = state?.lot;
  const leader = teamById(state, lot?.leaderId);
  const [hit, setHit] = useState(0);
  const prevAmount = useRef(lot?.amount);
  useEffect(() => {
    if (lot?.amount != null && lot.amount !== prevAmount.current) setHit((b) => b + 1);
    prevAmount.current = lot?.amount;
  }, [lot?.amount]);

  if (!lot) {
    const ended = state?.status === 'ended';
    return (
      <div className="empty-stage">
        <span className="label">{ended ? 'Full time' : state?.status === 'live' ? 'Between lots' : 'Pre-match'}</span>
        <div className="display bone-text" style={{ marginTop: 12 }}>
          {ended ? 'Auction complete' : state?.status === 'live' ? 'Next player incoming' : 'Kick-off soon'}
        </div>
        <p className="muted" style={{ marginTop: 14, maxWidth: 520 }}>
          {state?.status === 'live' ? 'The auctioneer is loading the next name. Stay on this screen.' : 'This page goes live the moment the auctioneer starts the auction.'}
        </p>
      </div>
    );
  }

  const phase = lot.phase;
  const hasBid = lot.amount != null;
  const p = lot.player || {};
  return (
    <div className="stage">
      <PlayerCard key={lot.seq} player={p} enter showName={false} />
      <div className="bid-panel">
        <div className="row wrap">
          <span className={`phase ${state.paused ? '' : phase}`}>
            {phase === 'bidding' && !state.paused && <span className="live-dot" />}
            {state.paused ? 'Paused' : PHASE_LABEL[phase]}
          </span>
          <span className="chip">Lot {String(lot.seq).padStart(3, '0')}</span>
        </div>

        <h2 key={`n${lot.seq}`} className="stage-name">
          {p.name?.split(' ').map((w, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <span key={i} className="mask" style={{ display: 'inline-block', marginRight: '0.22em' }}><span style={{ animationDelay: `${0.15 + i * 0.07}s` }}>{w}</span></span>
          ))}
        </h2>

        <div className="meta-row">
          <div><span className="tiny">Pos</span><b>{POS_SHORT[p.position] || '—'}</b></div>
          <div><span className="tiny">Year</span><b>{p.year || '—'}</b></div>
          {p.tier && <div><span className="tiny">Tier</span><b style={{ color: p.tierColor || undefined }}>{p.tier}</b></div>}
          <div><span className="tiny">Base</span><b>{money(lot.base, state.currency)}</b></div>
        </div>

        <div className="price-block">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="label">{phase === 'sold' ? 'Sold for' : hasBid ? 'Current bid' : 'Opening at'}</span>
            {phase === 'bidding' && <span className="label">Next {money(lot.nextAmount, state.currency)} · {lot.bidCount} bid{lot.bidCount === 1 ? '' : 's'}</span>}
          </div>
          <div key={hit} className={`price ${hit ? 'hit' : ''}`}>
            <RollingNumber value={hasBid ? lot.amount : lot.base} />
            <span className="cur">{state.currency}</span>
          </div>
        </div>

        <Countdown lot={lot} now={now} paused={state.paused} />
        <LowerThird team={leader} phase={phase} />

        {phase === 'awaiting' && (
          <div className="label" style={{ color: 'var(--amber)' }}>Bidding closed — awaiting the auctioneer's confirmation</div>
        )}

        {children}

        {showHistory && lot.history?.length > 0 && (
          <div className="history">
            {lot.history.map((h) => {
              const t = teamById(state, h.teamId);
              return (
                <div key={`${h.at}-${h.amount}`} className="history-row">
                  <TeamLogo team={t} size={24} />
                  <span className="ellipsis">{t?.name || 'Team'}{h.source !== 'captain' ? ' · via admin' : ''}</span>
                  <span className="t">{clock(h.at)}</span>
                  <b>{money(h.amount, state.currency)}</b>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
