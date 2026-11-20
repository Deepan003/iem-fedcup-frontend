import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TeamLogo } from './ui.jsx';
import '../presence.css';

/**
 * "BLACK BANDITS · JOINED THE ROOM" — plays when a team's captain opens the captain room.
 * Joins that land together queue up; each shows ~3.4 s. `compact` = a corner card (captain room,
 * or while a lot is live on the studio), otherwise a full-width moment for the big screen.
 */
export function JoinMoment({ state, joinEvent, presence, compact = false }) {
  const [queue, setQueue] = useState([]);
  const seen = useRef(new Set());
  useEffect(() => {
    if (!joinEvent || seen.current.has(joinEvent.key)) return;
    seen.current.add(joinEvent.key);
    setQueue((q) => [...q, joinEvent]);
  }, [joinEvent]);
  const cur = queue[0];
  useEffect(() => {
    if (!cur) return undefined;
    const t = setTimeout(() => setQueue((q) => q.slice(1)), compact ? 2800 : 3400);
    return () => clearTimeout(t);
  }, [cur, compact]);
  if (!cur || !state) return null;
  const team = state.teams.find((t) => t.id === cur.teamId);
  if (!team) return null;
  const total = state.teams.length;
  const inRoom = presence?.joined?.length || cur.count;
  return createPortal(
    <div key={cur.key} className={`join-moment ${compact ? 'compact' : ''}`} style={{ '--c': team.color }} role="status" aria-live="polite">
      <span className="jm-flash" aria-hidden="true" />
      <div className="jm-logo"><TeamLogo team={team} size={compact ? 46 : 120} /></div>
      <div className="jm-text">
        <span className="jm-k">{cur.first ? 'Captain has joined' : 'Captain is back'}</span>
        <b className="jm-name">{team.name}</b>
        <span className="jm-count"><i>{Math.min(inRoom, total)}</i> of {total} captains in the room</span>
      </div>
    </div>,
    document.body,   // above everything, even the screensaver (rendered at the top level so nothing can hide it)
  );
}

/** A row of team crests: lit = captain is in the room now, dim = not yet. */
export function JoinedStrip({ state, presence, label = 'Captains in the room' }) {
  if (!state?.teams?.length) return null;
  const online = new Set(presence?.online || []);
  const n = state.teams.filter((t) => online.has(t.id)).length;
  return (
    <div className="joined-strip" aria-label={`${label}: ${n} of ${state.teams.length}`}>
      <span className="js-k">{label} <b>{n}/{state.teams.length}</b></span>
      <span className="js-row">
        {state.teams.map((t) => (
          <span key={t.id} className={`js-team ${online.has(t.id) ? 'on' : ''}`} style={{ '--c': t.color }} title={`${t.name}${online.has(t.id) ? ' · in the room' : ' · not yet'}`}>
            <TeamLogo team={t} size={28} />
            <i className="js-dot" aria-hidden="true" />
          </span>
        ))}
      </span>
    </div>
  );
}
