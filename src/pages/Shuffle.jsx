import { useCallback, useEffect, useState } from 'react';
import { api, session } from '../lib/api.js';
import { POS_SHORT } from '../lib/format.js';
import {
  Avatar, Spinner, useToast,
} from '../components/ui.jsx';
import { BrandMark } from '../components/Nav.jsx';
import '../shuffle.css';

const shuffled = (arr) => {
  const b = [...arr];
  for (let i = b.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

function Login({ onDone }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="auth-wrap">
      <form
        className="auth-card stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr('');
          try {
            const r = await api('/auth/admin', { method: 'POST', body: { password: pw } });
            session.set('admin', { token: r.token, mustChangePassword: r.mustChangePassword });
            onDone();
          } catch (ex) {
            setErr(ex.message || 'Wrong password');
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="label">Restricted · Admin</span>
        <h1 className="display" style={{ fontSize: 44, margin: 0 }}>Queue order</h1>
        <input className="input" type="password" autoComplete="current-password" placeholder="Admin password" value={pw} onChange={(e) => setPw(e.target.value)} />
        {err && <span className="small" style={{ color: 'var(--signal)' }}>{err}</span>}
        <button type="submit" className="btn primary" disabled={busy || !pw}>Enter</button>
      </form>
    </div>
  );
}

/**
 * Hidden admin page (/shuffle5): set the order players come up in, per position.
 * Shuffle a position (defenders only among defenders, …), or move players up / down by hand.
 */
export default function Shuffle() {
  const [auth, setAuth] = useState(() => session.get('admin'));
  const toast = useToast();
  const [positions, setPositions] = useState([]);
  const [lists, setLists] = useState(null); // { [position]: [player] }
  const [pos, setPos] = useState(null);
  const [dirty, setDirty] = useState({});
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(null);

  const call = useCallback(async (path, opts = {}) => {
    try {
      return await api(path, { ...opts, token: auth?.token });
    } catch (e) {
      if (e.status === 401) { session.clear('admin'); setAuth(null); }
      throw e;
    }
  }, [auth?.token]);

  const load = useCallback(async () => {
    const [settings, players] = await Promise.all([call('/admin/settings'), call('/admin/players')]);
    const order = settings.auction?.positionOrder || ['Defender', 'Midfielder', 'Forward', 'Goalkeeper'];
    const by = {};
    for (const p of players) {
      if (p.status !== 'available') continue;
      (by[p.position] = by[p.position] || []).push(p);
    }
    for (const k of Object.keys(by)) by[k].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
    const list = order.filter((p) => by[p]?.length);
    setPositions(list);
    setLists(by);
    setDirty({});
    setPos((cur) => (cur && by[cur] ? cur : list[0] || null));
  }, [call]);

  useEffect(() => { if (auth?.token) load().catch((e) => toast(e.message, 'error')); }, [auth?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!auth?.token) return <Login onDone={() => setAuth(session.get('admin'))} />;
  if (!lists) return <div className="auth-wrap"><Spinner /></div>;

  const rows = pos ? lists[pos] || [] : [];
  const setRows = (next) => {
    setLists({ ...lists, [pos]: next });
    setDirty({ ...dirty, [pos]: true });
  };
  const move = (i, to) => {
    if (to < 0 || to >= rows.length || to === i) return;
    const next = [...rows];
    const [p] = next.splice(i, 1);
    next.splice(to, 0, p);
    setRows(next);
  };
  const save = async (position = pos) => {
    setBusy(true);
    try {
      await call('/admin/players/order', { method: 'POST', body: { position, ids: lists[position].map((p) => p.id) } });
      setDirty((d) => ({ ...d, [position]: false }));
      toast(`${position} order saved. The queue follows it from the next player.`, 'ok');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="container shuffle-page">
      <header className="sh-head">
        <BrandMark />
        <div>
          <span className="label">Admin · not linked anywhere</span>
          <h1 className="display">Queue order</h1>
          <p className="muted small" style={{ margin: 0 }}>Players come up position by position. Shuffle a position (defenders only among defenders, and so on) or move players by hand, then save. The player already on the block is not affected.</p>
        </div>
        <button type="button" className="btn sm ghost" onClick={() => { session.clear('admin'); setAuth(null); }}>Sign out</button>
      </header>

      <nav className="sh-tabs" aria-label="Positions">
        {positions.map((p) => (
          <button key={p} type="button" className={p === pos ? 'on' : ''} onClick={() => setPos(p)}>
            {p} <span className="mono">{lists[p].length}</span>{dirty[p] && <i className="sh-dot" title="Unsaved changes" />}
          </button>
        ))}
      </nav>

      {pos && (
        <>
          <div className="sh-bar">
            <button type="button" className="btn" disabled={busy || rows.length < 2} onClick={() => setRows(shuffled(rows))}>🔀 Shuffle {POS_SHORT[pos] || pos}</button>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => load()}>↺ Undo changes</button>
            <span className="grow" />
            <button type="button" className="btn primary" disabled={busy || !dirty[pos]} onClick={() => save()}>{dirty[pos] ? 'Save order' : 'Saved'}</button>
          </div>

          <ol className="sh-list">
            {rows.map((p, i) => (
              <li
                key={p.id}
                draggable
                className={drag === i ? 'dragging' : ''}
                onDragStart={() => setDrag(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (drag != null) move(drag, i); setDrag(null); }}
                onDragEnd={() => setDrag(null)}
              >
                <span className="sh-n mono">{String(i + 1).padStart(2, '0')}</span>
                <span className="sh-grip" aria-hidden="true">⋮⋮</span>
                <Avatar player={p} size={36} />
                <span className="sh-name">
                  <b className="ellipsis">{p.name}</b>
                  <span className="tiny">{[p.tierName || p.tier, p.department, p.year].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="sh-btns">
                  <button type="button" className="btn sm ghost" disabled={i === 0} onClick={() => move(i, 0)} title="Move to top" aria-label={`Move ${p.name} to the top`}>⤒</button>
                  <button type="button" className="btn sm ghost" disabled={i === 0} onClick={() => move(i, i - 1)} title="Up" aria-label={`Move ${p.name} up`}>▲</button>
                  <button type="button" className="btn sm ghost" disabled={i === rows.length - 1} onClick={() => move(i, i + 1)} title="Down" aria-label={`Move ${p.name} down`}>▼</button>
                  <button type="button" className="btn sm ghost" disabled={i === rows.length - 1} onClick={() => move(i, rows.length - 1)} title="Move to bottom" aria-label={`Move ${p.name} to the bottom`}>⤓</button>
                </span>
              </li>
            ))}
          </ol>
          {dirty[pos] && (
            <div className="sh-save-bar">
              <span>Unsaved changes to {pos}</span>
              <button type="button" className="btn primary" disabled={busy} onClick={() => save()}>Save order</button>
            </div>
          )}
        </>
      )}
      {!positions.length && <p className="muted">No players left in the queue.</p>}
    </main>
  );
}
