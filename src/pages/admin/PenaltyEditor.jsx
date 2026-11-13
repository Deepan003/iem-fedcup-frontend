import { useState } from 'react';
import { money } from '../../lib/format.js';
import { Field, useAction } from '../../components/ui.jsx';
import { useConfirm } from '../../components/Dialog.jsx';
import { useAdmin } from './AdminApp.jsx';

const when = (at) => (at ? new Date(at).toLocaleString('en-GB', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
}) : '');

/** Penalties for one team: an amount off the purse, always with a remark. Removing one refunds it. */
export default function PenaltyEditor({ team, currency, onSaved }) {
  const { call } = useAdmin();
  const ask = useConfirm();
  const [run, busy] = useAction();
  const [amount, setAmount] = useState('');
  const [remark, setRemark] = useState('');
  const list = team.penalties || [];
  const total = list.reduce((s, p) => s + (p.amount || 0), 0);
  const ready = Number(amount) > 0 && remark.trim().length > 0;

  const add = async () => {
    const ok = await ask({
      title: `Penalise ${team.name}?`,
      message: `${money(Number(amount), currency)} comes off their purse straight away. Reason: “${remark.trim()}”. You can remove it later to refund it.`,
      tone: 'warning',
      confirmLabel: 'Apply penalty',
    });
    if (!ok) return;
    run(async () => {
      await call(`/admin/teams/${team.id}/penalties`, { method: 'POST', body: { amount: Number(amount), remark: remark.trim() } });
      setAmount('');
      setRemark('');
      onSaved();
    }, 'Penalty applied');
  };

  const remove = async (p) => {
    const ok = await ask({
      title: 'Remove this penalty?',
      message: `${team.name} gets ${money(p.amount, currency)} back. (“${p.remark}”)`,
      confirmLabel: 'Remove & refund',
    });
    if (!ok) return;
    run(async () => {
      await call(`/admin/teams/${team.id}/penalties/${p.id}`, { method: 'DELETE' });
      onSaved();
    }, 'Penalty removed');
  };

  return (
    <div className="card" style={{ background: 'var(--bg-2)' }}>
      <div className="ret-head">
        <h2 style={{ margin: 0 }}>Penalties</h2>
        {total > 0 && <span className="chip pen-chip">−{money(total, currency)} off purse</span>}
      </div>

      {list.length === 0 && <p className="muted small">No penalties. A penalty is taken off the team's purse and lowers their max bid.</p>}
      {list.map((p) => (
        <div key={p.id} className="pen-row">
          <b className="mono pen-amt">−{money(p.amount, currency)}</b>
          <span className="pen-remark">{p.remark}<span className="tiny">{when(p.at)}</span></span>
          <button type="button" className="btn sm ghost" disabled={busy} onClick={() => remove(p)} aria-label={`Remove penalty: ${p.remark}`}>✕</button>
        </div>
      ))}

      <div className="pen-add">
        <Field label={`Amount (${currency || 'pts'})`}>
          <input className="input" inputMode="numeric" value={amount} placeholder="e.g. 50" onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field label="Remark (reason)">
          <input className="input" value={remark} maxLength={200} placeholder="e.g. Late for the captains' meeting" onChange={(e) => setRemark(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && ready) { e.preventDefault(); add(); } }} />
        </Field>
      </div>
      <button type="button" className="btn sm" style={{ marginTop: 10 }} disabled={busy || !ready} onClick={add}>Apply penalty</button>
    </div>
  );
}
