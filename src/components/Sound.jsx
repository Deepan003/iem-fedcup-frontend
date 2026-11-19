import {
  useEffect, useRef, useState, useSyncExternalStore,
} from 'react';
import {
  listVoices, loadPrefs, pickVoice, savePrefs, sound,
} from '../lib/sound.js';
import { fmtAmount, teamById } from '../lib/format.js';
import '../sound.css';

const CURRENCY_WORD = {
  pts: 'points', pt: 'points', points: 'points', '₹': 'rupees', rs: 'rupees', inr: 'rupees', l: 'lakh', cr: 'crore', k: 'thousand',
};
const say$ = (n, cur) => `${fmtAmount(n || 0)} ${CURRENCY_WORD[String(cur || '').toLowerCase()] ?? (cur || '')}`.trim();

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Varied, human announcer lines (picked at random so it never sounds robotic). */
const LINES = {
  welcome: (title) => [`Welcome to the ${title}! Let's get started.`, `Good evening, and welcome to the ${title}! Let the bidding begin!`, `Welcome, everyone, to the ${title}! It's auction time!`],
  next: (n, bits, base) => [`Next up: ${n}. ${bits}Base price, ${base}.`, `Coming to the block: ${n}. ${bits}Starting at ${base}.`, `Here's our next player, ${n}. ${bits}Base price, ${base}.`],
  open: ['Bidding is open!', 'The floor is open. Who wants him?', "Bidding is open. Let's see those paddles!", 'Over to the captains. Bidding is open!'],
  bid: (amt, team, m) => (m >= 3
    ? [`${amt}! ${team}!`, `${amt} from ${team}! This is getting serious!`, `Wow! ${amt}, ${team}!`]
    : m >= 2
      ? [`${team} go to ${amt}!`, `${amt} now, ${team}.`, `${amt}, ${team}!`]
      : [`${amt}, ${team}.`, `${team}, ${amt}.`, `${amt} from ${team}.`]),
  sold: (n, t, a) => [`Sold! ${n}, to ${t}, for ${a}!`, `And it's sold! ${n} goes to ${t} for ${a}!`, `Hammer down! ${n} joins ${t} for ${a}!`],
  soldBig: (n, t, a) => [`Sold! What a signing! ${n} to ${t} for ${a}!`, `Hammer down! ${t} land ${n} for a massive ${a}!`, `Sold! ${t} pay big, ${a}, for ${n}!`],
  record: ["That's a new auction record!", 'History made! A brand new auction record!', 'Unbelievable! A new record!'],
  unsold: (n) => [`No takers. ${n} goes unsold.`, `${n} goes unsold, for now.`, `Nothing doing. ${n} is unsold.`],
  closed: ['Bidding is closed.', 'And bidding is closed.', 'Time is up!'],
  paused: ["We'll take a short break.", 'The auction is paused.', 'Quick pause, folks. Stay with us.'],
  resumed: ["And we're back!", "We're back. Let's carry on!"],
  end: ['And that is full time on the auction! Thank you all for watching!', "That's a wrap! Thank you, everyone, for an amazing auction!"],
};

