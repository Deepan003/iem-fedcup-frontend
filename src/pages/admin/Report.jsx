import { useEffect, useState } from 'react';
import { API_URL, assetUrl } from '../../lib/api.js';
import { initials, money } from '../../lib/format.js';
import { Spinner, TeamLogo, useToast } from '../../components/ui.jsx';
import { useAdmin } from './AdminApp.jsx';

const LISTS = [
  ['bids', 'Bid history', 'Every bid, lot by lot, with team, amount and time.'],
  ['sold-main', 'Sold in the auction', 'Players bought in the main auction.'],
  ['sold-unsold', 'Sold from the unsold round', 'Players who went unsold first and were bought later.'],
  ['unsold', 'Unsold players', 'Players still unsold.'],
];

/** Download any list as Excel, or print it as a PDF (browser "Save as PDF"). */
function ReportDownloads({ onPrint }) {
  const { token, call } = useAdmin();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const excel = async (kind) => {
    setBusy(kind);
    try {
      const res = await fetch(`${API_URL}/api/admin/report/${kind}?format=xlsx`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Download failed');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `fedcup-${kind}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy('');
    }
  };
  const pdf = async (kind) => {
    setBusy(kind);
    try {
      onPrint(await call(`/admin/report/${kind}`));
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy('');
    }
  };
  return (
    <div className="card stack no-print" style={{ marginBottom: 18 }}>
      <h2 style={{ margin: 0 }}>Downloads</h2>
      {LISTS.map(([kind, title, hint]) => (
        <div key={kind} className="dl-row">
          <div className="grow"><b>{title}</b><div className="muted small">{hint}</div></div>
          <button type="button" className="btn sm" disabled={!!busy} onClick={() => pdf(kind)}>PDF</button>
          <button type="button" className="btn sm" disabled={!!busy} onClick={() => excel(kind)}>{busy === kind ? '…' : 'Excel'}</button>
        </div>
      ))}
    </div>
  );
}

/** Round profile picture for printed reports (initials when there is no photo). */
function Face({ url, name, size = 34 }) {
  const src = assetUrl(url);
  return src
    ? <img className="rp-face" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} />
    : <span className="rp-face rp-ini" style={{ width: size, height: size }}>{initials(name || '')}</span>;
}

/** Print once every photo on the page has loaded (or after a few seconds at most). */
export async function printWhenImagesReady(root = document, maxMs = 6000) {
  const imgs = [...root.querySelectorAll('img')].filter((i) => !i.complete);
  await Promise.race([
    Promise.all(imgs.map((i) => new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }))),
    new Promise((r) => { setTimeout(r, maxMs); }),
  ]);
  window.print();
}

/** A single list laid out for printing; only this prints while it is open. */
function PrintList({ data, onDone }) {
  useEffect(() => {
    document.body.classList.add('print-list');
    const done = () => onDone();
    window.addEventListener('afterprint', done);
    const t = setTimeout(() => printWhenImagesReady(document.querySelector('.rp-list') || document), 250);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', done);
      document.body.classList.remove('print-list');
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="rp-list">
      <div className="no-print" style={{ marginBottom: 12 }}><button type="button" className="btn sm" onClick={onDone}>✕ Close</button></div>
      <h1>{data.title}</h1>
      <p>IEM Federation Cup · Season 5 · {new Date().toLocaleString()} · {data.rows.length} rows</p>
      <table className="rp-table">
        <thead><tr><th aria-label="Photo" />{data.columns.map(([k, h]) => <th key={k}>{h}</th>)}</tr></thead>
        <tbody>
          {data.rows.map((r, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <tr key={i}><td className="rp-ph"><Face url={r.photo} name={r.player || r.name} size={28} /></td>{data.columns.map(([k]) => <td key={k}>{r[k] ?? ''}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Print-ready auction report. "Save as PDF" uses the browser's print dialog (no extra download). */
export default function Report() {
  const { auction } = useAdmin();
  const [printing, setPrinting] = useState(null);
  const s = auction.state;
  if (!s) return <Spinner />;
  const cur = s.currency;
  const date = new Date().toLocaleString();
  const teams = s.teams.map((t) => {
    const squad = [...(t.squad || [])].sort((a, b) => (b.isCaptain - a.isCaptain) || ((b.price || 0) - (a.price || 0)));
    const capName = (t.captainName || '').trim().toLowerCase();
    if (capName && !squad.some((p) => p.isCaptain || p.name.trim().toLowerCase() === capName)) {
      squad.unshift({
        id: `cap-${t.id}`, name: t.captainName, position: t.captainPosition || '—', isCaptain: true, thumbUrl: t.captainPhotoUrl, price: 0,
      });
    }
    return { ...t, squad, spent: squad.reduce((x, p) => x + (p.price || 0), 0) };
  });

  return (
    <div className="report">
      <ReportDownloads onPrint={setPrinting} />
      {printing && <PrintList data={printing} onDone={() => setPrinting(null)} />}
      <div className="report-tools no-print">
        <button type="button" className="btn primary lg" onClick={() => printWhenImagesReady()}>⬇ Save as PDF</button>
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
              <p>Captain: {t.captainName || '—'} · {t.count} players · spent {money(t.spent, cur)}{t.penalty > 0 ? ` · penalties ${money(t.penalty, cur)}` : ''} · left {money(t.purse, cur)}</p>
              {(t.penalties || []).map((p) => <p key={p.id} className="rp-pen">Penalty −{money(p.amount, cur)}: {p.remark}</p>)}
            </div>
          </header>
          <table className="rp-table">
            <thead><tr><th>#</th><th aria-label="Photo" /><th>Name</th><th>Position</th><th>Department</th><th>Year</th><th>Role</th><th>Price</th></tr></thead>
            <tbody>
              {t.squad.map((p, i) => (
                <tr key={p.id}>
                  <td>{i + 1}</td>
                  <td className="rp-ph"><Face url={p.thumbUrl || p.photoUrl} name={p.name} size={40} /></td>
                  <td><b>{p.name}</b></td>
                  <td>{p.position}</td>
                  <td>{p.department || '—'}</td>
                  <td>{p.year || '—'}</td>
                  <td>{p.isCaptain ? 'Captain' : p.retained ? 'Retained' : 'Bought'}</td>
                  <td>{p.isCaptain ? 'Free' : money(p.price, cur)}</td>
                </tr>
              ))}
              <tr className="rp-total"><td /><td /><td>Total</td><td /><td /><td /><td /><td>{money(t.spent, cur)}</td></tr>
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
