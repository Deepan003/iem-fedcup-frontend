import { useState } from 'react';
import { money, POS_SHORT } from '../../lib/format.js';
import { TeamLogo, useAction } from '../../components/ui.jsx';
import { useAdmin } from './AdminApp.jsx';

/** One row: team name / short name editable in place, retained players listed for checking. */
function Row({
  team, live, currency, onSaved,
}) {
  const { call } = useAdmin();
  const [run, busy] = useAction();
  const [name, setName] = useState(team.name);
  const [short, setShort] = useState(team.shortName || '');
  const dirty = name.trim() !== team.name || short.trim() !== (team.shortName || '');
  const retained = (live?.squad || []).filter((p) => p.retained || p.isCaptain)
    .sort((a, b) => (b.isCaptain - a.isCaptain) || ((b.price || 0) - (a.price || 0)));

  const save = () => run(async () => {
    await call(`/admin/teams/${team.id}`, { method: 'PUT', body: { name: name.trim(), shortName: short.trim() } });
    onSaved();
  }, 'Team name saved');

  return (
    <tr>
      <td><TeamLogo team={team} size={34} /></td>
      <td>
        <input className="input ov-name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Team name" onKeyDown={(e) => e.key === 'Enter' && dirty && save()} />
      </td>
      <td>
        <input className="input ov-short" value={short} maxLength={5} onChange={(e) => setShort(e.target.value.toUpperCase())} aria-label="Short name" onKeyDown={(e) => e.key === 'Enter' && dirty && save()} />
      </td>
      <td>
        <div className="ov-players">
        {retained.length === 0 && <span className="muted small">No captain or retained players yet</span>}
        {retained.map((p) => (
          <span key={p.id} className="ov-player">
            {p.isCaptain && <span className="cap-badge">C</span>}
            <b>{p.name}</b>
            <span className="tiny">{[POS_SHORT[p.position], p.department, p.year].filter(Boolean).join(' · ')}</span>
            <span className="mono small">{p.isCaptain ? 'free' : money(p.price, currency)}</span>
          </span>
        ))}
        </div>
      </td>
      <td className="mono" style={{ whiteSpace: 'nowrap' }}>{live?.purse !== undefined ? money(live.purse, currency) : '—'}</td>
      <td style={{ whiteSpace: 'nowrap' }}>
        {dirty && <button type="button" className="btn sm primary" disabled={busy || !name.trim()} onClick={save}>Save</button>}
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => document.getElementById(`team-${team.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          title="Go to this team's full card (retained players, photos, penalties)"
        >
          Edit ↓
        </button>
      </td>
    </tr>
  );
}

/** Teams at a glance: names (editable in place) and every captain / retained player, for checking. */
export default function TeamsOverview({
  teams, live, currency, onSaved,
}) {
  if (!teams.length) return null;
  return (
    <div className="card stack" style={{ marginBottom: 14 }}>
      <div className="ret-head">
        <h2 style={{ margin: 0 }}>Overview</h2>
        <span className="muted small"><b>Rename a team:</b> type the new name or short name and press Save (or Enter). Use Edit ↓ for logo, captain photo, retained players and penalties.</span>
      </div>
      <div className="table-wrap">
        <table className="table ov-table">
          <thead>
            <tr><th aria-label="Logo" /><th>Team</th><th>Short</th><th>Captain &amp; retained players</th><th>Purse</th><th aria-label="Actions" /></tr>
          </thead>
          <tbody>
            {/* key includes the saved names so a save elsewhere refreshes the inputs */}
            {teams.map((t) => <Row key={`${t.id}-${t.name}-${t.shortName}`} team={t} live={live[t.id]} currency={currency} onSaved={onSaved} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
