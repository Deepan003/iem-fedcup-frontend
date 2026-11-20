import { useEffect, useMemo, useState } from 'react';
import { API_URL, assetUrl } from '../lib/api.js';
import { initials, money } from '../lib/format.js';
import { Spinner, TeamLogo } from './ui.jsx';
import '../story.css';

const STATUS = {
  sold: 'Sold', retained: 'Retained', unsold: 'Unsold', available: 'Still in the pool',
};
const time = (at) => (at ? new Date(at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) : '');

/**
 * One player's page: photo, result, and every bid made for them, lot by lot.
 * Opened from the Players list (or a shared ?p=<id> link). While the player is on the block,
 * the live bids come straight from the auction feed.
 */
export default function PlayerStory({
  id, code, teamMap, currency, live, onClose, onCard,
}) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const onBlock = live?.lot?.playerId === id && ['live', 'paused'].includes(live?.status);
  const liveKey = live ? `${live.dataV}-${live.stats?.sold}-${live.stats?.unsold}` : '';

  useEffect(() => {
    let off = false;
    fetch(`${API_URL}/api/players/${encodeURIComponent(id)}/bids`, { headers: code ? { 'x-portal-code': code } : {} })
      .then(async (r) => {
        const b = await r.json().catch(() => null);
        if (!r.ok) throw new Error(b?.error === 'NOT_FOUND' ? 'Player not found.' : 'Could not load this player.');
        return b;
      })
      .then((b) => { if (!off) { setData(b); setErr(''); } })
      .catch((e) => { if (!off) setErr(e.message); });
    return () => { off = true; };
  }, [id, code, liveKey]);

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = prev; };
  }, [onClose]);

  // live lot: newest-first history from the feed, shown oldest-first like the saved lots
  const liveLot = useMemo(() => (onBlock ? {
    seq: live.lot.seq, round: live.round, live: true, bids: [...(live.lot.history || [])].reverse(),
  } : null), [onBlock, live?.lot]); // eslint-disable-line react-hooks/exhaustive-deps

  const p = data?.player;
  const team = p?.teamId ? teamMap[p.teamId] : null;
  const url = assetUrl(p?.photoUrl || p?.thumbUrl);
  const lots = useMemo(() => {
    const saved = (data?.lots || []).filter((l) => !liveLot || l.seq !== liveLot.seq);
    return (liveLot ? [...saved, liveLot] : saved).slice().reverse(); // latest lot first
  }, [data, liveLot]);
  const allBids = lots.flatMap((l) => l.bids);
  const bidders = new Set(allBids.map((b) => b.teamId)).size;

  // the bidding-war film: the winning lot, or the latest finished lot when the player went unsold
  const [filmBusy, setFilmBusy] = useState('');
  const [filmProg, setFilmProg] = useState(0);
  const [filmErr, setFilmErr] = useState('');
  const filmLot = useMemo(() => {
    const done = (data?.lots || []).filter((l) => l.bids?.length && !(liveLot && l.seq === liveLot.seq));
    return done.find((l) => l.final) || (p?.status === 'unsold' ? done[done.length - 1] : null) || null;
  }, [data, liveLot, p?.status]);
  const makeFilm = async (ratio) => {
    setFilmBusy(ratio); setFilmErr(''); setFilmProg(0);
    try {
      const { bidFilm } = await import('../lib/bidFilm.js');
      const r = await bidFilm({
        player: p, lot: filmLot, teamMap, fmt: (n) => money(n, currency), sold: !!filmLot.final, ratio, onProgress: setFilmProg,
      });
      if (!r) throw new Error('Videos need Chrome, Edge or Safari 14.1+.');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(r.blob);
      a.download = `${(p.name || 'player').replace(/[^\w]+/g, '-').toLowerCase()}-bidding-war-${ratio === '1x1' ? 'square' : 'story'}.${r.ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    } catch (e) {
      setFilmErr(e.message || 'Could not make the video.');
    } finally {
      setFilmBusy('');
    }
  };

  const share = async () => {
    const link = `${window.location.origin}/players?p=${id}`;
    try {
      if (navigator.share) await navigator.share({ title: p?.name, url: link });
      else { await navigator.clipboard.writeText(link); setErr('Link copied.'); setTimeout(() => setErr(''), 1800); }
    } catch { /* closed the share sheet */ }
  };

  return (
    <div className="story" role="dialog" aria-modal="true" aria-label={p ? `${p.name}: bid history` : 'Player'} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="story-card" style={{ '--tc': team?.color || 'var(--signal)' }}>
        <button type="button" className="story-x" onClick={onClose} aria-label="Close">✕</button>
        {!data && !err && <div className="story-load"><Spinner /></div>}
        {!data && err && <p className="muted" style={{ padding: 30 }}>{err}</p>}
        {p && (
          <>
            <header className="story-head">
              <div className="story-photo">
                {url ? <img src={url} alt="" /> : <span>{initials(p.name)}</span>}
              </div>
              <div className="story-who">
                <span className="tiny">{p.position}{p.department ? ` · ${p.department}` : ''}{p.year ? ` · ${p.year}` : ''}</span>
                <h2>{p.name}</h2>
                <div className="story-tags">
                  {p.tier && <span className="story-tier" style={{ '--tier': p.tierColor || '#888' }}>{p.tier}</span>}
                  <span className={`stamp ${onBlock ? 'live' : p.status}`}>{onBlock ? 'On the block now' : STATUS[p.status] || p.status}</span>
                </div>
              </div>
            </header>

            <div className="story-result">
              {team ? (
                <>
                  <TeamLogo team={team} size={44} />
                  <div>
                    <span className="tiny">{p.status === 'retained' ? (p.isCaptain ? 'Captain of' : 'Retained by') : 'Bought by'}</span>
                    <b>{team.name}</b>
                  </div>
                  {p.price != null && <span className="story-price">{p.isCaptain ? 'Captain' : money(p.price, currency)}</span>}
                </>
              ) : (
                <div>
                  <span className="tiny">Base price</span>
                  <b>{money(p.basePrice, currency)}</b>
                </div>
              )}
            </div>

            {filmLot && (
              <div className="story-film">
                <div className="sf-head">
                  <b>Bidding war video</b>
                  <span className="tiny">{filmLot.bids.length} bid{filmLot.bids.length === 1 ? '' : 's'} · with music</span>
                </div>
                <div className="sf-btns">
                  <button type="button" className="btn sm primary" disabled={!!filmBusy} onClick={() => makeFilm('9x16')}>▶ MP4 · Story 9:16</button>
                  <button type="button" className="btn sm" disabled={!!filmBusy} onClick={() => makeFilm('1x1')}>▶ MP4 · Post 1:1</button>
                </div>
                {filmBusy && (
                  <div className="cs-prog" role="progressbar" aria-valuenow={Math.round(filmProg * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <i style={{ width: `${Math.round(filmProg * 100)}%` }} />
                    <span>Recording the bidding war… {Math.round(filmProg * 100)}% · keep this open</span>
                  </div>
                )}
                {filmErr && <span className="tiny" style={{ color: 'var(--signal)' }}>{filmErr}</span>}
              </div>
            )}

            <div className="story-stats">
              <div><b>{allBids.length}</b><span className="tiny">bids</span></div>
              <div><b>{bidders}</b><span className="tiny">teams bid</span></div>
              <div><b>{lots.length}</b><span className="tiny">{lots.length === 1 ? 'time up' : 'times up'}</span></div>
            </div>

            <div className="story-lots">
              {lots.length === 0 && (
                <p className="muted story-empty">
                  {p.status === 'retained' ? 'Retained before the auction, so there were no bids.'
                    : p.status === 'available' ? 'Not auctioned yet. Bids will show here live when this player is up.'
                      : 'No bids were placed.'}
                </p>
              )}
              {lots.map((l) => {
                const top = l.bids[l.bids.length - 1];
                return (
                  <section key={l.seq} className={`story-lot ${l.live ? 'is-live' : ''}`}>
                    <h3>
                      <span>Lot {l.seq}{l.round > 1 ? ` · unsold round ${l.round - 1}` : ''}</span>
                      <span className="tiny">{l.live ? '● Live' : l.final ? 'Sold here' : 'No sale'}</span>
                    </h3>
                    <ol className="story-bids">
                      {l.bids.map((b, i) => ({ b, n: i + 1 })).reverse().map(({ b, n }) => { // final bid on top
                        const t = teamMap[b.teamId];
                        const win = (l.final || l.live) && b === top;
                        return (
                          <li key={n} className={win ? 'win' : ''} style={{ '--c': t?.color || '#888' }}>
                            <span className="story-n">{n}</span>
                            <TeamLogo team={t} size={22} />
                            <span className="story-team">{t?.name || 'Team'}</span>
                            <span className="story-amt">{money(b.amount, currency)}</span>
                            <span className="story-t tiny">{win && l.final ? 'SOLD' : win ? 'Leading' : time(b.at)}</span>
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                );
              })}
            </div>

            <div className="story-foot">
              <button type="button" className="btn sm" onClick={share}>↗ Share my page</button>
              {onCard && <button type="button" className="btn sm" onClick={onCard}>🃏 Player card</button>}
              {err && <span className="tiny">{err}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
