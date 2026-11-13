import { money } from '../../lib/format.js';
import { Spinner, TeamLogo } from '../../components/ui.jsx';
import { useAdmin } from './AdminApp.jsx';

/** Print-ready auction report. "Save as PDF" uses the browser's print dialog (no extra download). */
export default function Report() {
  const { auction } = useAdmin();
  const s = auction.state;
  if (!s) return <Spinner />;
  const cur = s.currency;
  const date = new Date().toLocaleString();
  const teams = s.teams.map((t) => {
    const squad = [...(t.squad || [])].sort((a, b) => (b.isCaptain - a.isCaptain) || ((b.price || 0) - (a.price || 0)));
    return { ...t, squad, spent: squad.reduce((x, p) => x + (p.price || 0), 0) };
  });

  return (
    <div className="report">
      <div className="report-tools no-print">
        <button type="button" className="btn primary lg" onClick={() => window.print()}>⬇ Save as PDF</button>
        <span className="muted small">In the print dialog choose "Save as PDF". Each team starts on a new page.</span>
      </div>

      <section className="rp-page rp-cover">
        <img src="/brand/logo.png" alt="FED Cup Season 5" className="rp-logo" />
        <h1>Player Auction Report</h1>
        <p>IEM Federation Cup · Season 5 · generated {date}</p>
        <table className="rp-table">
          <thead><tr><th>Team</th><th>Captain</th><th>Players</th><th>Spent</th><th>Purse left</th></tr></thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id}>
                <td><span className="rp-dot" style={{ background: t.color }} />{t.name}</td>
                <td>{t.captainName || '—'}</td>
                <td>{t.count}</td>
                <td>{money(t.spent, cur)}</td>
                <td>{money(t.purse, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="rp-meta">{s.stats.sold} sold · {s.stats.unsold} unsold · {s.stats.retained} retained · total spent {money(s.stats.totalSpent, cur)}</p>
      </section>

      {teams.map((t) => (
        <section key={t.id} className="rp-page">
          <header className="rp-team" style={{ borderColor: t.color }}>
            {t.logoUrl && <TeamLogo team={t} size={72} />}
            <div>
              <h2>{t.name}</h2>
              <p>Captain: {t.captainName || '—'} · {t.count} players · spent {money(t.spent, cur)} · left {money(t.purse, cur)}</p>
            </div>
          </header>
          <table className="rp-table">
            <thead><tr><th>#</th><th>Name</th><th>Position</th><th>Department</th><th>Year</th><th>Role</th><th>Price</th></tr></thead>
            <tbody>
              {t.squad.map((p, i) => (
                <tr key={p.id}>
                  <td>{i + 1}</td>
                  <td><b>{p.name}</b></td>
                  <td>{p.position}</td>
                  <td>{p.department || '—'}</td>
                  <td>{p.year || '—'}</td>
                  <td>{p.isCaptain ? 'Captain' : p.retained ? 'Retained' : 'Bought'}</td>
                  <td>{p.isCaptain ? 'Free' : money(p.price, cur)}</td>
                </tr>
              ))}
              <tr className="rp-total"><td /><td>Total</td><td /><td /><td /><td /><td>{money(t.spent, cur)}</td></tr>
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
