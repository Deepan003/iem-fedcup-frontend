import {
  useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import Lenis from 'lenis';
import { api, API_URL, assetUrl } from '../lib/api.js';
import { useAuction } from '../lib/auction.js';
import { initials, onColor } from '../lib/format.js';
import Shader from '../components/Shader.jsx';
import { Magnetic, RollingNumber } from '../components/fx.jsx';
import { MiniPlayer, PlayerCard, TeamLogo } from '../components/ui.jsx';
import '../football.css';

gsap.registerPlugin(ScrollTrigger, MotionPathPlugin);

/* ------------------------------------------------------------------------- */
/* Small football graphics                                                   */
/* ------------------------------------------------------------------------- */

function Ball({ className }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="#f4f1ea" stroke="#0b0b0c" strokeWidth="1.2" />
      <path d="M16 9.5l5.4 3.9-2.1 6.4h-6.6l-2.1-6.4z" fill="#0b0b0c" />
      <path d="M16 1v8.5M21.4 13.4l8-2.6M19.3 19.8l5 6.8M12.7 19.8l-5 6.8M10.6 13.4l-8-2.6" stroke="#0b0b0c" strokeWidth="1.2" />
      <path d="M2.2 10.6l2.6 1.4-.4 4.6-3-1.2zM29.8 10.6l-2.6 1.4.4 4.6 3-1.2zM9 27.5l3-1.6 3.4 1.6-1 3.2zM23 27.5l-3-1.6-3.4 1.6 1 3.2zM13.2 1.6l2.8 1.6 2.8-1.6" fill="#0b0b0c" />
    </svg>
  );
}

function Jersey({ color, text, number }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M33 8 L44 4 Q50 11 56 4 L67 8 L92 24 L82 42 L72 36 L72 95 L28 95 L28 36 L18 42 L8 24 Z" fill={color} stroke="rgba(0,0,0,.35)" strokeWidth="1.5" />
      <path d="M44 4 Q50 11 56 4" fill="none" stroke="rgba(0,0,0,.35)" strokeWidth="2" />
      <text x="50" y="40" textAnchor="middle" fontFamily="Big Shoulders Display, Impact, sans-serif" fontWeight="900" fontSize="9" fill={text} letterSpacing="1">{(number.label || '').toUpperCase().slice(0, 12)}</text>
      <text x="50" y="76" textAnchor="middle" fontFamily="Big Shoulders Display, Impact, sans-serif" fontWeight="900" fontSize="34" fill={text}>{number.n}</text>
    </svg>
  );
}

/** Scroll progress as a match clock: 00' → 90' with a ball rolling the touchline. */
function MatchClock() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const min = el.querySelector('.mc-time');
    const half = el.querySelector('.mc-half');
    let idle = 0;
    const st = ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => {
        const p = self.progress;
        const m = Math.round(p * 90);
        el.style.setProperty('--p', p.toFixed(4));
        min.textContent = `${String(m).padStart(2, '0')}'`;
        half.textContent = p >= 0.995 ? 'Full time' : m >= 44 && m <= 46 ? 'Half time' : m < 45 ? '1st half' : '2nd half';
        // Visible only while scrolling (and not over the hero/footer), so it never sits on content.
        el.classList.toggle('show', p > 0.04 && p < 0.97);
        el.classList.remove('idle');
        clearTimeout(idle);
        idle = setTimeout(() => el.classList.add('idle'), 1400);
      },
    });
    return () => {
      clearTimeout(idle);
      st.kill();
    };
  }, []);
  return (
    <div className="match-clock" ref={ref} aria-hidden="true">
      <span className="mc-time">00'</span>
      <span className="mc-half">1st half</span>
      <span className="mc-track"><span className="mc-fill" /><Ball className="mc-ball" /></span>
    </div>
  );
}

