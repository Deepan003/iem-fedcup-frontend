import { useEffect, useState } from 'react';
import { POSITIONS } from '../../lib/format.js';
import {
  Field, Spinner, Toggle, useAction,
} from '../../components/ui.jsx';
import { useAdmin } from './AdminApp.jsx';

const num = (v) => (v === '' || v == null ? '' : Number(v));

function NumField({ label, value, onChange, hint }) {
  return (
    <Field label={label} hint={hint}>
      <input className="input" inputMode="numeric" value={value ?? ''} onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, '') === '' ? '' : Number(e.target.value.replace(/[^\d]/g, '')))} />
    </Field>
  );
}

/** Increment levels: "until the price reaches X, each bid adds Y". */
function IncrementLevels({ value, base, currency, onChange }) {
  const levels = value.length ? value : [{ upTo: null, step: 10 }];
  const upd = (i, patch) => onChange(levels.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const remove = (i) => onChange(levels.filter((_, j) => j !== i).map((l, j, arr) => (j === arr.length - 1 ? { ...l, upTo: null } : l)));
  const addLevel = () => {
    const prev = levels.length > 1 ? levels[levels.length - 2].upTo || 0 : 0;
    const last = levels[levels.length - 1];
    onChange([...levels.slice(0, -1), { upTo: prev + (last.step || 10) * 10, step: last.step || 10 }, { upTo: null, step: (last.step || 10) * 2 }]);
  };
  const stepFor = (amt) => (levels.find((l) => l.upTo == null || amt < l.upTo) || levels[levels.length - 1]).step || 1;
  const seq = [];
  let p = Number(base) || 0;
  for (let k = 0; k < 9 && p < 1e9; k += 1) { seq.push(p); p += stepFor(p); }
  const fmt = (n) => Number(n).toLocaleString('en-IN');
  return (
    <div className="inc-box">
      <h2 style={{ margin: '10px 0 4px' }}>Bid increment levels</h2>
      <p className="muted small" style={{ margin: 0 }}>How much each new bid adds. It goes up automatically as the price climbs, and captains always see the exact next amount on their BID button.</p>
      {levels.map((l, i) => {
        const last = i === levels.length - 1;
        const from = i === 0 ? 0 : levels[i - 1].upTo || 0;
        return (
          <div key={i} className="inc-row">
            <span className="inc-idx">L{i + 1}</span>
            {last ? (
              <span className="inc-text">{i === 0 ? 'At any price' : <>From <b>{fmt(from)}</b> and above</>}</span>
            ) : (
              <span className="inc-text">{i === 0 ? 'From the base price' : <>From <b>{fmt(from)}</b></>} until it reaches
                <input className="input" inputMode="numeric" value={l.upTo ?? ''} onChange={(e) => upd(i, { upTo: e.target.value === '' ? '' : Number(e.target.value.replace(/\D/g, '')) })} />
              </span>
            )}
            <span className="inc-text">each bid adds <span className="inc-plus">+</span>
              <input className="input" inputMode="numeric" value={l.step ?? ''} onChange={(e) => upd(i, { step: e.target.value === '' ? '' : Number(e.target.value.replace(/\D/g, '')) })} />
              <span className="muted">{currency}</span>
            </span>
            {!last && <button type="button" className="btn sm ghost" onClick={() => remove(i)}>✕</button>}
          </div>
        );
      })}
      <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={addLevel}>+ Add a level</button>
      <div className="inc-preview"><span className="label">Example from a base of {fmt(base)}</span><div>{seq.map((n) => fmt(n)).join('  →  ')}  →  …</div></div>
    </div>
  );
}

function AuctionRules({ value, onSave }) {
  const [a, setA] = useState(value);
  const set = (k) => (v) => setA((x) => ({ ...x, [k]: v }));
  const move = (i, d) => {
    const order = [...a.positionOrder];
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    set('positionOrder')(order);
  };
  return (
    <div className="card stack">
      <h2>Auction rules</h2>
      <div className="form-grid">
        <Field label="Currency label"><input className="input" value={a.currency} onChange={(e) => set('currency')(e.target.value)} placeholder="pts / ₹ / L" /></Field>
        <NumField label="Team budget" value={a.teamBudget} onChange={set('teamBudget')} />
        <NumField label="Default base price" value={a.defaultBasePrice} onChange={set('defaultBasePrice')} hint="For players without a tier" />
        <NumField label="Min squad size" value={a.minSquadSize} onChange={set('minSquadSize')} />
        <NumField label="Max squad size" value={a.maxSquadSize} onChange={set('maxSquadSize')} />
        <NumField label="Reserve per open slot" value={a.reservePerSlot} onChange={set('reservePerSlot')} hint="Money a team must keep for each player still needed" />
      </div>

      <h2 style={{ marginTop: 10 }}>Tiers & base prices</h2>
      <p className="muted small" style={{ margin: 0 }}>A player opens at their <b>tier's base price</b>. A price typed on a single player (Players page) overrides it; players with no tier open at the default base price above. Set tiers in bulk on the Players page, or with a <b>Tier</b> column in the sheet.</p>
      {a.tiers.map((t, i) => (
        <div key={i} className="row wrap"> {/* eslint-disable-line react/no-array-index-key */}
          <input className="input" style={{ maxWidth: 160 }} value={t.name} onChange={(e) => set('tiers')(a.tiers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <input className="input" style={{ maxWidth: 110 }} inputMode="numeric" value={t.basePrice} onChange={(e) => set('tiers')(a.tiers.map((x, j) => (j === i ? { ...x, basePrice: num(e.target.value.replace(/\D/g, '')) } : x)))} />
          <input className="input" type="color" style={{ width: 56, padding: 4 }} value={t.color} onChange={(e) => set('tiers')(a.tiers.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} />
          <button type="button" className="btn sm ghost" onClick={() => set('tiers')(a.tiers.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => set('tiers')([...a.tiers, { name: 'New tier', basePrice: a.defaultBasePrice, color: '#94a3b8' }])}>+ Add tier</button>

      <IncrementLevels value={a.increments} base={a.defaultBasePrice} currency={a.currency} onChange={set('increments')} />

      <h2 style={{ marginTop: 10 }}>Order of positions</h2>
      {a.positionOrder.map((p, i) => (
        <div key={p} className="row">
          <b style={{ width: 24 }}>{i + 1}</b>
          <span className="grow">{p}</span>
          <button type="button" className="btn sm ghost" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
          <button type="button" className="btn sm ghost" onClick={() => move(i, 1)} disabled={i === a.positionOrder.length - 1}>↓</button>
        </div>
      ))}

      <h2 style={{ marginTop: 10 }}>Players per position</h2>
      <div className="form-grid">
        {POSITIONS.map((p) => (
          <div key={p} className="row">
            <span className="small" style={{ width: 90 }}>{p}</span>
            <input className="input" placeholder="min" inputMode="numeric" value={a.positionLimits[p]?.min ?? 0} onChange={(e) => set('positionLimits')({ ...a.positionLimits, [p]: { ...a.positionLimits[p], min: num(e.target.value.replace(/\D/g, '')) || 0 } })} />
            <input className="input" placeholder="max" inputMode="numeric" value={a.positionLimits[p]?.max ?? ''} onChange={(e) => set('positionLimits')({ ...a.positionLimits, [p]: { ...a.positionLimits[p], max: e.target.value === '' ? null : num(e.target.value.replace(/\D/g, '')) } })} />
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: 10 }}>Timers</h2>
      <Toggle label="Use countdown timers" hint="Turn off for fully manual auctions." checked={a.timerEnabled} onChange={set('timerEnabled')} />
      <Toggle label="Auctioneer must confirm every sale" hint="When the timer ends, bidding closes and waits for you to click Confirm SOLD." checked={a.requireConfirm} onChange={set('requireConfirm')} />
      <Toggle label="Open bidding automatically after the reveal" checked={a.autoOpen} onChange={set('autoOpen')} />
      <div className="form-grid">
        <NumField label="Reveal time (sec)" value={a.revealSec} onChange={set('revealSec')} />
        <NumField label="First bid timer (sec)" value={a.firstBidSec} onChange={set('firstBidSec')} />
        <NumField label="Timer after each bid (sec)" value={a.bidSec} onChange={set('bidSec')} />
        <NumField label="Latency grace (ms)" value={a.graceMs} onChange={set('graceMs')} hint="Accepts bids clicked right at zero" />
        <NumField label="Min time after resume (sec)" value={a.resumeMinSec} onChange={set('resumeMinSec')} />
      </div>
      <button type="button" className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => onSave('auction', a)}>Save rules</button>
    </div>
  );
}

function Toggles({ title, section, value, items, onSave, extra }) {
  const [v, setV] = useState(value);
  return (
    <div className="card">
      <h2>{title}</h2>
      {items.map(([k, label, hint]) => <Toggle key={k} label={label} hint={hint} checked={v[k]} onChange={(on) => setV({ ...v, [k]: on })} />)}
      {extra?.(v, setV)}
      <button type="button" className="btn primary" style={{ marginTop: 10 }} onClick={() => onSave(section, v)}>Save</button>
    </div>
  );
}

export default function SettingsAdmin({ ChangePassword, onAuthChange }) {
  const { call, token } = useAdmin();
  const [s, setS] = useState(null);
  const [code, setCode] = useState('');
  const [run] = useAction();
  useEffect(() => {
    call('/admin/settings').then(setS).catch(() => {});
  }, [call]);
  if (!s) return <Spinner />;
  const save = (section, value) => run(async () => {
    const saved = await call(`/admin/settings/${section}`, { method: 'PUT', body: value });
    setS((x) => ({ ...x, [section]: saved }));
  }, 'Saved. Live screens update immediately.');

  return (
    <>
      <h1>Rules & views</h1>
      <div className="cols-2">
        <AuctionRules value={s.auction} onSave={save} />
        <div className="stack">
          <Toggles
            title="What captains can see"
            section="captainView"
            value={s.captainView}
            onSave={save}
            items={[
              ['biddingEnabled', 'Captains can bid online'],
              ['showOtherPurses', "Other teams' purse & max bid"],
              ['showOtherSquads', "Other teams' squads"],
              ['showOtherPrices', 'Prices paid by other teams'],
              ['showBidHistory', 'Live bid history (who bid what)'],
              ['showUpcoming', 'Upcoming players'],
              ['showSquadBuilder', 'Squad builder / formation'],
            ]}
            extra={(v, setV) => <NumField label="How many upcoming players" value={v.upcomingCount} onChange={(n) => setV({ ...v, upcomingCount: n })} />}
          />
          <Toggles
            title="Studio (public screen)"
            section="studio"
            value={s.studio}
            onSave={save}
            items={[
              ['live', 'Show "Auction is LIVE" on the home page'],
              ['showPurses', 'Team purses'],
              ['showSquads', 'Team squads & prices'],
              ['showUpcoming', 'Up next players'],
              ['showViewerCount', 'Viewer count'],
            ]}
            extra={(v, setV) => (
              <div className="stack" style={{ marginTop: 8 }}>
                <Field label="Title"><input className="input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
                <Field label="Subtitle"><input className="input" value={v.subtitle} onChange={(e) => setV({ ...v, subtitle: e.target.value })} /></Field>
                <Field label="Auction starts at (countdown on home page)"><input className="input" type="datetime-local" value={v.startsAt ? new Date(new Date(v.startsAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''} onChange={(e) => setV({ ...v, startsAt: e.target.value ? new Date(e.target.value).toISOString() : null })} /></Field>
                <NumField label="How many upcoming players" value={v.upcomingCount} onChange={(n) => setV({ ...v, upcomingCount: n })} />
              </div>
            )}
          />
          <div className="card stack">
            <h2>Player portal</h2>
            <select className="input" value={s.portal.mode} onChange={(e) => save('portal', { mode: e.target.value })}>
              <option value="public">Public: anyone can search</option>
              <option value="code">Private: needs an access code</option>
              <option value="off">Closed</option>
            </select>
            <Field label="Access code (for private mode)"><input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Set a new code" /></Field>
            <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} disabled={code.length < 4} onClick={() => run(async () => { await call('/admin/portal-code', { method: 'PUT', body: { code } }); setCode(''); }, 'Code saved')}>Save code</button>
          </div>
          <ChangePassword token={token} onDone={onAuthChange} />
        </div>
      </div>
    </>
  );
}
