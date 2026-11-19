import {
  useEffect, useLayoutEffect, useRef, useState,
} from 'react';
import {
  money, POSITIONS, POS_SHORT, teamById,
} from '../lib/format.js';
import { Avatar, TeamLogo } from './ui.jsx';
import '../live.css';

/** "x of y left" for the whole pool and per position, with thin progress bars. */
export function AuctionProgress({ state, compact = false }) {
  const s = state?.stats;
  if (!s?.pool) return null;
  const byPos = s.byPosition || {};
  const cell = (label, left, total, key) => (
    <div key={key} className="ap-cell" title={`${left} of ${total} still to come`}>
      <span className="ap-k">{label}</span>
      <span className="ap-v"><b>{left}</b>/{total}</span>
      <span className="ap-bar"><i style={{ transform: `scaleX(${total ? (total - left) / total : 0})` }} /></span>
    </div>
  );
  return (
    <div className={`ap ${compact ? 'compact' : ''}`} aria-label="Players still to come">
      {cell('Left', s.pool.left, s.pool.total, 'all')}
      {POSITIONS.filter((p) => byPos[p]).map((p) => cell(POS_SHORT[p], byPos[p].left, byPos[p].total, p))}
    </div>
  );
}

const ORD = ['', 'Most expensive', '2nd most expensive', '3rd most expensive'];
const POS_WORD = {
  Goalkeeper: 'goalkeeper', Defender: 'defender', Midfielder: 'midfielder', Forward: 'striker',
};

/** Rank (1–3) of a just-sold player among the most expensive buys at their position, or 0. */
export function positionRank(state, playerId, position) {
  const list = state?.stats?.topByPosition?.[position] || [];
  const i = list.findIndex((x) => x.playerId === playerId);
  return i >= 0 ? i + 1 : 0;
}

/**
 * After a sale settles, a calm banner: "Most expensive defender so far" (or 2nd / 3rd).
 * Lazy on purpose: waits for the SOLD moment to pass, holds, then fades out.
 */
export function PositionAnnounce({ state }) {
  const [show, setShow] = useState(null);
  const last = useRef(undefined);
  const sale = state?.recentSales?.[0];
  useEffect(() => {
    if (!sale) return undefined;
    if (last.current === undefined) { last.current = sale.seq; return undefined; } // not on first load
    if (sale.seq === last.current) return undefined;
    last.current = sale.seq;
    const pos = sale.player?.position;
    const rank = positionRank(state, sale.playerId, pos);
    if (!rank) return undefined;
    const t1 = setTimeout(() => setShow({
      rank, pos, name: sale.player?.name, team: teamById(state, sale.teamId), price: sale.price, player: sale.player, key: sale.seq,
    }), 4600); // after the SOLD overlay
    return () => clearTimeout(t1);
  }, [sale?.seq]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!show) return undefined;
    const t = setTimeout(() => setShow(null), 7200);
    return () => clearTimeout(t);
  }, [show]);
  if (!show) return null;
  return (
    <div key={show.key} className={`pos-ann r${show.rank}`} style={{ '--c': show.team?.color }} role="status">
      <Avatar player={show.player} team={show.team} size={64} />
      <div className="pos-ann-text">
        <span className="pos-ann-k">{ORD[show.rank]} {POS_WORD[show.pos] || 'player'} so far</span>
        <b>{show.name}</b>
        <span className="pos-ann-m"><TeamLogo team={show.team} size={18} /> {show.team?.name} · {money(show.price, state.currency)}</span>
      </div>
      <span className="pos-ann-rank">#{show.rank}</span>
    </div>
  );
}

/**
 * A ranked list that animates when the order changes (rows slide to their new place)
 * and marks movers with ▲/▼ and newcomers with NEW for a few seconds.
 */
export function RankList({ items, render }) {
  const refs = useRef(new Map());
  const prevTops = useRef(new Map());
  const prevOrder = useRef(null);
  const [moves, setMoves] = useState({});

  useLayoutEffect(() => {
    // FLIP: measure new positions, play from the old ones
    const tops = new Map();
    refs.current.forEach((el, id) => { if (el) tops.set(id, el.getBoundingClientRect().top); });
    tops.forEach((top, id) => {
      const before = prevTops.current.get(id);
      const el = refs.current.get(id);
      if (before != null && before !== top && el?.animate) {
        el.animate([{ transform: `translateY(${before - top}px)` }, { transform: 'none' }], { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    });
    prevTops.current = tops;
    const order = items.map((x) => x.id);
    if (prevOrder.current) {
      const m = {};
      order.forEach((id, i) => {
        const was = prevOrder.current.indexOf(id);
        if (was === -1) m[id] = 'new';
        else if (was > i) m[id] = `up${was - i}`;
        else if (was < i) m[id] = `down${i - was}`;
      });
      if (Object.keys(m).length) setMoves(m);
    }
    prevOrder.current = order;
  }, [items.map((x) => x.id).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!Object.keys(moves).length) return undefined;
    const t = setTimeout(() => setMoves({}), 5000);
    return () => clearTimeout(t);
  }, [moves]);

  return items.map((item, i) => {
    const mv = moves[item.id];
    const badge = mv === 'new' ? <span className="rk new">NEW</span>
      : mv?.startsWith('up') ? <span className="rk up">▲{mv.slice(2)}</span>
        : mv?.startsWith('down') ? <span className="rk down">▼{mv.slice(4)}</span> : null;
    return (
      <div key={item.id} ref={(el) => refs.current.set(item.id, el)} className={`rank-row ${mv ? `moved ${mv.replace(/\d+/, '')}` : ''}`}>
        {render(item, i, badge)}
      </div>
    );
  });
}
