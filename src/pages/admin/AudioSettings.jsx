import { useRef, useState } from 'react';
import { assetUrl } from '../../lib/api.js';
import { Toggle, useAction } from '../../components/ui.jsx';
import { useConfirm } from '../../components/Dialog.jsx';
import { previewVoice } from '../../components/Sound.jsx';
import { useAdmin } from './AdminApp.jsx';

const SLOTS = [
  ['intro', 'Intro music', 'Plays when the auction starts, for the length set above, then fades out.'],
  ['bed', 'Background music', 'Loops quietly after the intro; dips while bidding and under the announcer.'],
  ['sold', 'Sold sting', 'Plays on every sale. Without it, a built-in stadium "sold" hit is used.'],
  ['end', 'Full-time music', 'Plays when the auction ends.'],
];
/* Short effects: each replaces the built-in sound when uploaded (keep them 0.2–3 seconds). */
const EFFECTS = [
  ['bid', 'Bid sound', 'Every new bid.'],
  ['newPlayer', 'New player', 'A player comes to the block.'],
  ['hammer', 'Hammer / gavel', 'The moment of a sale.'],
  ['record', 'New record', 'A new auction record.'],
  ['unsold', 'Unsold', 'A player goes unsold.'],
];

function Slider({ label, value, min = 0, max = 100, suffix = '%', onChange }) {
  return (
    <label className="aud-slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <b className="mono">{value}{suffix}</b>
    </label>
  );
}

/** Admin: sound, announcer voice and music for every screen. */
export default function AudioSettings({ value, tracks = {}, onSave }) {
  const { call } = useAdmin();
  const ask = useConfirm();
  const [run, busy] = useAction();
  const [v, setV] = useState(value);
  const playing = useRef(null);
  const set = (k) => (x) => setV({ ...v, [k]: x });

  const upload = (slot, file) => run(async () => {
    const fd = new FormData();
    fd.append('file', file);
    await call(`/admin/audio/${slot}`, { method: 'POST', form: fd });
  }, 'Music uploaded. Every screen picks it up automatically.');

  const preview = (url) => {
    playing.current?.pause();
    if (!url) return;
    const el = new Audio(assetUrl(url));
    el.volume = 0.8;
    el.play().catch(() => {});
    playing.current = el;
    setTimeout(() => { if (playing.current === el) el.pause(); }, 12000);
  };

  return (
    <div className="card stack">
      <h2>Sound &amp; voice</h2>
      <Toggle label="Sound on" hint="Master switch for every screen." checked={v.enabled} onChange={set('enabled')} />
      <Toggle label="Studio / projector" hint="The live show plays effects, voice and music." checked={v.studioSound} onChange={set('studioSound')} />
      <Toggle label="Captains" hint="Bid ticks, timer beeps and an outbid alert (with vibration on Android)." checked={v.captainSound} onChange={set('captainSound')} />
      <Toggle label="Crowd ambience & cheers" checked={v.crowd} onChange={set('crowd')} />
      <Toggle label="Music" hint="Uses the tracks below." checked={v.music} onChange={set('music')} />
      <Slider label="Intro music length" value={v.introSeconds ?? 25} min={0} max={120} suffix={v.introSeconds ? 's' : ' (full)'} onChange={set('introSeconds')} />

      <h3 className="aud-h">Announcer</h3>
      <Toggle label="Announcer voice" hint='"Next up…", bid calls, "Sold to … for …!"' checked={v.voice} onChange={set('voice')} />
      <div className="aud-seg" role="radiogroup" aria-label="Voice">
        {['male', 'female'].map((g) => (
          <button key={g} type="button" role="radio" aria-checked={v.voiceGender === g} className={v.voiceGender === g ? 'on' : ''} onClick={() => set('voiceGender')(g)}>
            {g === 'male' ? 'Male voice' : 'Female voice'}
          </button>
        ))}
      </div>
      <label className="aud-slider">
        <span>Call out bids</span>
        <select className="input" value={v.callBids} onChange={(e) => set('callBids')(e.target.value)}>
          <option value="every">Every bid ("120 points, Radical Reds")</option>
          <option value="leader">Only when the leading team changes</option>
          <option value="off">Never (effects only)</option>
        </select>
      </label>
      <Toggle label='"Going once… going twice…"' hint="In the last seconds of the timer." checked={v.goingOnceTwice} onChange={set('goingOnceTwice')} />
      <Slider label="Voice speed" value={v.voiceRate} min={60} max={140} onChange={set('voiceRate')} />
      <div className="row wrap" style={{ gap: 8 }}>
        <button type="button" className="btn sm" onClick={() => previewVoice(v, 'Next up: Arjun Sen. Midfielder, Gold tier. Base price, 50 points.')}>▶ Preview "Next up"</button>
        <button type="button" className="btn sm" onClick={() => previewVoice(v, 'Sold! Arjun Sen, to Radical Reds, for 300 points!')}>▶ Preview "Sold"</button>
      </div>
      <p className="muted small" style={{ margin: 0 }}>The voice comes from each device's browser, so it can sound slightly different on the projector laptop and on phones. Viewers can pick another voice from the speaker button.</p>

      <h3 className="aud-h">Volume</h3>
      <Slider label="Effects" value={v.sfxVolume} onChange={set('sfxVolume')} />
      <Slider label="Music" value={v.musicVolume} onChange={set('musicVolume')} />
      <Slider label="Voice" value={v.voiceVolume} onChange={set('voiceVolume')} />

      <button type="button" className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => onSave('audio', v)}>Save sound settings</button>

      <h3 className="aud-h">Music tracks</h3>
      <p className="muted small" style={{ margin: 0 }}>MP3, M4A, OGG or WAV, under 10 MB each. Use music you have the rights to play.</p>
      {[...SLOTS, ['__fx'], ...EFFECTS].map(([slot, label, hint]) => {
        if (slot === '__fx') return <h3 key="fx" className="aud-h">Sound effects (optional, your own clips)</h3>;
        const t = tracks[slot];
        return (
          <div key={slot} className="aud-track">
            <div className="grow" style={{ minWidth: 0 }}>
              <b>{label}</b>
              <div className="tiny ellipsis">{t ? t.name : 'Not set'}</div>
              <div className="muted small">{hint}</div>
            </div>
            {t && <button type="button" className="btn sm ghost" onClick={() => preview(t.url)} aria-label={`Play ${label}`}>▶</button>}
            <label className="btn sm">
              {t ? 'Replace' : 'Upload'}
              <input type="file" accept="audio/*,.mp3,.m4a,.ogg,.wav" hidden disabled={busy} onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) upload(slot, f); }} />
            </label>
            {t && (
              <button
                type="button"
                className="btn sm ghost"
                onClick={async () => (await ask({ title: `Remove ${label.toLowerCase()}?`, message: 'Screens stop playing it straight away.', tone: 'warning', confirmLabel: 'Remove' })) && run(() => call(`/admin/audio/${slot}`, { method: 'DELETE' }), 'Removed')}
                aria-label={`Remove ${label}`}
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
