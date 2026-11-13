import { useSearchParams, Link } from 'react-router-dom';
import { useAuction } from '../lib/auction.js';
import { money, teamById } from '../lib/format.js';
import LotStage, { SoldOverlay } from '../components/LotStage.jsx';
import { PurseStrip, SquadCard } from '../components/Teams.jsx';
import { MiniPlayer, Spinner, TeamLogo } from '../components/ui.jsx';

/** Public live broadcast. Add ?screen=1 for the projector layout. */
export default function Studio() {
  const [params] = useSearchParams();
  const screen = params.get('screen') === '1';
  const {
    state, connected, viewers, now,
  } = useAuction();

  return (
    <div className={screen ? 'screen-mode' : ''}>
      <header className="nav glass">
        <div className="container nav-inner">
          <Link to="/" className="brand"><img src="/favicon.svg" alt="" />IEM FED CUP</Link>
          <div className="row" style={{ marginLeft: 'auto' }}>
            {state?.status === 'live' && <span className="chip" style={{ borderColor: 'rgba(255,61,90,.6)' }}><span className="live-dot" />LIVE</span>}
            {viewers?.total != null && <span className="chip">👁 {viewers.total}</span>}
            {!connected && <span className="chip" style={{ color: '#fcd34d' }}>Reconnecting…</span>}
          </div>
        </div>
      </header>

      {!state ? (
        <div className="auth-wrap"><Spinner /></div>
      ) : (
        <main className="container studio">
          <div className="studio-head">
            <h1 className="display" style={{ fontSize: 'clamp(34px, 6vw, 56px)' }}>{state.studio.title}</h1>
            <span className="chip">Round {state.round}</span>
            <span className="chip">{state.stats.sold} sold · {state.stats.available} left</span>
          </div>

          <div className="studio-grid">
            <LotStage state={state} now={now} />
            <aside className="stack">
              <div className="card">
                <div className="tiny muted" style={{ marginBottom: 10 }}>Recent sales</div>
                {state.recentSales.length === 0 && <div className="muted small">No sales yet</div>}
                <div className="stack" style={{ gap: 8 }}>
                  {state.recentSales.slice(0, 6).map((s) => {
                    const t = teamById(state, s.teamId);
                    return (
                      <div key={s.seq} className="row">
                        <TeamLogo team={t} size={28} />
                        <span className="grow ellipsis small"><b>{s.player?.name}</b><br /><span className="muted">{t?.name}</span></span>
                        <b>{money(s.price, state.currency)}</b>
                      </div>
                    );
                  })}
                </div>
              </div>
              {state.stats.topBuys.length > 0 && (
                <div className="card">
                  <div className="tiny muted" style={{ marginBottom: 10 }}>Top buys</div>
                  {state.stats.topBuys.map((b, i) => (
                    <div key={b.playerId} className="row small" style={{ padding: '4px 0' }}>
                      <b style={{ width: 18 }}>{i + 1}</b>
                      <span className="grow ellipsis">{b.name}</span>
                      <b>{money(b.price, state.currency)}</b>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          </div>

          {state.upcoming.length > 0 && (
            <section>
              <div className="tiny muted" style={{ marginBottom: 8 }}>Up next</div>
              <div className="upnext">
                {state.upcoming.map((p) => <MiniPlayer key={p.id} player={p} />)}
              </div>
            </section>
          )}

          <section>
            <div className="tiny muted" style={{ marginBottom: 8 }}>Team purses</div>
            <PurseStrip state={state} />
          </section>

          {state.teams.some((t) => t.squad) && (
            <section>
              <div className="tiny muted" style={{ marginBottom: 8 }}>Squads</div>
              <div className="purse-strip">
                {state.teams.map((t) => <SquadCard key={t.id} team={t} currency={state.currency} />)}
              </div>
            </section>
          )}
        </main>
      )}
      <SoldOverlay state={state} />
    </div>
  );
}
