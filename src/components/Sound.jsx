import {
  useEffect, useRef, useState, useSyncExternalStore,
} from 'react';
import {
  listVoices, loadPrefs, pickVoice, savePrefs, sound,
} from '../lib/sound.js';
import { fmtAmount, teamById } from '../lib/format.js';
import { flavor, line, milestoneWord } from '../lib/commentary.js';
import '../sound.css';

const CURRENCY_WORD = {
  pts: 'points', pt: 'points', points: 'points', '₹': 'rupees', rs: 'rupees', inr: 'rupees', l: 'lakh', cr: 'crore', k: 'thousand',
};
const say$ = (n, cur) => `${fmtAmount(n || 0)} ${CURRENCY_WORD[String(cur || '').toLowerCase()] ?? (cur || '')}`.trim();

const subscribe = (fn) => sound.onChange(fn);
const isUnlocked = () => sound.unlocked;
const isSuppressed = () => sound.suppressed;
const isSpeechBlocked = () => sound.speechBlocked;

/** Settings switch for this kind of screen (studio / captain / admin). */
function surfaceAllowed(audio, surface) {
  if (!audio?.enabled) return false;
  if (surface === 'studio') return audio.studioSound !== false;
  if (surface === 'captain') return audio.captainSound !== false;
  return true;
}

const snap = (s) => ({
  status: s.status,
  paused: !!s.paused,
  seq: s.lot?.seq ?? null,
  phase: s.lot?.phase ?? null,
  amount: s.lot?.amount ?? null,
  leaderId: s.lot?.leaderId ?? null,
  record: s.stats?.records?.overall?.price ?? 0,
});

const RAPID_MS = 2600; // bids closer together than this get quick-fire calls

/**
 * Plays the auction: effects, voice and music react to live state changes.
 * One instance per page. `teamId` (captain room) adds outbid / leading alerts.
 */
