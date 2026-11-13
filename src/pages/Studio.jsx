import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuction } from '../lib/auction.js';
import { money, teamById } from '../lib/format.js';
import LotStage, { SoldOverlay } from '../components/LotStage.jsx';
import { PurseStrip, SquadCard } from '../components/Teams.jsx';
import { MiniPlayer, Spinner, TeamLogo } from '../components/ui.jsx';
import { BrandMark } from '../components/Nav.jsx';
import TeamReveal from '../components/TeamReveal.jsx';

function Clock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  return <span>{t.toLocaleTimeString('en-GB', { hour12: false })}</span>;
}

/** Public live broadcast. Add ?screen=1 for the projector layout. */
export default function Studio() {
  const [params] = useSearchParams();
  const screen = params.get('screen') === '1';
  const {
    state, connected, viewers, now,
  } = useAuction();
  const live = state?.status === 'live';
  const [showReveal, setShowReveal] = useState(false);
  useEffect(() => { if (state?.status === 'ended') setShowReveal(true); }, [state?.status]);

  return (
    <div className={screen ? 'screen-mode' : ''}>
      <div className="studio-bg" />
      <header className="scorebug">
        <div className="scorebug-inner">
          <Link to="/" style={{ gap: 10 }}><BrandMark /></Link>
          {live ? <span><span className="on-air">On air</span></span> : <span className="muted">{state?.status === 'ended' ? 'Full time' : 'Pre-match'}</span>}
          <span className="sb-title"><span className="ellipsis">{state?.studio.title || 'IEM FED Cup Auction'}</span></span>
          {state && <span className="hide-sm">Round {state.round}</span>}
          {state && <span className="hide-sm">{state.stats.sold} sold · {state.stats.available} left</span>}
          {viewers?.total != null && <span>{viewers.total} watching</span>}
          {state?.status === 'ended' && <span><button type="button" className="btn sm primary" onClick={() => setShowReveal(true)}>▶ Team reveal</button></span>}
          {!connected ? <span style={{ color: 'var(--amber)' }}>Reconnecting</span> : <span className="hide-sm"><Clock /></span>}
        </div>
      </header>

      {!state ? (
        <div className="auth-wrap"><Spinner /></div>
      ) : (
        <main className="container studio">
          <div className="studio-grid">
            <LotStage state={state} now={now} />
            <aside className="stack" style={{ gap: 28 }}>
              <div className="side-block">
                <div className="label" style={{ marginBottom: 6 }}>Latest sales</div>
                {state.recentSales.length === 0 && <div className="tiny" style={{ padding: '10px 0' }}>No sales yet</div>}
                {state.recentSales.slice(0, 6).map((s) => {
                  const t = teamById(state, s.teamId);
                  return (
                    <div key={s.seq} className="sale-row">
                      <TeamLogo team={t} size={26} />
                      <span className="ellipsis small"><b style={{ fontFamily: 'var(--sans)' }}>{s.player?.name}</b><br /><span className="tiny">{t?.name}</span></span>
                      <b>{money(s.price, state.currency)}</b>
                    </div>
                  );
                })}
              </div>
              {state.stats.topBuys.length > 0 && (
                <div className="side-block">
                  <div className="label" style={{ marginBottom: 6 }}>Top buys</div>
                  {state.stats.topBuys.map((b, i) => (
                    <div key={b.playerId} className="sale-row">
                      <span className="idx" style={{ fontSize: 13 }}>{String(i + 1).padStart(2, '0')}</span>
                      <span className="ellipsis small">{b.name}</span>
                      <b>{money(b.price, state.currency)}</b>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          </div>

          {state.upcoming.length > 0 && (
            <section>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
                <span className="label">Up next</span>
                <span className="tiny">{state.upcoming.length} in queue view</span>
              </div>
              <div className="film">
                {state.upcoming.map((p) => <MiniPlayer key={p.id} player={p} />)}
              </div>
            </section>
          )}

          <section>
            <div className="label" style={{ marginBottom: 10 }}>Purse standings</div>
            <PurseStrip state={state} />
          </section>

          {state.teams.some((t) => t.squad) && (
            <section>
              <div className="label" style={{ marginBottom: 10 }}>Squads</div>
              <div className="purse-strip">
                {state.teams.map((t) => <SquadCard key={t.id} team={t} currency={state.currency} />)}
              </div>
            </section>
          )}
        </main>
      )}
      {state?.status === 'ended' && showReveal && <TeamReveal state={state} onClose={() => setShowReveal(false)} />}
      <SoldOverlay state={state} />
    </div>
  );
}
