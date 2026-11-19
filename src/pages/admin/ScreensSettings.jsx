import { useState } from 'react';
import { Field, Toggle } from '../../components/ui.jsx';

const ITEMS = {
  retained: ['Retained players', 'One slide per team: captain and retained players with photos and prices.'],
  top3: ['Top 3 buys', 'Podium of the three most expensive players.'],
  record: ['Record buy replay', 'Replays every bid on the most expensive player, then SOLD.'],
  war: ['Biggest bidding war', 'Replays the sale with the most bids.'],
  teams: ['Team by team', "One slide per team: purse, spend, squad by position."],
  teamsAll: ['All teams', 'Every team’s purse and squad size on one board.'],
  custom: ['Your own slides', 'The custom title / text slides below.'],
};
const ALL = Object.keys(ITEMS);

/** Admin: studio screensavers (when they show, which screens, timing, custom text slides). */
export default function ScreensSettings({ value, onSave }) {
  const [v, setV] = useState(() => ({ ...value, items: value.items || ALL, custom: value.custom || [] }));
  const set = (k) => (x) => setV((cur) => ({ ...cur, [k]: x }));
  const on = (k) => v.items.includes(k);
  const toggleItem = (k) => set('items')(on(k) ? v.items.filter((x) => x !== k) : [...v.items, k]);
  const move = (k, d) => {
    const list = [...v.items];
    const i = list.indexOf(k);
    const j = i + d;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    set('items')(list);
  };
  const ordered = [...v.items, ...ALL.filter((k) => !v.items.includes(k))];
  const setCustom = (i, patch) => set('custom')(v.custom.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <div className="card stack">
      <h2>Screensavers (studio)</h2>
      <Toggle label="Screensavers on" checked={v.enabled} onChange={set('enabled')} />
      <Toggle label="Show when the auction is paused" checked={v.onPause} onChange={set('onPause')} />
      <Toggle label="Show between players" hint="When no player is on the block." checked={v.betweenLots} onChange={set('betweenLots')} />
      <Toggle label="Shuffle" hint="Random order instead of the order below." checked={v.shuffle} onChange={set('shuffle')} />
      <label className="aud-slider">
        <span>Time per slide</span>
        <input type="range" min={3} max={30} value={v.slideSeconds} onChange={(e) => set('slideSeconds')(Number(e.target.value))} />
        <b className="mono">{v.slideSeconds}s</b>
      </label>

      <h3 className="aud-h">Screens (tick to show, arrows to reorder)</h3>
      {ordered.map((k) => (
        <div key={k} className={`ss-item ${on(k) ? '' : 'off'}`}>
          <input type="checkbox" checked={on(k)} onChange={() => toggleItem(k)} aria-label={ITEMS[k][0]} />
          <div className="grow">
            <b>{ITEMS[k][0]}</b>
            <div className="muted small">{ITEMS[k][1]}</div>
          </div>
          {on(k) && (
            <span className="row" style={{ gap: 4 }}>
              <button type="button" className="btn sm ghost" onClick={() => move(k, -1)} aria-label="Move up">↑</button>
              <button type="button" className="btn sm ghost" onClick={() => move(k, 1)} aria-label="Move down">↓</button>
            </span>
          )}
        </div>
      ))}

      <h3 className="aud-h">Your own slides</h3>
      {v.custom.length === 0 && <p className="muted small" style={{ margin: 0 }}>e.g. sponsors, &quot;Back in 10 minutes&quot;, rules, a welcome message.</p>}
      {v.custom.map((c, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={i} className="ss-custom-row">
          <Field label={`Slide ${i + 1} title`}><input className="input" value={c.title} maxLength={80} onChange={(e) => setCustom(i, { title: e.target.value })} /></Field>
          <Field label="Text (optional)"><textarea className="input" rows={2} value={c.text} maxLength={400} onChange={(e) => setCustom(i, { text: e.target.value })} /></Field>
          <button type="button" className="btn sm ghost" onClick={() => set('custom')(v.custom.filter((_, j) => j !== i))} aria-label={`Remove slide ${i + 1}`}>✕</button>
        </div>
      ))}
      {v.custom.length < 12 && <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => set('custom')([...v.custom, { title: '', text: '' }])}>+ Add a slide</button>}

      <button type="button" className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => onSave('screens', { ...v, custom: v.custom.filter((c) => c.title.trim() || c.text.trim()) })}>Save screensavers</button>
      <p className="muted small" style={{ margin: 0 }}>Use <b>Show now</b> in the Control room to put them on the studio at any time.</p>
    </div>
  );
}