/** Full-size pitch (105 × 68 m, ×10) that draws itself, with a curling pass. */
function PitchLines() {
  return (
    <div className="pitch-bg" aria-hidden="true">
      <svg viewBox="-20 -20 1090 720">
        <defs>
          <linearGradient id="passGrad" x1="0" x2="1">
            <stop offset="0" stopColor="#e3123f" />
            <stop offset="1" stopColor="#ffd84a" />
          </linearGradient>
        </defs>
        <rect className="pl" x="0" y="0" width="1050" height="680" pathLength="1" />
        <line className="pl" x1="525" y1="0" x2="525" y2="680" pathLength="1" />
        <circle className="pl" cx="525" cy="340" r="91.5" pathLength="1" />
        <rect className="pl" x="0" y="138.5" width="165" height="403" pathLength="1" />
        <rect className="pl" x="885" y="138.5" width="165" height="403" pathLength="1" />
        <rect className="pl" x="0" y="248.4" width="55" height="183.2" pathLength="1" />
        <rect className="pl" x="995" y="248.4" width="55" height="183.2" pathLength="1" />
        <path className="pl" d="M165 266.9 A91.5 91.5 0 0 1 165 413.1" pathLength="1" />
        <path className="pl" d="M885 266.9 A91.5 91.5 0 0 0 885 413.1" pathLength="1" />
        <path className="pl" d="M0 10 A10 10 0 0 0 10 0 M1040 0 A10 10 0 0 0 1050 10 M1050 670 A10 10 0 0 0 1040 680 M10 680 A10 10 0 0 0 0 670" pathLength="1" />
        <path id="passPath" className="pass" d="M140 560 C 300 470, 360 210, 525 300 S 760 560, 990 340" pathLength="1" />
        <circle className="pball" cx="0" cy="0" r="9" />
      </svg>
    </div>
  );
}

/** Split-flap stadium scoreboard digits. */
function Flap({ value }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(0);
  const [run, setRun] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setRun(true); }, { threshold: 0.5 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!run) return undefined;
    let raf = 0;
    let start = 0;
    let last = 0;
    const dur = 1500;
    const step = (t) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / dur);
      if (t - last > 70 || p === 1) {
        last = t;
        setShown(Math.round((1 - (1 - p) ** 3) * value));
      }
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [run, value]);
  const digits = String(shown).padStart(2, '0').split('');
  return (
    <span className="flap-board" ref={ref} aria-label={String(value)}>
      {digits.map((d, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <span key={i} className="flap-cell"><span key={d} className="flap">{d}</span></span>
      ))}
    </span>
  );
}

function LedBoard({ items, reverse = false }) {
  return (
    <div className={`ticker led ${reverse ? 'rev' : ''}`} aria-hidden="true">
      <div className="ticker-track">
        {[0, 1].map((k) => (
          <span key={k}>{items.map((t) => <span key={t}>{t}<b>●</b></span>)}</span>
        ))}
      </div>
    </div>
  );
}

/* 4-3-3, attacking upward. Coordinates are % of the pitch. */
const XI = [
  ['GK', 50, 90], ['LB', 15, 71], ['CB', 37, 76], ['CB', 63, 76], ['RB', 85, 71],
  ['CM', 29, 52], ['CM', 50, 57], ['CM', 71, 52], ['LW', 17, 27], ['ST', 50, 19], ['RW', 83, 27],
];
const MOVE = [0, 3, 4, 7, 6, 8, 9]; // GK → CB → RB → CM → CM → LW → ST → goal
const GOAL = [50, 0.5];

