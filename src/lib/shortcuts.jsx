import { useEffect, useState } from 'react';

/**
 * Keyboard shortcuts that press on-screen buttons.
 * A button opts in with data-kbd="n" (or "shift+s") and data-kbd-label="N" (shown as a key cap).
 * Pressing the key clicks that button — so every shortcut reuses the button's own checks and
 * confirmations, and does nothing when the button is hidden or disabled.
 * Ignored while typing in a field, when the key is held down (no auto-repeat), and while a dialog is open.
 */
const editable = (el) => !!el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName));

export function keyId(e) {
  const k = e.key.toLowerCase();
  return `${e.shiftKey && k !== '?' ? 'shift+' : ''}${k}`;
}

export function useShortcuts({ enabled = true } = {}) {
  const [help, setHelp] = useState(false);
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (editable(document.activeElement)) return;
      if (e.key === '?') { e.preventDefault(); setHelp((h) => !h); return; }
      if (e.key === 'Escape') { setHelp(false); return; }
      if (e.repeat) return; // holding a key never fires twice
      if (document.querySelector('[aria-modal="true"]')) return; // a confirm dialog handles its own keys
      const id = keyId(e);
      // a letter works with or without Shift (labels show plain letters; destructive actions confirm first)
      const alt = id.startsWith('shift+') ? id.slice(6) : `shift+${id}`;
      const btn = [...document.querySelectorAll(`[data-kbd="${CSS.escape(id)}"], [data-kbd="${CSS.escape(alt)}"]`)]
        .find((b) => !b.disabled && b.offsetParent !== null);
      if (!btn) return;
      e.preventDefault();
      btn.classList.remove('kbd-hit');
      void btn.offsetWidth; // restart the flash
      btn.classList.add('kbd-hit');
      btn.click();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
  return { help, setHelp };
}

/** Overlay listing the shortcuts available on this screen right now (press ? to toggle). */
export function ShortcutHelp({
  open, onClose, extra = [], all = null,
}) {
  if (!open) return null;
  // keys usable right now (their button is on screen and enabled)
  const liveKeys = new Set();
  const seen = new Map();
  document.querySelectorAll('[data-kbd]').forEach((b) => {
    const k = b.getAttribute('data-kbd-label') || b.getAttribute('data-kbd');
    const live = !b.disabled && b.offsetParent !== null;
    if (live) liveKeys.add(k);
    const name = (b.getAttribute('data-kbd-name') || b.getAttribute('aria-label') || b.innerText || '').replace(/\s+/g, ' ').trim();
    if (!seen.has(k) || live) seen.set(k, { name, live });
  });
  // a full, fixed list (e.g. every control-room key), with the ones usable right now highlighted
  if (all) {
    seen.clear();
    all.forEach(([k, name]) => seen.set(k, { name, live: liveKeys.has(k) }));
  }
  return (
    <div className="kbd-help" role="dialog" aria-label="Keyboard shortcuts" onClick={onClose}>
      <div className="kbd-help-card" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <b className="display" style={{ fontSize: 26 }}>Keyboard shortcuts</b>
          <button type="button" className="btn sm ghost" onClick={onClose}>✕</button>
        </div>
        <ul>
          {[...seen].map(([k, v]) => (
            <li key={k} className={v.live ? '' : 'off'}><kbd>{k}</kbd><span>{v.name}</span></li>
          ))}
          {extra.map(([k, name]) => <li key={k}><kbd>{k}</kbd><span>{name}</span></li>)}
          <li><kbd>?</kbd><span>Show / hide this list</span></li>
        </ul>
        <p className="muted small" style={{ margin: 0 }}>Keys only work when that button is on screen. Final actions (sold, unsold, undo, reset) always ask you to confirm. Holding a key never repeats it.</p>
      </div>
    </div>
  );
}