export function useAuctionSound(state, now, { surface, teamId = null } = {}) {
  const [prefs, setPrefsRaw] = useState(() => loadPrefs(surface));
  const setPrefs = (p) => {
    setPrefsRaw(p);
    savePrefs(surface, p);
  };
  const unlocked = useSyncExternalStore(subscribe, isUnlocked);
  const audio = state?.audio;
  const audioKey = JSON.stringify(audio || {});

  useEffect(() => {
    sound.configure({ settings: audio || {}, prefs, surface });
  }, [audioKey, prefs, surface, unlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  // After a refresh: turn sound straight back on if this browser allows it without a click.
  useEffect(() => {
    if (!unlocked && prefs.on && surfaceAllowed(audio, surface)) sound.tryAutoUnlock();
  }, [audioKey, prefs.on, surface]); // eslint-disable-line react-hooks/exhaustive-deps

  // First tap/click anywhere unlocks sound (browsers block audio until a gesture) — and the voice,
  // which Chrome keeps blocked even when music was allowed to start on its own.
  const speechBlocked = useSyncExternalStore(subscribe, isSpeechBlocked);
  useEffect(() => {
    if ((unlocked && !speechBlocked) || !prefs.on || !surfaceAllowed(audio, surface)) return undefined;
    const go = () => { sound.unlock(); };
    window.addEventListener('pointerdown', go, { once: true });
    window.addEventListener('keydown', go, { once: true });
    return () => {
      window.removeEventListener('pointerdown', go);
      window.removeEventListener('keydown', go);
    };
  }, [unlocked, speechBlocked, prefs.on, audioKey, surface]); // eslint-disable-line react-hooks/exhaustive-deps

  // React to state changes.
  const prev = useRef(null);
  const lotMem = useRef({ seq: null, bidders: new Set(), leaders: [], lastAt: 0, bids: 0 });
  useEffect(() => {
    if (!state) return;
    const p = prev.current;
    const s = snap(state);
    prev.current = s;
    const live = s.status === 'live' && !s.paused;
    sound.crowd(s.status === 'live');
    sound.bed(live, s.phase === 'bidding' ? 0.45 : 1);
    if (!p || !unlocked) return; // first render or no sound yet: background only, no replays

    const cur = state.currency;
    const lot = state.lot;
    const pl = lot?.player || {};
    const team = (id) => teamById(state, id);
    const title = state.studio?.title || 'IEM FED Cup auction';

    // Auction start / end / pause
    if (p.status !== 'live' && s.status === 'live') {
      sound.whistle();
      sound.play('intro');
      sound.say(line('welcome', { title }), 'urgent', 'hype');
    }
    if (p.status === 'live' && s.status === 'ended') {
      sound.gavel(3, 1.4);
      sound.cheer(true);
      sound.stop('bed', 2);
      sound.play('end');
      sound.say(line('end'), 'urgent', 'excited');
    }
    if (s.status === 'live' && p.status === 'live') {
      if (!p.paused && s.paused) sound.say(line('paused'), 'urgent', 'calm');
      if (p.paused && !s.paused) sound.say(line('resumed'), 'info', 'excited');
    }
    if (!lot) return;

    const newLot = s.seq !== p.seq;
    if (newLot || lotMem.current.seq !== s.seq) {
      lotMem.current = { seq: s.seq, bidders: new Set(), leaders: [], lastAt: 0, bids: 0 };
    }
    if (newLot) {
      sound.whoosh();
      sound.heat(0);
      const bits = [pl.position, pl.tier ? `${pl.tier} tier` : ''].filter(Boolean).join(', ');
      sound.stop('intro', 1.5); // the show is underway: let the intro make way for the bed
      sound.say(line('next', { p: pl.name, bits: `${bits ? `${bits}. ` : ''}${flavor(pl.position)}`, base: say$(lot.base, cur) }), 'urgent', 'normal');
    }
    const phaseNow = newLot || s.phase !== p.phase;

    if (phaseNow && s.phase === 'bidding' && (newLot || p.phase === 'reveal')) {
      sound.horn();
      sound.say(line('open'), 'info', 'excited');
    }

    // A new bid on the same lot
    if (!newLot && s.amount != null && s.amount !== p.amount && ['bidding', 'awaiting'].includes(s.phase)) {
      const up = p.amount == null || s.amount > p.amount;
      if (up) {
        const m = lotMem.current;
        const at = Date.now();
        const gap = m.lastAt ? at - m.lastAt : Infinity;
        const rapid = gap < RAPID_MS;
        m.lastAt = at;
        m.bids += 1;
        const base = Math.max(1, lot.base);
        const mult = s.amount / base;
        const prevMult = (p.amount ?? lot.base) / base;
        // heat: how high the price has gone + how fast bids are flying
        const heat = Math.min(1, Math.max(0, (mult - 1) / 4) * 0.6 + (rapid ? 0.4 : gap < 5000 ? 0.2 : 0));
        sound.bid(mult, heat);

        const call = state.audio?.callBids || 'every';
        const leaderChanged = s.leaderId !== p.leaderId;
        const t = team(s.leaderId);
        const newBidder = s.leaderId && !m.bidders.has(s.leaderId);
        if (s.leaderId) m.bidders.add(s.leaderId);
        m.leaders = [...m.leaders, s.leaderId].slice(-4);
        if (t && (call === 'every' || (call === 'leader' && leaderChanged))) {
          const v = { a: say$(s.amount, cur), n: fmtAmount(s.amount), t: t.name };
          const pair = [...new Set(m.leaders)];
          const war = m.leaders.length === 4 && pair.length === 2 && m.leaders[0] !== m.leaders[1];
          const x = milestoneWord(prevMult, mult);
          const jump = p.amount != null && (s.amount - p.amount) >= Math.max(base, p.amount * 0.3);
          let text;
          let mood = mult >= 3 ? 'hype' : mult >= 2 ? 'excited' : 'normal';
          if (rapid) {
            // keep pace with the room: tiny calls, said fast; a milestone still gets a word in
            text = x ? `${v.n}! ${x[0].toUpperCase()}${x.slice(1)} the base!` : line('rapid', v);
            mood = 'rapid';
          } else if (m.bids === 1) text = line('firstBid', v);
          else if (x) text = line('milestone', { ...v, x });
          else if (jump) text = line('jump', v);
          else if (war && m.bids % 2 === 0) text = line('war', { ...v, t2: team(pair.find((id) => id !== s.leaderId))?.name || 'their rivals' });
          else if (newBidder && m.bids > 1) text = line('newTeam', v);
          else text = line(mult >= 3 ? 'bidHuge' : mult >= 2 ? 'bidHot' : 'bid', v);
          sound.say(text, 'bid', mood);
        }
        if (teamId) {
          if (p.leaderId === teamId && s.leaderId !== teamId) sound.outbid();
          else if (s.leaderId === teamId && p.leaderId !== teamId) sound.leading();
        }
      }
    }

    if (phaseNow && !newLot) {
      if (s.phase === 'awaiting') {
        sound.buzzer();
        sound.say(line('closed'), 'info', 'tense');
      }
      if (s.phase === 'sold') {
        const t = team(s.leaderId);
        const record = p.record > 0 && s.amount > p.record;
        const base = Math.max(1, lot.base);
        const big = record || s.amount >= 3 * base;
        const bids = lot.bidCount || lotMem.current.bids;
        sound.gavel(1, big ? 1.5 : 1.3); // the SOLD strike
        setTimeout(() => { if (!sound.play('sold')) sound.soldSting(big); }, 70); // fanfare lands with the hammer
        setTimeout(() => sound.cheer(big), 120);
        const v = {
          p: pl.name, t: t?.name || 'the team', a: say$(s.amount, cur), bids,
        };
        let key = 'sold';
        if (big) key = 'soldBig';
        else if (bids >= 8) key = 'soldWar';
        else if (s.amount <= base) key = 'soldBase';
        sound.say(line(key, v), 'urgent', big ? 'hype' : 'excited');
        if (record) {
          setTimeout(() => sound.chime(), 900);
          sound.say(line('record'), 'info', 'hype');
        }
        if (teamId && s.leaderId === teamId) sound.leading();
      }
      if (s.phase === 'unsold') {
        sound.unsold();
        sound.say(line('unsold', { p: pl.name }), 'urgent', 'sad');
      }
    }
  }, [state, unlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown: beeps + heartbeat in the last five seconds, "going once / going twice" with a riser.
  const lot = state?.lot;
  useEffect(() => {
    if (!lot || lot.phase !== 'bidding' || lot.endsAt == null || state?.paused || !unlocked) return undefined;
    let lastSec = null;
    const iv = setInterval(() => {
      const sec = Math.ceil((lot.endsAt - now()) / 1000);
      if (sec === lastSec || sec <= 0) return;
      lastSec = sec;
      if (sec <= 5) sound.beep(sec <= 3);
      if (state?.audio?.goingOnceTwice !== false && lot.amount != null) {
        // queued one second early: speech starts a beat after it is requested
        if (sec === 5) sound.say(line('goingOnce'), 'going', 'tense');
        if (sec === 3) {
          sound.riser(2.6, 0.18);
          sound.say(line('goingTwice'), 'going', 'tense');
        }
      }
    }, 100);
    return () => clearInterval(iv);
  }, [lot?.endsAt, lot?.phase, lot?.seq, lot?.amount, state?.paused, unlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Sound check" from the control room: every public screen with sound on answers out loud
  const check = state?.audio?.soundCheck || 0;
  const lastCheck = useRef(check);
  useEffect(() => {
    if (check === lastCheck.current) return;
    lastCheck.current = check;
    if (!unlocked || surface === 'admin' || Date.now() - check > 60000) return;
    sound.shimmer();
    sound.gavel(1);
    sound.say(line('soundCheck'), 'urgent', 'excited');
  }, [check, unlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  return { prefs, setPrefs, unlocked };
}

/** Say a sample line with the chosen voice settings (admin preview). */
export async function previewVoice(audio, line, mood = 'excited') {
  await sound.unlock();
  const keepPrefs = sound.prefs;
  sound.configure({ settings: { ...audio, enabled: true, voice: true }, prefs: { ...keepPrefs, on: true, voice: true }, surface: 'admin' });
  sound.bid(2);
  sound.say(line || 'Sold! Arjun Sen, to Radical Reds, for 300 points!', 'urgent', mood);
}

/** Admin preview of a whole moment: a fast bidding war, or a big sale with the crowd. */
export async function previewMoment(audio, kind) {
  await sound.unlock();
  sound.configure({ settings: { ...audio, enabled: true, voice: true, crowd: true }, prefs: { ...sound.prefs, on: true, voice: true }, surface: 'admin' });
  sound.stopVoice();
  if (kind === 'war') {
    const teams = ['Radical Reds', 'Blue Hawks'];
    [120, 130, 140, 150, 160, 180].forEach((amt, i) => setTimeout(() => {
      const mult = amt / 50;
      sound.bid(mult, Math.min(1, 0.3 + i * 0.12));
      sound.say(i === 0 ? line('firstBid', { a: `${amt} points`, n: amt, t: teams[0] }) : line('rapid', { n: amt, t: teams[i % 2] }), 'bid', i === 0 ? 'excited' : 'rapid');
    }, i * 1100));
    return;
  }
  if (kind === 'hammer') {
    sound.gavel(1, 1.5);
    return;
  }
  sound.gavel(1, 1.5);
  setTimeout(() => sound.soldSting(true), 70);
  setTimeout(() => sound.cheer(true), 120);
  sound.say(line('soldBig', { p: 'Arjun Sen', t: 'Radical Reds', a: '300 points' }), 'urgent', 'hype');
}

function useVoices() {
  const [voices, setVoices] = useState(() => listVoices());
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return undefined;
    const update = () => setVoices(listVoices());
    synth.addEventListener?.('voiceschanged', update);
    update();
    return () => synth.removeEventListener?.('voiceschanged', update);
  }, []);
  return voices;
}

/** Floating speaker button + per-device sound panel. */
export function SoundDock({
  state, sound: ctl, surface, big = false, inline = false, gate = false,
}) {
  const { prefs, setPrefs, unlocked } = ctl;
  const elsewhere = useSyncExternalStore(subscribe, isSuppressed);
  const voiceBlocked = useSyncExternalStore(subscribe, isSpeechBlocked);
  const [open, setOpen] = useState(false);
  const voices = useVoices();
  const ref = useRef(null);
  const audio = state?.audio;

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  if (!surfaceAllowed(audio, surface)) return null;
  const set = (k) => (v) => setPrefs({ ...prefs, [k]: v });
  const on = prefs.on && unlocked;
  const auto = pickVoice(audio?.voiceGender, '', audio?.voiceAccent || 'auto')?.name;

  if (elsewhere && unlocked && prefs.on) {
    return (
      <div className={`snd-dock ${inline ? 'inline' : ''}`} ref={ref}>
        <span className="snd-elsewhere" title="Only one tab on this computer plays sound, so voices and music never overlap. The studio tab has priority.">
          🔈 Playing in another tab
        </span>
      </div>
    );
  }

  // Music is playing but the browser blocks the announcer until one click on the page
  if (unlocked && voiceBlocked && prefs.on && prefs.voice !== false && audio?.voice !== false && !elsewhere) {
    if (gate) {
      return (
        <div className="snd-gate" role="dialog" aria-label="Turn on the announcer" onClick={() => sound.unlock()}>
          <div className="snd-gate-card" onClick={(e) => e.stopPropagation()}>
            <span className="snd-wave live big" aria-hidden="true"><i /><i /><i /><i /><i /></span>
            <h2>Turn on the announcer</h2>
            <p>The music is on. Click once so the announcer can call the players, bids and sales out loud.</p>
            <div className="snd-gate-actions">
              <button type="button" className="btn primary" onClick={() => { sound.unlock(); document.documentElement.requestFullscreen?.().catch(() => {}); }}>🎙 Voice on + full screen</button>
              <button type="button" className="btn" onClick={() => sound.unlock()}>🎙 Voice on</button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className={`snd-dock ${inline ? 'inline' : ''}`} ref={ref}>
        <button type="button" className="snd-unlock" onClick={() => sound.unlock()}>
          <span className="snd-wave" aria-hidden="true"><i /><i /><i /></span>
          Tap for the announcer
        </button>
      </div>
    );
  }

  if (prefs.on && !unlocked && gate) {
    // Studio: browsers only allow sound after one click on the page, so make that click impossible to miss
    const start = (full) => {
      sound.unlock();
      if (full) document.documentElement.requestFullscreen?.().catch(() => {});
    };
    return (
      <div className="snd-gate" role="dialog" aria-label="Start the show" onClick={() => start(false)}>
        <div className="snd-gate-card" onClick={(e) => e.stopPropagation()}>
          <span className="snd-wave live big" aria-hidden="true"><i /><i /><i /><i /><i /></span>
          <h2>Start the show</h2>
          <p>Click once so this screen can play the sound, music and announcer for everyone in the room.</p>
          <div className="snd-gate-actions">
            <button type="button" className="btn primary" onClick={() => start(true)}>🔊 Sound on + full screen</button>
            <button type="button" className="btn" onClick={() => start(false)}>🔊 Sound on</button>
          </div>
          <button type="button" className="snd-gate-skip" onClick={() => setPrefs({ ...prefs, on: false })}>Continue without sound</button>
        </div>
      </div>
    );
  }

  if (prefs.on && !unlocked) {
    return (
      <div className={`snd-dock ${big ? 'big' : ''} ${inline ? 'inline' : ''}`} ref={ref}>
        <button type="button" className="snd-unlock" onClick={() => sound.unlock()}>
          <span className="snd-wave" aria-hidden="true"><i /><i /><i /></span>
          {big ? 'Click to turn on sound' : 'Tap for sound'}
        </button>
      </div>
    );
  }

  return (
    <div className={`snd-dock ${inline ? 'inline' : ''}`} ref={ref}>
      {open && (
        <div className="snd-panel" role="dialog" aria-label="Sound settings">
          <div className="snd-row">
            <b>Sound</b>
            <input type="checkbox" checked={prefs.on} onChange={(e) => { set('on')(e.target.checked); if (e.target.checked) sound.unlock(); }} aria-label="Sound on" />
          </div>
          <label className="snd-slider">
            <span>Volume</span>
            <input type="range" min={0} max={100} value={prefs.volume} onChange={(e) => set('volume')(Number(e.target.value))} />
          </label>
          {audio?.voice !== false && (
            <div className="snd-row">
              <span>Announcer voice</span>
              <input type="checkbox" checked={prefs.voice} onChange={(e) => set('voice')(e.target.checked)} aria-label="Announcer voice" />
            </div>
          )}
          {audio?.voice !== false && prefs.voice && voices.length > 0 && (
            <label className="snd-slider">
              <span>Voice on this device</span>
              <select className="input" value={prefs.voiceName} onChange={(e) => set('voiceName')(e.target.value)}>
                <option value="">Auto ({audio?.voiceGender === 'female' ? 'female' : 'male'}{auto ? `: ${auto}` : ''})</option>
                {voices.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
              </select>
            </label>
          )}
          {audio?.music !== false && (
            <div className="snd-row">
              <span>Music</span>
              <input type="checkbox" checked={prefs.music} onChange={(e) => set('music')(e.target.checked)} aria-label="Music" />
            </div>
          )}
          <button
            type="button"
            className="btn sm"
            onClick={async () => {
              await sound.unlock();
              sound.bid(1.5);
              setTimeout(() => sound.bid(3), 180);
              sound.say(`Testing. ${state?.teams?.[0]?.name ? `Sold to ${state.teams[0].name}` : 'Sold'}, for 300 points!`, 'urgent');
            }}
          >
            Test sound
          </button>
        </div>
      )}
      <button
        type="button"
        className={`snd-btn ${on ? 'on' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={on ? 'Sound settings (on)' : 'Sound settings (off)'}
        title="Sound"
      >
        {on ? (
          <span className="snd-wave live" aria-hidden="true"><i /><i /><i /></span>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" /><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" /></svg>
        )}
      </button>
    </div>
  );
}
