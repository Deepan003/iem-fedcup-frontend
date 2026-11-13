export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/+$/, '');

/** Images stored in the DB come back as relative /api/media/... paths. */
export const assetUrl = (u) => (!u ? null : u.startsWith('/') ? `${API_URL}${u}` : u);

const KEYS = { admin: 'fedcup.admin', captain: 'fedcup.captain' };
export const session = {
  get: (role) => {
    try {
      return JSON.parse(localStorage.getItem(KEYS[role]) || 'null');
    } catch {
      return null;
    }
  },
  set: (role, value) => localStorage.setItem(KEYS[role], JSON.stringify(value)),
  clear: (role) => localStorage.removeItem(KEYS[role]),
};

const MESSAGES = {
  WRONG_PASSWORD: 'Wrong password.',
  TOO_MANY_ATTEMPTS: 'Too many attempts. Wait a few minutes and try again.',
  ADMIN_PASSWORD_NOT_SET: 'The server has no ADMIN_PASSWORD set.',
  UNAUTHORIZED: 'Your session has expired. Please log in again.',
  PORTAL_CLOSED: 'The player portal is closed right now.',
  PORTAL_CODE_REQUIRED: 'Enter the access code shared by the organisers.',
  // Auction
  NOT_LIVE: 'The auction is not live.',
  PAUSED: 'The auction is paused.',
  NO_ACTIVE_LOT: 'No player is on the block.',
  BIDDING_NOT_OPEN: 'Bidding has not opened yet.',
  BIDDING_CLOSED: 'Bidding is closed for this player.',
  STALE_LOT: 'That player is no longer on the block.',
  STALE_AMOUNT: 'Someone bid first. The price has gone up.',
  TIME_UP: 'Too late, time is up.',
  ALREADY_LEADING: 'You already have the highest bid.',
  ONLINE_BIDDING_OFF: 'Online bidding is off right now.',
  INVALID_AMOUNT: 'That amount is not allowed.',
  TEAM_FROZEN: 'Your team is frozen by the organisers.',
  SQUAD_FULL: 'Your squad is full.',
  POSITION_FULL: 'You already have the maximum for this position.',
  POSITION_SLOTS_NEEDED: 'Keep your remaining slots for required positions.',
  OVER_BUDGET: 'Not enough money left.',
  RESERVE_REQUIRED: 'You must keep money to complete your minimum squad.',
  TOO_FAST: 'Slow down a little.',
  LOT_IN_PROGRESS: 'Finish the current player first.',
  QUEUE_EMPTY: 'No players left in the queue.',
  NOTHING_TO_UNDO: 'Nothing to undo.',
  NO_BIDS: 'No bids yet. Mark unsold instead.',
  NOT_AWAITING: 'Bidding is not closed.',
  NO_UNSOLD_PLAYERS: 'There are no unsold players.',
  ALREADY_LIVE: 'The auction is already live.',
  ALREADY_PAUSED: 'Already paused.',
  NOT_PAUSED: 'Not paused.',
  SERVER_ERROR: 'Server error. Try again.',
  TIMEOUT: 'No response from the server. Check your connection.',
};
export const explain = (code, fallback) => MESSAGES[code] || fallback || code || 'Something went wrong';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message && body.error === 'ERROR' ? body.message : explain(body?.error, body?.message));
    this.status = status;
    this.code = body?.error;
  }
}

export async function api(path, {
  method = 'GET', body, token, form,
} = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers: {
        ...(body && !form ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: form || (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, { error: 'TIMEOUT' });
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
