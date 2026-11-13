import {
  useCallback, useEffect, useMemo, useState,
} from 'react';
import { assetUrl } from '../../lib/api.js';
import { money, POSITIONS, POS_SHORT } from '../../lib/format.js';
import {
  Field, Spinner, useAction,
} from '../../components/ui.jsx';
import { useAdmin } from './AdminApp.jsx';
import { useConfirm } from '../../components/Dialog.jsx';

const STATUSES = ['all', 'available', 'sold', 'unsold', 'retained', 'withheld'];

function Row({ p, tiers, teamName, currency, selected, onSelect, onSaved }) {
  const { call } = useAdmin();
  const ask = useConfirm();
  const [run, busy] = useAction();
  const [edit, setEdit] = useState(null);
  const locked = ['sold', 'retained'].includes(p.status);
  const save = () => run(async () => {
    await call(`/admin/players/${p.id}`, {
      method: 'PUT',
      body: {
        name: edit.name, position: edit.position, tier: edit.tier, year: edit.year, basePrice: edit.basePrice === '' ? null : Number(edit.basePrice),
      },
    });
    setEdit(null);
    onSaved();
  }, 'Saved');
  const photo = (file) => {
    const fd = new FormData();
    fd.append('file', file);
    run(async () => {
      await call(`/admin/players/${p.id}/photo`, { method: 'POST', form: fd });
      onSaved();
    }, 'Photo updated');
  };

  return (
    <tr>
      <td><input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} /></td>
      <td>
        <label style={{ cursor: 'pointer' }} title={p.photoError || 'Upload photo'}>
          {p.thumbUrl ? <img className="thumb" src={assetUrl(p.thumbUrl)} alt="" loading="lazy" /> : <span className="thumb" style={{ color: p.photoError ? '#fca5a5' : undefined }}>{p.photoError ? '⚠' : '+'}</span>}
          <input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && photo(e.target.files[0])} />
        </label>
      </td>
      {edit ? (
        <>
          <td><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></td>
          <td>
            <select className="input" value={edit.position} onChange={(e) => setEdit({ ...edit, position: e.target.value })}>{POSITIONS.map((x) => <option key={x}>{x}</option>)}</select>
          </td>
          <td>
            <select className="input" value={edit.tier} onChange={(e) => setEdit({ ...edit, tier: e.target.value })}>
              <option value="">—</option>
              {tiers.map((t) => <option key={t.name}>{t.name}</option>)}
            </select>
          </td>
          <td><input className="input" value={edit.year} onChange={(e) => setEdit({ ...edit, year: e.target.value })} style={{ width: 90 }} /></td>
          <td><input className="input" placeholder="tier" value={edit.basePrice} onChange={(e) => setEdit({ ...edit, basePrice: e.target.value.replace(/\D/g, '') })} style={{ width: 80 }} /></td>
        </>
      ) : (
        <>
          <td><b>{p.name}</b>{p.photoError && <div className="small" style={{ color: '#fca5a5' }}>{p.photoError}</div>}</td>
          <td>{POS_SHORT[p.position]}</td>
          <td>{p.tier || <span className="muted">—</span>}</td>
          <td className="muted">{p.year}</td>
          <td>{p.basePrice ?? <span className="muted">tier</span>}</td>
        </>
      )}
      <td>
        <span className="chip">{p.status}</span>
        {p.teamId && <div className="small muted">{teamName(p.teamId)} · {money(p.price, currency)}</div>}
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>
        {edit ? (
          <>
            <button type="button" className="btn sm primary" disabled={busy} onClick={save}>Save</button>
            <button type="button" className="btn sm ghost" onClick={() => setEdit(null)}>Cancel</button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn sm"
              onClick={() => setEdit({
                name: p.name, position: p.position, tier: p.tier || '', year: p.year || '', basePrice: p.basePrice ?? '',
              })}
            >
              Edit
            </button>
            {!locked && (
              <button type="button" className="btn sm ghost" disabled={busy} onClick={() => run(async () => { await call(`/admin/players/${p.id}`, { method: 'PUT', body: { withheld: p.status !== 'withheld' } }); onSaved(); })}>
                {p.status === 'withheld' ? 'Include' : 'Withhold'}
              </button>
            )}
            {!locked && (
              <button type="button" className="btn sm ghost" disabled={busy} onClick={async () => (await ask({ title: `Delete ${p.name}?`, message: 'The player is removed from the pool. Importing the sheet again would add them back.', tone: 'danger', confirmLabel: 'Delete' })) && run(async () => { await call(`/admin/players/${p.id}`, { method: 'DELETE' }); onSaved(); })}>✕</button>
            )}
          </>
        )}
      </td>
    </tr>
  );
}

