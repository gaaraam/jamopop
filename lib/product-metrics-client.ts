'use client';
import { advanceMetric, METRIC_MAX_BATCH } from './product-metrics.mjs';
export const METRIC_PREFERENCE = 'jamopop-metrics-choice-v1';
export const METRIC_CHANGED = 'jamopop-metrics-changed';
const OBSERVATIONS = 'jamopop-metrics-runs-v2';
const IDLE = 30 * 60000;
type MetricEvent = { id: string; run: string; mode: string; name: string; outcome?: string };
type Observations = { until: number; games: Record<string, any>; scenes: Record<string, boolean> };
let queue: MetricEvent[] = [],
  sending = false,
  retryAfter = 0;
let memory: Observations = { until: 0, games: {}, scenes: {} };
export function measurementAllowed() {
  if (
    (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl ||
    navigator.doNotTrack === '1'
  )
    return false;
  try {
    return localStorage.getItem(METRIC_PREFERENCE) !== 'no';
  } catch {
    return true;
  }
}
export function changeMeasurement(allowed: boolean) {
  queue = [];
  memory = { until: 0, games: {}, scenes: {} };
  try {
    localStorage.setItem(METRIC_PREFERENCE, allowed ? 'yes' : 'no');
    sessionStorage.removeItem(OBSERVATIONS);
  } catch {}
  window.dispatchEvent(new Event(METRIC_CHANGED));
}
function observations(): Observations {
  const now = Date.now();
  try {
    memory = JSON.parse(sessionStorage.getItem(OBSERVATIONS) || 'null') || memory;
  } catch {}
  if (!memory || memory.until <= now) memory = { until: now + IDLE, games: {}, scenes: {} };
  memory.until = now + IDLE;
  return memory;
}
function persist(state: Observations) {
  memory = state;
  try {
    sessionStorage.setItem(OBSERVATIONS, JSON.stringify(state));
  } catch {}
}
function enqueue(run: string, mode: string, name: string, outcome?: string) {
  if (queue.length >= 60) return;
  queue.push({ id: crypto.randomUUID(), run, mode, name, ...(outcome ? { outcome } : {}) });
  if (name === 'complete' || queue.length >= METRIC_MAX_BATCH) void flushMeasurements();
}
export async function flushMeasurements(leaving = false) {
  if (!measurementAllowed()) {
    queue = [];
    return;
  }
  if (sending || !queue.length || (!leaving && Date.now() < retryAfter)) return;
  const batch = queue.splice(0, METRIC_MAX_BATCH);
  sending = true;
  try {
    const response = await fetch('/api/product-metrics', {
      method: 'POST',
      credentials: 'omit',
      keepalive: true,
      signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 2, events: batch }),
    });
    if (!response.ok) throw Error('measurement unavailable');
    retryAfter = 0;
  } catch {
    if (measurementAllowed()) queue = [...batch, ...queue].slice(0, 60);
    retryAfter = Date.now() + 60000;
  } finally {
    sending = false;
  }
}
export function observeGame(
  mode: string,
  snapshot: { key: string; steps: number; status: string },
) {
  if (!measurementAllowed()) return;
  try {
    const state = observations(),
      previous = state.games[mode];
    if (
      previous &&
      previous.key !== snapshot.key &&
      previous.acted &&
      ['room', 'practice', 'speed'].includes(mode)
    )
      enqueue(previous.run, mode, 'next');
    const next = advanceMetric(previous, snapshot),
      run = previous?.key === snapshot.key ? previous.run : crypto.randomUUID();
    state.games[mode] = { ...next.state, run };
    persist(state);
    for (const name of next.events)
      enqueue(run, mode, name, name === 'complete' ? snapshot.status : undefined);
  } catch {}
}
export function newMeasuredAttempt(mode: string, kind: 'retry' | 'next') {
  if (!measurementAllowed()) return;
  try {
    const state = observations(),
      previous = state.games[mode];
    if (previous?.acted) enqueue(previous.run, mode, kind);
    delete state.games[mode];
    persist(state);
  } catch {}
}
export function measureScene(mode: string) {
  if (!measurementAllowed()) return;
  const state = observations();
  if (state.scenes[mode]) return;
  state.scenes[mode] = true;
  persist(state);
  enqueue(crypto.randomUUID(), mode, 'view');
}
