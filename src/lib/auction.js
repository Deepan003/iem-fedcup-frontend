import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { io } from 'socket.io-client';
import { API_URL } from './api.js';

/**
 * Live auction connection.
 * - Receives full `state` snapshots and small `bid` deltas (versioned; a gap triggers a resync).
 * - Keeps a server clock offset so every screen shows the same countdown.
 * - Reconnects automatically and refetches state after reconnecting.
 */
export function useAuction({ token = null, onSessionEnded, onEvent } = {}) {
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(false);
  const [viewers, setViewers] = useState(null);
  const offsetRef = useRef(0);
  const socketRef = useRef(null);
  const stateRef = useRef(null);
  const cbRef = useRef({ onSessionEnded, onEvent });
  cbRef.current = { onSessionEnded, onEvent };

  useEffect(() => {
    const s = io(API_URL, {
      auth: token ? { token } : {},
      transports: ['websocket', 'polling'],
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    });
    socketRef.current = s;

    const apply = (next) => {
      stateRef.current = next;
      setState(next);
    };
    const resync = () => s.emit('state:get', null, apply);

    const syncClock = async () => {
      let best = null;
      for (let i = 0; i < 4; i += 1) {
        const t0 = Date.now();
        // eslint-disable-next-line no-await-in-loop
        const server = await s.timeout(3000).emitWithAck('sync', null).catch(() => null);
        const t1 = Date.now();
        if (server != null) {
          const rtt = t1 - t0;
          if (!best || rtt < best.rtt) best = { rtt, offset: server + rtt / 2 - t1 };
        }
      }
      if (best) offsetRef.current = best.offset;
    };

    s.on('connect', () => {
      setConnected(true);
      syncClock();
    });
    s.on('disconnect', (reason) => {
      setConnected(false);
      if (reason === 'io server disconnect') cbRef.current.onSessionEnded?.();
    });
    s.on('connect_error', (err) => {
      if (err?.message === 'SESSION_EXPIRED') cbRef.current.onSessionEnded?.();
    });
    s.on('state', apply);
    s.on('bid', (d) => {
      const prev = stateRef.current;
      if (!prev?.lot || d.v <= prev.v) return;
      if (d.v !== prev.v + 1) {
        resync();
        return;
      }
      apply({ ...prev, v: d.v, lot: { ...prev.lot, ...d.lot } });
      cbRef.current.onEvent?.('bid', d);
    });
    s.on('viewers', setViewers);
    s.on('job', (j) => cbRef.current.onEvent?.('job', j));

    const clockTimer = setInterval(syncClock, 60_000);
    return () => {
      clearInterval(clockTimer);
      s.disconnect();
    };
  }, [token]);

  const now = useCallback(() => Date.now() + offsetRef.current, []);
  const emit = useCallback(async (event, payload) => {
    const s = socketRef.current;
    if (!s?.connected) return { ok: false, code: 'TIMEOUT' };
    try {
      return await s.timeout(8000).emitWithAck(event, payload);
    } catch {
      return { ok: false, code: 'TIMEOUT' };
    }
  }, []);

  /** Apply the fresh lot that comes back with a rejected/accepted action, without waiting for a broadcast. */
  const mergeLot = useCallback((lot, v) => {
    const prev = stateRef.current;
    if (!prev || !lot || (v != null && v < prev.v)) return;
    const next = { ...prev, lot: { ...prev.lot, ...lot } };
    stateRef.current = next;
    setState(next);
  }, []);

  return {
    state, connected, viewers, now, emit, mergeLot,
  };
}

/** Re-renders every `ms` while `active` (cheap ticking for countdowns). */
export function useTicker(active, ms = 100) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setTick((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [active, ms]);
}
