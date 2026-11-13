import {
  useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { api, API_URL } from '../lib/api.js';
import { onColor } from '../lib/format.js';
import Shader from '../components/Shader.jsx';
import { Magnetic, RollingNumber } from '../components/fx.jsx';
import { MiniPlayer, PlayerCard, TeamLogo } from '../components/ui.jsx';

gsap.registerPlugin(ScrollTrigger);

const SPARKS = [[10, 18, 0], [16, 32, 0.7], [22, 46, 1.3], [8, 38, 2], [88, 18, 0.4], [82, 32, 1.1], [76, 46, 1.8], [91, 38, 0.2]];

/** Animated crest: trophy rises, wings spread and flap, stars drop, sparkles twinkle. */
function Crest() {
  return (
    <div className="crest" aria-label="IEM FED Cup crest" role="img">
      <img className="c-lw" src="/brand/crest.webp" alt="" />
      <img className="c-rw" src="/brand/crest.webp" alt="" />
      <img className="c-trophy" src="/brand/crest.webp" alt="" />
      <img className="c-stars" src="/brand/crest.webp" alt="" />
      <img className="c-full" src="/brand/crest.webp" alt="" />
      {SPARKS.map(([x, y, d]) => <i key={`${x}-${y}`} className="spark" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${1.6 + d}s` }} />)}
    </div>
  );
}

/**
 * Opening sequence (once per session): the halfway line draws across the screen, the centre
 * circle draws around it, the crest settles inside, then the screen breaks open along the
 * halfway line to reveal the floodlit hero.
 */
function Intro({ onReveal }) {
  const ref = useRef(null);
  const revealed = useRef(false);
  const onRevealRef = useRef(onReveal);
  onRevealRef.current = onReveal;
  // Runs once: page re-renders (data arriving) must not restart the sequence.
  useLayoutEffect(() => {
    const el = ref.current;
    const reveal = () => {
      if (!revealed.current) {
        revealed.current = true;
        onRevealRef.current();
      }
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      reveal();
      gsap.set(el, { display: 'none' });
      return undefined;
    }
    const ring = el.querySelector('.ring circle');
    const len = ring.getTotalLength();
    gsap.set(ring, { strokeDasharray: len, strokeDashoffset: len });
    const tl = gsap.timeline({ defaults: { ease: 'expo.inOut' } });
    tl.fromTo(el.querySelector('.halfway'), { scaleX: 0 }, { scaleX: 1, duration: 0.8 })
      .to(ring, { strokeDashoffset: 0, duration: 1, ease: 'power3.inOut' }, 0.25)
      .fromTo(el.querySelector('.content img'), { opacity: 0, scale: 0.72, y: 10 }, { opacity: 1, scale: 1, y: 0, duration: 0.9, ease: 'expo.out' }, 0.7)
      .fromTo(el.querySelectorAll('.cap'), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.6, ease: 'expo.out', stagger: 0.08 }, 0.85)
      .to(el.querySelectorAll('.content, .cap'), { opacity: 0, scale: 1.04, duration: 0.35, ease: 'power2.in' }, '+=0.35')
      .add(reveal)
      .to(el.querySelector('.top'), { yPercent: -100, duration: 1.05 }, '<')
      .to(el.querySelector('.bot'), { yPercent: 100, duration: 1.05 }, '<')
      .to(el.querySelector('.halfway'), { scaleX: 0, opacity: 0, duration: 0.6, ease: 'power2.in' }, '<')
      .set(el, { display: 'none' });
    return () => tl.kill();
  }, []);
  return (
    <div className="intro" ref={ref} aria-hidden="true">
      <div className="half top" />
      <div className="half bot" />
      <span className="halfway" />
      <div className="content">
        <svg className="ring" viewBox="0 0 200 200"><circle cx="100" cy="100" r="96" /></svg>
        <img src="/brand/crest.webp" alt="" />
      </div>
      <div className="cap label cap-l">IEM Federation Cup</div>
      <div className="cap label cap-r">Season 5</div>
    </div>
  );
}

function Lines({ lines, className = '', as: Tag = 'h2' }) {
  return (
    <Tag className={`lines ${className}`}>
      {lines.map((l, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <span key={i} className="line"><span>{l}</span></span>
      ))}
    </Tag>
  );
}

const MANIFESTO = 'Five seasons. One trophy. Every captain starts with the same purse — and every player walks onto the block with a price on their name. Bids land in milliseconds, the hammer waits for the auctioneer, and squads are built live in front of the whole campus.';
const HL = new Set(['trophy.', 'same', 'purse', 'milliseconds,', 'hammer', 'live']);

const STEPS = [
  ['Reveal', 'The next name lights up the studio. Position, tier, year and base price are on screen before a single bid is made.'],
  ['Bid', 'Captains bid from their phones. Each tap carries the exact price they saw, so the server always knows who was first.'],
  ['Hammer', 'The clock runs out and bidding closes. Nothing is final yet: the auctioneer reviews the last bid.'],
  ['Confirmed', 'The auctioneer confirms the sale. The player joins the squad and the purse updates for everyone.'],
];

export default function Landing() {
  const root = useRef(null);
  const [config, setConfig] = useState(null);
  const [teams, setTeams] = useState([]);
  const [stats, setStats] = useState(null);
  const [players, setPlayers] = useState([]);
  const [showIntro] = useState(() => !sessionStorage.getItem('fedcup.intro'));
  const [ready, setReady] = useState(!showIntro);
  const [scenePrice, setScenePrice] = useState(40);

  useEffect(() => {
    sessionStorage.setItem('fedcup.intro', '1');
    api('/config').then(setConfig).catch(() => {});
    api('/teams').then(setTeams).catch(() => {});
    api('/state').then((s) => setStats(s.stats)).catch(() => {});
    fetch(`${API_URL}/api/players`).then((r) => (r.ok ? r.json() : [])).then(setPlayers).catch(() => {});
  }, []);

  const live = config && (config.studio.live || config.auctionStatus === 'live');
  const featured = useMemo(() => players.find((p) => p.photoUrl && p.tier === 'Icon') || players.find((p) => p.photoUrl) || {
    name: 'Your name here', position: 'Forward', tier: 'Icon', tierColor: '#e9b44c', year: '2nd',
  }, [players]);
  const rows = useMemo(() => {
    const withPhotos = players.filter((p) => p.thumbUrl);
    const list = withPhotos.length >= 8 ? withPhotos : players;
    const half = Math.ceil(list.length / 2);
    return [list.slice(0, Math.min(half, 18)), list.slice(half, half + 18)];
  }, [players]);

  /* Smooth scrolling (desktop wheel/trackpad; touch keeps native momentum). */
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const lenis = new Lenis({ lerp: 0.085 });
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);

  /* Scroll choreography. */
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();
      mm.add({ motion: '(prefers-reduced-motion: no-preference)', desktop: '(min-width: 761px)' }, ({ conditions }) => {
        if (!conditions.motion) return;

        // Hero: crest lifts, title sinks, floodlights scale up as you leave.
        gsap.timeline({ scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } })
          .to('.hero .crest', { yPercent: -18, scale: 0.86, ease: 'none' }, 0)
          .to('.hero-title', { yPercent: 22, ease: 'none' }, 0)
          .to('.hero-inner', { opacity: 0.1, ease: 'none' }, 0)
          .to('.hero-canvas', { scale: 1.18, ease: 'none' }, 0);

        // Big titles rise line by line.
        gsap.utils.toArray('.lines').forEach((el) => {
          gsap.from(el.querySelectorAll('.line > span'), {
            yPercent: 110, rotate: 2, duration: 1.2, ease: 'expo.out', stagger: 0.08,
            scrollTrigger: { trigger: el, start: 'top 88%' },
          });
        });

        // Generic fade-ups.
        ScrollTrigger.batch('[data-up]', {
          start: 'top 90%',
          onEnter: (els) => gsap.fromTo(els, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 1, ease: 'expo.out', stagger: 0.08, overwrite: true }),
        });

        // Manifesto words light up with the scroll.
        gsap.to('.manifesto .w', {
          opacity: 1, ease: 'none', stagger: 0.05,
          scrollTrigger: { trigger: '.manifesto', start: 'top 78%', end: 'bottom 45%', scrub: true },
        });

        // Bone section opens like a split screen; counters run once.
        gsap.fromTo('.split-sect', { clipPath: 'inset(14% 8% 14% 8%)' }, {
          clipPath: 'inset(0% 0% 0% 0%)', ease: 'none',
          scrollTrigger: { trigger: '.split-sect', start: 'top bottom', end: 'top 20%', scrub: true },
        });
        gsap.utils.toArray('[data-count]').forEach((el) => {
          ScrollTrigger.create({
            trigger: el,
            start: 'top 85%',
            once: true,
            onEnter: () => {
              const target = Number(el.dataset.count) || 0;
              const o = { v: 0 };
              gsap.to(o, { v: target, duration: 1.8, ease: 'expo.out', onUpdate: () => { el.textContent = String(Math.round(o.v)).padStart(2, '0'); } });
            },
          });
        });

        // Horizontal "how a lot runs" (desktop): pinned and scrubbed sideways.
        if (conditions.desktop) {
          const track = document.querySelector('.hscroll-track');
          const dist = () => track.scrollWidth - window.innerWidth;
          gsap.to(track, {
            x: () => -dist(), ease: 'none',
            scrollTrigger: {
              trigger: '.hscroll', pin: true, scrub: 0.8, end: () => `+=${dist()}`, invalidateOnRefresh: true,
              onUpdate: (self) => gsap.set('.hs-progress i', { scaleX: self.progress }),
            },
          });
        }

        // Upscaler: the studio frame grows from a small window to full screen.
        gsap.timeline({ scrollTrigger: { trigger: '.upscale', start: 'top top', end: '+=130%', pin: true, scrub: 0.6,
          onUpdate: (self) => setScenePrice(40 + Math.round((self.progress * 260) / 10) * 10) } })
          .fromTo('.upscale-frame', { clipPath: 'inset(24% 26% 24% 26%)' }, { clipPath: 'inset(0% 0% 0% 0%)', ease: 'none' }, 0)
          .fromTo('.upscale .scene', { scale: 1.35 }, { scale: 1, ease: 'none' }, 0)
          .fromTo('.upscale-caption', { opacity: 0, y: 30 }, { opacity: 1, y: 0, ease: 'none' }, 0.6);

        // Player wall: rows drift opposite ways and skew with scroll speed.
        const skew = gsap.quickTo('.marquee-track', 'skewX', { duration: 0.5, ease: 'power3' });
        gsap.utils.toArray('.marquee-track').forEach((row, i) => {
          gsap.fromTo(row, { xPercent: i % 2 ? -25 : 0 }, {
            xPercent: i % 2 ? 0 : -25, ease: 'none',
            scrollTrigger: { trigger: '.wall', start: 'top bottom', end: 'bottom top', scrub: true,
              onUpdate: (self) => skew(gsap.utils.clamp(-12, 12, self.getVelocity() / -260)) },
          });
        });

        // CTA bursts open from the bottom edge.
        gsap.fromTo('.cta', { clipPath: 'circle(8% at 50% 100%)' }, {
          clipPath: 'circle(150% at 50% 100%)', ease: 'none',
          scrollTrigger: { trigger: '.cta', start: 'top bottom', end: 'top 15%', scrub: true },
        });

        // Footer wordmark rises.
        gsap.from('.footer-word', { yPercent: 40, opacity: 0, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: '.footer', start: 'top 85%' } });
      });
    }, root);
    return () => ctx.revert();
  }, []);

  /* Team tiles fall into place in 3D once data arrives. */
  useLayoutEffect(() => {
    if (!teams.length) return undefined;
    const ctx = gsap.context(() => {
      const tiles = gsap.utils.toArray('.team-tile');
      gsap.set(tiles, { opacity: 0, y: 60, rotateX: -35, transformOrigin: '50% 0%' });
      ScrollTrigger.batch(tiles, {
        start: 'top 92%',
        onEnter: (b) => gsap.to(b, { opacity: 1, y: 0, rotateX: 0, duration: 1.1, ease: 'expo.out', stagger: 0.07 }),
      });
    }, root);
    ScrollTrigger.refresh();
    return () => ctx.revert();
  }, [teams.length]);

  useEffect(() => { ScrollTrigger.refresh(); }, [players.length, stats]);

  const words = MANIFESTO.split(' ');
  const tickerItems = [
    live ? '● Auction live now' : 'Player auction',
    'Season 5',
    `${stats?.total ?? '—'} players`,
    `${teams.length || '—'} teams`,
    'Defenders → Midfielders → Forwards → Keepers',
    'Every sale confirmed by the auctioneer',
  ];

  return (
    <main ref={root}>
      {showIntro && <Intro onReveal={() => setReady(true)} />}

      {/* ------------------------------- HERO ------------------------------ */}
      <section className={`hero ${ready ? 'ready' : ''}`}>
        <div className="hero-fallback" />
        <Shader />
        <div className="hero-vignette" />
        <div className="hero-grid"><Crest /></div>
        <div className="hero-inner">
          <div className="hero-meta">
            {live ? (
              <Link to="/studio" className="on-air fade-up" style={{ pointerEvents: 'auto' }}>On air · Watch the auction</Link>
            ) : <span className="label fade-up">IEM presents</span>}
          </div>
          <h1 className="hero-title">
            <span className="mask"><span className="solid" style={{ animationDelay: '0.15s' }}>Fed</span></span>
            <span className="mask"><span className="sig" style={{ animationDelay: '0.28s' }}>Cup</span></span>
          </h1>
          <div className="hero-foot">
            <div className="season fade-up" style={{ animationDelay: '0.6s' }}><span className="gold" style={{ background: 'var(--grad-gold)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Season 5</span> · Player Auction</div>
            <div className="row wrap fade-up" style={{ animationDelay: '0.75s' }}>
              <Magnetic><Link to="/studio" className="btn primary lg">{live ? 'Watch live' : 'Enter the studio'} <span className="arrow">→</span></Link></Magnetic>
              <Link to="/players" className="btn lg">Find a player</Link>
            </div>
          </div>
        </div>
      </section>

      <div className="ticker" aria-hidden="true">
        <div className="ticker-track">
          {[0, 1].map((k) => (
            <span key={k}>{tickerItems.map((t) => <span key={t}>{t}<b className="star">★</b></span>)}</span>
          ))}
        </div>
      </div>

      {/* ----------------------------- MANIFESTO --------------------------- */}
      <section className="sect mesh">
        <div className="container">
          <div className="sect-head"><span className="idx">[01] — The cup</span></div>
          <p className="manifesto">
            {words.map((w, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <span key={i}><span className={`w ${HL.has(w) ? 'hl' : ''}`}>{w}</span>{' '}</span>
            ))}
          </p>
        </div>
      </section>

      {/* -------------------------------- STATS ---------------------------- */}
      <section className="sect on-bone mesh split-sect">
        <div className="container">
          <div className="sect-head">
            <span className="idx">[02] — By the numbers</span>
            <Lines className="big-title" lines={['The draft,', <>in <em>numbers</em></>]} />
          </div>
          <div className="stats">
            {[
              ['Players registered', stats?.total ?? 0],
              ['Teams', teams.length],
              ['Season', 5],
              ['Sold so far', stats?.sold ?? 0],
            ].map(([label, value]) => (
              <div key={label} data-up>
                <b data-count={value}>{String(value).padStart(2, '0')}</b>
                <span className="label">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------- HORIZONTAL SEQ ------------------------ */}
      <section className="hscroll">
        <div className="container" style={{ paddingTop: 'clamp(70px, 12vh, 120px)', paddingBottom: 30 }}>
          <div className="sect-head" style={{ marginBottom: 0 }}>
            <span className="idx">[03] — How a lot runs</span>
            <Lines className="big-title" lines={['Four beats.', <>One <em>hammer.</em></>]} />
          </div>
        </div>
        <div className="hscroll-track">
          {STEPS.map(([title, text], i) => (
            <article key={title} className={`hpanel ${i === STEPS.length - 1 ? 'accent' : ''}`}>
              <span className="label" style={i === STEPS.length - 1 ? { color: 'var(--ink)' } : undefined}>Beat 0{i + 1}</span>
              <div className="stack" style={{ gap: 16, position: 'relative', zIndex: 1 }}>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
              <span className="num">0{i + 1}</span>
            </article>
          ))}
        </div>
        <div className="hs-progress"><i /></div>
      </section>

      {/* ------------------------------ UPSCALER --------------------------- */}
      <section className="upscale">
        <div className="upscale-frame">
          <div className="scene">
            <div className="scene-grid">
              <PlayerCard player={featured} />
              <div className="stack scene-price" style={{ gap: 16 }}>
                <span className="phase bidding"><span className="live-dot" />Bidding live</span>
                <div className="price"><RollingNumber value={scenePrice} /><span className="cur">pts</span></div>
                <div className="timer"><div className="timer-track"><div className="timer-fill" style={{ transform: 'scaleX(0.62)' }} /></div><div className="timer-secs">09</div></div>
                {teams[0] && (
                  <div className="lower-third" style={{ '--c': teams[0].color, '--fg': onColor(teams[0].color) }}>
                    <span className="lt-slab" />
                    <span className="lt-logo"><TeamLogo team={teams[0]} size={44} /></span>
                    <span className="lt-text"><span className="label" style={{ color: 'inherit', opacity: 0.75 }}>Highest bidder</span><span className="lt-name">{teams[0].name}</span></span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="upscale-caption">
            <div>
              <span className="idx">[04] — The studio</span>
              <h2 className="big-title" style={{ fontSize: 'clamp(44px, 7vw, 120px)', marginTop: 10 }}>Every bid,<br /><em>live.</em></h2>
            </div>
            <Link to="/studio" className="btn primary lg" style={{ pointerEvents: 'auto' }}>Open the studio <span className="arrow">→</span></Link>
          </div>
        </div>
      </section>

      {/* ------------------------------ PLAYER WALL ------------------------ */}
      {rows[0].length > 0 && (
        <section className="sect wall" style={{ paddingBottom: 'clamp(40px, 8vh, 90px)' }}>
          <div className="container sect-head">
            <span className="idx">[05] — The pool</span>
            <Lines className="big-title" lines={[<>{stats?.total ?? players.length} players.</>, <>One <em>shot.</em></>]} />
          </div>
          {rows.map((row, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={i} className="marquee">
              <div className="marquee-track">
                {[...row, ...row].map((p, j) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <div key={`${p.id}-${j}`} className="tile"><MiniPlayer player={p} /></div>
                ))}
              </div>
            </div>
          ))}
          <div className="container" style={{ marginTop: 30 }}>
            <Link to="/players" className="btn">Search the full pool <span className="arrow">→</span></Link>
          </div>
        </section>
      )}

      {/* --------------------------------- TEAMS --------------------------- */}
      {teams.length > 0 && (
        <section className="sect">
          <div className="container">
            <div className="sect-head">
              <span className="idx">[06] — The clubs</span>
              <Lines className="big-title" lines={[`${teams.length} captains.`, <>Same <em>purse.</em></>]} />
            </div>
            <div className="teams-grid">
              {teams.map((t, i) => (
                <div key={t.id} className="team-tile" style={{ '--c': t.color, '--fg': onColor(t.color) }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="label" style={{ color: 'inherit', opacity: 0.6 }}>Club {String(i + 1).padStart(2, '0')}</span>
                    <span className="label" style={{ color: 'inherit', opacity: 0.6 }}>{t.shortName}</span>
                  </div>
                  <TeamLogo team={t} size={84} />
                  <h3>{t.name}</h3>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------------------------------- CTA ---------------------------- */}
      <section className="cta">
        <img className="crest-bg" src="/brand/crest.webp" alt="" aria-hidden="true" />
        <div className="cta-inner">
          <span className="label" style={{ color: 'var(--ink)' }}>[07] — Matchday</span>
          <h2 className="big-title" style={{ color: 'var(--ink)' }}>The hammer<br /><em>falls</em> live</h2>
          <Magnetic strength={0.4}><Link to="/studio" className="btn lg">{live ? 'Watch now' : 'Enter the studio'} <span className="arrow">→</span></Link></Magnetic>
        </div>
      </section>

      {/* -------------------------------- FOOTER --------------------------- */}
      <footer className="footer">
        <div className="container">
          <div className="row wrap" style={{ justifyContent: 'space-between', alignItems: 'flex-end', gap: 30 }}>
            <img className="footer-logo" src="/brand/logo.webp" alt="FED Cup Season 5" loading="lazy" />
            <div className="footer-links">
              <Link to="/studio">Live auction</Link>
              <Link to="/players">Players</Link>
              <Link to="/captain">Captain login</Link>
              <Link to="/admin">Organisers</Link>
            </div>
          </div>
          <div className="row wrap label" style={{ justifyContent: 'space-between', marginTop: 30 }}>
            <span>© {new Date().getFullYear()} IEM Federation Cup</span>
            <span>Season 5 · Player Auction</span>
          </div>
        </div>
        <div className="footer-word" aria-hidden="true">Fed Cup</div>
      </footer>
    </main>
  );
}
