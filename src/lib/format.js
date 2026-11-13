export const POSITIONS = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'];
export const POS_SHORT = {
  Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Forward: 'FWD',
};
export const POS_COLOR = {
  Goalkeeper: '#f59e0b', Defender: '#3b82f6', Midfielder: '#22c55e', Forward: '#f43f5e',
};

export function money(n, currency = 'pts') {
  if (n == null) return '—';
  const v = Number(n).toLocaleString('en-IN');
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
