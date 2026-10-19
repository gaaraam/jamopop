'use client';
import { advanceMetric, METRIC_MAX_BATCH } from './product-metrics.mjs';
export const METRIC_PREFERENCE = 'jamopop-metrics-choice-v1';
export const METRIC_CHANGED = 'jamopop-metrics-changed';
const VISITOR = 'jamopop-metrics-browser-v1',
  SESSION = 'jamopop-metrics-session-v1',
  OBSERVATIONS = 'jamopop-metrics-runs-v1';
const WEEK = 7 * 86400000;
type Identity = { visitor: string; session: string };
type Event = { id: string; run: string; mode: string; name: string; outcome?: string };
type Pending = { identity: Identity; event: Event };
let queue: Pending[] = [],
  sending = false,
  retryAfter = 0;
export function measurementAllowed() {
  try {
    return (
      localStorage.getItem(METRIC_PREFERENCE) === 'yes' &&
      !(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl &&
      navigator.doNotTrack !== '1'
    );
  } catch {
    return false;
  }
}
export function changeMeasurement(allowed: boolean) {
  queue = [];
  try {
    localStorage.setItem(METRIC_PREFERENCE, allowed ? 'yes' : 'no');
    if (!allowed) {
      localStorage.removeItem(VISITOR);
      sessionStorage.removeItem(SESSION);
      sessionStorage.removeItem(OBSERVATIONS);
      for (const mode of ['home', 'lobby', 'hub'])
        sessionStorage.removeItem(`jamopop-metrics-view-${mode}`);
    }
  } catch {}
  window.dispatchEvent(new Event(METRIC_CHANGED));
}
function identity(): Identity | null {
  if (!measurementAllowed()) return null;
  try {
    const now = Date.now();
    let visitor = JSON.parse(localStorage.getItem(VISITOR) || 'null');
    if (!visitor || typeof visitor.id !== 'string' || visitor.until <= now) {
      visitor = { id: crypto.randomUUID(), until: now + WEEK };
      localStorage.setItem(VISITOR, JSON.stringify(visitor));
    }
    let session = JSON.parse(sessionStorage.getItem(SESSION) || 'null');
    if (!session || session.visitor !== visitor.id || session.until <= now) {
      session = { id: crypto.randomUUID(), visitor: visitor.id };
      sessionStorage.removeItem(OBSERVATIONS);
    }
    session.until = now + 30 * 60000;
    sessionStorage.setItem(SESSION, JSON.stringify(session));
    return { visitor: visitor.id, session: session.id };
  } catch {
    return null;
  }
}
function enqueue(who: Identity, run: string, mode: string, name: string, outcome?: string) {
  if (queue.length >= 60) return;
  queue.push({
    identity: who,
    event: { id: crypto.randomUUID(), run, mode, name, ...(outcome ? { outcome } : {}) },
  });
  if (name === 'complete' || queue.length >= METRIC_MAX_BATCH) void flushMeasurements();
}
export async function flushMeasurements(leaving = false) {
  if (!measurementAllowed()) {
    queue = [];
    return;
  }
  if (sending || !queue.length || (!leaving && Date.now() < retryAfter)) return;
  const first = queue[0].identity;
  const batch = queue.splice(
    0,
    Math.min(
      METRIC_MAX_BATCH,
      queue.findIndex((x) => x.identity.session !== first.session) < 0
        ? queue.length
        : queue.findIndex((x) => x.identity.session !== first.session),
    ),
  );
  if (!batch.length) return;
  sending = true;
  try {
    const response = await fetch('/api/product-metrics', {
      method: 'POST',
      credentials: 'omit',
      keepalive: true,
      signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 1, ...first, events: batch.map((x) => x.event) }),
    });
    if (!response.ok) throw new Error('measurement unavailable');
    retryAfter = 0;
  } catch {
    // Best effort only. Never block play or persist unsent event content.
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
  const who = identity();
  if (!who) return;
  try {
    const observations = JSON.parse(sessionStorage.getItem(OBSERVATIONS) || '{}');
    const previous = observations[mode];
    if (
      previous &&
      previous.key !== snapshot.key &&
      previous.acted &&
      ['room', 'practice', 'speed'].includes(mode)
    )
      enqueue(who, previous.run, mode, 'next');
    const { state, events } = advanceMetric(previous, snapshot);
    const run = previous?.key === snapshot.key ? previous.run : crypto.randomUUID();
    observations[mode] = { ...state, run };
    sessionStorage.setItem(OBSERVATIONS, JSON.stringify(observations));
    for (const name of events)
      enqueue(who, run, mode, name, name === 'complete' ? snapshot.status : undefined);
  } catch {}
}
export function newMeasuredAttempt(mode: string, kind: 'retry' | 'next') {
  const who = identity();
  if (!who) return;
  try {
    const observations = JSON.parse(sessionStorage.getItem(OBSERVATIONS) || '{}');
    const previous = observations[mode];
    // A button click after simply loading a saved result is not a measured retry.
    if (previous?.acted) enqueue(who, previous.run, mode, kind);
    delete observations[mode];
    sessionStorage.setItem(OBSERVATIONS, JSON.stringify(observations));
  } catch {}
}
export function measureScene(mode: string) {
  const who = identity();
  if (!who) return;
  try {
    const key = `jamopop-metrics-view-${mode}`;
    if (sessionStorage.getItem(key) === who.session) return;
    sessionStorage.setItem(key, who.session);
    enqueue(who, crypto.randomUUID(), mode, 'view');
  } catch {}
}
