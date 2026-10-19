// Fixed vocabulary only: no URLs, identity headers, text input or arbitrary properties.
export const METRIC_MODES = [
  'home',
  'lobby',
  'hub',
  'daily',
  'word',
  'exit',
  'stack',
  'toktok',
  'room',
  'practice',
  'speed',
];
export const METRIC_EVENTS = ['view', 'start', 'first_action', 'complete', 'retry', 'next'];
export const METRIC_DAYS = 7;
export const METRIC_MAX_BATCH = 12;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const keys = (x, names) =>
  x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).every((k) => names.includes(k));
export function validateMetricBatch(body) {
  if (
    !keys(body, ['version', 'visitor', 'session', 'events']) ||
    body.version !== 1 ||
    !ID.test(body.visitor) ||
    !ID.test(body.session) ||
    !Array.isArray(body.events) ||
    !body.events.length ||
    body.events.length > METRIC_MAX_BATCH
  )
    return null;
  const events = [];
  for (const e of body.events) {
    if (
      !keys(e, ['id', 'run', 'mode', 'name', 'outcome']) ||
      !ID.test(e.id) ||
      !ID.test(e.run) ||
      !METRIC_MODES.includes(e.mode) ||
      !METRIC_EVENTS.includes(e.name)
    )
      return null;
    if (
      e.name === 'complete'
        ? !['won', 'lost', 'timeout', 'abandoned'].includes(e.outcome)
        : e.outcome !== undefined
    )
      return null;
    if (['home', 'lobby', 'hub'].includes(e.mode) && e.name !== 'view') return null;
    events.push({ id: e.id, run: e.run, mode: e.mode, name: e.name, outcome: e.outcome || null });
  }
  return { visitor: body.visitor, session: body.session, events };
}
export function metricScene(pathname, search = '') {
  // Never retain paths or query values. Only emit a whitelisted scene name.
  if (pathname === '/') {
    const p = new URLSearchParams(search);
    return p.has('r') || p.has('lobby') ? 'lobby' : 'home';
  }
  if (pathname === '/solo') return 'hub';
  return null;
}
// Existing/finished saves are a baseline, never synthetic actions or completions.
export function advanceMetric(previous, snapshot) {
  const events = [];
  if (!previous || previous.key !== snapshot.key) {
    return {
      state: { ...snapshot, acted: false, completed: false },
      events: ['view', ...(snapshot.status === 'playing' ? ['start'] : [])],
    };
  }
  const state = { ...previous, ...snapshot };
  if (snapshot.steps > previous.steps && !previous.acted && previous.status === 'playing') {
    state.acted = true;
    events.push('first_action');
  }
  if (
    state.acted &&
    !previous.completed &&
    previous.status === 'playing' &&
    ['won', 'lost', 'timeout', 'abandoned'].includes(snapshot.status)
  ) {
    state.completed = true;
    events.push('complete');
  }
  return { state, events };
}
export async function saveMetricBatch(db, batch, now = Date.now()) {
  const day = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  // Event id + semantic uniqueness make transport retries, refreshes and StrictMode idempotent.
  return db.batch(
    batch.events.map((e) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO product_events(id,visitor,session,run,mode,name,outcome,day,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          e.id,
          batch.visitor,
          batch.session,
          e.run,
          e.mode,
          e.name,
          e.outcome,
          day,
          now,
          now + METRIC_DAYS * 86400000,
        ),
    ),
  );
}
export async function readProductMetrics(db, days = 7, now = Date.now()) {
  const since = now - days * 86400000;
  const select = async (sql, ...args) =>
    (
      await db
        .prepare(sql)
        .bind(...args)
        .all()
    ).results;
  const [summary, funnel, daily] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(DISTINCT visitor) browsers,COUNT(DISTINCT session) sessions,MIN(created_at) firstAt,MAX(created_at) lastAt,COUNT(*) events,(SELECT COUNT(*) FROM (SELECT visitor FROM product_events WHERE created_at>=? AND expires_at>? GROUP BY visitor HAVING COUNT(DISTINCT day)>1)) returningBrowsers FROM product_events WHERE created_at>=? AND expires_at>?`,
      )
      .bind(since, now, since, now)
      .first(),
    select(
      `WITH runs AS (SELECT mode,visitor,session,run,MAX(name='view') viewed,MAX(name='start') started,MAX(name='first_action') acted,MAX(name='complete') completed,MAX(name='complete' AND outcome='won') won,MAX(name='retry') retried,MAX(name='next') advanced FROM product_events WHERE created_at>=? AND expires_at>? GROUP BY mode,visitor,session,run) SELECT mode,SUM(viewed) views,SUM(started) starts,SUM(acted AND started) actions,SUM(completed AND acted AND started) completions,SUM(won AND completed AND acted AND started) wins,SUM(retried) retries,SUM(advanced) nextGames FROM runs GROUP BY mode ORDER BY views DESC`,
      since,
      now,
    ),
    select(
      `SELECT day,COUNT(DISTINCT visitor) browsers,COUNT(DISTINCT session) sessions,SUM(name='first_action') actions,SUM(name='complete') completions FROM product_events WHERE created_at>=? AND expires_at>? GROUP BY day ORDER BY day DESC`,
      since,
      now,
    ),
  ]);
  return { summary, funnel, daily, days, serverNow: now, retentionDays: METRIC_DAYS };
}
export async function cleanupProductMetrics(db, now = Date.now()) {
  // Separate new table only. Expired rows are also excluded from every report.
  return db.prepare('DELETE FROM product_events WHERE expires_at<=?').bind(now).run();
}
