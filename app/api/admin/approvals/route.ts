import { isSiteAdmin, accountId } from '@/lib/account';
import { all, one } from '@/lib/store';
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET(req: Request) {
  if (!isSiteAdmin(req)) return reply({ error: '관리자만 확인할 수 있어요.' }, 403);
  try {
    const u = new URL(req.url),
      status = u.searchParams.get('status') || 'pending',
      offset = Number(u.searchParams.get('offset') || 0);
    if (
      !['pending', 'approved', 'rejected'].includes(status) ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 100000
    )
      return reply({ error: '조회 조건을 확인해 주세요.' }, 400);
    const rows = await all(
      'SELECT subject,name,email,created_at AS createdAt,approval_status AS status,approval_revision AS revision,reviewed_at AS reviewedAt FROM google_accounts WHERE approval_status=? ORDER BY created_at,subject LIMIT 51 OFFSET ?',
      status,
      offset,
    );
    return reply({ rows: rows.slice(0, 50), nextOffset: rows.length > 50 ? offset + 50 : null });
  } catch {
    return reply({ error: '가입 신청을 불러오지 못했어요.' }, 503);
  }
}
export async function POST(req: Request) {
  if (!isSiteAdmin(req)) return reply({ error: '관리자만 승인할 수 있어요.' }, 403);
  if (req.headers.get('origin') !== new URL(req.url).origin)
    return reply({ error: '현재 페이지에서 다시 시도해 주세요.' }, 403);
  try {
    const b = (await req.json()) as { subject?: unknown; status?: unknown; revision?: unknown };
    if (
      typeof b.subject !== 'string' ||
      b.subject.length > 255 ||
      !['approved', 'rejected'].includes(String(b.status)) ||
      typeof b.revision !== 'number' ||
      !Number.isSafeInteger(b.revision) ||
      b.revision < 0
    )
      return reply({ error: '승인 요청을 확인해 주세요.' }, 400);
    const changed = await one(
      "UPDATE google_accounts SET approval_status=?,approval_revision=approval_revision+1,reviewed_at=?,reviewed_by=? WHERE subject=? AND approval_revision=? AND approval_status IN ('pending','rejected') RETURNING subject",
      b.status,
      Date.now(),
      accountId(req),
      b.subject,
      b.revision,
    );
    if (!changed) return reply({ error: '이미 처리된 신청이에요. 목록을 새로고침해 주세요.' }, 409);
    return reply({ ok: true });
  } catch {
    return reply({ error: '처리하지 못했어요. 다시 시도해 주세요.' }, 503);
  }
}
