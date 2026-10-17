import { isSiteAdmin } from '@/lib/account';
import { database } from '@/lib/store';
import { retentionPreview } from '@/lib/retention.mjs';
export async function GET(req: Request) {
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
  if (!isSiteAdmin(req))
    return Response.json({ error: '관리자만 확인할 수 있습니다.' }, { status: 403, headers });
  try {
    return Response.json(await retentionPreview(database()), { headers });
  } catch {
    return Response.json({ error: '보관 현황을 확인하지 못했습니다.' }, { status: 503, headers });
  }
}
