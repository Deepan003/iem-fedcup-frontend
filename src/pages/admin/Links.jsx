import { useCallback, useEffect, useState } from 'react';
import { Spinner, TeamLogo, useAction, useToast } from '../../components/ui.jsx';
import { useAdmin } from './AdminApp.jsx';
import { useConfirm } from '../../components/Dialog.jsx';

const origin = () => window.location.origin;

/** Clipboard with a fallback for older browsers / non-secure pages. */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

const inviteText = (team, link, password, title) => [
  `${title} · Captain room`,
  `Team: ${team.name}`,
  `Link: ${link}`,
  `Password: ${password}`,
  '',
  'Open the link, check your team is selected, enter the password and tap "Enter captain room".',
  'Please do not share this password.',
].join('\n');

function LinkRow({ label, hint, path, warn = false, onCopy }) {
  const url = `${origin()}${path}`;
  return (
    <div className={`link-row ${warn ? 'warn' : ''}`}>
      <div className="grow" style={{ minWidth: 0 }}>
        <b>{label}</b>
        {hint && <div className="muted small">{hint}</div>}
        <a className="link-url ellipsis" href={path} target="_blank" rel="noreferrer">{url}</a>
      </div>
      <button type="button" className="btn sm" onClick={() => onCopy(url, label)}>Copy</button>
    </div>
  );
}

