import { accountId, isSiteAdmin } from '@/lib/account';
import { database, adminAccountId, one, run } from '@/lib/store';
import {
  previewDeletion,
  executeDeletion,
  digest,
  DeletionError,
} from '@/lib/account-deletion.mjs';
const reply = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' },
  });
export async function POST(req: Request) {
  try {
    if (req.headers.get('origin') !== new URL(req.url).origin)
      return reply({ error: '현재 페이지에서 다시 시도해 주세요.' }, 403);
    const raw = await req.text();
    if (raw.length > 2048) return reply({ error: '요청이 너무 깁니다.' }, 400);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return reply({ error: '요청을 확인해 주세요.' }, 400);
    }
    if (!body || typeof body !== 'object') return reply({ error: '요청을 확인해 주세요.' }, 400);
    const id = accountId(req),
      now = Date.now();
    if (body.action === 'status') {
      if (typeof body.code !== 'string' || !/^[a-f0-9]{64}$/.test(body.code))
        return reply({ error: '조회 코드를 확인해 주세요.' }, 400);
      const receipt = await one(
        `SELECT i.status,i.updated_at,a.completed_at FROM deletion_receipts r JOIN inquiries i ON i.id=r.inquiry_id LEFT JOIN deletion_audit a ON a.inquiry_id=i.id WHERE r.token_hash=? AND r.expires_at>?`,
        await digest(body.code),
        now,
      );
      if (!receipt) return reply({ error: '조회 코드가 없거나 만료됐습니다.' }, 404);
      return reply({
        status: receipt.completed_at
          ? 'completed'
          : receipt.status === 'closed'
            ? 'cancelled'
            : 'pending',
        completedAt: receipt.completed_at || null,
      });
    }
    if (!id) return reply({ error: '로그인이 필요합니다.' }, 401);
    if (typeof body.inquiry !== 'string' || body.inquiry.length > 80)
      return reply({ error: '요청 번호를 확인해 주세요.' }, 400);
    if (body.action === 'receipt' || body.action === 'cancel') {
      const ticket = await one(
        "SELECT id FROM inquiries WHERE id=? AND owner=? AND category='계정 삭제' AND status!='closed'",
        body.inquiry,
        'account:' + id,
      );
      if (!ticket) return reply({ error: '본인의 진행 중인 요청만 처리할 수 있습니다.' }, 403);
      if (body.action === 'cancel') {
        const changed = await run(
          "UPDATE inquiries SET status='closed',answer='본인이 삭제 요청을 취소했습니다.',revision=revision+1,updated_at=? WHERE id=? AND owner=? AND status!='closed'",
          now,
          body.inquiry,
          'account:' + id,
        );
        if (!changed.meta.changes) return reply({ error: '이미 처리된 요청입니다.' }, 409);
        return reply({ ok: true });
      }
      const code =
        crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
      await database().batch([
        database().prepare('DELETE FROM deletion_receipts WHERE expires_at<=?').bind(now),
        database()
          .prepare(
            "INSERT INTO deletion_receipts SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM inquiries WHERE id=? AND owner=? AND category='계정 삭제' AND status!='closed')",
          )
          .bind(
            await digest(code),
            body.inquiry,
            now + 90 * 86400000,
            body.inquiry,
            'account:' + id,
          ),
      ]);
      return reply({ code });
    }
    if (!isSiteAdmin(req)) return reply({ error: '관리자만 실행할 수 있습니다.' }, 403);
    if (body.action === 'preview')
      return reply(await previewDeletion(database(), body.inquiry, id, adminAccountId(), now));
    if (body.action === 'execute') {
      if (body.confirm !== '계정 삭제 실행' || typeof body.token !== 'string')
        return reply({ error: '실행 확인 문구를 입력해 주세요.' }, 400);
      return reply(
        await executeDeletion(database(), body.inquiry, body.token, id, adminAccountId(), now),
      );
    }
    return reply({ error: '지원하지 않는 요청입니다.' }, 400);
  } catch (error) {
    return reply(
      {
        error:
          error instanceof DeletionError
            ? error.message
            : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      },
      error instanceof DeletionError ? error.status : 503,
    );
  }
}
