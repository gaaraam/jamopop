import { validateMetricBatch, saveMetricBatch } from '../lib/product-metrics.mjs';
import { rateLimit } from './safety.mjs';
import { hash } from '../lib/migration-ticket.mjs';
const reply = (status) => new Response(null,{status,headers:{'Cache-Control':'no-store'}});
// Runs before session/auth resolution; collection does not inspect account/guest cookies.
export async function productMetricsEndpoint(req, env) {
  if (req.method !== 'POST') return reply(405);
  if (req.headers.get('origin') !== new URL(req.url).origin || req.headers.get('sec-fetch-site') === 'cross-site') return reply(403);
  if (!req.headers.get('content-type')?.startsWith('application/json')) return reply(415);
  let bytes = 0, raw = '';
  const reader = req.body?.getReader(), decoder = new TextDecoder();
  try {
    if (!reader) return reply(400);
    while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 6000) { await reader.cancel(); return reply(413); } raw += decoder.decode(chunk.value,{stream:true}); }
    raw += decoder.decode();
    let body; try { body = JSON.parse(raw); } catch { return reply(400); }
    const batch = validateMetricBatch(body);
    if (!batch) return reply(400);
    const ip = req.headers.get('CF-Connecting-IP');
    if (ip) {
      // Reuse bounded technical-expiry counters; never store the original IP in events.
      const key = 'product:' + await hash(new Date().toISOString().slice(0,10) + ':' + ip);
      if (!(await rateLimit(env,key,60,60000)).allowed) return reply(429);
    }
    await saveMetricBatch(env.DB,batch);
    return reply(204);
  } catch { return reply(503); }
}
