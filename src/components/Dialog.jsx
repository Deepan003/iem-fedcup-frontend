import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import '../dialog.css';

/**
 * Branded confirm / type-to-confirm dialog, replacing window.confirm and window.prompt.
 *
 *   const ask = useConfirm();
 *   if (await ask({ title, message, tone: 'danger', confirmLabel: 'Delete' })) …
 *   if (await ask({ title, message, tone: 'danger', expect: 'RESET' })) …   // type to confirm
 *
 * Tones (referee cards): 'danger' → red card, 'warning' → yellow card, default → crest gradient.
 */
const DialogCtx = createContext(null);
export const useConfirm = () => useContext(DialogCtx);

const KICKER = {
  danger: 'Red card · this cannot be undone',
  warning: 'Yellow card · please check',
  default: 'Confirm',
};

function DialogView({ req, onClose }) {
  const {
    title = 'Are you sure?', message, tone = 'default', confirmLabel, cancelLabel = 'Cancel', expect,
  } = req;
  const [typed, setTyped] = useState('');
  const [leaving, setLeaving] = useState(false);
  const inputRef = useRef(null);
  const cancelRef = useRef(null);
  const okRef = useRef(null);
  const ok = !expect || typed.trim() === expect;

  const close = useCallback((result) => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => onClose(result), 200);
  }, [leaving, onClose]);

  useEffect(() => {
    const prev = document.activeElement;
    // Safe default focus: type box for type-to-confirm, Cancel for destructive, OK otherwise.
    (expect ? inputRef : tone === 'danger' ? cancelRef : okRef).current?.focus();
    return () => prev?.focus?.();
  }, [expect, tone]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      if (e.key === 'Enter' && ok && document.activeElement !== cancelRef.current) { e.preventDefault(); close(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, ok]);

  return (
    <div className={`dlg-backdrop ${leaving ? 'out' : ''}`} onMouseDown={() => close(false)}>
      <div
        className={`dlg tone-${tone} ${leaving ? 'out' : ''}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dlg-title"
        aria-describedby="dlg-msg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="dlg-line" aria-hidden="true" />
        <svg className="dlg-circle" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="92" pathLength="1" /></svg>
        <div className="dlg-head">
          <span className="dlg-card" aria-hidden="true"><i /></span>
          <div className="dlg-titles">
            <span className="dlg-kicker">{KICKER[tone] || KICKER.default}</span>
            <h3 id="dlg-title">{title}</h3>
          </div>
        </div>
        {message && <p id="dlg-msg" className="dlg-msg">{message}</p>}
        {expect && (
          <label className={`dlg-type ${typed ? (ok ? 'match' : 'nomatch') : ''}`}>
            <span>Type <b>{expect}</b> to confirm</span>
            <input
              ref={inputRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck="false"
              placeholder={expect}
            />
            <i aria-hidden="true">{ok ? '✓' : ''}</i>
          </label>
        )}
        <div className="dlg-actions">
          <button ref={cancelRef} type="button" className="btn ghost" onClick={() => close(false)}>{cancelLabel}</button>
          <button
            ref={okRef}
            type="button"
            className={`btn ${tone === 'danger' ? 'dlg-danger' : tone === 'warning' ? 'gold' : 'primary'}`}
            disabled={!ok}
            onClick={() => close(true)}
          >
            {confirmLabel || (tone === 'danger' ? 'Yes, do it' : 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DialogProvider({ children }) {
  const [req, setReq] = useState(null);
  const resolver = useRef(null);
  const ask = useCallback((opts) => new Promise((resolve) => {
    resolver.current?.(false); // only one dialog at a time; a new one cancels the old
    resolver.current = resolve;
    setReq(typeof opts === 'string' ? { message: opts } : { ...opts });
  }), []);
  const onClose = useCallback((result) => {
    resolver.current?.(result);
    resolver.current = null;
    setReq(null);
  }, []);
  return (
    <DialogCtx.Provider value={ask}>
      {children}
      {req && createPortal(<DialogView key={req.title + req.message} req={req} onClose={onClose} />, document.body)}
    </DialogCtx.Provider>
  );
}
