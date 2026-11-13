import { useState } from 'react';
import { assetUrl } from '../../lib/api.js';
import { money, POSITIONS, POS_SHORT, initials } from '../../lib/format.js';
import { Field, useAction } from '../../components/ui.jsx';
import { useConfirm } from '../../components/Dialog.jsx';
import { useAdmin } from './AdminApp.jsx';

const blank = {
  playerId: '', name: '', position: 'Midfielder', department: '', year: '', price: '', isCaptain: false,
};

function photoForm(file) {
  const fd = new FormData();
  fd.append('file', file);
  return fd;
}

/** Captain + retained players of one team: add, edit, photo, remove. Prices come off the purse. */
export default function RetainedEditor({ team, liveTeam, players, currency, onSaved }) {
  const { call } = useAdmin();
  const ask = useConfirm();
  const [run, busy] = useAction();
  const [form, setForm] = useState(blank);
  const [photo, setPhoto] = useState(null);
  const [editing, setEditing] = useState(null); // { id, ...fields }

  const members = (liveTeam?.squad || []).filter((p) => p.retained)
    .sort((a, b) => (b.isCaptain - a.isCaptain) || ((b.price || 0) - (a.price || 0)));
  const retainedTotal = members.reduce((s, p) => s + (p.price || 0), 0);
  const pool = players.filter((p) => ['available', 'unsold', 'withheld'].includes(p.status));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));

  const add = () => run(async () => {
    const body = form.playerId
      ? { playerId: form.playerId, price: Number(form.price || 0), isCaptain: form.isCaptain, department: form.department }
      : { ...form, price: Number(form.price || 0) };
    const r = await call(`/admin/teams/${team.id}/retained`, { method: 'POST', body });
    if (photo) await call(`/admin/players/${r.playerId}/photo`, { method: 'POST', form: photoForm(photo) });
    setForm(blank);
    setPhoto(null);
    onSaved();
  }, form.isCaptain ? 'Captain added' : 'Retained player added');

  const save = () => run(async () => {
    const { id, ...fields } = editing;
    await call(`/admin/teams/${team.id}/retained/${id}`, { method: 'PUT', body: { ...fields, price: Number(fields.price || 0) } });
    setEditing(null);
    onSaved();
  }, 'Saved: purse updated');

  return (
    <div className="card" style={{ background: 'var(--bg-2)' }}>
      <div className="ret-head">
        <h2 style={{ margin: 0 }}>Captain & retained</h2>
        <span className="chip">{members.length} player{members.length === 1 ? '' : 's'} · {money(retainedTotal, currency)} off purse</span>
      </div>

      {members.length === 0 && <p className="muted small">None yet. Captains cost nothing; retained players' prices are taken off the team budget.</p>}
      <div className="stack" style={{ gap: 0, marginTop: 8 }}>
        {members.map((p) => (editing?.id === p.id ? (
          <div key={p.id} className="ret-edit">
            <div className="form-grid">
              <Field label="Name"><input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
              <Field label="Department"><input className="input" value={editing.department} onChange={(e) => setEditing({ ...editing, department: e.target.value })} /></Field>
              <Field label="Year"><input className="input" value={editing.year} onChange={(e) => setEditing({ ...editing, year: e.target.value })} /></Field>
              <Field label="Position"><select className="input" value={editing.position} onChange={(e) => setEditing({ ...editing, position: e.target.value })}>{POSITIONS.map((x) => <option key={x}>{x}</option>)}</select></Field>
              {!editing.isCaptain && <Field label={`Price (${currency})`}><input className="input" inputMode="numeric" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value.replace(/\D/g, '') })} /></Field>}
            </div>
            <label className="toggle" style={{ borderBottom: 0 }}><span>Captain (free)</span><input type="checkbox" checked={editing.isCaptain} onChange={(e) => setEditing({ ...editing, isCaptain: e.target.checked })} /></label>
            <div className="row"><button type="button" className="btn sm primary" disabled={busy} onClick={save}>Save</button><button type="button" className="btn sm ghost" onClick={() => setEditing(null)}>Cancel</button></div>
          </div>
        ) : (
          <div key={p.id} className="ret-row">
            <label className="ret-photo" title="Change photo">
              {p.thumbUrl ? <img src={assetUrl(p.thumbUrl)} alt="" /> : <span>{initials(p.name)}</span>}
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && run(async () => { await call(`/admin/players/${p.id}/photo`, { method: 'POST', form: photoForm(e.target.files[0]) }); onSaved(); }, 'Photo updated')} />
            </label>
            <div className="grow" style={{ minWidth: 0 }}>
              <b className="ellipsis" style={{ display: 'block' }}>{p.name} {p.isCaptain && <span className="cap-badge">C</span>}</b>
              <span className="tiny">{POS_SHORT[p.position]}{p.department ? ` · ${p.department}` : ''}{p.year ? ` · ${p.year}` : ''}</span>
            </div>
            <b className="mono small">{p.isCaptain ? 'Free' : money(p.price, currency)}</b>
            <button type="button" className="btn sm ghost" onClick={() => setEditing({ id: p.id, name: p.name, department: p.department || '', year: p.year || '', position: p.position, price: String(p.price ?? 0), isCaptain: !!p.isCaptain })}>Edit</button>
            <button type="button" className="btn sm ghost" onClick={async () => (await ask({ title: `Remove ${p.name}?`, message: `${p.name} goes back into the auction pool${p.isCaptain ? '' : ` and ${team.name} gets ${money(p.price, currency)} back`}.`, tone: 'warning', confirmLabel: 'Remove' })) && run(async () => { await call(`/admin/teams/${team.id}/retained/${p.id}`, { method: 'DELETE' }); onSaved(); })}>✕</button>
          </div>
        )))}
      </div>

      <div className="ret-add">
        <div className="row wrap" style={{ gap: 14 }}>
          <label className="toggle" style={{ borderBottom: 0, padding: 0, gap: 10 }}><input type="checkbox" checked={form.isCaptain} onChange={set('isCaptain')} /><span>This is the captain (free)</span></label>
        </div>
        <div className="form-grid" style={{ marginTop: 10 }}>
          <Field label="From player list (optional)">
            <select className="input" value={form.playerId} onChange={set('playerId')}>
              <option value="">New person (fill in below)</option>
              {pool.map((p) => <option key={p.id} value={p.id}>{POS_SHORT[p.position]} · {p.name}</option>)}
            </select>
          </Field>
          {!form.playerId && <Field label="Name"><input className="input" value={form.name} onChange={set('name')} /></Field>}
          {!form.playerId && <Field label="Position"><select className="input" value={form.position} onChange={set('position')}>{POSITIONS.map((x) => <option key={x}>{x}</option>)}</select></Field>}
          <Field label="Department"><input className="input" value={form.department} onChange={set('department')} placeholder="e.g. CSE" /></Field>
          {!form.playerId && <Field label="Year"><input className="input" value={form.year} onChange={set('year')} placeholder="e.g. 3rd" /></Field>}
          {!form.isCaptain && <Field label={`Retention price (${currency})`}><input className="input" inputMode="numeric" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value.replace(/\D/g, '') })} /></Field>}
          <Field label="Photo (optional)"><input className="input" type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files[0] || null)} style={{ padding: 8 }} /></Field>
        </div>
        <button type="button" className="btn sm primary" style={{ marginTop: 12 }} disabled={busy || (!form.playerId && !form.name) || (!form.isCaptain && form.price === '')} onClick={add}>
          {form.isCaptain ? 'Add captain' : 'Add retained player'}
        </button>
      </div>
    </div>
  );
}
