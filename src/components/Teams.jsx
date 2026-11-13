import { money, POS_SHORT } from '../lib/format.js';
import { TeamLogo } from './ui.jsx';

/** Every team's purse at a glance (hidden fields are simply absent from the data). */
export function PurseStrip({ state, highlight }) {
  if (!state?.teams?.length) return null;
  return (
    <div className="purse-strip">
      {state.teams.map((t) => {
        const leading = state.lot?.leaderId === t.id && ['bidding', 'awaiting', 'sold'].includes(state.lot.phase);
        const pct = t.budget ? Math.max(0, Math.min(1, t.purse / t.budget)) : 0;
        return (
          <div key={t.id} className={`purse ${leading ? 'leading' : ''}`} style={{ '--c': t.color, outline: highlight === t.id ? '2px solid var(--brand-2)' : undefined }}>
            <div className="row">
              <TeamLogo team={t} size={30} />
              <b className="grow ellipsis">{t.name}</b>
              <span className="chip">{t.count} 👤</span>
            </div>
            {t.purse !== undefined ? (
              <>
                <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
                  <span className="muted small">Purse</span>
                  <b>{money(t.purse, state.currency)}</b>
                </div>
                <div className="purse-bar"><i style={{ transform: `scaleX(${pct})` }} /></div>
                <div className="muted small" style={{ marginTop: 6 }}>Max bid {money(t.maxBid, state.currency)}</div>
              </>
            ) : <div className="muted small" style={{ marginTop: 8 }}>Budget hidden</div>}
          </div>
        );
      })}
    </div>
  );
}

export function SquadCard({ team, currency }) {
  return (
    <div className="purse" style={{ '--c': team.color }}>
      <div className="row">
        <TeamLogo team={team} size={34} />
        <div className="grow">
          <b className="ellipsis" style={{ display: 'block' }}>{team.name}</b>
          {team.captainName && <span className="muted small">C: {team.captainName}</span>}
        </div>
        {team.purse !== undefined && <b>{money(team.purse, currency)}</b>}
      </div>
      {team.squad ? (
        <div className="squad-list">
          {team.squad.length === 0 && <span className="muted">No players yet</span>}
          {team.squad.map((p) => (
            <div key={p.id}>
              <span className="ellipsis"><span className="muted">{POS_SHORT[p.position]}</span> {p.name}{p.retained ? ' (R)' : ''}</span>
              {p.price !== undefined && <span className="muted">{money(p.price, currency)}</span>}
            </div>
          ))}
        </div>
      ) : <div className="muted small" style={{ marginTop: 8 }}>{team.count} players · squad hidden</div>}
    </div>
  );
}