function Tactics({ players }) {
  const faces = useMemo(() => {
    const withPhoto = players.filter((p) => p.thumbUrl || p.photoUrl);
    return XI.map((_, i) => withPhoto[i] || players[i] || null);
  }, [players]);
  return (
    <section className="tactics">
      <div className="tac-copy">
        <div className="tac-cap">
          <span className="idx">38' — The tactics board</span>
          <h2 className="big-title">Eleven<br /><em>spots.</em></h2>
          <p>Every squad starts as an empty team sheet. Defenders, midfielders, forwards, a keeper: the order the players come up is the order the board fills.</p>
        </div>
        <div className="tac-cap">
          <span className="idx">38' — Take shape</span>
          <h2 className="big-title">Fill them<br /><em>live.</em></h2>
          <p>Each captain gets a private tactics board. Every player they buy drops straight into the formation while the auction is still running.</p>
        </div>
        <div className="tac-cap">
          <span className="idx">38' — Play it forward</span>
          <h2 className="big-title">Plan the<br /><em>move.</em></h2>
          <p>Swap formations, shuffle the bench and see exactly which positions still need a name before the next bid.</p>
        </div>
      </div>
      <div className="tac-stage">
        <div className="tac-pitch">
          <svg className="lines" viewBox="0 0 680 1050" preserveAspectRatio="none" aria-hidden="true">
            <rect className="pl" x="0" y="0" width="680" height="1050" pathLength="1" />
            <line className="pl" x1="0" y1="525" x2="680" y2="525" pathLength="1" />
            <circle className="pl" cx="340" cy="525" r="91.5" pathLength="1" />
            <rect className="pl" x="138.5" y="0" width="403" height="165" pathLength="1" />
            <rect className="pl" x="138.5" y="885" width="403" height="165" pathLength="1" />
            <rect className="pl" x="248.4" y="0" width="183.2" height="55" pathLength="1" />
            <rect className="pl" x="248.4" y="995" width="183.2" height="55" pathLength="1" />
            <path className="pl" d="M266.9 165 A91.5 91.5 0 0 0 413.1 165" pathLength="1" />
            <path className="pl" d="M266.9 885 A91.5 91.5 0 0 1 413.1 885" pathLength="1" />
            <rect className="goal" x="303.4" y="-26" width="73.2" height="26" pathLength="1" />
          </svg>
          <span className="tac-goal-glow" />
          <svg className="passes" viewBox="0 0 680 1050" aria-hidden="true">
            {MOVE.map((from, i) => {
              const a = XI[from];
              const b = i < MOVE.length - 1 ? XI[MOVE[i + 1]] : [null, ...GOAL];
              return <line key={from} x1={a[1] * 6.8} y1={a[2] * 10.5} x2={b[1] * 6.8} y2={b[2] * 10.5} pathLength="1" />;
            })}
          </svg>
          {XI.map(([pos], i) => {
            const p = faces[i];
            const url = p && assetUrl(p.thumbUrl || p.photoUrl);
            return (
              // eslint-disable-next-line react/no-array-index-key
              <div key={i} className="tok">
                <span className="face">{url ? <img src={url} alt="" loading="lazy" /> : (p ? initials(p.name) : pos)}</span>
                <span className="pos">{pos}</span>
              </div>
            );
          })}
          <span className="tac-ball"><Ball /></span>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* Hero crest + intro (unchanged behaviour)                                  */
/* ------------------------------------------------------------------------- */

const SPARKS = [[10, 18, 0], [16, 32, 0.7], [22, 46, 1.3], [8, 38, 2], [88, 18, 0.4], [82, 32, 1.1], [76, 46, 1.8], [91, 38, 0.2]];

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

function Mow() {
  return <div className="mow" aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <i key={i} />)}</div>;
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
  const [flipped, setFlipped] = useState(null);

  useEffect(() => {
    sessionStorage.setItem('fedcup.intro', '1');
    api('/config').then(setConfig).catch(() => {});
    api('/teams').then(setTeams).catch(() => {});
    api('/state').then((s) => setStats(s.stats)).catch(() => {});
    fetch(`${API_URL}/api/players`).then((r) => (r.ok ? r.json() : [])).then(setPlayers).catch(() => {});
  }, []);

  // Live: stats, the "on air" banner, teams and players follow the auction in real time.
  const { state: liveState } = useAuction();
  const statsKey = liveState ? JSON.stringify(liveState.stats) : '';
  useEffect(() => {
    if (!liveState) return;
    setStats(liveState.stats);
    setConfig((c) => (c ? { ...c, auctionStatus: liveState.status, studio: { ...c.studio, ...liveState.studio } } : c));
  }, [statsKey, liveState?.status, liveState?.studio?.live]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!liveState?.dataV) return;
    api('/teams').then(setTeams).catch(() => {});
    fetch(`${API_URL}/api/players`).then((r) => (r.ok ? r.json() : [])).then(setPlayers).catch(() => {});
  }, [liveState?.dataV, liveState?.stats?.sold]); // eslint-disable-line react-hooks/exhaustive-deps

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
      gsap.set('.tok, .tac-ball', { xPercent: -50, yPercent: -50 });
      mm.add({ motion: '(prefers-reduced-motion: no-preference)', desktop: '(min-width: 761px)' }, ({ conditions }) => {
        if (!conditions.motion) {
          // Reduced motion: show the finished formation and fully lit text, no scrubbing.
          gsap.utils.toArray('.tok').forEach((t, i) => gsap.set(t, { left: `${XI[i][1]}%`, top: `${XI[i][2]}%`, opacity: 1, scale: 1 }));
          gsap.set('.manifesto .w', { opacity: 1 });
          gsap.set('.split-sect .mow', { display: 'none' });
          return;
        }
        gsap.set('.tok', { scale: 0.4 });

        // Hero: crest lifts, title sinks, floodlights scale up as you leave.
        gsap.timeline({ scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } })
          .to('.hero .crest', { yPercent: -18, scale: 0.86, ease: 'none' }, 0)
          .to('.hero-title', { yPercent: 22, ease: 'none' }, 0)
          .to('.hero-inner', { opacity: 0.1, ease: 'none' }, 0)
          .to('.hero-canvas', { scale: 1.18, ease: 'none' }, 0);

        // Big titles rise line by line.
        gsap.utils.toArray('.lines').forEach((el) => {
          if (el.closest('.tactics')) return;
          gsap.from(el.querySelectorAll('.line > span'), {
            yPercent: 110, rotate: 2, duration: 1.2, ease: 'expo.out', stagger: 0.08,
            scrollTrigger: { trigger: el, start: 'top 88%' },
          });
        });

        ScrollTrigger.batch('[data-up]', {
          start: 'top 90%',
          onEnter: (els) => gsap.fromTo(els, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 1, ease: 'expo.out', stagger: 0.08, overwrite: true }),
        });

        // 00' — the pitch draws itself while the manifesto lights up; a pass curls across.
        const draw = gsap.timeline({ scrollTrigger: { trigger: '.manifesto-sect', start: 'top 85%', end: 'bottom 35%', scrub: 0.6 } });
        draw.fromTo('.pitch-bg .pl', { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: 'none', stagger: 0.04, duration: 1 }, 0)
          .fromTo('.pitch-bg .pass', { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: 'none', duration: 0.8 }, 0.35)
          .to('.pitch-bg .pball', { motionPath: { path: '#passPath', align: '#passPath', alignOrigin: [0.5, 0.5] }, ease: 'none', duration: 0.8 }, 0.35)
          .to('.manifesto .w', { opacity: 1, ease: 'none', stagger: 0.03, duration: 0.6 }, 0);

        // 15' — grass-mowing stripes reveal the scoreboard section.
        gsap.to('.split-sect .mow i', {
          scaleY: 0, ease: 'none',
          transformOrigin: (i) => (i % 2 ? '50% 100%' : '50% 0%'),
          stagger: { each: 0.06, from: 'center' },
          scrollTrigger: { trigger: '.split-sect', start: 'top 95%', end: 'top 25%', scrub: 0.5 },
        });

        // 30' — horizontal sequence (desktop): pinned and scrubbed sideways.
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

        // 38' — tactics board: the pitch tilts into a broadcast angle, the XI walks out
        // into a 4-3-3, then a passing move plays out to the goal.
        const toks = gsap.utils.toArray('.tok');
        const lines = gsap.utils.toArray('.tac-pitch .passes line');
        const caps = gsap.utils.toArray('.tac-cap');
        const tac = gsap.timeline({ scrollTrigger: { trigger: '.tactics', start: 'top top', end: '+=260%', pin: true, scrub: 0.8 } });
        tac.fromTo('.tac-pitch', { rotateX: 0, rotateZ: -8, scale: 0.86 }, { rotateX: 48, rotateZ: 0, scale: 1.14, ease: 'power1.inOut', duration: 1.2 }, 0)
          .fromTo('.tac-pitch .lines .pl, .tac-pitch .lines .goal', { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: 'none', stagger: 0.05, duration: 0.9 }, 0);
        toks.forEach((t, i) => {
          tac.to(t, { left: `${XI[i][1]}%`, top: `${XI[i][2]}%`, opacity: 1, scale: 1, ease: 'power3.out', duration: 0.7 }, 1 + i * 0.07);
        });
        tac.to(caps[0], { opacity: 0, y: -20, duration: 0.3 }, 1.1).fromTo(caps[1], { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.3 }, 1.3);
        tac.set('.tac-ball', { left: `${XI[0][1]}%`, top: `${XI[0][2] - 3}%` }, 2).to('.tac-ball', { opacity: 1, duration: 0.15 }, 2);
        let t0 = 2.2;
        MOVE.forEach((from, i) => {
          const to = i < MOVE.length - 1 ? XI[MOVE[i + 1]] : [null, ...GOAL];
          tac.to(lines[i], { strokeDashoffset: 0, ease: 'none', duration: 0.35 }, t0)
            .to('.tac-ball', { left: `${to[1]}%`, top: `${to[2]}%`, rotate: `+=${200}`, ease: 'power1.inOut', duration: 0.35 }, t0);
          t0 += 0.4;
        });
        tac.to(caps[1], { opacity: 0, y: -20, duration: 0.3 }, 3.2).fromTo(caps[2], { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.3 }, 3.4)
          .to('.tac-goal-glow', { opacity: 1, scale: 1.3, duration: 0.25, ease: 'power2.out' }, t0)
          .to('.tac-goal-glow', { opacity: 0.35, duration: 0.4 }, t0 + 0.3)
          .to({}, { duration: 0.4 });

        // 45' — upscaler: the studio frame grows from a small window to full screen.
        gsap.timeline({ scrollTrigger: { trigger: '.upscale', start: 'top top', end: '+=130%', pin: true, scrub: 0.6,
          onUpdate: (self) => setScenePrice(40 + Math.round((self.progress * 260) / 10) * 10) } })
          .fromTo('.upscale-frame', { clipPath: 'inset(24% 26% 24% 26%)' }, { clipPath: 'inset(0% 0% 0% 0%)', ease: 'none' }, 0)
          .fromTo('.upscale .scene', { scale: 1.35 }, { scale: 1, ease: 'none' }, 0)
          .fromTo('.upscale-caption', { opacity: 0, y: 30 }, { opacity: 1, y: 0, ease: 'none' }, 0.6);

        // 60' — player wall: rows drift opposite ways and skew with scroll speed.
        const skew = gsap.quickTo('.marquee-track', 'skewX', { duration: 0.5, ease: 'power3' });
        gsap.utils.toArray('.marquee-track').forEach((row, i) => {
          gsap.fromTo(row, { xPercent: i % 2 ? -25 : 0 }, {
            xPercent: i % 2 ? 0 : -25, ease: 'none',
            scrollTrigger: { trigger: '.wall', start: 'top bottom', end: 'bottom top', scrub: true,
              onUpdate: (self) => skew(gsap.utils.clamp(-12, 12, self.getVelocity() / -260)) },
          });
        });

        // 90' — CTA bursts open from the centre spot.
        gsap.fromTo('.cta', { clipPath: 'circle(6% at 50% 100%)' }, {
          clipPath: 'circle(150% at 50% 100%)', ease: 'none',
          scrollTrigger: { trigger: '.cta', start: 'top bottom', end: 'top 15%', scrub: true },
        });
        gsap.fromTo('.cta .crest-bg', { yPercent: 18, rotate: -6 }, { yPercent: -12, rotate: 0, ease: 'none', scrollTrigger: { trigger: '.cta', start: 'top bottom', end: 'bottom top', scrub: true } });

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
  const board1 = [
    live ? 'Auction live now' : 'Player auction',
    'IEM FED Cup',
    'Season 5',
    `${stats?.total ?? '—'} players`,
    `${teams.length || '—'} clubs`,
  ];
  const board2 = ['Watch every bid live', 'FED Cup Season 5', 'Studio open on matchday', 'Captains bid from their phones'];

  return (
    <main ref={root}>
      {showIntro && <Intro onReveal={() => setReady(true)} />}
      <MatchClock />

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
            <div className="season fade-up" style={{ animationDelay: '0.6s' }}><span style={{ background: 'var(--grad-gold)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Season 5</span> · Player Auction</div>
            <div className="row wrap fade-up" style={{ animationDelay: '0.75s' }}>
              <Magnetic><Link to="/studio" className="btn primary lg">{live ? 'Watch live' : 'Enter the studio'} <span className="arrow">→</span></Link></Magnetic>
              <Link to="/players" className="btn lg">Find a player</Link>
            </div>
          </div>
        </div>
        <div className="kickoff" aria-hidden="true"><Ball className="ball" /><span className="shadow" /><span className="tiny">Kick off</span></div>
      </section>

      <LedBoard items={board1} />

      {/* ----------------------------- MANIFESTO --------------------------- */}
      <section className="sect mesh manifesto-sect">
        <PitchLines />
        <div className="container" style={{ position: 'relative' }}>
          <div className="sect-head"><span className="idx">00' — Kick-off</span></div>
          <p className="manifesto">
            {words.map((w, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <span key={i}><span className={`w ${HL.has(w) ? 'hl' : ''}`}>{w}</span>{' '}</span>
            ))}
          </p>
        </div>
      </section>

      {/* -------------------------------- STATS ---------------------------- */}
      <section className="sect on-bone mesh split-sect" style={{ position: 'relative', overflow: 'hidden' }}>
        <Mow />
        <div className="container">
          <div className="sect-head">
            <span className="idx">15' — The scoreboard</span>
            <Lines className="big-title" lines={['The draft,', <>in <em>numbers</em></>]} />
          </div>
          <div className="stats">
            {[
              ['Players registered', stats?.total ?? 0],
              ['Clubs', teams.length],
              ['Season', 5],
              ['Sold so far', stats?.sold ?? 0],
            ].map(([label, value]) => (
              <div key={label} data-up>
                <b className="flapper"><Flap value={value} /></b>
                <span className="label" style={{ display: 'block', marginTop: 10 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------- HORIZONTAL SEQ ------------------------ */}
      <section className="hscroll">
        <div className="container" style={{ paddingTop: 'clamp(70px, 12vh, 120px)', paddingBottom: 30 }}>
          <div className="sect-head" style={{ marginBottom: 0 }}>
            <span className="idx">30' — How a lot runs</span>
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

      {/* ------------------------------ TACTICS ---------------------------- */}
      <Tactics players={players} />

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
              <span className="idx">45' — Half time · The studio</span>
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
            <span className="idx">60' — The pool</span>
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
              <span className="idx">75' — The clubs</span>
              <Lines className="big-title" lines={[`${teams.length} captains.`, <>Same <em>purse.</em></>]} />
            </div>
            <div className="teams-grid">
              {teams.map((t, i) => {
                const fg = onColor(t.color);
                return (
                  <div
                    key={t.id}
                    className={`team-tile ${flipped === t.id ? 'flipped' : ''}`}
                    style={{ '--c': t.color, '--fg': fg }}
                    onClick={() => setFlipped((f) => (f === t.id ? null : t.id))}
                    role="button"
                    tabIndex={0}
                    aria-label={`${t.name} — show kit`}
                  >
                    <div className="tile-inner">
                      <div className="tile-face">
                        <div className="row" style={{ justifyContent: 'space-between' }}>
                          <span className="label">Club {String(i + 1).padStart(2, '0')}</span>
                          <span className="label">{t.shortName}</span>
                        </div>
                        <TeamLogo team={t} size={84} />
                        <h3>{t.name}</h3>
                      </div>
                      <div className="tile-face tile-back">
                        <Jersey color={t.color} text={fg} number={{ n: String(i + 1).padStart(2, '0'), label: t.shortName || t.name }} />
                        <span className="kit-name">{t.name}</span>
                        <span className="label" style={{ color: 'inherit', opacity: 0.75, position: 'relative' }}>Home kit · Season 5</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <LedBoard items={board2} reverse />

      {/* ---------------------------------- CTA ---------------------------- */}
      <section className="cta">
        <img className="crest-bg" src="/brand/crest.webp" alt="" aria-hidden="true" />
        <div className="cta-inner">
          <span className="label" style={{ color: 'var(--ink)' }}>90' — Full time</span>
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
