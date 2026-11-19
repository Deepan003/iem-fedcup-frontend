export const POSITIONS = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'];
export const POS_SHORT = {
  Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Forward: 'FWD',
};
export const POS_COLOR = {
  Goalkeeper: '#f59e0b', Defender: '#3b82f6', Midfielder: '#22c55e', Forward: '#f43f5e',
};

/*
 * Money: amounts travel as whole numbers of the smallest unit. With 1 decimal place, 2.1 is 21.
 * The server sends the decimal places (state.decimals / config.decimals); everything here
 * converts for display and input.
 */
let DECIMALS = 0;
export function setMoneyDecimals(d) {
  const n = Number(d);
  DECIMALS = [0, 1, 2].includes(n) ? n : 0;
}
export const moneyDecimals = () => DECIMALS;
/** Stored units → real amount (e.g. 21 → 2.1). */
export const toMajor = (n) => (n == null || n === '' ? n : Number(n) / 10 ** DECIMALS);
/** Stored units → display text without currency (e.g. 21 → "2.1", 125000 → "1,25,000"). */
export const fmtAmount = (n) => (n == null || n === '' ? '—' : toMajor(n).toLocaleString('en-IN', { maximumFractionDigits: DECIMALS }));
/** Typed text → stored units ('' stays ''). "2.1" → 21 with 1 decimal. */
export function parseAmount(text) {
  const s = String(text ?? '').trim();
  if (s === '' || s === '.') return '';
  const f = Number.parseFloat(s);
  return Number.isFinite(f) ? Math.round(f * 10 ** DECIMALS) : '';
}
/** Keep only what a money box may contain: digits and, if allowed, one dot with limited decimals. */
export function cleanAmountText(text) {
  const s = String(text ?? '').replace(/[^\d.]/g, '');
  if (!DECIMALS) return s.replace(/\./g, '');
  const [int, ...rest] = s.split('.');
  return rest.length ? `${int}.${rest.join('').slice(0, DECIMALS)}` : int;
}
/** Stored units → text for an input box. */
export const amountToText = (n) => (n == null || n === '' ? '' : String(toMajor(n)));

export function money(n, currency = 'pts') {
  if (n == null) return '—';
  const v = fmtAmount(n);
  if (currency === '₹' || currency === 'Rs') return `₹${v}`;
  return `${v} ${currency}`;
}

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export function teamById(state, id) {
  return state?.teams?.find((t) => t.id === id) || null;
}

/** Readable text colour (black/white) for a background hex colour. */
export function onColor(hex = '#000000') {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#0b0f19' : '#ffffff';
}

export const PHASE_LABEL = {
  reveal: 'Up next',
  bidding: 'Bidding live',
  awaiting: 'Awaiting auctioneer',
  sold: 'Sold',
  unsold: 'Unsold',
};