/** Admin: every shareable address in one place, with per-captain invites. */
export default function Links() {
  const { call, auction } = useAdmin();
  const toast = useToast();
  const [run, busy] = useAction();
  const ask = useConfirm();
  const [teams, setTeams] = useState(null);
  const [portalMode, setPortalMode] = useState('public');
  const title = auction.state?.studio?.title || 'IEM FED Cup Auction';

  const load = useCallback(() => {
    call('/admin/teams').then(setTeams).catch(() => setTeams([]));
    call('/admin/settings').then((s) => setPortalMode(s.portal?.mode || 'public')).catch(() => {});
  }, [call]);
  useEffect(load, [load, auction.state?.dataV]); // live: new teams / passwords appear here too

  const copy = async (text, what) => {
    if (await copyText(text)) toast(`${what} copied`, 'ok');
    else toast('Could not copy. Select the text and copy it manually.', 'error');
  };

  const captainPath = (t) => `/captain?team=${encodeURIComponent(t.id)}`;

  const copyInvite = (t) => run(async () => {
    const { password } = await call(`/admin/teams/${t.id}/password`);
    if (!password) throw new Error(`${t.name} has no password yet. Create one first.`);
    await copy(inviteText(t, `${origin()}${captainPath(t)}`, password, title), `${t.name} invite`);
  });

  const createPassword = (t) => run(async () => {
    await call(`/admin/teams/${t.id}/password`, { method: 'POST', body: {} });
    load();
  }, `Password created for ${t.name}`);

  const copyAll = () => run(async () => {
    const parts = [];
    const missing = [];
    for (const t of teams) {
      // eslint-disable-next-line no-await-in-loop
      const { password } = await call(`/admin/teams/${t.id}/password`);
      if (password) parts.push(inviteText(t, `${origin()}${captainPath(t)}`, password, title));
      else missing.push(t.name);
    }
    if (!parts.length) throw new Error('No team has a captain password yet.');
    await copy(parts.join('\n\n────────────\n\n'), `${parts.length} invites`);
    if (missing.length) toast(`No password yet: ${missing.join(', ')}`, 'error', 6000);
  });

  // new passwords for every team in one go: all captains are signed out, the new invites are copied + saved as a file
  const resetAll = async () => {
    if (!teams?.length) return;
    const ok = await ask({
      title: `Reset ALL ${teams.length} captain passwords?`,
      message: 'Every team gets a new password at once. All captains are signed out immediately and must sign in again with the new password (during a live auction they cannot bid until they are back in). The new invites are copied and saved as a text file for you.',
      tone: 'danger', confirmLabel: 'Reset all passwords',
    });
    if (!ok) return;
    run(async () => {
      const parts = [];
      for (const t of teams) {
        // eslint-disable-next-line no-await-in-loop
        const { password } = await call(`/admin/teams/${t.id}/password`, { method: 'POST', body: {} });
        parts.push(inviteText(t, `${origin()}${captainPath(t)}`, password, title));
      }
      load();
      const text = parts.join('\n\n────────────\n\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      a.download = 'FED Cup - new captain passwords.txt'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      await copy(text, `${parts.length} new invites`);
    }, `New passwords for all ${teams.length} teams`);
  };

  if (!teams) return <Spinner />;
  const portalHint = portalMode === 'off'
    ? 'The portal is currently CLOSED (Rules & views). Visitors see a "closed" page.'
    : portalMode === 'code'
      ? 'Private: visitors need the access code set in Rules & views. Share the code separately.'
      : 'Public: anyone with the link can search players.';

  return (
    <>
      <h1>Links</h1>
      <p className="muted" style={{ marginTop: -6, marginBottom: 18 }}>Every address to share, ready to copy. Links follow this website&apos;s address ({origin()}).</p>

      <div className="cols-2">
        <div className="stack">
          <div className="card stack">
            <h2>For everyone</h2>
            <LinkRow label="Home page" path="/" onCopy={copy} />
            <LinkRow label="Live auction (studio)" hint="The live show for phones and laptops." path="/studio" onCopy={copy} />
            <LinkRow label="Player portal" hint={portalHint} path="/players" onCopy={copy} />
          </div>
          <div className="card stack">
            <h2>Projector / big screen</h2>
            <LinkRow label="Studio, big-screen layout" hint="Open on the projector laptop, then click once to turn on sound." path="/studio?screen=1" onCopy={copy} />
          </div>
          <div className="card stack">
            <h2>Organisers only</h2>
            <LinkRow label="Admin control room" hint="Do not share: needs the admin password." path="/admin" warn onCopy={copy} />
            <LinkRow label="Report & PDF" hint="Organisers only." path="/admin/report" warn onCopy={copy} />
          </div>
        </div>

        <div className="card stack">
          <div className="ret-head">
            <h2 style={{ margin: 0 }}>Captains</h2>
            <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn sm danger" disabled={busy || !teams.length} onClick={resetAll} title="New password for every team at once">⟲ Reset all passwords</button>
              <button type="button" className="btn sm primary" disabled={busy || !teams.length} onClick={copyAll}>Copy all invites</button>
            </span>
          </div>
          <p className="muted small" style={{ margin: 0 }}>Each link opens the captain room with that team already selected. &quot;Copy invite&quot; adds the password and short instructions, ready to paste into WhatsApp. Send each invite only to that team&apos;s captain.</p>
          {teams.length === 0 && <p className="muted small">No teams yet. Add them on the Teams page.</p>}
          {teams.map((t) => {
            const url = `${origin()}${captainPath(t)}`;
            return (
              <div key={t.id} className="link-row" style={{ '--c': t.color }}>
                <TeamLogo team={t} size={36} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <b style={{ display: "block", overflowWrap: "anywhere" }}>{t.name}</b>
                  <a className="link-url ellipsis" href={captainPath(t)} target="_blank" rel="noreferrer">{url}</a>
                  {!t.hasPassword && <div className="small" style={{ color: 'var(--amber)' }}>No password yet: the captain cannot sign in.</div>}
                </div>
                <div className="link-actions">
                  <button type="button" className="btn sm" onClick={() => copy(url, `${t.name} link`)}>Copy link</button>
                  {t.hasPassword
                    ? <button type="button" className="btn sm primary" disabled={busy} onClick={() => copyInvite(t)}>Copy invite</button>
                    : <button type="button" className="btn sm" disabled={busy} onClick={() => createPassword(t)}>Create password</button>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
