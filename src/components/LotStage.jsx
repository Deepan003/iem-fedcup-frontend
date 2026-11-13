import { useEffect, useMemo, useRef, useState } from 'react';
import { useTicker } from '../lib/auction.js';
import { money, PHASE_LABEL, teamById } from '../lib/format.js';
import { PlayerCard, TeamLogo } from './ui.jsx';

/** Countdown ring synced to the server clock. */
export function Countdown({ lot, now, paused }) {
  const running = lot?.phase === 'bidding' && lot.endsAt != null && !paused;
  useTicker(running, 100);
  const totalRef = useRef({ endsAt: null, total: 1 });
  let remaining = 0;
  if (running) remaining = Math.max(0, lot.endsAt - now());
  else if (lot?.phase === 'bidding' && lot.remainingMs != null) remaining = lot.remainingMs;
  if (lot?.endsAt && totalRef.current.endsAt !== lot.endsAt) {
    totalRef.current = { endsAt: lot.endsAt, total: Math.max(1000, lot.endsAt - now()) };
  }
  if (lot?.phase !== 'bidding') return null;
  if (lot.endsAt == null && lot.remainingMs == null) return null; // timer disabled (manual)
  const frac = Math.min(1, remaining / totalRef.current.total);
  const secs = remaining / 1000;
  const cls = secs <= 3 ? 'crit' : secs <= 6 ? 'warn' : '';
  const C = 2 * Math.PI * 40;
  return (
    <div className={`countdown ${cls}`} aria-label={`${Math.ceil(secs)} seconds left`}>
      <svg viewBox="0 0 92 92">
        <circle className="track" cx="46" cy="46" r="40" />
        <circle className="bar" cx="46" cy="46" r="40" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />
      </svg>
      <div className="num">{paused ? '❚❚' : secs < 5 ? secs.toFixed(1) : Math.ceil(secs)}</div>
    </div>
  );
}

/** Full-screen SOLD moment in the buying team's colour, with light confetti. */
export function SoldOverlay({ state }) {
  const [show, setShow] = useState(null);
  const shownSeq = useRef(undefined);
  const lot = state?.lot;
  useEffect(() => {
    if (!state) return;
    // First snapshot after opening the page: remember it, never replay an old sale.
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
    const t = setTimeout(() => setShow(null), 3600);
    return () => clearTimeout(t);
  }, [show]);

  const confetti = useMemo(() => Array.from({ length: 36 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.6,
    dur: 1.8 + Math.random() * 1.4,
    color: i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? 'var(--brand-2)' : 'var(--c)',
  })), [show?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!show) return null;
  return (
    <div className="sold-overlay" style={{ '--c': show.team?.color || '#22c55e' }}>
      {confetti.map((c, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <i key={i} className="confetti" style={{ left: `${c.left}%`, background: c.color, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }} />
      ))}
      <div className="sold-stamp">
        <div className="word">SOLD!</div>
        <div className="to">{show.name}</div>
        <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
          <TeamLogo team={show.team} size={44} />
          <span className="to">{show.team?.name} · {money(show.amount, state.currency)}</span>
        </div>
      </div>
    </div>
  );
}

/** The player on the block: card, price, leader, countdown, bid history. */
export default function LotStage({ state, now, showHistory = true, children }) {
  const lot = state?.lot;
  const leader = teamById(state, lot?.leaderId);
  const [bump, setBump] = useState(0);
  const prevAmount = useRef(lot?.amount);
  useEffect(() => {
    if (lot?.amount != null && lot.amount !== prevAmount.current) setBump((b) => b + 1);
    prevAmount.current = lot?.amount;
  }, [lot?.amount]);

  if (!lot) {
    return (
      <div className="card empty-stage">
        <div className="display">{state?.status === 'ended' ? 'Auction complete' : state?.status === 'live' ? 'Next player coming up' : 'Auction not started'}</div>
        <p className="muted">{state?.status === 'live' ? 'Stay tuned — the auctioneer is loading the next player.' : 'The studio goes live when the auctioneer starts the auction.'}</p>
      </div>
    );
  }

  const phase = lot.phase;
  const hasBid = lot.amount != null;
  return (
    <div className="stage">
      <PlayerCard key={lot.seq} player={lot.player} className="card-enter" />
      <div className="bid-panel">
        <div className="row wrap">
          <span className={`phase ${phase}`}>
            {phase === 'bidding' && !state.paused && <span className="live-dot" />}
            {state.paused ? 'Paused' : PHASE_LABEL[phase]}
          </span>
          <span className="chip">Lot #{lot.seq}</span>
          <span className="chip">Base {money(lot.base, state.currency)}</span>
        </div>

        <div className="price-box row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="grow">
            <div className="tiny muted">{phase === 'sold' ? 'Sold for' : hasBid ? 'Current bid' : 'Starting at'}</div>
            <div key={bump} className={`price ${bump ? 'bump' : ''}`}>
              {(hasBid ? lot.amount : lot.base).toLocaleString('en-IN')}
              <span className="cur">{state.currency}</span>
            </div>
            {phase === 'bidding' && <div className="muted small">Next bid {money(lot.nextAmount, state.currency)} · {lot.bidCount} bid{lot.bidCount === 1 ? '' : 's'}</div>}
          </div>
          <Countdown lot={lot} now={now} paused={state.paused} />
        </div>

        {leader ? (
          <div key={`${lot.leaderId}-${lot.amount}`} className="leader flash" style={{ '--c': leader.color }}>
            <TeamLogo team={leader} size={44} />
            <div className="grow">
              <div className="tiny muted">{phase === 'sold' ? 'Bought by' : 'Highest bidder'}</div>
              <div style={{ fontWeight: 800, fontSize: 18 }} className="ellipsis">{leader.name}</div>
            </div>
          </div>
        ) : (
          <div className="leader" style={{ '--c': '#334155' }}>
            <div className="grow muted">{phase === 'unsold' ? 'No bids — unsold' : phase === 'reveal' ? 'Bidding opens soon' : 'Waiting for the first bid…'}</div>
          </div>
        )}

        {phase === 'awaiting' && (
          <div className="chip" style={{ alignSelf: 'flex-start', color: '#fcd34d' }}>Bidding closed · the auctioneer will confirm</div>
        )}

        {children}

        {showHistory && lot.history?.length > 0 && (
          <div className="history">
            {lot.history.map((h) => {
              const t = teamById(state, h.teamId);
              return (
                <div key={`${h.at}-${h.amount}`} className="history-row">
                  <TeamLogo team={t} size={24} />
                  <span className="grow ellipsis">{t?.name || 'Team'}</span>
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
