import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { POSITIONS } from '../lib/format.js';
import { sound } from '../lib/sound.js';
import '../positions.css';

export const POS_META = {
  Goalkeeper: { word: 'Goalkeepers', short: 'GK', color: '#f5c542', film: 'goalkeepers' },
  Defender: { word: 'Defenders', short: 'DEF', color: '#3b82f6', film: 'defenders' },
  Midfielder: { word: 'Midfielders', short: 'MID', color: '#22c55e', film: 'midfielders' },
  Forward: { word: 'Forwards', short: 'FWD', color: '#ef4444', film: 'forwards' },
};

/** The position being auctioned now: the live lot's, else the next in the queue. */
export function currentPosition(state) {
  return state?.lot?.player?.position || state?.upcoming?.[0]?.position || null;
}

/** Positions in auction order: finished ones, then the current one, then the queue's order. */
function ordered(state) {
  const by = state?.stats?.byPosition || {};
  const cur = currentPosition(state);
  const seen = [];
  const add = (p) => { if (p && by[p] && !seen.includes(p)) seen.push(p); };
  POSITIONS.filter((p) => by[p] && by[p].left === 0 && p !== cur).forEach(add);
  add(cur);
  (state?.upcoming || []).forEach((p) => add(p.position));
  POSITIONS.forEach(add);
  return seen;
}

/**
 * "NOW AUCTIONING · DEFENDERS" — a segmented strip, one segment per position:
 * done (✓, dim) · live now (position colour, pulsing) · still to come.
 */
export function PositionNow({ state, compact = false }) {
  const by = state?.stats?.byPosition;
  if (!by || !Object.keys(by).length) return null;
  const cur = currentPosition(state);
  const list = ordered(state);
  const m = POS_META[cur];
  return (
    <section className={`posnow ${compact ? 'compact' : ''}`} style={{ '--pc': m?.color || '#efebe3' }} aria-label={cur ? `Now auctioning ${m?.word}` : 'Auction order'}>
      <div className="pn-head">
        <span className="pn-k"><i className="pn-live" aria-hidden="true" />{state?.mode === 'unsold' || state?.round > 1 ? 'Unsold round · now' : 'Now auctioning'}</span>
        <b key={cur} className="pn-now">{m?.word || 'Up next'}</b>
      </div>
      <ol className="pn-segs">
        {list.map((p) => {
          const b = by[p];
          const meta = POS_META[p];
          const done = b.left === 0 && p !== cur;
          const live = p === cur;
          const pct = b.total ? ((b.total - b.left) / b.total) * 100 : 0;
          return (
            <li key={p} className={`pn-seg ${live ? 'live' : ''} ${done ? 'done' : ''}`} style={{ '--c': meta.color }} aria-current={live ? 'step' : undefined}>
              <span className="pn-name">{done && <span aria-hidden="true">✓ </span>}{compact ? meta.short : meta.word}</span>
              <span className="pn-count"><b>{b.left}</b> left of {b.total}</span>
              <span className="pn-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * When the auction moves to a new position (the first lot of DEFENDERS…), play that position's film:
 * full screen on the studio, a corner card on the captain / control room. Never on page load.
 */
export function PositionIntro({ state, compact = false }) {
  const [film, setFilm] = useState(null);
  const lastPos = useRef(undefined);
  const lastSeq = useRef(undefined);
  const lot = state?.lot;
  const pos = lot?.player?.position;
  useEffect(() => {
    if (!state || !lot) return;
    if (lastSeq.current === undefined) { lastSeq.current = lot.seq; lastPos.current = pos; return; }
    if (lot.seq === lastSeq.current) return;
    const prev = lastPos.current;
    lastSeq.current = lot.seq;
    lastPos.current = pos;
    if (pos && prev && pos !== prev && POS_META[pos]) setFilm({ pos, key: lot.seq });
  }, [lot?.seq, state ? 1 : 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const ref = useRef(null);
  useEffect(() => {
    if (!film) return undefined;
    const v = ref.current;
    if (v) {
      const loud = sound.active;
      v.muted = !loud;
      v.volume = loud ? Math.min(1, sound.level('sfx')) : 0;
      v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    }
    const t = setTimeout(() => setFilm(null), 6000); // safety: never stuck on screen
    return () => clearTimeout(t);
  }, [film]);
  if (!film) return null;
  const m = POS_META[film.pos];
  return createPortal(
    <div key={film.key} className={`pos-intro ${compact ? 'compact' : ''}`} style={{ '--pc': m.color }} role="status" aria-label={`Now: ${m.word}`}>
      <video ref={ref} src={`/intros/${m.film}.mp4`} playsInline preload="auto" onEnded={() => setFilm(null)} onError={() => setFilm(null)} />
      {compact && <span className="pi-tag">Now auctioning · <b>{m.word}</b></span>}
    </div>,
    document.body,
  );
}
