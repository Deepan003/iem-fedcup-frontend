import {
  useCallback, useEffect, useMemo, useState,
} from 'react';
import { money, POSITIONS, POS_SHORT } from '../../lib/format.js';
import {
  Field, Spinner, TeamLogo, Toggle, useAction, logoTransform,
} from '../../components/ui.jsx';
import { useAdmin } from './AdminApp.jsx';
import RetainedEditor from './RetainedEditor.jsx';
import LogoAdjust from './LogoAdjust.jsx';
import PenaltyEditor from './PenaltyEditor.jsx';
import { useConfirm } from '../../components/Dialog.jsx';

const blankTeam = {
  name: '', shortName: '', color: '#e11d48', captainName: '', budget: '',
};

function upload(file) {
  const fd = new FormData();
  fd.append('file', file);
  return fd;
}

function TeamEditor({
  team, liveTeam, players, currency, onSaved, autoAdjust = false, onUploaded, onAdjustDone,
}) {
  const { call } = useAdmin();
  const ask = useConfirm();
  const [run, busy] = useAction();
  const [form, setForm] = useState({ ...team, budget: team.budget ?? '' });
  const [password, setPassword] = useState(null);
  const [adjusting, setAdjusting] = useState(autoAdjust);
  const [ret, setRet] = useState({
    playerId: '', name: '', position: 'Forward', price: '',
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const save = () => run(async () => {
    await call(`/admin/teams/${team.id}`, {
      method: 'PUT',
      body: {
        name: form.name, shortName: form.shortName, color: form.color, captainName: form.captainName, budget: form.budget === '' ? null : Number(form.budget), frozen: form.frozen,
      },
    });
    onSaved();
  }, 'Team saved');

  const retained = (liveTeam?.squad || []).filter((p) => p.retained);
  const pool = players.filter((p) => ['available', 'unsold', 'withheld'].includes(p.status));

  return (
    <div className="card stack" style={{ borderColor: form.color }}>
      {adjusting && (
        <LogoAdjust
          team={team}
          onClose={() => { setAdjusting(false); onAdjustDone?.(); }}
          onSave={(fit) => run(async () => { await call(`/admin/teams/${team.id}`, { method: 'PUT', body: { logoFit: fit } }); onSaved(); }, 'Logo framing saved')}
        />
      )}
      <div className="row">
        {team.logoUrl ? (
          <button type="button" className="logo-adjust-btn" onClick={() => setAdjusting(true)} title="Adjust logo framing">
            <TeamLogo team={team} size={56} />
          </button>
        ) : <TeamLogo team={team} size={56} />}
        <div className="grow">
          <b style={{ fontSize: 18 }}>{team.name}</b>
          <div className="muted small">{liveTeam ? `${liveTeam.count} players · purse ${money(liveTeam.purse, currency)}` : ''}</div>
        </div>
      </div>
      <div className="form-grid">
        <Field label="Team name"><input className="input" value={form.name} onChange={set('name')} /></Field>
        <Field label="Short name"><input className="input" value={form.shortName} onChange={set('shortName')} maxLength={5} /></Field>
        <Field label="Colour"><input className="input" type="color" value={form.color} onChange={set('color')} style={{ padding: 4 }} /></Field>
        <Field label="Captain"><input className="input" value={form.captainName} onChange={set('captainName')} /></Field>
        <Field label="Budget (empty = default)"><input className="input" inputMode="numeric" value={form.budget} onChange={(e) => set('budget')(e.target.value.replace(/\D/g, ''))} /></Field>
      </div>
      <Toggle label="Freeze team" hint="A frozen team cannot bid (e.g. during a dispute)." checked={form.frozen} onChange={set('frozen')} />
      <div className="row wrap">
        <button type="button" className="btn primary" disabled={busy} onClick={save}>Save</button>
        <label className="btn">
          Upload logo
          <input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && run(async () => { await call(`/admin/teams/${team.id}/logo`, { method: 'POST', form: upload(e.target.files[0]) }); onUploaded?.(team.id); setAdjusting(true); onSaved(); }, 'Logo uploaded · adjust the framing')} />
        </label>
        {team.logoUrl && <button type="button" className="btn" onClick={() => setAdjusting(true)}>Adjust logo</button>}
        <label className="btn">
          Captain photo
          <input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && run(async () => { await call(`/admin/teams/${team.id}/captain-photo`, { method: 'POST', form: upload(e.target.files[0]) }); onSaved(); }, 'Photo updated')} />
        </label>
      </div>

      <div className="card" style={{ background: 'var(--bg-2)' }}>
        <h2>Captain login</h2>
        {password ? (
          <p>Password: <span className="kbd">{password}</span> <button type="button" className="btn sm" onClick={() => navigator.clipboard?.writeText(password)}>Copy</button></p>
        ) : <p className="muted small">{team.hasPassword ? 'A password is set.' : 'No password yet. The captain cannot sign in.'}</p>}
        <div className="row wrap">
          {team.hasPassword && <button type="button" className="btn sm" onClick={() => run(async () => setPassword((await call(`/admin/teams/${team.id}/password`)).password))}>Show</button>}
          <button
            type="button"
            className="btn sm"
            onClick={async () => (!team.hasPassword || await ask({ title: 'New captain password?', message: `${team.name}'s captain will be signed out on every device and must use the new password.`, tone: 'warning', confirmLabel: 'Generate' })) && run(async () => {
              setPassword((await call(`/admin/teams/${team.id}/password`, { method: 'POST', body: {} })).password);
              onSaved();
            }, 'New password generated')}
          >
            {team.hasPassword ? 'Regenerate' : 'Generate password'}
          </button>
        </div>
      </div>

      <RetainedEditor team={team} liveTeam={liveTeam} players={players} currency={currency} onSaved={onSaved} />
      <PenaltyEditor team={team} currency={currency} onSaved={onSaved} />

      <button
        type="button"
        className="btn danger sm"
        style={{ alignSelf: 'flex-start' }}
        onClick={async () => (await ask({ title: `Delete ${team.name}?`, message: 'The team, its logo and its captain login are removed for good.', tone: 'danger', confirmLabel: 'Delete team' })) && run(async () => { await call(`/admin/teams/${team.id}`, { method: 'DELETE' }); onSaved(); }, 'Team deleted')}
      >
        Delete team
      </button>
    </div>
  );
}

