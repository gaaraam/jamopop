import { isSiteAdmin } from '@/lib/account';
import { database } from '@/lib/store';
import { readProductMetrics } from '@/lib/product-metrics.mjs';
const reply = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
  });
export async function GET(req: Request) {
  if (!isSiteAdmin(req)) return reply({ error: '관리자만 확인할 수 있어요.' }, 403);
  const days = Number(new URL(req.url).searchParams.get('days') || 7);
  if (![1, 7].includes(days)) return reply({ error: '조회 기간을 확인해 주세요.' }, 400);
  try {
    return reply(await readProductMetrics(database(), days));
  } catch {
    return reply(
      { error: '제품 지표를 불러오지 못했어요. 측정 DB 준비 상태를 확인해 주세요.' },
      503,
    );
  }
}
