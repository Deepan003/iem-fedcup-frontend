import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { TeamLogo, useReveal } from '../components/ui.jsx';

function Pitch() {
  return (
    <svg viewBox="0 0 680 400" preserveAspectRatio="none" aria-hidden="true">
      <g fill="none" stroke="#fff" strokeWidth="3">
        <rect x="10" y="10" width="660" height="380" />
        <line x1="340" y1="10" x2="340" y2="390" />
        <circle cx="340" cy="200" r="60" />
        <rect x="10" y="110" width="100" height="180" />
        <rect x="570" y="110" width="100" height="180" />
      </g>
    </svg>
  );
}

function useCountdown(target) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!target) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [target]);
  if (!target) return null;
  const ms = new Date(target).getTime() - now;
  if (ms <= 0) return null;
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor(ms / 3_600_000) % 24;
  const m = Math.floor(ms / 60_000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  return { d, h, m, s };
}

export default function Landing() {
  const [config, setConfig] = useState(null);
  const [teams, setTeams] = useState([]);
  const [stats, setStats] = useState(null);
  const ref = useReveal();

  useEffect(() => {
    api('/config').then(setConfig).catch(() => {});
    api('/teams').then(setTeams).catch(() => {});
    api('/state').then((s) => setStats(s.stats)).catch(() => {});
  }, []);

  const live = config && (config.studio.live || config.auctionStatus === 'live');
  const cd = useCountdown(!live && config?.studio.startsAt);
  const words = ['IEM', 'FEDERATION'];

  return (
    <main ref={ref}>
      <section className="hero">
        <div className="hero-bg" />
        <div className="floodlight l" />
        <div className="floodlight r" />
        <div className="hero-pitch"><Pitch /></div>
        <div className="container">
          {live ? (
            <Link to="/studio" className="hero-kicker" style={{ borderColor: 'rgba(255,61,90,.6)' }}>
              <span className="live-dot" /> FED Cup Auction is LIVE · Watch now →
            </Link>
          ) : (
            <span className="hero-kicker">⚽ Season 2027 · Player Auction</span>
          )}
          <h1 className="hero-title">
            {words.map((w, i) => (
              <span key={w} className="hero-word" style={{ animationDelay: `${0.1 + i * 0.15}s`, display: 'block', WebkitTextFillColor: i ? undefined : '#fff' }}>{w}</span>
            ))}
            <span className="hero-word" style={{ animationDelay: '0.45s' }}>CUP</span>
          </h1>
          <p className="hero-sub">The biggest football tournament on campus. Teams are built live, one bid at a time: watch every player go under the hammer.</p>
          {cd && (
            <div className="row" style={{ justifyContent: 'center', gap: 14, marginBottom: 22 }}>
              {[['Days', cd.d], ['Hrs', cd.h], ['Min', cd.m], ['Sec', cd.s]].map(([l, v]) => (
                <div key={l} className="stat" style={{ padding: '10px 14px', minWidth: 70 }}>
                  <b style={{ fontSize: 40 }}>{String(v).padStart(2, '0')}</b>
                  <span className="tiny muted">{l}</span>
                </div>
              ))}
            </div>
          )}
          <div className="hero-cta">
            <Link to="/studio" className="btn primary lg">{live ? '● Watch the auction live' : 'Open the auction studio'}</Link>
            <Link to="/players" className="btn lg">Find a player</Link>
          </div>
        </div>
        <div className="scroll-cue" aria-hidden="true" />
      </section>

      {live && (
        <div className="container" style={{ marginTop: -30, position: 'relative' }}>
          <Link to="/studio" className="live-banner reveal">
            <span className="live-dot" />
            <div className="grow">
              <b>{config.studio.title}</b>
              <div className="muted small">{config.studio.subtitle || 'Bidding is happening right now. Tap to watch.'}</div>
            </div>
            <span className="btn primary sm">Watch</span>
          </Link>
        </div>
      )}

      <section className="section container">
        <div className="stat-grid">
          {[
            ['Players', stats?.total ?? '—'],
            ['Teams', teams.length || '—'],
            ['Sold', stats?.sold ?? 0],
            ['In the pool', stats?.available ?? '—'],
          ].map(([label, value], i) => (
            <div key={label} className="stat reveal" style={{ transitionDelay: `${i * 80}ms` }}>
              <b>{value}</b>
              <span className="muted">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section container">
        <h2 className="section-title reveal">How the <em>auction</em> works</h2>
        <p className="muted reveal" style={{ maxWidth: 640 }}>Every captain starts with the same purse. Players come up one by one: defenders, midfielders, forwards, then goalkeepers. The highest bid when the clock stops wins, once the auctioneer confirms the sale.</p>
        <div className="feature-grid" style={{ marginTop: 26 }}>
          {[
            ['🎥', 'Live studio', 'Watch every bid as it happens, on your phone or the big screen at the venue.'],
            ['⚡', 'Real-time bidding', 'Captains bid from their phones. The server decides who was first, down to the millisecond.'],
            ['🛡️', 'Fair by design', 'Budget guards, squad limits and auctioneer-confirmed sales. Every bid is logged.'],
          ].map(([ico, t, d], i) => (
            <div key={t} className="feature reveal" style={{ transitionDelay: `${i * 90}ms` }}>
              <div className="ico">{ico}</div>
              <h3 style={{ fontSize: 20, marginBottom: 6 }}>{t}</h3>
              <p className="muted" style={{ margin: 0 }}>{d}</p>
            </div>
          ))}
        </div>
      </section>

      {teams.length > 0 && (
        <section className="section container">
          <h2 className="section-title reveal">The <em>teams</em></h2>
          <div className="team-grid" style={{ marginTop: 22 }}>
            {teams.map((t, i) => (
              <div key={t.id} className="team-tile reveal" style={{ '--c': t.color, transitionDelay: `${(i % 6) * 60}ms` }}>
                <TeamLogo team={t} size={72} />
                <b>{t.name}</b>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="footer">
        <div className="container row wrap" style={{ justifyContent: 'space-between' }}>
          <span>© {new Date().getFullYear()} IEM Federation Cup</span>
          <span className="row" style={{ gap: 16 }}>
            <Link to="/studio">Live auction</Link>
            <Link to="/players">Players</Link>
            <Link to="/captain">Captain login</Link>
            <Link to="/admin">Organisers</Link>
          </span>
        </div>
      </footer>
    </main>
  );
}