export default function TeamsAdmin() {
  const { call, auction } = useAdmin();
  const [teams, setTeams] = useState(null);
  const [players, setPlayers] = useState([]);
  const [form, setForm] = useState(blankTeam);
  const [logoFile, setLogoFileRaw] = useState(null);
  const [newFit, setNewFit] = useState(null);
  const [adjustNew, setAdjustNew] = useState(false);
  const [autoAdjustId, setAutoAdjustId] = useState(null);
  const setLogoFile = (file) => { setLogoFileRaw(file); setNewFit(null); setAdjustNew(!!file); };
  const logoPreview = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : null), [logoFile]);
  useEffect(() => () => { if (logoPreview) URL.revokeObjectURL(logoPreview); }, [logoPreview]);
  const [run, busy] = useAction();

  const load = useCallback(() => {
    call('/admin/teams').then(setTeams).catch(() => setTeams([]));
    call('/admin/players').then(setPlayers).catch(() => {});
  }, [call]);
  useEffect(load, [load, auction.state?.dataV]); // live: refresh when data changes anywhere

  if (!teams) return <Spinner />;
  const live = Object.fromEntries((auction.state?.teams || []).map((t) => [t.id, t]));

  return (
    <>
      <h1>Teams</h1>
      <form
        className="card"
        style={{ marginBottom: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const team = await call('/admin/teams', { method: 'POST', body: { ...form, budget: form.budget === '' ? null : Number(form.budget), order: teams.length } });
            if (logoFile) await call(`/admin/teams/${team.id}/logo`, { method: 'POST', form: upload(logoFile) });
            if (logoFile && newFit) await call(`/admin/teams/${team.id}`, { method: 'PUT', body: { logoFit: newFit } });
            setForm(blankTeam);
            setLogoFile(null);
            load();
          }, 'Team added');
        }}
      >
        <h2>Add a team</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
          <div className="stack" style={{ gap: 8 }}>
            <label className="logo-drop" title="Upload team logo">
              {logoPreview ? <img src={logoPreview} alt="Logo preview" style={{ transform: logoTransform(newFit) }} /> : <span>+ Logo<br /><small>PNG / SVG / JPG</small></span>}
              <input type="file" accept="image/*" hidden onChange={(e) => { setLogoFile(e.target.files[0] || null); e.target.value = ''; }} />
            </label>
            {logoPreview && (
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className="btn sm" onClick={() => setAdjustNew(true)}>⤢ Adjust</button>
                <button type="button" className="btn sm ghost" onClick={() => setLogoFile(null)} aria-label="Remove logo">✕</button>
              </div>
            )}
          </div>
          {adjustNew && logoPreview && (
            <LogoAdjust
              team={{ name: form.name || 'New team', color: form.color, logoUrl: logoPreview, logoFit: newFit }}
              onClose={() => setAdjustNew(false)}
              onSave={(fit) => setNewFit(fit.scale === 1 && !fit.x && !fit.y ? null : fit)}
            />
          )}
          <div className="form-grid">
            <Field label="Team name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="Short name"><input className="input" value={form.shortName} maxLength={5} onChange={(e) => setForm({ ...form, shortName: e.target.value })} /></Field>
            <Field label="Colour"><input className="input" type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} style={{ padding: 4 }} /></Field>
            <Field label="Captain"><input className="input" value={form.captainName} onChange={(e) => setForm({ ...form, captainName: e.target.value })} /></Field>
          </div>
        </div>
        <button className="btn primary" style={{ marginTop: 14 }} disabled={busy || !form.name}>Add team</button>
      </form>
      <div className="team-cols">
        {teams.map((t) => (
          <TeamEditor key={`${t.id}-${t.logoUrl}-${t.hasPassword}`} team={t} liveTeam={live[t.id]} players={players} currency={auction.state?.currency} onSaved={load} autoAdjust={autoAdjustId === t.id} onUploaded={setAutoAdjustId} onAdjustDone={() => setAutoAdjustId(null)} />
        ))}
      </div>
    </>
  );
}
