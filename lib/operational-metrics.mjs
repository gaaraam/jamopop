import { AsyncLocalStorage } from 'node:async_hooks';
const context = new AsyncLocalStorage();
const PATHS = new Set([
  '/api/game',
  '/api/solo',
  '/api/speed',
  '/api/daily',
  '/api/party',
  '/api/inquiries',
  '/api/operations',
  '/api/account-deletion',
  '/auth/google/start',
  '/auth/google/callback',
  '/healthz',
]);
export function metricPath(url) {
  const path = new URL(url).pathname;
  return PATHS.has(path)
    ? path
    : path.startsWith('/api/')
      ? '/api/other'
      : path.startsWith('/auth/')
        ? '/auth/other'
        : '/page';
}
function record(result) {
  const c = context.getStore();
  if (!c) return;
  c.queries++;
  if (result?.meta) {
    c.rowsRead += Number(result.meta.rows_read || 0);
    c.rowsWritten += Number(result.meta.rows_written || 0);
  } else c.queriesWithoutRowCounts++;
}
export function measuredDatabase(db) {
  if (!context.getStore() || !db) return db;
  const statement = (raw) =>
    new Proxy(raw, {
      get(target, key) {
        if (key === 'bind') return (...args) => statement(target.bind(...args));
        if (['first', 'all', 'run', 'raw'].includes(key))
          return async (...args) => {
            let result;
            try {
              result = await target[key](...args);
            } catch (error) {
              const c = context.getStore();
              if (c) c.storageErrors++;
              record(null);
              throw error;
            }
            record(key === 'first' || key === 'raw' ? null : result);
            return result;
          };
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  return new Proxy(db, {
    get(target, key) {
      if (key === 'prepare') return (sql) => statement(target.prepare(sql));
      if (key === 'batch')
        return async (statements) => {
          const results = await target.batch(statements);
          for (const r of results) record(r);
          return results;
        };
      const v = Reflect.get(target, key);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}
export async function measureRequest(request, handler, emit = console.log) {
  const path = metricPath(request.url);
  if (path === '/page') return handler();
  const c = {
    queries: 0,
    queriesWithoutRowCounts: 0,
    rowsRead: 0,
    rowsWritten: 0,
    storageErrors: 0,
  };
  const start = performance.now();
  return context.run(c, async () => {
    let status = 500;
    try {
      const response = await handler();
      status = response.status;
      return response;
    } finally {
      emit(
        JSON.stringify({
          event: 'api_request',
          route: path,
          method: request.method === 'GET' ? 'GET' : request.method === 'POST' ? 'POST' : 'OTHER',
          status,
          durationMs: Math.round((performance.now() - start) * 10) / 10,
          ...c,
        }),
      );
    }
  });
}
export function operationAlerts(samples) {
  if (!samples.length) return { sampleCount: 0, alerts: [], p50: null, p95: null };
  const durations = samples
      .map((x) => x.durationMs)
      .filter(Number.isFinite)
      .sort((a, b) => a - b),
    quantile = (p) => durations[Math.max(0, Math.ceil(durations.length * p) - 1)] ?? null;
  const errors = samples.filter((x) => x.status >= 500).length / samples.length,
    limited = samples.filter((x) => x.status === 429).length / samples.length,
    p95 = quantile(0.95);
  return {
    sampleCount: samples.length,
    p50: quantile(0.5),
    p95,
    errorRate: errors,
    limitedRate: limited,
    alerts: [
      ...(samples.length >= 20 && errors > 0.01 ? ['server_errors'] : []),
      ...(samples.length >= 20 && p95 > 1500 ? ['latency'] : []),
      ...(samples.length >= 20 && limited > 0.05 ? ['rate_limit'] : []),
    ],
  };
}
