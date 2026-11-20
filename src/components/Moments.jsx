import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { assetUrl } from '../lib/api.js';
import { initials, money, teamById } from '../lib/format.js';
import { sound } from '../lib/sound.js';
import { TeamLogo } from './ui.jsx';
import { positionRank } from './Live.jsx';
import '../moments.css';

const POS = {
  Goalkeeper: ['goalkeeper', '#f5c542'], Defender: ['defender', '#3b82f6'], Midfielder: ['midfielder', '#22c55e'], Forward: ['forward', '#ef4444'],
};

/**
 * After a sale settles (the SOLD overlay has had its moment), the big story of that sale, on every screen:
 *   NEW AUCTION RECORD (gold) · NEW HIGHEST DEFENDER / MIDFIELDER / FORWARD / GOALKEEPER (position colour)
 *   · 2nd / 3rd most expensive at the position (a quieter card).
 * `compact` = a corner card (captain room, control room); otherwise the full studio moment.
 */
export function SaleMoments({ state, compact = false }) {
  const [show, setShow] = useState(null);
  const prev = useRef(null);       // records before the latest sale
  const lastSeq = useRef(undefined);
  const sale = state?.recentSales?.[0];
  const R = state?.stats?.records;

  useEffect(() => {
    if (!state) return undefined;
    let timer;
    // only a NEW sale (higher lot seq) — an undo exposes an older sale, which must not replay
    if (sale && lastSeq.current !== undefined && sale.seq > (lastSeq.current ?? -1)) {
      const pos = sale.player?.position;
      const before = prev.current || { overall: null, byPosition: {} };
      const isOverall = R?.overall?.playerId === sale.playerId && before.overall && before.overall.playerId !== sale.playerId;
      const posBefore = before.byPosition?.[pos];
      const isPos = R?.byPosition?.[pos]?.playerId === sale.playerId && posBefore && posBefore.playerId !== sale.playerId;
      const rank = positionRank(state, sale.playerId, pos);
      const kind = isOverall ? 'record' : isPos ? 'pos1' : rank === 2 || rank === 3 ? 'pos23' : null;
      if (kind) {
        const beaten = isOverall ? before.overall : isPos ? posBefore : null;
        timer = setTimeout(() => {
          setShow({ kind, rank, pos, sale, team: teamById(state, sale.teamId), beaten, key: sale.seq });
          if (kind === 'record') { sound.impact?.(); sound.cymbal?.(0.4); sound.shimmer?.(); }
          else if (kind === 'pos1') { sound.chime?.(); sound.shimmer?.(); }
          else sound.chime?.();
        }, 4400);
      }
    }
    lastSeq.current = sale ? Math.max(sale.seq, lastSeq.current ?? -1) : (lastSeq.current ?? null);
    prev.current = R ? { overall: R.overall, byPosition: { ...R.byPosition } } : prev.current;
    return () => clearTimeout(timer);
  }, [sale?.seq, state ? 1 : 0]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!show) return undefined;
    const t = setTimeout(() => setShow(null), show.kind === 'pos23' ? 5200 : 6800);
    return () => clearTimeout(t);
  }, [show]);
  if (!show) return null;

  const { kind, pos, sale: sold, team, beaten } = show;
  const [word, posColor] = POS[pos] || ['player', '#efebe3'];
  const accent = kind === 'record' ? '#f5c542' : posColor;
  const kicker = kind === 'record' ? 'New auction record' : kind === 'pos1' ? `New highest ${word}` : `${show.rank === 2 ? '2nd' : '3rd'} most expensive ${word}`;
  const url = assetUrl(sold.player?.thumbUrl || sold.player?.photoUrl);
  const big = !compact && kind !== 'pos23';
  return createPortal(
    <div key={show.key} className={`moment m-${kind} ${big ? 'big' : 'card'}`} style={{ '--ac': accent, '--tc': team?.color || accent }} role="status" aria-live="polite">
      {big && <span className="m-rays" aria-hidden="true" />}
      <span className="m-sweep" aria-hidden="true" />
      <div className="m-face">{url ? <img src={url} alt="" /> : <span>{initials(sold.player?.name || '')}</span>}</div>
      <div className="m-body">
        <span className="m-kicker">{kind === 'record' && <i className="m-crown" aria-hidden="true">★</i>}{kicker}</span>
        <b className="m-name">{sold.player?.name}</b>
        <span className="m-meta"><TeamLogo team={team} size={big ? 26 : 18} /> {team?.name}</span>
        {beaten && <span className="m-beat">beats {beaten.name} · {money(beaten.price, state.currency)}</span>}
      </div>
      <b className="m-price">{money(sold.price, state.currency)}</b>
    </div>,
    document.body,
  );
}

/** A player goes unsold: their card slides in, a red cut slashes through, UNSOLD lands. */
export function UnsoldMoment({ state, compact = false }) {
  const [show, setShow] = useState(null);
  const last = useRef(undefined);
  const lot = state?.lot;
  const key = lot ? `${lot.seq}-${lot.phase}` : '';
  useEffect(() => {
    if (!state) return;
    if (last.current === undefined) { last.current = key; return; } // never on page load
    if (key === last.current) return;
    last.current = key;
    if (lot?.phase === 'unsold' && lot.player) setShow({ player: lot.player, key });
  }, [key, state ? 1 : 0]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!show) return undefined;
    sound.swoosh?.(-1);
    const t = setTimeout(() => setShow(null), compact ? 2600 : 3200);
    return () => clearTimeout(t);
  }, [show, compact]);
  if (!show) return null;
  const url = assetUrl(show.player.thumbUrl || show.player.photoUrl);
  return createPortal(
    <div key={show.key} className={`unsold-moment ${compact ? 'card' : 'big'}`} role="status" aria-live="polite">
      <div className="um-card">
        {url ? <img src={url} alt="" /> : <span className="um-ini">{initials(show.player.name)}</span>}
        <i className="um-cut" aria-hidden="true" />
      </div>
      <div className="um-text">
        <b className="um-stamp">Unsold</b>
        <span className="um-name">{show.player.name}</span>
        <span className="um-note">No bids · back for the unsold round</span>
      </div>
    </div>,
    document.body,
  );
}
