import { useEffect, useRef, useState } from 'react';
import { money } from '../lib/format.js';
import '../indicators.css';

/** Price "heat" class for the price block: glows as the bid climbs relative to the base. */
export function heatClass(lot, records) {
  if (!lot || lot.amount == null) return '';
  const rec = records?.overall?.price;
  if (rec && lot.amount > rec && ['bidding', 'awaiting'].includes(lot.phase)) return 'heat-record';
  const x = lot.amount / Math.max(1, lot.base);
  return x >= 3 ? 'heat-2' : x >= 2 ? 'heat-1' : '';
}

/**
 * Broadcast indicators under the price: records to beat, position/tier highs, price multiple,
 * bidding war. Plus a one-off "NEW AUCTION RECORD" sting when the record is broken.
 */
export default function Indicators({ state, now }) {
  const lot = state?.lot;
  const records = state?.stats?.records;
  const [sting, setSting] = useState(null);
  const stungSeq = useRef(null);

  const live = lot && ['bidding', 'awaiting'].includes(lot.phase);
  const amount = lot?.amount ?? lot?.base ?? 0;
  const pos = lot?.player?.position;
  const tier = lot?.player?.tier;
  const recAll = records?.overall;
  const recPos = pos ? records?.byPosition?.[pos] : null;
  const recTier = tier ? records?.byTier?.[tier] : null;
  const cur = state?.currency;

  useEffect(() => {
    if (!live || !recAll || lot.amount == null) return undefined;
    if (lot.amount > recAll.price && stungSeq.current !== lot.seq) {
      stungSeq.current = lot.seq;
      setSting({ amount: lot.amount });
      const t = setTimeout(() => setSting(null), 2600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [lot?.amount, lot?.seq, live]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lot || !['bidding', 'awaiting', 'sold'].includes(lot.phase)) return null;

  const tags = [];
  if (lot.amount != null && lot.base) {
    const x = lot.amount / lot.base;
    if (x >= 1.5) tags.push({ k: 'x', text: `${x.toFixed(1)}× base price`, tone: x >= 3 ? 'hot' : '' });
  }
  if (recAll) {
    if (lot.amount != null && lot.amount > recAll.price) tags.push({ k: 'rec', text: 'New auction record', tone: 'gold' });
    else if (live) tags.push({ k: 'rec', text: `${money(recAll.price - amount + 1 > 0 ? recAll.price - amount + 1 : 0, cur)} more beats the record (${money(recAll.price, cur)}, ${recAll.name})` });
  }
  if (recPos && pos) {
    if (lot.amount != null && lot.amount > recPos.price) tags.push({ k: 'pos', text: `Highest ${pos.toLowerCase()} so far`, tone: 'gold' });
    else tags.push({ k: 'pos', text: `Top ${pos.toLowerCase()} so far: ${money(recPos.price, cur)} (${recPos.name})` });
  }
  if (recTier && tier) {
    if (!(lot.amount != null && lot.amount > recTier.price)) tags.push({ k: 'tier', text: `Top ${tier} buy: ${money(recTier.price, cur)}` });
  }
  const t = now ? now() : Date.now();
  const recent = (lot.history || []).filter((h) => t - h.at < 20_000);
  const teamsIn = new Set(recent.map((h) => h.teamId)).size;
  if (live && recent.length >= 4 && teamsIn >= 2) tags.unshift({ k: 'war', text: `Bidding war · ${recent.length} bids in 20s`, tone: 'hot' });

  return (
    <>
      {tags.length > 0 && (
        <div className="ind-strip" aria-live="polite">
          {tags.map((g) => <span key={g.k + g.text} className={`ind ${g.tone || ''}`}>{g.text}</span>)}
        </div>
      )}
      {sting && (
        <div className="rec-sting" aria-live="assertive">
          <span className="rec-bar" />
          <div className="rec-text"><b>New auction record</b><span>{money(sting.amount, cur)}</span></div>
        </div>
      )}
    </>
  );
}
