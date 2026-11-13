import { money, POS_SHORT } from '../lib/format.js';
import { TeamLogo } from './ui.jsx';

/** Standings-style purse table (fields hidden by the admin are simply absent). */
export function PurseStrip({ state, highlight }) {
  if (!state?.teams?.length) return null;
  return (
    <div className="purse-strip">
      {state.teams.map((t) => {
        const leading = state.lot?.leaderId === t.id && ['bidding', 'awaiting', 'sold'].includes(state.lot.phase);
        const pct = t.budget ? Math.max(0, Math.min(1, t.purse / t.budget)) : 0;
        return (
          <div key={t.id} className={`purse ${leading ? 'leading' : ''}`} style={{ '--c': t.color, outline: highlight === t.id ? '1px solid var(--signal)' : undefined }}>
            <div className="row">
              <TeamLogo team={t} size={28} />
              <b className="grow ellipsis" style={{ fontFamily: 'var(--display)', fontWeight: 900, fontSize: 20, textTransform: 'uppercase', lineHeight: 1 }}>{t.shortName || t.name}</b>
              <span className="tiny">{t.count} pl</span>
            </div>
            {t.purse !== undefined ? (
              <>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12 }}>
                  <span className="amt">{Number(t.purse).toLocaleString('en-IN')}</span>
                  <span className="tiny">max {money(t.maxBid, state.currency)}</span>
                </div>
                <div className="purse-bar"><i style={{ transform: `scaleX(${pct})` }} /></div>
                {t.penalty > 0 && <span className="pen-tag" title={(t.penalties || []).map((p) => `−${p.amount}: ${p.remark}`).join(' · ')}>−{Number(t.penalty).toLocaleString('en-IN')} penalty</span>}
              </>
            ) : <div className="tiny" style={{ marginTop: 12 }}>Budget hidden</div>}
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
        <TeamLogo team={team} size={32} />
        <div className="grow">
          <b className="ellipsis" style={{ display: 'block', fontFamily: 'var(--display)', fontWeight: 900, fontSize: 22, textTransform: 'uppercase', lineHeight: 1 }}>{team.name}</b>
          {team.captainName && <span className="tiny">C · {team.captainName}</span>}
        </div>
        {team.purse !== undefined && <span className="amt" style={{ fontSize: 26 }}>{Number(team.purse).toLocaleString('en-IN')}</span>}
      </div>
      {team.squad ? (
        <div className="squad-list">
          {team.squad.length === 0 && <span className="tiny" style={{ paddingTop: 8 }}>No players yet</span>}
          {team.squad.map((p) => (
            <div key={p.id}>
              <span className="ellipsis"><span className="p">{POS_SHORT[p.position]}</span>{p.name}{p.isCaptain ? ' · C' : p.retained ? ' · R' : ''}</span>
              {p.price !== undefined && <span className="mono small muted">{money(p.price, currency)}</span>}
            </div>
          ))}
        </div>
      ) : <div className="tiny" style={{ marginTop: 10 }}>{team.count} players · squad hidden</div>}
    </div>
  );
}