export default function PlayersAdmin() {
  const { call, auction } = useAdmin();
  const ask = useConfirm();
  const [players, setPlayers] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState('all');
  const [status, setStatus] = useState('all');
  const [sel, setSel] = useState(() => new Set());
  const [bulkTier, setBulkTier] = useState('');
  const [add, setAdd] = useState({ name: '', position: 'Defender', tier: '' });
  const [run, busy] = useAction();

  const load = useCallback(() => {
    call('/admin/players').then(setPlayers).catch(() => setPlayers([]));
  }, [call]);
  useEffect(() => {
    load();
    call('/admin/settings').then((s) => setTiers(s.auction.tiers)).catch(() => {});
    call('/admin/teams').then(setTeams).catch(() => {});
  }, [call, load]);
  // Live: refresh when players change anywhere (import, photos, sales, edits on another device).
  useEffect(() => { load(); }, [load, auction.state?.dataV, auction.state?.stats?.sold, auction.state?.stats?.unsold, auction.state?.stats?.retained]);

  const teamName = (id) => teams.find((t) => t.id === id)?.name || '';
  const list = useMemo(() => (players || []).filter((p) => (pos === 'all' || p.position === pos)
    && (status === 'all' || p.status === status)
    && (!q || p.name.toLowerCase().includes(q.toLowerCase()))), [players, pos, status, q]);

  if (!players) return <Spinner />;
  const counts = POSITIONS.map((p) => `${POS_SHORT[p]} ${players.filter((x) => x.position === p).length}`).join(' · ');
  const missingPhotos = players.filter((p) => !p.thumbUrl).length;

  return (
    <>
      <h1>Players</h1>
      <div className="status-bar">
        <span className="chip">{players.length} players</span>
        <span className="chip">{counts}</span>
        {missingPhotos > 0 && <span className="chip" style={{ color: '#fcd34d' }}>{missingPhotos} without photo</span>}
      </div>

      <div className="cols" style={{ marginBottom: 14 }}>
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await call('/admin/players', { method: 'POST', body: add });
              setAdd({ ...add, name: '' });
              load();
            }, 'Player added');
          }}
        >
          <h2>Add a player</h2>
          <div className="form-grid">
            <Field label="Name"><input className="input" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} required /></Field>
            <Field label="Position"><select className="input" value={add.position} onChange={(e) => setAdd({ ...add, position: e.target.value })}>{POSITIONS.map((p) => <option key={p}>{p}</option>)}</select></Field>
            <Field label="Tier"><select className="input" value={add.tier} onChange={(e) => setAdd({ ...add, tier: e.target.value })}><option value="">—</option>{tiers.map((t) => <option key={t.name}>{t.name}</option>)}</select></Field>
          </div>
          <button className="btn primary" style={{ marginTop: 12 }} disabled={busy || !add.name}>Add</button>
        </form>
        <div className="card stack">
          <h2>Queue order</h2>
          <p className="muted small" style={{ margin: 0 }}>Players come up by position (order set in Rules) and then by this order. Shuffle to make the order random and fair.</p>
          <div className="row wrap">
            <button type="button" className="btn" disabled={busy || auction.state?.lot?.phase === 'bidding'} onClick={async () => (await ask({ title: 'Shuffle the queue?', message: 'Every available player gets a new random place in the auction order.', confirmLabel: 'Shuffle' })) && run(async () => { await call('/admin/players/shuffle', { method: 'POST', body: {} }); load(); }, 'Queue shuffled')}>🔀 Shuffle all</button>
            {POSITIONS.map((p) => <button type="button" key={p} className="btn sm" disabled={busy} onClick={() => run(async () => { await call('/admin/players/shuffle', { method: 'POST', body: { position: p } }); load(); }, `${p}s shuffled`)}>{POS_SHORT[p]}</button>)}
          </div>
        </div>
      </div>

      <div className="row wrap" style={{ marginBottom: 10 }}>
        <input className="input" style={{ maxWidth: 260 }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" style={{ width: 'auto' }} value={pos} onChange={(e) => setPos(e.target.value)}><option value="all">All positions</option>{POSITIONS.map((p) => <option key={p}>{p}</option>)}</select>
        <select className="input" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>)}</select>
        {sel.size > 0 && (
          <>
            <span className="chip">{sel.size} selected</span>
            <select className="input" style={{ width: 'auto' }} value={bulkTier} onChange={(e) => setBulkTier(e.target.value)}>
              <option value="">Set tier…</option>
              <option value="__none">No tier</option>
              {tiers.map((t) => <option key={t.name}>{t.name}</option>)}
            </select>
            <button
              type="button"
              className="btn sm primary"
              disabled={!bulkTier || busy}
              onClick={() => run(async () => {
                await call('/admin/players/bulk', { method: 'POST', body: { ids: [...sel], tier: bulkTier === '__none' ? '' : bulkTier } });
                setSel(new Set());
                load();
              }, 'Tier updated')}
            >
              Apply
            </button>
          </>
        )}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th><input type="checkbox" checked={list.length > 0 && list.every((p) => sel.has(p.id))} onChange={(e) => setSel(e.target.checked ? new Set(list.map((p) => p.id)) : new Set())} /></th>
              <th>Photo</th><th>Name</th><th>Pos</th><th>Tier</th><th>Year</th><th>Base</th><th>Status</th><th />
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <Row
                key={p.id}
                p={p}
                tiers={tiers}
                teamName={teamName}
                currency={auction.state?.currency}
                selected={sel.has(p.id)}
                onSelect={(on) => setSel((s) => {
                  const n = new Set(s);
                  if (on) n.add(p.id); else n.delete(p.id);
                  return n;
                })}
                onSaved={load}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
