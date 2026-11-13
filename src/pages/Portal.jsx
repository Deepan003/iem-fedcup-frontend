import { useEffect, useMemo, useState } from 'react';
import { api, API_URL, assetUrl } from '../lib/api.js';
import { useAuction } from '../lib/auction.js';
import { money, POSITIONS, initials } from '../lib/format.js';
import { Spinner, TeamLogo } from '../components/ui.jsx';

const STATUS = {
  sold: 'Sold', retained: 'Retained', unsold: 'Unsold', available: 'In the pool',
};

async function portalFetch(path, code) {
  const res = await fetch(`${API_URL}/api${path}`, { headers: code ? { 'x-portal-code': code } : {} });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(body?.error || 'ERROR'), { code: body?.error });
  return body;
}

function Gate({ title, children }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card stack" style={{ gap: 18 }}>
        <span className="idx">Player portal</span>
        <h1 className="display"><span className="mask"><span>{title}</span></span></h1>
        {children}
      </div>
    </div>
  );
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
        setError('That access code is not right.');
      } else setError('Could not load players.');
    });
  }, [config, code]);

  // Live: when a player is sold/retained or data changes, refresh the list automatically.
  const { state: live } = useAuction();
  const liveKey = live ? `${live.dataV}-${live.stats.sold}-${live.stats.unsold}-${live.stats.retained}` : '';
  useEffect(() => {
    if (!liveKey || !players) return;
    portalFetch('/players', code).then(setPlayers).catch(() => {});
    api('/teams').then(setTeams).catch(() => {});
  }, [liveKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
    return <Gate title="Closed"><p className="muted">The player portal opens after the auction. Check back soon.</p></Gate>;
  }
  if (config.portalMode === 'code' && !code) {
    return (
      <Gate title="Access">
        <form className="stack" onSubmit={(e) => { e.preventDefault(); sessionStorage.setItem('fedcup.portal', codeInput.trim()); setCode(codeInput.trim()); }}>
          <p className="muted">Enter the access code shared by the organisers.</p>
          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
          <input className="input" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="Access code" />
          <button className="btn primary lg" disabled={!codeInput.trim()}>Continue <span className="arrow">→</span></button>
        </form>
      </Gate>
    );
  }

  return (
    <main className="container" style={{ padding: '120px 0 80px' }}>
      <div className="sect-head" style={{ marginBottom: 30 }}>
        <span className="idx">Player portal</span>
        <h1 className="big-title"><span className="mask"><span>Find your</span></span><span className="mask"><span style={{ animationDelay: '0.08s' }}><em>name.</em></span></span></h1>
      </div>
      <label className="search-line">
        <span className="sr-only">Search players</span>
        <input placeholder="Type here" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <span className="label" style={{ paddingBottom: 10 }}>{list.length} found</span>
      </label>
      <div className="tabs" style={{ margin: '18px 0 8px' }}>
        {['All', ...POSITIONS].map((p) => <button type="button" key={p} className={pos === p ? 'on' : ''} onClick={() => setPos(p)}>{p === 'All' ? 'Everyone' : `${p}s`}</button>)}
      </div>
      {!players ? <Spinner /> : (
        <div>
          {list.length === 0 && <p className="muted" style={{ padding: '30px 0' }}>Nobody by that name yet.</p>}
          {list.slice(0, 120).map((p, i) => {
            const t = p.teamId ? teamMap[p.teamId] : null;
            const url = assetUrl(p.thumbUrl || p.photoUrl);
            return (
              <div key={p.id} className="result" style={{ animationDelay: `${Math.min(i, 14) * 25}ms` }}>
                <div className="mini" style={{ width: '100%' }}>{url ? <img src={url} alt="" loading="lazy" /> : <div className="ph" style={{ fontSize: 22 }}>{initials(p.name)}</div>}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="nm ellipsis">{p.name}</div>
                  <div className="row wrap" style={{ gap: 12, marginTop: 6 }}>
                    <span className="tiny">{p.position}{p.year ? ` · ${p.year}` : ''}</span>
                    {t && <span className="row tiny" style={{ gap: 6, color: 'var(--bone)' }}><TeamLogo team={t} size={18} />{t.name}</span>}
                    {p.price != null && <span className="tiny" style={{ color: 'var(--bone)' }}>{money(p.price, config.currency)}</span>}
                  </div>
                </div>
                <span className={`stamp ${p.status}`}>{STATUS[p.status] || p.status}</span>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
