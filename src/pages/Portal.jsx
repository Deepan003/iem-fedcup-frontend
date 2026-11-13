import { useEffect, useMemo, useState } from 'react';
import { api, API_URL } from '../lib/api.js';
import { money, POSITIONS } from '../lib/format.js';
import {
  Field, MiniPlayer, Spinner, TeamLogo,
} from '../components/ui.jsx';

const STATUS = {
  sold: 'Sold', retained: 'Retained', unsold: 'Unsold', available: 'In the auction pool',
};

async function portalFetch(path, code) {
  const res = await fetch(`${API_URL}/api${path}`, { headers: code ? { 'x-portal-code': code } : {} });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(body?.error || 'ERROR'), { code: body?.error });
  return body;
}

export default function Portal() {
  const [config, setConfig] = useState(null);
  const [code, setCode] = useState(() => sessionStorage.getItem('fedcup.portal') || '');
  const [codeInput, setCodeInput] = useState('');
  const [players, setPlayers] = useState(null);
  const [teams, setTeams] = useState([]);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [pos, setPos] = useState('All');

  useEffect(() => {
    api('/config').then(setConfig).catch(() => setError('Could not reach the server.'));
    api('/teams').then(setTeams).catch(() => {});
  }, []);

  useEffect(() => {
    if (!config || config.portalMode === 'off') return;
    if (config.portalMode === 'code' && !code) return;
    portalFetch('/players', code).then((p) => {
      setPlayers(p);
      setError('');
    }).catch((e) => {
      if (e.code === 'PORTAL_CODE_REQUIRED') {
        sessionStorage.removeItem('fedcup.portal');
        setCode('');
        setError('Wrong access code.');
      } else setError('Could not load players.');
    });
  }, [config, code]);

  const teamMap = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);
  const list = useMemo(() => {
    if (!players) return [];
    const s = q.trim().toLowerCase();
    return players
      .filter((p) => (pos === 'All' || p.position === pos) && (!s || p.name.toLowerCase().includes(s)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [players, q, pos]);

  if (!config) return <div className="auth-wrap">{error ? <p className="muted">{error}</p> : <Spinner />}</div>;
  if (config.portalMode === 'off') {
    return <div className="auth-wrap"><div className="card auth-card"><h1 className="display" style={{ fontSize: 40 }}>Player portal</h1><p className="muted">The player portal is closed right now. Check back after the auction.</p></div></div>;
  }
  if (config.portalMode === 'code' && !code) {
    return (
      <div className="auth-wrap">
        <form className="card auth-card stack" onSubmit={(e) => { e.preventDefault(); sessionStorage.setItem('fedcup.portal', codeInput.trim()); setCode(codeInput.trim()); }}>
          <h1 className="display" style={{ fontSize: 40 }}>Player portal</h1>
          <p className="muted" style={{ margin: 0 }}>Enter the access code shared by the organisers.</p>
          {error && <p style={{ color: '#fca5a5', margin: 0 }}>{error}</p>}
          <Field label="Access code"><input className="input" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} /></Field>
          <button className="btn primary" disabled={!codeInput.trim()}>Continue</button>
        </form>
      </div>
    );
  }

  return (
    <main className="container section" style={{ paddingTop: 30 }}>
      <h1 className="section-title">Find <em>your</em> name</h1>
      <p className="muted">Search for yourself to see whether you were picked, by which team and for how much.</p>
      <div className="row wrap" style={{ margin: '18px 0' }}>
        <input className="input grow" style={{ minWidth: 220 }} placeholder="Type your name…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <div className="tabs" style={{ flex: 'none' }}>
          {['All', ...POSITIONS].map((p) => <button type="button" key={p} className={pos === p ? 'on' : ''} onClick={() => setPos(p)}>{p === 'All' ? 'All' : `${p}s`}</button>)}
        </div>
      </div>
      {!players ? <Spinner /> : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {list.length === 0 && <p className="muted">No players match.</p>}
          {list.slice(0, 120).map((p, i) => {
            const t = p.teamId ? teamMap[p.teamId] : null;
            return (
              <div key={p.id} className="result-card" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                <MiniPlayer player={p} />
                <div className="grow stack" style={{ gap: 4 }}>
                  <b className="ellipsis">{p.name}</b>
                  <span className="muted small">{p.position}{p.year ? ` · ${p.year}` : ''}</span>
                  <span className="row small">
                    {t && <TeamLogo team={t} size={22} />}
                    <b style={{ color: p.status === 'sold' || p.status === 'retained' ? '#86efac' : undefined }}>
                      {STATUS[p.status] || p.status}{t ? ` · ${t.name}` : ''}
                    </b>
                  </span>
                  {p.price != null && <span className="small">for <b>{money(p.price, config.currency)}</b></span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