const subscribe = (fn) => sound.onChange(fn);
const isUnlocked = () => sound.unlocked;

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

  // First tap/click anywhere unlocks sound (browsers block audio until a gesture).
  useEffect(() => {
    if (unlocked || !prefs.on || !surfaceAllowed(audio, surface)) return undefined;
    const go = () => { sound.unlock(); };
    window.addEventListener('pointerdown', go, { once: true });
    window.addEventListener('keydown', go, { once: true });
    return () => {
      window.removeEventListener('pointerdown', go);
      window.removeEventListener('keydown', go);
    };
  }, [unlocked, prefs.on, audioKey, surface]); // eslint-disable-line react-hooks/exhaustive-deps

  // React to state changes.
  const prev = useRef(null);
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

    // Auction start / end / pause
    if (p.status !== 'live' && s.status === 'live') {
      sound.whistle();
      sound.play('intro');
      sound.say(pick(LINES.welcome(state.studio?.title || 'IEM FED Cup auction')), 'urgent', 'hype');
    }
    if (p.status === 'live' && s.status === 'ended') {
      sound.gavel(3);
      sound.cheer(true);
      sound.stop('bed', 2);
      sound.play('end');
      sound.say(pick(LINES.end), 'urgent', 'excited');
    }
    if (s.status === 'live' && p.status === 'live') {
      if (!p.paused && s.paused) sound.say(pick(LINES.paused), 'urgent', 'calm');
      if (p.paused && !s.paused) sound.say(pick(LINES.resumed), 'info', 'excited');
    }
    if (!lot) return;

    const newLot = s.seq !== p.seq;
    if (newLot) {
      sound.whoosh();
      const bits = [pl.position, pl.tier ? `${pl.tier} tier` : ''].filter(Boolean).join(', ');
      sound.stop('intro', 1.5); // the show is underway: let the intro make way for the bed
      sound.say(pick(LINES.next(pl.name, bits ? `${bits}. ` : '', say$(lot.base, cur))), 'urgent', 'normal');
    }
    const phaseNow = newLot || s.phase !== p.phase;

    if (phaseNow && s.phase === 'bidding' && (newLot || p.phase === 'reveal')) {
      sound.horn();
      sound.say(pick(LINES.open), 'info', 'excited');
    }

    // A new bid on the same lot
    if (!newLot && s.amount != null && s.amount !== p.amount && ['bidding', 'awaiting'].includes(s.phase)) {
      const up = p.amount == null || s.amount > p.amount;
      if (up) {
        sound.bid(s.amount / Math.max(1, lot.base));
        const call = state.audio?.callBids || 'every';
        const leaderChanged = s.leaderId !== p.leaderId;
        if (call === 'every' || (call === 'leader' && leaderChanged)) {
          const t = team(s.leaderId);
          const mult = s.amount / Math.max(1, lot.base);
          sound.say(t ? pick(LINES.bid(say$(s.amount, cur), t.name, mult)) : `${say$(s.amount, cur)}.`, 'bid', mult >= 3 ? 'hype' : mult >= 2 ? 'excited' : 'normal');
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
        sound.say(pick(LINES.closed), 'info', 'tense');
      }
      if (s.phase === 'sold') {
        const t = team(s.leaderId);
        const record = p.record > 0 && s.amount > p.record;
        sound.gavel(1);
        if (!sound.play('sold')) sound.soldSting();
        sound.cheer(record);
        const big = record || s.amount >= 3 * Math.max(1, lot.base);
        sound.say(pick((big ? LINES.soldBig : LINES.sold)(pl.name, t?.name || 'the team', say$(s.amount, cur))), 'urgent', big ? 'hype' : 'excited');
        if (record) {
          setTimeout(() => sound.chime(), 900);
          sound.say(pick(LINES.record), 'info', 'hype');
        }
        if (teamId && s.leaderId === teamId) sound.leading();
      }
      if (s.phase === 'unsold') {
        sound.unsold();
        sound.say(pick(LINES.unsold(pl.name)), 'urgent', 'sad');
      }
    }
  }, [state, unlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown: beeps in the last five seconds, "going once / going twice".
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
        if (sec === 5) sound.say('Going once…', 'going', 'tense');
        if (sec === 3) sound.say(pick(['Going twice…', 'Last chance… going twice…']), 'going', 'tense');
      }
    }, 100);
    return () => clearInterval(iv);
  }, [lot?.endsAt, lot?.phase, lot?.seq, lot?.amount, state?.paused, unlocked]); // eslint-disable-line react-hooks/exhaustive-deps

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
  state, sound: ctl, surface, big = false, inline = false,
}) {
  const { prefs, setPrefs, unlocked } = ctl;
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
  const auto = pickVoice(audio?.voiceGender)?.name;

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
