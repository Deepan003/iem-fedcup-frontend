import { useEffect, useState } from 'react';
import {
  fmtAmount, POSITIONS, setMoneyDecimals,
} from '../../lib/format.js';
import {
  Field, MoneyInput, Spinner, Toggle, useAction,
} from '../../components/ui.jsx';
import { useConfirm } from '../../components/Dialog.jsx';
import { useAdmin } from './AdminApp.jsx';
import AudioSettings from './AudioSettings.jsx';
import ScreensSettings from './ScreensSettings.jsx';

const num = (v) => (v === '' || v == null ? '' : Number(v));

/** A money field: shows real amounts (2.1), stores whole units. */
function MoneyField({
  label, value, onChange, hint,
}) {
  return <Field label={label} hint={hint}><MoneyInput value={value ?? ''} onChange={onChange} /></Field>;
}

/** Decimal places for every amount. Changing it converts saved amounts (before any sale only). */
function DecimalsControl({ value }) {
  const { call } = useAdmin();
  const ask = useConfirm();
  const [run, busy] = useAction();
  const change = async (next) => {
    if (next === value) return;
    const ok = await ask({
      title: next ? `Allow ${next} decimal place${next > 1 ? 's' : ''}?` : 'Whole numbers only?',
      message: `All saved amounts (budgets, tier prices, increments, retained prices, penalties) are converted and keep their value${next < value ? ', rounded to fewer decimals' : ''}. Only possible before any player is sold.`,
      tone: 'warning',
      confirmLabel: 'Change',
    });
    if (!ok) return;
    run(async () => {
      await call('/admin/money/decimals', { method: 'POST', body: { decimals: next } });
      setMoneyDecimals(next);
    }, 'Decimal places updated');
  };
  return (
    <Field label="Decimal places" hint="For prices like 2.1 or 2.25">
      <select className="input" value={value} disabled={busy} onChange={(e) => change(Number(e.target.value))}>
        <option value={0}>None (whole numbers)</option>
        <option value={1}>1 (e.g. 2.1)</option>
        <option value={2}>2 (e.g. 2.25)</option>
      </select>
    </Field>
  );
}

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
  const fmt = fmtAmount;
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
                <MoneyInput value={l.upTo ?? ''} onChange={(v) => upd(i, { upTo: v })} />
              </span>
            )}
            <span className="inc-text">each bid adds <span className="inc-plus">+</span>
              <MoneyInput value={l.step ?? ''} onChange={(v) => upd(i, { step: v })} />
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
        <DecimalsControl value={a.decimals || 0} />
        <MoneyField label="Team budget" value={a.teamBudget} onChange={set('teamBudget')} />
        <MoneyField label="Default base price" value={a.defaultBasePrice} onChange={set('defaultBasePrice')} hint="For players without a tier" />
        <NumField label="Min squad size" value={a.minSquadSize} onChange={set('minSquadSize')} />
        <NumField label="Max squad size" value={a.maxSquadSize} onChange={set('maxSquadSize')} hint="Whole squad: captain + retained + bought" />
        <NumField label="Max retained per team" value={a.maxRetained ?? 2} onChange={set('maxRetained')} hint="Captain not counted" />
        <MoneyField label="Reserve per open slot" value={a.reservePerSlot} onChange={set('reservePerSlot')} hint="Money a team must keep for each player still needed" />
      </div>

      <h2 style={{ marginTop: 10 }}>Tiers & base prices</h2>
      <p className="muted small" style={{ margin: 0 }}>A player opens at their <b>tier's base price</b>. A price typed on a single player (Players page) overrides it; players with no tier open at the default base price above. Set tiers in bulk on the Players page, or with a <b>Tier</b> column in the sheet.</p>
      {a.tiers.map((t, i) => (
        <div key={i} className="row wrap"> {/* eslint-disable-line react/no-array-index-key */}
          <input className="input" style={{ maxWidth: 160 }} value={t.name} onChange={(e) => set('tiers')(a.tiers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <MoneyInput style={{ maxWidth: 110 }} value={t.basePrice} onChange={(v) => set('tiers')(a.tiers.map((x, j) => (j === i ? { ...x, basePrice: v } : x)))} />
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
      <Toggle label="Captain counts in the squad" hint="The captain takes one squad slot (and their position), so with a 17 squad, a captain and 2 retained, a team buys 14 more." checked={a.captainInSquad !== false} onChange={set('captainInSquad')} />
      <Toggle label="Goalkeeper rule" hint="A team that already has a goalkeeper (bought, retained, or a goalkeeper captain) can't bid for another until every team has one." checked={a.gkRule !== false} onChange={set('gkRule')} />
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
  const { call, token, auction } = useAdmin();
  const [s, setS] = useState(null);
  const [code, setCode] = useState('');
  const [run] = useAction();
  // Live: reload when anything changes. Each form below is keyed by its own settings, so it
  // only resets when those settings really changed (not on every sale or team edit).
  useEffect(() => {
    call('/admin/settings').then((x) => { setMoneyDecimals(x.auction?.decimals); setS(x); }).catch(() => {});
  }, [call, auction.state?.dataV]);
  if (!s) return <Spinner />;
  const save = (section, value) => run(async () => {
    const saved = await call(`/admin/settings/${section}`, { method: 'PUT', body: value });
    setS((x) => ({ ...x, [section]: saved }));
  }, 'Saved. Live screens update immediately.');

  return (
    <>
      <h1>Rules & views</h1>
      <div className="cols-2">
        <AuctionRules key={JSON.stringify(s.auction)} value={s.auction} onSave={save} />
        <div className="stack">
          <Toggles
            key={JSON.stringify(s.captainView)}
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
            key={JSON.stringify(s.studio)}
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
          <AudioSettings key={JSON.stringify(s.audio)} value={s.audio} tracks={auction.state?.audio?.tracks} onSave={save} />
          {/* forceOn is toggled from the Control room: keep it out of the key so it doesn't reset this form */}
          <ScreensSettings key={JSON.stringify({ ...s.screens, forceOn: undefined })} value={s.screens} onSave={save} />
          <div className="card stack">
            <h2>Player portal</h2>
            <select className="input" value={s.portal.mode} onChange={(e) => save('portal', { ...s.portal, mode: e.target.value })}>
              <option value="public">Public: anyone can search</option>
              <option value="code">Private: needs an access code</option>
              <option value="off">Closed</option>
            </select>
            <Toggle label="Player cards download" hint="Adds a Card button on the players page: preview and download any player's card (PNG, JPG or animated). Switch on after the auction." checked={!!s.portal.cards} onChange={(v) => save('portal', { ...s.portal, cards: v })} />
            <Field label="Access code (for private mode)"><input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Set a new code" /></Field>
            <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} disabled={code.length < 4} onClick={() => run(async () => { await call('/admin/portal-code', { method: 'PUT', body: { code } }); setCode(''); }, 'Code saved')}>Save code</button>
          </div>
          <ChangePassword token={token} onDone={onAuthChange} />
        </div>
      </div>
    </>
  );
}
