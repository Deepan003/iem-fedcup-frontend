import { useCallback, useEffect, useState } from 'react';
import { API_URL } from '../../lib/api.js';
import {
  Field, Spinner, useAction,
} from '../../components/ui.jsx';
import { useAdmin } from './AdminApp.jsx';

export default function Integrations() {
  const { call, token, jobs } = useAdmin();
  const [info, setInfo] = useState(null);
  const [gjson, setGjson] = useState('');
  const [sheet, setSheet] = useState({ url: '', tab: '' });
  const [r2, setR2] = useState({
    accountId: '', accessKeyId: '', secretAccessKey: '', bucket: '', publicUrl: '',
  });
  const [preview, setPreview] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [logs, setLogs] = useState(null);
  const [run, busy] = useAction();

  const load = useCallback(() => call('/admin/integrations').then((d) => {
    setInfo(d);
    setSheet(d.sheet);
    if (d.r2.configured || d.r2.bucket) {
      setR2({
        accountId: d.r2.accountId || '', accessKeyId: d.r2.accessKeyId || '', secretAccessKey: d.r2.secretAccessKey || '', bucket: d.r2.bucket || '', publicUrl: d.r2.publicUrl || '',
      });
    }
  }), [call]);
  useEffect(() => { load().catch(() => {}); }, [load]);

  if (!info) return <Spinner />;
  const job = jobs.photos;

  const exportCsv = () => run(async () => {
    const res = await fetch(`${API_URL}/api/admin/export.csv`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Export failed');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = `fedcup-auction-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  return (
    <>
      <h1>Data & storage</h1>
      <p className="muted" style={{ marginTop: -6 }}>Credentials are stored encrypted in the database and never shown again in full. See the backend README for step-by-step setup.</p>
      <div className="cols">
        <div className="card stack">
          <h2>1 · Google (Sheets + Drive)</h2>
          {info.google.configured ? (
            <p className="small" style={{ margin: 0 }}>✅ Connected as <span className="kbd">{info.google.email}</span><br /><span className="muted">Share the sheet and the photo folder with this email (Viewer).</span></p>
          ) : <p className="muted small" style={{ margin: 0 }}>Paste the service-account JSON key from Google Cloud.</p>}
          <textarea className="input" placeholder='{"type": "service_account", ...}' value={gjson} onChange={(e) => setGjson(e.target.value)} />
          <div className="row wrap">
            <button type="button" className="btn primary" disabled={!gjson || busy} onClick={() => run(async () => { await call('/admin/integrations/google', { method: 'PUT', body: { json: gjson } }); setGjson(''); await load(); }, 'Google key saved')}>Save key</button>
            {info.google.configured && <button type="button" className="btn ghost" onClick={() => window.confirm('Remove the Google key?') && run(async () => { await call('/admin/integrations/google', { method: 'DELETE' }); await load(); })}>Remove</button>}
          </div>
        </div>

        <div className="card stack">
          <h2>2 · Player sheet</h2>
          <Field label="Google Sheet link"><input className="input" value={sheet.url} onChange={(e) => setSheet({ ...sheet, url: e.target.value })} placeholder="https://docs.google.com/spreadsheets/d/…" /></Field>
          <Field label="Tab name (empty = first tab)"><input className="input" value={sheet.tab} onChange={(e) => setSheet({ ...sheet, tab: e.target.value })} /></Field>
          <div className="row wrap">
            <button type="button" className="btn primary" disabled={busy} onClick={() => run(async () => { await call('/admin/integrations/sheet', { method: 'PUT', body: sheet }); await load(); }, 'Sheet saved')}>Save</button>
            <button type="button" className="btn" disabled={busy || !info.google.configured} onClick={() => run(async () => setTestResult(await call('/admin/integrations/google/test', { method: 'POST' })))}>Test access</button>
          </div>
          {testResult && <p className="small" style={{ margin: 0 }}>✅ {testResult.title ? <>Opened <b>{testResult.title}</b>. Tabs: {testResult.tabs?.join(', ')}</> : testResult.message}</p>}
        </div>

        <div className="card stack">
          <h2>3 · Cloudflare R2 (images)</h2>
          <p className="small" style={{ margin: 0 }}>Currently storing images in: <b>{info.storageMode === 'r2' ? 'Cloudflare R2' : 'the database (fallback)'}</b></p>
          <div className="form-grid">
            <Field label="Account ID"><input className="input" value={r2.accountId} onChange={(e) => setR2({ ...r2, accountId: e.target.value })} /></Field>
            <Field label="Bucket"><input className="input" value={r2.bucket} onChange={(e) => setR2({ ...r2, bucket: e.target.value })} /></Field>
            <Field label="Access Key ID"><input className="input" value={r2.accessKeyId} onChange={(e) => setR2({ ...r2, accessKeyId: e.target.value })} /></Field>
            <Field label="Secret Access Key"><input className="input" type="password" value={r2.secretAccessKey} onChange={(e) => setR2({ ...r2, secretAccessKey: e.target.value })} /></Field>
          </div>
          <Field label="Public URL" hint="Custom domain (recommended) or r2.dev URL"><input className="input" value={r2.publicUrl} onChange={(e) => setR2({ ...r2, publicUrl: e.target.value })} placeholder="https://media.yourdomain.com" /></Field>
          <div className="row wrap">
            <button type="button" className="btn primary" disabled={busy} onClick={() => run(async () => { await call('/admin/integrations/r2', { method: 'PUT', body: r2 }); await load(); }, 'R2 connected and tested')}>Test & save</button>
            {info.r2.configured && <button type="button" className="btn ghost" onClick={() => window.confirm('Disconnect R2? New uploads will go to the database.') && run(async () => { await call('/admin/integrations/r2', { method: 'DELETE' }); await load(); })}>Disconnect</button>}
          </div>
          <p className="muted small" style={{ margin: 0 }}>After connecting R2, run "Sync photos" again with "re-download all" to move existing photos to R2.</p>
        </div>

        <div className="card stack">
          <h2>4 · Import players</h2>
          <div className="row wrap">
            <button type="button" className="btn" disabled={busy} onClick={() => run(async () => setPreview(await call('/admin/import/preview', { method: 'POST' })))}>Preview import</button>
            {preview && <button type="button" className="btn primary" disabled={busy} onClick={() => run(async () => { const r = await call('/admin/import/commit', { method: 'POST' }); setPreview(null); return r; }, 'Import complete')}>Import now</button>}
          </div>
          {preview && (
            <div className="small stack" style={{ gap: 6 }}>
              <span>{preview.total} rows: <b>{preview.create.length} new</b>, <b>{preview.update.length} updated</b>, {preview.unchanged} unchanged, {preview.skipped.length} skipped</span>
              {preview.update.slice(0, 8).map((u) => <span key={u.sheetKey} className="muted">✎ {u.name}: {u.changes.join(', ')}</span>)}
              {preview.skipped.filter((s) => !/Section heading/.test(s.reason)).slice(0, 10).map((s) => <span key={s.row} style={{ color: '#fcd34d' }}>Row {s.row} {s.name}: {s.reason}</span>)}
            </div>
          )}
          <h2 style={{ marginTop: 6 }}>Photos from Drive</h2>
          <div className="row wrap">
            <button type="button" className="btn" disabled={busy || job?.running} onClick={() => run(() => call('/admin/import/photos', { method: 'POST', body: {} }), 'Photo sync started')}>Sync new photos</button>
            <button type="button" className="btn ghost" disabled={busy || job?.running} onClick={() => run(() => call('/admin/import/photos', { method: 'POST', body: { force: true } }), 'Re-downloading all photos')}>Re-download all</button>
          </div>
          {job && (
            <div className="stack small" style={{ gap: 6 }}>
              <div className="progress"><i style={{ width: `${job.total ? (job.done / job.total) * 100 : 100}%` }} /></div>
              <span>{job.running ? 'Working…' : 'Finished'} {job.done}/{job.total} · {job.ok} ok · {job.failed.length} failed{job.skipped ? ` · ${job.skipped} already done` : ''}</span>
              {job.failed.slice(0, 12).map((f) => <span key={f.playerId} style={{ color: '#fca5a5' }}>{f.name}: {f.reason}</span>)}
            </div>
          )}
        </div>

        <div className="card stack">
          <h2>Results & audit</h2>
          <div className="row wrap">
            <button type="button" className="btn" onClick={exportCsv}>⬇ Export results (CSV)</button>
            <button type="button" className="btn ghost" onClick={() => run(async () => setLogs(await call('/admin/logs?limit=100')))}>Show audit log</button>
          </div>
          {logs && (
            <div style={{ maxHeight: 300, overflow: 'auto' }} className="small">
              {logs.map((l) => (
                <div key={l._id} className="list-row">
                  <span className="muted" style={{ width: 70 }}>{new Date(l.at).toLocaleTimeString()}</span>
                  <b style={{ width: 110 }}>{l.type}</b>
                  <span className="grow ellipsis muted">{l.actor} {l.data?.code || ''} {l.data?.amount ?? l.data?.price ?? ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card stack danger-zone">
          <h2>Danger zone</h2>
          <p className="muted small" style={{ margin: 0 }}>After a rehearsal: puts every sold/unsold player back in the pool and clears all bids. Teams, players, retained players and settings are kept.</p>
          <button
            type="button"
            className="btn danger"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => {
              const typed = window.prompt('Type RESET to reset the whole auction');
              if (typed === 'RESET') run(() => call('/admin/auction/reset', { method: 'POST', body: { confirm: 'RESET' } }), 'Auction reset');
            }}
          >
            Reset auction
          </button>
        </div>
      </div>
    </>
  );
}
