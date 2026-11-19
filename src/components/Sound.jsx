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
      sound.say(`Welcome to the ${state.studio?.title || 'IEM FED Cup auction'}. Let's get started!`, 'urgent');
    }
    if (p.status === 'live' && s.status === 'ended') {
      sound.gavel(3);
      sound.cheer(true);
      sound.say('And that is full time on the auction. Thank you all for watching!', 'urgent');
    }
    if (s.status === 'live' && p.status === 'live') {
      if (!p.paused && s.paused) sound.say('The auction is paused.', 'urgent');
      if (p.paused && !s.paused) sound.say("And we're back.", 'info');
    }
    if (!lot) return;

    const newLot = s.seq !== p.seq;
    if (newLot) {
      sound.whoosh();
      const bits = [pl.position, pl.tier ? `${pl.tier} tier` : ''].filter(Boolean).join(', ');
      sound.say(`Next up: ${pl.name}. ${bits ? `${bits}. ` : ''}Base price, ${say$(lot.base, cur)}.`, 'urgent');
    }
    const phaseNow = newLot || s.phase !== p.phase;

    if (phaseNow && s.phase === 'bidding' && (newLot || p.phase === 'reveal')) {
      sound.horn();
      sound.say('Bidding is open.', 'info');
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
          sound.say(`${say$(s.amount, cur)}${t ? `, ${t.name}` : ''}.`, 'bid');
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
        sound.say('Bidding is closed.', 'info');
      }
      if (s.phase === 'sold') {
        const t = team(s.leaderId);
        const record = p.record > 0 && s.amount > p.record;
        sound.gavel(1);
        if (!sound.play('sold')) sound.soldSting();
        sound.cheer(record);
        sound.say(`Sold! ${pl.name}, to ${t?.name || 'the team'}, for ${say$(s.amount, cur)}!`, 'urgent');
        if (record) {
          setTimeout(() => sound.chime(), 900);
          sound.say("That's a new auction record!", 'info');
        }
        if (teamId && s.leaderId === teamId) sound.leading();
      }
      if (s.phase === 'unsold') {
        sound.unsold();
        sound.say(`${pl.name} goes unsold.`, 'urgent');
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
        if (sec === 5) sound.say('Going once.', 'going');
        if (sec === 3) sound.say('Going twice.', 'going');
      }
    }, 100);
    return () => clearInterval(iv);
  }, [lot?.endsAt, lot?.phase, lot?.seq, lot?.amount, state?.paused, unlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  return { prefs, setPrefs, unlocked };
}

/** Say a sample line with the chosen voice settings (admin preview). */
export async function previewVoice(audio, line) {
  await sound.unlock();
  const keepPrefs = sound.prefs;
  sound.configure({ settings: { ...audio, enabled: true, voice: true }, prefs: { ...keepPrefs, on: true, voice: true }, surface: 'admin' });
  sound.bid(2);
  sound.say(line || 'Sold! Arjun Sen, to Radical Reds, for 300 points!', 'urgent');
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
