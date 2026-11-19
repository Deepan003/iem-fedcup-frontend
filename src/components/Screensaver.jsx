import { useEffect, useMemo, useState } from 'react';
import { assetUrl } from '../lib/api.js';
import {
  initials, money, POSITIONS, POS_SHORT, teamById,
} from '../lib/format.js';
import { Avatar, TeamLogo } from './ui.jsx';
import { BrandMark } from './Nav.jsx';
import { sound } from '../lib/sound.js';
import '../screensaver.css';

const shuffled = (arr) => {
  const b = [...arr];
  for (let i = b.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

/** Should the studio show the screensaver right now? */
export function screensaverActive(state) {
  const sc = state?.screens;
  if (!sc?.enabled) return false;
  if (sc.forceOn) return true;
  if (state.status !== 'live') return false;
  if (sc.onPause && state.paused) return true;
  if (sc.betweenLots && !state.lot) return true;
  return false;
}

const ALL_ITEMS = ['retained', 'top3', 'record', 'war', 'teams', 'teamsAll', 'custom'];
// a group pick ("retained", "teams", "custom") shows every slide of that group
const GROUP_PREFIX = { retained: 'r-', teams: 't-', custom: 'c-' };

/** Every screen the control room can pick, as [value, label]. */
export function screenChoices(state) {
  const sc = state?.screens;
  if (!sc) return [];
  const all = buildSlides({ ...state, screens: { ...sc, show: '' } }, true);
  const label = (s) => {
    if (s.kind === 'retained') return `Retained · ${s.team.name}`;
    if (s.kind === 'team') return `Team sheet · ${s.team.name}`;
    if (s.kind === 'custom') return `Your slide · ${s.title || s.text}`.slice(0, 60);
    if (s.key === 'top3') return 'Top 3 buys';
    if (s.key === 'record') return 'Record buy replay';
    if (s.key === 'war') return `Biggest bidding war (${s.story.bids} bids)`;
    return 'All teams board';
  };
  const count = (p) => all.filter((s) => s.key.startsWith(p)).length;
  return [
    ['', 'Rotate the ticked screens'],
    ...(count('r-') > 1 ? [['retained', 'Retained · all teams']] : []),
    ...(count('t-') > 1 ? [['teams', 'Team sheets · all teams']] : []),
    ...(count('c-') > 1 ? [['custom', 'Your slides · all']] : []),
    ...all.map((s) => [s.key, label(s)]),
  ];
}

function buildSlides(state, every = false) {
  const sc = state.screens;
  const show = sc.show || '';
  const out = [];
  const byPrice = (a, b) => (b.isCaptain - a.isCaptain) || ((b.price || 0) - (a.price || 0));
  for (const item of (show || every) ? ALL_ITEMS : (sc.items || [])) {
    if (item === 'retained') {
      for (const t of state.teams) {
        const players = (sc.retained || []).filter((p) => p.teamId === t.id).sort(byPrice);
        if (players.length) out.push({ kind: 'retained', key: `r-${t.id}`, team: t, players });
      }
    }
    if (item === 'top3' && sc.top?.length) out.push({ kind: 'top3', key: 'top3' });
    if (item === 'record' && sc.topStory) out.push({ kind: 'story', key: 'record', story: sc.topStory, title: 'Record buy' });
    if (item === 'war' && sc.war && (show === 'war' || sc.war.id !== sc.topStory?.id)) out.push({ kind: 'story', key: 'war', story: sc.war, title: `Biggest bidding war · ${sc.war.bids} bids` });
    if (item === 'teams') state.teams.forEach((t) => out.push({ kind: 'team', key: `t-${t.id}`, team: t }));
    if (item === 'teamsAll' && state.teams.length) out.push({ kind: 'teamsAll', key: 'all' });
    if (item === 'custom') (sc.custom || []).forEach((c, i) => out.push({ kind: 'custom', key: `c-${i}`, ...c }));
  }
  if (!show || every) return out;
  const picked = out.filter((s) => s.key === show || (GROUP_PREFIX[show] && s.key.startsWith(GROUP_PREFIX[show])));
  // the picked screen has nothing to show (e.g. no sales yet): fall back to the normal rotation
  return picked.length ? picked : buildSlides({ ...state, screens: { ...sc, show: '' } });
}

function Photo({ p, className = '' }) {
  const url = assetUrl(p.photoUrl);
  return (
    <div className={`ss-photo ${className}`}>
      {url ? <img src={url} alt="" /> : <span>{initials(p.name)}</span>}
    </div>
  );
}

const calm = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Money that counts up from zero when the slide appears. */
function CountUp({ value = 0, cur, delay = 0, dur = 1100 }) {
  const [v, setV] = useState(() => (calm() ? value : 0));
  useEffect(() => {
    if (calm()) { setV(value); return undefined; }
    let raf;
    const t0 = performance.now() + delay;
    const tick = (t) => {
      const k = Math.min(1, Math.max(0, (t - t0) / dur));
      setV(Math.round(value * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, delay, dur]);
  return money(v, cur);
}

// fixed spark positions so they don't jump on re-render
const SPARKS = Array.from({ length: 16 }, (_, i) => ({
  left: `${(i * 61) % 100}%`, dur: `${7 + ((i * 37) % 8)}s`, delay: `${-((i * 1.7) % 9)}s`, size: `${2 + (i % 3)}px`,
}));

/* ------------------------------ slides ------------------------------ */

function RetainedSlide({ team, players, cur }) {
  return (
    <div className={`ss-slide ss-retained ${players.length <= 3 ? 'few' : ''}`}>
      <div className="ss-head">
        <TeamLogo team={team} size={players.length <= 3 ? 120 : 84} />
        <div>
          <span className="ss-kicker">Captain &amp; retained</span>
          <h2 className="ss-h">{team.name}</h2>
        </div>
      </div>
      <div className={`ss-cards n${Math.min(players.length, 6)}`}>
        {players.slice(0, 8).map((p, i) => (
          <div key={p.id} className={`ss-card ${p.isCaptain ? 'cap' : ''}`} style={{ animationDelay: `${0.35 + i * 0.16}s`, '--d': `${0.35 + i * 0.16}s` }}>
            <Photo p={p} />
            <div className="ss-card-body">
              {p.isCaptain && <span className="ss-badge">Captain</span>}
              <b>{p.name}</b>
              <span className="ss-meta">{[POS_SHORT[p.position], p.department, p.year].filter(Boolean).join(' · ')}</span>
              <span className="ss-price">{p.isCaptain ? 'Free' : <CountUp value={p.price} cur={cur} delay={600 + i * 160} />}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Top3Slide({ state }) {
  const top = state.screens.top;
  const order = [top[1], top[0], top[2]].filter(Boolean); // podium: 2nd, 1st, 3rd
  const rank = (p) => top.indexOf(p) + 1;
  return (
    <div className="ss-slide ss-top3">
      <span className="ss-kicker">Most expensive so far</span>
      <h2 className="ss-h">Top {top.length} buys</h2>
      <div className="ss-podium">
        {order.map((p) => {
          const r = rank(p);
          const t = teamById(state, p.teamId);
          return (
            <div key={p.id} className={`ss-step r${r}`} style={{ '--c': t?.color, animationDelay: `${0.2 + (3 - r) * 0.3}s`, '--d': `${0.2 + (3 - r) * 0.3}s` }}>
              <Photo p={p} />
              <span className="ss-rank">#{r}</span>
              <b>{p.name}</b>
              <span className="ss-team"><TeamLogo team={t} size={22} />{t?.name}</span>
              <span className="ss-price"><CountUp value={p.price} cur={state.currency} delay={500 + (3 - r) * 300} dur={1400} /></span>
              <span className="ss-plinth" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Replays a sale's bids one by one, then stamps SOLD. */
function StorySlide({
  story, title, state, secs, sfx,
}) {
  const steps = story.history;
  const [n, setN] = useState(0);
  useEffect(() => {
    const span = Math.max(1200, secs * 1000 * 0.72);
    const every = Math.max(90, span / Math.max(1, steps.length));
    const iv = setInterval(() => setN((x) => (x >= steps.length ? x : x + 1)), every);
    return () => clearInterval(iv);
  }, [steps.length, secs]);
  const shown = steps.slice(0, n);
  const last = shown[shown.length - 1];
  const leader = last && teamById(state, last.teamId);
  const buyer = teamById(state, story.teamId);
  const done = n >= steps.length;
  useEffect(() => {
    if (!sfx || n === 0) return;
    if (n < steps.length) sound.bid(1 + (n / steps.length) * 3, n / steps.length > 0.6 ? 0.5 : 0.15);
    else {
      sound.gavel(1);
      sound.soldSting(true);
      sound.cheer(false);
    }
  }, [n, sfx]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="ss-slide ss-story" style={{ '--c': (done ? buyer : leader)?.color }}>
      <div className="ss-story-left">
        <span className="ss-kicker">{title}</span>
        <Photo p={story} className="big" />
        <h2 className="ss-h sm">{story.name}</h2>
        <span className="ss-meta">{[POS_SHORT[story.position], story.tier].filter(Boolean).join(' · ')}</span>
      </div>
      <div className="ss-story-right">
        <div className="ss-now">
          <span className="ss-kicker">{done ? 'Sold for' : 'Bid'}</span>
          <div key={n} className="ss-amount">{last ? money(last.amount, state.currency) : '—'}</div>
          {leader && !done && <span className="ss-team big"><TeamLogo team={leader} size={30} />{leader.name}</span>}
          {done && buyer && <span className="ss-sold"><TeamLogo team={buyer} size={34} />Sold to {buyer.name}</span>}
        </div>
        <ol className="ss-ladder">
          {[...shown].reverse().slice(0, 7).map((h, i) => {
            const t = teamById(state, h.teamId);
            return (
              <li key={`${shown.length - i}`} className={i === 0 ? 'top' : ''} style={{ '--c': t?.color }}>
                <TeamLogo team={t} size={24} />
                <span>{t?.shortName || t?.name}</span>
                <b>{money(h.amount, state.currency)}</b>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function TeamSlide({ team, cur }) {
  const squad = team.squad || [];
  const count = (pos) => squad.filter((p) => p.position === pos).length;
  return (
    <div className="ss-slide ss-team-slide" style={{ '--c': team.color }}>
      <div className="ss-head">
        <TeamLogo team={team} size={96} />
        <div>
          <span className="ss-kicker">Team sheet</span>
          <h2 className="ss-h">{team.name}</h2>
          {team.captainName && <span className="ss-meta">Captain · {team.captainName}</span>}
        </div>
      </div>
      <div className="ss-team-grid">
        <div className="ss-stats">
          {team.purse !== undefined && <div><span className="ss-kicker">Purse left</span><b><CountUp value={team.purse} cur={cur} delay={400} /></b></div>}
          {team.spent !== undefined && <div><span className="ss-kicker">Spent</span><b><CountUp value={team.spent} cur={cur} delay={550} /></b></div>}
          <div><span className="ss-kicker">Players</span><b>{team.count}{team.slotsLeft != null ? ` / ${team.count + team.slotsLeft}` : ''}</b></div>
          <div className="ss-tally">{POSITIONS.map((pos) => <span key={pos}>{POS_SHORT[pos]} <b>{count(pos)}</b></span>)}</div>
        </div>
        <ul className="ss-squad">
          {squad.length === 0 && <li className="ss-meta">No players yet</li>}
          {squad.slice(0, 15).map((p, i) => (
            <li key={p.id} style={{ animationDelay: `${0.3 + i * 0.05}s` }}>
              <Avatar player={p} size={40} className="ss-av" />
              <span className="ss-pos">{POS_SHORT[p.position]}</span>
              <span className="ss-nm">{p.name}{p.isCaptain ? ' (C)' : ''}</span>
              {p.price !== undefined && <span className="ss-p">{p.isCaptain ? 'C' : money(p.price, cur)}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function TeamsAllSlide({ state }) {
  const max = Math.max(1, ...state.teams.map((t) => t.budget || t.purse || 0));
  return (
    <div className="ss-slide ss-all">
      <span className="ss-kicker">All teams</span>
      <h2 className="ss-h">The table</h2>
      <div className="ss-all-grid">
        {state.teams.map((t, i) => (
          <div key={t.id} className="ss-tile" style={{ '--c': t.color, animationDelay: `${0.2 + i * 0.08}s` }}>
            <div className="ss-tile-top"><TeamLogo team={t} size={44} /><b>{t.shortName || t.name}</b></div>
            {t.purse !== undefined && <div className="ss-tile-purse"><CountUp value={t.purse} cur={state.currency} delay={300 + i * 80} /></div>}
            {t.purse !== undefined && <div className="ss-bar"><i style={{ transform: `scaleX(${Math.max(0, Math.min(1, t.purse / max))})` }} /></div>}
            <span className="ss-meta">{t.count} players</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CustomSlide({ title, text }) {
  return (
    <div className="ss-slide ss-custom">
      {title && (
        <h2 className="ss-h huge">
          {title.split(' ').map((w, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <span key={i} className="ss-word" style={{ animationDelay: `${0.15 + i * 0.09}s` }}>{w}&nbsp;</span>
          ))}
        </h2>
      )}
      {text && <p className="ss-text">{text}</p>}
    </div>
  );
}

function BrandSlide({ state }) {
  return (
    <div className="ss-slide ss-brand">
      <img className="ss-crest" src="/brand/crest.webp" alt="" />
      <h2 className="ss-h">{state.paused ? "We'll be right back" : state.studio?.title || 'IEM FED Cup'}</h2>
    </div>
  );
}

/* ------------------------------ root ------------------------------ */

/** Full-screen studio screensaver: cycles the chosen screens while paused / between players / on demand. */
export default function Screensaver({ state }) {
  const active = screensaverActive(state);
  const [mounted, setMounted] = useState(active);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (active) {
      setMounted(true);
      setLeaving(false);
      return undefined;
    }
    if (!mounted) return undefined;
    setLeaving(true);
    const t = setTimeout(() => { setMounted(false); setLeaving(false); }, 650);
    return () => clearTimeout(t);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const slides = useMemo(() => (state?.screens ? buildSlides(state) : []), [state]);
  const keys = slides.map((s) => s.key).join('|');
  const [order, setOrder] = useState([]);
  const [idx, setIdx] = useState(0);
  const shuffle = !!state?.screens?.shuffle;
  useEffect(() => {
    const k = slides.map((s) => s.key);
    setOrder(shuffle ? shuffled(k) : k);
    setIdx(0);
  }, [keys, shuffle, active]); // eslint-disable-line react-hooks/exhaustive-deps

  const secs = state?.screens?.slideSeconds || 8;
  useEffect(() => {
    if (!active || order.length < 2) return undefined;
    const t = setInterval(() => setIdx((i) => (i + 1) % order.length), secs * 1000);
    return () => clearInterval(t);
  }, [active, order.length, secs]);

  // music and effects on the studio screensaver (Audio settings: "Screensaver sounds")
  const sfx = state?.audio?.screenSfx !== false;
  useEffect(() => {
    sound.screensMusic(!!(active && sfx));
  }, [active, sfx]);
  useEffect(() => () => sound.screensMusic(false), []);
  const curSlide = slides.find((x) => x.key === order[idx]);
  useEffect(() => {
    if (!active || !sfx || !curSlide) return undefined;
    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));
    sound.swoosh(idx % 2 ? -1 : 1);
    if (curSlide.kind === 'retained') curSlide.players.slice(0, 8).forEach((_, i) => at(380 + i * 160, () => sound.deal(i)));
    if (curSlide.kind === 'top3') { at(150, () => sound.drumroll(1.2)); at(1500, () => sound.shimmer()); }
    if (curSlide.kind === 'teamsAll') state.teams.forEach((_, i) => at(220 + i * 80, () => sound.deal(i)));
    if (curSlide.kind === 'team') { at(250, () => sound.riser(0.7, 0.1)); at(950, () => sound.shimmer()); }
    if (curSlide.kind === 'custom') at(120, () => sound.riser(1, 0.12));
    return () => timers.forEach(clearTimeout);
  }, [curSlide?.key, idx, active, sfx]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted || !state) return null;
  const slide = slides.find((s) => s.key === order[idx]) || slides[0] || { kind: 'brand', key: 'brand' };
  const cur = state.currency;
  const ghost = slide.team?.name || (slide.kind === 'top3' ? 'Top three' : slide.kind === 'story' ? slide.story.name : slide.kind === 'teamsAll' ? 'The table' : 'FED Cup');
  let body;
  if (slide.kind === 'retained') body = <RetainedSlide team={slide.team} players={slide.players} cur={cur} />;
  else if (slide.kind === 'top3') body = <Top3Slide state={state} />;
  else if (slide.kind === 'story') body = <StorySlide story={slide.story} title={slide.title} state={state} secs={secs} sfx={sfx} />;
  else if (slide.kind === 'team') body = <TeamSlide team={slide.team} cur={cur} />;
  else if (slide.kind === 'teamsAll') body = <TeamsAllSlide state={state} />;
  else if (slide.kind === 'custom') body = <CustomSlide title={slide.title} text={slide.text} />;
  else body = <BrandSlide state={state} />;

  return (
    <div className={`ss-root ${leaving ? 'out' : ''}`} style={{ '--c': slide.team?.color || 'var(--signal)' }} aria-live="polite">
      <div className="ss-bg" aria-hidden="true"><i /><i /></div>
      <div className="ss-sparks" aria-hidden="true">
        {SPARKS.map((p, i) => <i key={i} style={{ left: p.left, width: p.size, height: p.size, animationDuration: p.dur, animationDelay: p.delay }} />)}
      </div>
      <div className="ss-ghost" key={`g-${slide.key}`} aria-hidden="true"><span>{ghost} · {ghost} · {ghost} · {ghost} · </span></div>
      <div className="ss-wipe" key={`w-${slide.key}-${idx}`} aria-hidden="true" />
      <header className="ss-bar-top">
        <BrandMark />
        <span className="ss-title">{state.studio?.title || 'IEM FED Cup Auction'}</span>
        {state.paused && <span className="ss-chip">Paused · back soon</span>}
      </header>
      <main className="ss-stage" key={`${slide.key}-${idx}`}>{body}</main>
      {order.length > 1 && (
        <footer className="ss-foot">
          <div className="ss-progress"><i key={`${slide.key}-${idx}`} style={{ animationDuration: `${secs}s` }} /></div>
          <div className="ss-dots">{order.map((k, i) => <span key={k} className={i === idx ? 'on' : ''} />)}</div>
        </footer>
      )}
    </div>
  );
}
