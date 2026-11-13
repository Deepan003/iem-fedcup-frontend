import { useCallback, useEffect, useState } from 'react';
import { API_URL } from '../../lib/api.js';
import {
  Field, Spinner, useAction,
} from '../../components/ui.jsx';
import { useAdmin } from './AdminApp.jsx';
import { useConfirm } from '../../components/Dialog.jsx';

const mb = (b) => (b >= 1024 * 1024 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(0, Math.round(b / 1024))} KB`);

/** How full the free MongoDB (512 MB) is, with what is using the space. */
function StorageMeter({ call, refreshKey }) {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => {
    setErr('');
    call('/admin/storage').then(setS).catch((e) => setErr(e.message));
  }, [call]);
  useEffect(load, [load, refreshKey]);

  const pct = s ? Math.min(100, s.percent) : 0;
  const color = pct >= 85 ? 'var(--danger)' : pct >= 65 ? 'var(--amber)' : 'var(--go)';
  const others = s ? s.databases.filter((d) => !d.current && d.bytes > 0) : [];
  return (
    <div className="card stack" style={{ marginBottom: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Database storage</h2>
        <button type="button" className="btn sm ghost" onClick={load}>↻ Refresh</button>
      </div>
      {err && <p className="small" style={{ color: 'var(--danger)', margin: 0 }}>{err}</p>}
      {!s ? (!err && <Spinner />) : (
        <>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <span className="display" style={{ fontSize: 44 }}>{mb(s.totalBytes)}</span>
            <span className="label">of {mb(s.limitBytes)} free tier · {s.percent}% used</span>
          </div>
          <div className="progress" style={{ height: 10 }}><i style={{ width: `${pct}%`, background: color }} /></div>
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            <div><span className="label">Auction data ({s.auction.database})</span><div><b>{mb(s.auction.bytes)}</b></div></div>
            <div><span className="label">Player photos & logos</span><div><b>{mb(s.images.bytes)}</b> <span className="muted small">· {s.images.count} files{s.images.storedIn === 'r2' ? ' (new uploads go to R2)' : ''}</span></div></div>
            {others.map((d) => <div key={d.name}><span className="label">Other: {d.name}</span><div><b>{mb(d.bytes)}</b></div></div>)}
          </div>
          {others.some((d) => d.name.startsWith('sample_')) && (
            <p className="muted small" style={{ margin: 0 }}>The <b>sample_</b> databases are MongoDB's demo data and are not used by the auction. Delete them in Atlas → Browse collections to free space.</p>
          )}
          {pct >= 85 && <p className="small" style={{ color: 'var(--danger)', margin: 0 }}>Storage is nearly full. Delete sample data or old photos before importing more.</p>}
        </>
      )}
    </div>
  );
}

export default function Integrations() {
  const {
    call, token, jobs, setJobs, auction,
  } = useAdmin();
  const ask = useConfirm();
  const [info, setInfo] = useState(null);
  const [gjson, setGjson] = useState('');
  const [sheet, setSheet] = useState({ url: '', tab: '' });
  const [r2, setR2] = useState({
    accountId: '', accessKeyId: '', secretAccessKey: '', bucket: '', publicUrl: '',
  });
  const [preview, setPreview] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [logs, setLogs] = useState(null);
  const [status, setStatus] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [run, busy] = useAction();
  const loadStatus = useCallback(() => call('/admin/import/status').then(setStatus).catch(() => {}), [call]);
  const jobDoneAt = jobs.photos && !jobs.photos.running ? jobs.photos.finishedAt : 0;
  const dataV = auction.state?.dataV;
  useEffect(() => { loadStatus(); }, [loadStatus, jobDoneAt, dataV]);

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

  const exportXlsx = () => run(async () => {
    const res = await fetch(`${API_URL}/api/admin/export.xlsx`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Export failed');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = `fedcup-auction-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'Excel downloaded');

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
      <p className="muted" style={{ marginTop: -6, marginBottom: 14 }}>Credentials are stored encrypted in the database and never shown again in full. See the backend README for step-by-step setup.</p>
      <StorageMeter call={call} refreshKey={`${jobDoneAt}-${dataV}`} />
      <div className="cols">
        <div className="card stack">
          <h2>1 · Google (Sheets + Drive)</h2>
          {info.google.configured ? (
            <p className="small" style={{ margin: 0 }}>✅ Connected as <span className="kbd">{info.google.email}</span><br /><span className="muted">Share the sheet and the photo folder with this email (Viewer).</span></p>
          ) : <p className="muted small" style={{ margin: 0 }}>Paste the service-account JSON key from Google Cloud.</p>}
          <textarea className="input" placeholder='{"type": "service_account", ...}' value={gjson} onChange={(e) => setGjson(e.target.value)} />
          <div className="row wrap">
            <button type="button" className="btn primary" disabled={!gjson || busy} onClick={() => run(async () => { await call('/admin/integrations/google', { method: 'PUT', body: { json: gjson } }); setGjson(''); await load(); }, 'Google key saved')}>Save key</button>
            {info.google.configured && <button type="button" className="btn ghost" onClick={async () => (await ask({ title: 'Remove the Google key?', message: 'Sheet import and photo sync stop working until a key is added again.', tone: 'warning', confirmLabel: 'Remove' })) && run(async () => { await call('/admin/integrations/google', { method: 'DELETE' }); await load(); })}>Remove</button>}
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
          <h2>3 · Cloudflare R2 (optional)</h2>
          <p className="muted small" style={{ margin: 0 }}>Not needed: photos are already stored in your database. Only fill this in if you set up R2 later.</p>
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
            {info.r2.configured && <button type="button" className="btn ghost" onClick={async () => (await ask({ title: 'Disconnect R2?', message: 'New uploads will be stored in the database instead.', tone: 'warning', confirmLabel: 'Disconnect' })) && run(async () => { await call('/admin/integrations/r2', { method: 'DELETE' }); await load(); })}>Disconnect</button>}
          </div>
          <p className="muted small" style={{ margin: 0 }}>After connecting R2, run "Sync photos" again with "re-download all" to move existing photos to R2.</p>
        </div>

        <div className="card stack">
          <h2>4 · Import players</h2>
          {status && (
            <div className="small stack" style={{ gap: 4 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}><span className="label">Players in database</span><b>{status.players.total}</b></div>
              <div className="row" style={{ justifyContent: 'space-between' }}><span className="label">From the sheet</span><b>{status.players.fromSheet}</b></div>
              {status.lastImport ? (
                <span className="muted">Last import {new Date(status.lastImport.at).toLocaleString()} · {status.lastImport.total ?? '—'} rows · {status.lastImport.created} new · {status.lastImport.updated} updated</span>
              ) : <span className="muted">Not imported yet.</span>}
            </div>
          )}
          <div className="row wrap">
            <button type="button" className="btn" disabled={busy} onClick={() => run(async () => { setLastResult(null); setPreview(await call('/admin/import/preview', { method: 'POST' })); })}>Check sheet for changes</button>
            {preview && (preview.create.length + preview.update.length > 0) && (
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={() => run(async () => {
                  const r = await call('/admin/import/commit', { method: 'POST' });
                  setPreview(null);
                  setLastResult(r);
                  loadStatus();
                }, 'Import complete')}
              >
                Import {preview.create.length + preview.update.length} change{preview.create.length + preview.update.length === 1 ? '' : 's'}
              </button>
            )}
          </div>
          {preview && (
            <div className="small stack" style={{ gap: 6 }}>
              {preview.create.length + preview.update.length === 0 ? (
                <span style={{ color: 'var(--go)', fontWeight: 600 }}>✓ Up to date: all {preview.total}/{preview.total} sheet rows are already in the database.</span>
              ) : (
                <span style={{ color: 'var(--amber)', fontWeight: 600 }}>{preview.create.length + preview.update.length} change{preview.create.length + preview.update.length === 1 ? '' : 's'} waiting: {preview.create.length} new, {preview.update.length} updated ({preview.unchanged}/{preview.total} rows unchanged)</span>
              )}
              {preview.create.slice(0, 8).map((c) => <span key={c.sheetKey} className="muted">＋ {c.name} ({c.position})</span>)}
              {preview.update.slice(0, 8).map((u) => <span key={u.sheetKey} className="muted">✎ {u.name}: {u.changes.join(', ')}</span>)}
              {preview.skipped.filter((s) => !/Section heading/.test(s.reason)).slice(0, 10).map((s) => <span key={s.row} style={{ color: '#fcd34d' }}>Row {s.row} {s.name}: {s.reason}</span>)}
            </div>
          )}
          {lastResult && (
            <span className="small" style={{ color: 'var(--go)', fontWeight: 600 }}>
              ✓ Imported {lastResult.total}/{lastResult.total} rows: {lastResult.created} new, {lastResult.updated} updated, {lastResult.unchanged} unchanged{lastResult.skippedOnBlock ? ' (1 player on the block was skipped)' : ''}.
            </span>
          )}

          <h2 style={{ marginTop: 6 }}>Photos from Drive</h2>
          {status && (
            <div className="small stack" style={{ gap: 4 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="label">Players with photos</span>
                <b>{status.photos.withPhoto}/{status.photos.total}</b>
              </div>
              <div className="progress"><i style={{ width: `${status.photos.total ? (status.photos.withPhoto / status.photos.total) * 100 : 0}%` }} /></div>
              <span className={status.photos.failed ? '' : 'muted'} style={status.photos.failed ? { color: '#fca5a5' } : undefined}>
                {status.photos.failed} failed · {status.photos.waiting} waiting · {status.photos.noLink} without a photo link
                {status.photos.withPhoto === status.photos.withLink && status.photos.withLink > 0 ? ' · ✓ all synced' : ''}
              </span>
              {status.photos.lastSync && <span className="muted">Last sync {new Date(status.photos.lastSync.at).toLocaleString()} · {status.photos.lastSync.ok} saved · {status.photos.lastSync.failed} failed</span>}
            </div>
          )}
          <div className="row wrap">
            <button type="button" className="btn" disabled={busy || job?.running} onClick={() => run(() => call('/admin/import/photos', { method: 'POST', body: {} }), 'Photo sync started')}>Sync new photos</button>
            <button type="button" className="btn" disabled={busy || job?.running} onClick={() => run(() => call('/admin/import/photos', { method: 'POST', body: { onlyFailed: true } }), 'Retrying failed photos')}>↻ Retry failed</button>
            <button type="button" className="btn ghost" disabled={busy || job?.running} onClick={async () => (await ask({ title: 'Re-download every photo?', message: 'All player photos are fetched from Drive and processed again. This takes a few minutes.', confirmLabel: 'Re-download' })) && run(() => call('/admin/import/photos', { method: 'POST', body: { force: true } }), 'Re-downloading all photos')}>Re-download all</button>
          </div>
          <p className="muted small" style={{ margin: 0 }}>iPhone (HEIC) photos are converted automatically. "Sync new photos" also resumes an interrupted sync.</p>
          {job && (
            <div className="stack small" style={{ gap: 6 }}>
              <div className="progress"><i style={{ width: `${job.total ? (job.done / job.total) * 100 : 100}%` }} /></div>
              <span>{job.running ? 'Working…' : 'Finished'} {job.done}/{job.total} · {job.ok} ok · {job.failed.length} failed{job.skipped ? ` · ${job.skipped} already done` : ''}</span>
              {job.failed.slice(0, 20).map((f) => (
                <span key={f.playerId} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                  <span className="grow" style={{ color: '#fca5a5' }}>{f.name}: {f.reason}</span>
                  {!job.running && (
                    <button
                      type="button"
                      className="btn sm"
                      disabled={busy}
                      onClick={() => run(async () => {
                        const r = await call(`/admin/players/${f.playerId}/photo/retry`, { method: 'POST' });
                        if (!r.ok) throw new Error(r.reason);
                        setJobs((js) => ({ ...js, photos: { ...js.photos, ok: js.photos.ok + 1, failed: js.photos.failed.filter((x) => x.playerId !== f.playerId) } }));
                        loadStatus();
                      }, `${f.name}: photo saved`)}
                    >
                      Retry
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="card stack">
          <h2>Results & audit</h2>
          <div className="row wrap">
            <button type="button" className="btn primary" onClick={exportXlsx}>⬇ Excel (.xlsx)</button>
            <a className="btn" href="/admin/report" target="_blank" rel="noreferrer">⬇ PDF report</a>
            <button type="button" className="btn ghost" onClick={exportCsv}>CSV</button>
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
              ask({
                title: 'Reset the auction?', message: 'Every sold and unsold player goes back into the pool and all bids are cleared. Teams, players, retained players and settings are kept.', tone: 'danger', expect: 'RESET', confirmLabel: 'Reset auction',
              }).then((yes) => yes && run(() => call('/admin/auction/reset', { method: 'POST', body: { confirm: 'RESET' } }), 'Auction reset'));
            }}
          >
            Reset auction
          </button>
        </div>
      </div>
    </>
  );
}
