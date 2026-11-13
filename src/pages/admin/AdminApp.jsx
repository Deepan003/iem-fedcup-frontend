import {
  createContext, lazy, Suspense, useCallback, useContext, useMemo, useState,
} from 'react';
import {
  Link, NavLink, Route, Routes,
} from 'react-router-dom';
import { api, session } from '../../lib/api.js';
import { useAuction } from '../../lib/auction.js';
import {
  Field, Spinner, useAction, useToast,
} from '../../components/ui.jsx';
import '../../admin.css';

const Control = lazy(() => import('./Control.jsx'));
const TeamsAdmin = lazy(() => import('./TeamsAdmin.jsx'));
const PlayersAdmin = lazy(() => import('./PlayersAdmin.jsx'));
const SettingsAdmin = lazy(() => import('./SettingsAdmin.jsx'));
const Integrations = lazy(() => import('./Integrations.jsx'));

const AdminCtx = createContext(null);
export const useAdmin = () => useContext(AdminCtx);

function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [run, busy] = useAction();
  return (
    <div className="auth-wrap">
      <form
        className="card auth-card stack"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const r = await api('/auth/admin', { method: 'POST', body: { password } });
            session.set('admin', { token: r.token, mustChangePassword: r.mustChangePassword });
            onLogin();
          });
        }}
      >
        <Link to="/" className="brand"><img src="/favicon.svg" alt="" />IEM FED CUP</Link>
        <h1 className="display" style={{ fontSize: 44 }}>Control room</h1>
        <Field label="Admin password">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" />
        </Field>
        <button className="btn primary lg" disabled={!password || busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}

function ChangePassword({ token, onDone, forced }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [run, busy] = useAction();
  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const r = await api('/admin/password', { method: 'POST', body: { current, next }, token });
          session.set('admin', { token: r.token, mustChangePassword: false });
          onDone();
        }, 'Password changed');
      }}
    >
      <h2>{forced ? 'Set your own admin password first' : 'Change admin password'}</h2>
      {forced && <p className="muted small" style={{ margin: 0 }}>You signed in with the setup password from the server settings. Choose a new one (8+ characters). Other admin devices will be signed out.</p>}
      {!forced && <Field label="Current password"><input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>}
      <Field label="New password"><input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field>
      <button className="btn primary" disabled={next.length < 8 || busy}>Save password</button>
    </form>
  );
}

function Shell({ auth, onLogout, onAuthChange }) {
  const toast = useToast();
  const [jobs, setJobs] = useState({});
  const auction = useAuction({
    token: auth.token,
    onSessionEnded: () => {
      toast('Signed out (password changed on another device).', 'error');
      onLogout();
    },
    onEvent: (type, data) => {
      if (type === 'job') setJobs((j) => ({ ...j, [data.kind]: data }));
    },
  });

  const call = useCallback(async (path, opts = {}) => {
    try {
      return await api(path, { ...opts, token: auth.token });
    } catch (err) {
      if (err.status === 401) onLogout();
      throw err;
    }
  }, [auth.token, onLogout]);

  const ctx = useMemo(() => ({
    token: auth.token, call, auction, jobs, setJobs,
  }), [auth.token, call, auction, jobs]);

  if (auth.mustChangePassword) {
    return <div className="auth-wrap"><div className="auth-card"><ChangePassword token={auth.token} forced onDone={onAuthChange} /></div></div>;
  }

  return (
    <AdminCtx.Provider value={ctx}>
      <div className="admin-shell">
        <nav className="admin-side">
          <Link to="/" className="brand" style={{ fontSize: 22, padding: '4px 10px 14px' }}><img src="/favicon.svg" alt="" />FED CUP</Link>
          <NavLink to="/admin" end>🎙️ Control room</NavLink>
          <NavLink to="/admin/teams">🛡️ Teams</NavLink>
          <NavLink to="/admin/players">👟 Players</NavLink>
          <NavLink to="/admin/settings">⚙️ Rules & views</NavLink>
          <NavLink to="/admin/integrations">🔌 Data & storage</NavLink>
          <div className="spacer" style={{ flex: 1 }} />
          <a href="/studio" target="_blank" rel="noreferrer">📺 Open studio ↗</a>
          <button type="button" className="link" onClick={onLogout}>↩ Sign out</button>
        </nav>
        <section className="admin-main">
          <Suspense fallback={<Spinner />}>
            <Routes>
              <Route index element={<Control />} />
              <Route path="teams" element={<TeamsAdmin />} />
              <Route path="players" element={<PlayersAdmin />} />
              <Route path="settings" element={<SettingsAdmin ChangePassword={ChangePassword} onAuthChange={onAuthChange} />} />
              <Route path="integrations" element={<Integrations />} />
            </Routes>
          </Suspense>
        </section>
      </div>
    </AdminCtx.Provider>
  );
}

export default function AdminApp() {
  const [auth, setAuth] = useState(() => session.get('admin'));
  const refresh = () => setAuth(session.get('admin'));
  const logout = useCallback(() => {
    session.clear('admin');
    setAuth(null);
  }, []);
  if (!auth) return <Login onLogin={refresh} />;
  return <Shell key={auth.token} auth={auth} onLogout={logout} onAuthChange={refresh} />;
}
