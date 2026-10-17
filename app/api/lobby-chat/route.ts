import { accountId, isSiteAdmin } from '@/lib/account';
import { inquiryOwner, inquiryCommand, createInquiry } from '@/lib/inquiries';
import { all, one, run } from '@/lib/store';
const reply = (data: unknown, status = 200, cookie = '') =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) },
  });
async function state(req: Request, owner: string | null) {
  const rows = await all(
    "SELECT l.id,l.owner,l.name,COALESCE(p.avatar,l.avatar) avatar,p.skin_id AS skin,CASE WHEN l.deleted=1 THEN '' ELSE l.body END AS body,l.created_at AS createdAt,l.deleted FROM lobby_messages l LEFT JOIN profiles p ON l.owner='account:'||p.id ORDER BY l.id DESC LIMIT 80",
  );
  const id = accountId(req);
  const profile = id ? await one('SELECT name FROM profiles WHERE id=?', id) : null;
  return {
    messages: rows.reverse().map(({ owner: author, ...m }) => ({
      ...m,
      memberId: author === owner ? 'me' : 'other',
      canDelete: author === owner || isSiteAdmin(req),
    })),
    serverNow: Date.now(),
    name: profile?.name || '',
  };
}
export async function GET(req: Request) {
  try {
    const owner = await inquiryOwner(req);
    let cookie = '';
    if (!owner) {
      const token =
        crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
      cookie = `bw_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`;
    }
    return reply(await state(req, owner), 200, cookie);
  } catch {
    return reply({ error: '대화를 불러오지 못했어요.' }, 503);
  }
}
export async function POST(req: Request) {
  try {
    if (req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin)
      return reply({ error: '현재 페이지에서 다시 시도해 주세요.' }, 403);
    const raw = await req.text();
    if (raw.length > 4096) return reply({ error: '내용이 너무 길어요.' }, 400);
    let b: any;
    try {
      b = JSON.parse(raw);
    } catch {
      return reply({ error: '요청을 확인해 주세요.' }, 400);
    }
    if (!b || typeof b !== 'object') return reply({ error: '요청을 확인해 주세요.' }, 400);
    const owner = await inquiryOwner(req);
    if (!owner) return reply({ error: '대화창을 새로고침한 뒤 다시 시도해 주세요.' }, 401);
    if (b.action === 'chat_delete') {
      if (!Number.isSafeInteger(b.messageId) || b.messageId < 1)
        return reply({ error: '메시지를 확인해 주세요.' }, 400);
      const changed = await run(
        'UPDATE lobby_messages SET deleted=1 WHERE id=? AND (owner=? OR ?=1)',
        b.messageId,
        owner,
        isSiteAdmin(req) ? 1 : 0,
      );
      if (!changed.meta.changes) return reply({ error: '삭제 권한이 없어요.' }, 403);
      return reply(await state(req, owner));
    }
    if (
      b.action !== 'chat_send' ||
      typeof b.body !== 'string' ||
      !b.body.trim() ||
      b.body.trim().length > 300 ||
      typeof b.name !== 'string' ||
      !b.name.trim() ||
      b.name.trim().length > 16 ||
      typeof b.requestId !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(b.requestId)
    )
      return reply({ error: '닉네임과 메시지(1~300자)를 확인해 주세요.' }, 400);
    const body = b.body.trim(),
      name = b.name.trim(),
      inquiry = inquiryCommand(body);
    if (inquiry !== null) {
      if (!inquiry) return reply({ error: '@문의 뒤에 내용을 적어 주세요.' }, 400);
      try {
        const inquiryId = await createInquiry(owner, {
          requestId: b.requestId,
          name,
          category: '채팅 문의',
          title: inquiry.slice(0, 80),
          body: inquiry,
        });
        return reply({ ...(await state(req, owner)), inquiryId });
      } catch (e) {
        return reply({ error: (e as Error).message }, 400);
      }
    }
    const previous = await one(
      'SELECT body FROM lobby_messages WHERE owner=? AND request_id=?',
      owner,
      b.requestId,
    );
    if (previous) {
      if (previous.body !== body) return reply({ error: '이미 사용된 전송 번호입니다.' }, 409);
      return reply(await state(req, owner));
    }
    const profile = accountId(req)
      ? await one('SELECT avatar FROM profiles WHERE id=?', accountId(req))
      : null;
    const now = Date.now();
    const saved = await run(
      'INSERT INTO lobby_messages(owner,request_id,name,avatar,body,created_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM lobby_messages WHERE owner=? AND created_at>?) ON CONFLICT(owner,request_id) DO NOTHING',
      owner,
      b.requestId,
      name,
      profile?.avatar || '🐥',
      body,
      now,
      owner,
      now - 1500,
    );
    if (!saved.meta.changes) {
      const retry = await one(
        'SELECT body FROM lobby_messages WHERE owner=? AND request_id=?',
        owner,
        b.requestId,
      );
      if (retry?.body !== body)
        return reply({ error: '메시지는 1.5초에 한 번 보낼 수 있어요.' }, 429);
    }
    return reply(await state(req, owner));
  } catch {
    return reply({ error: '전송하지 못했어요. 입력을 유지하고 다시 시도해 주세요.' }, 503);
  }
}
