import { accountId, guestToken, tokenHash } from '@/lib/account';
import { one, run } from '@/lib/store';
export async function inquiryOwner(req: Request) {
  const id = accountId(req);
  if (id) return 'account:' + id;
  const token = guestToken(req);
  return /^[a-f0-9]{64}$/.test(token) ? 'guest:' + (await tokenHash(token)) : null;
}
export function inquiryCommand(body: string) {
  return /^@문의(?:\s|$)/.test(body) ? body.slice(3).trim() : null;
}
export async function createInquiry(
  owner: string,
  b: { requestId: string; name: string; category: string; title: string; body: string },
) {
  if (
    !/^[a-f0-9-]{36}$/.test(b.requestId) ||
    !b.name?.trim() ||
    b.name.length > 16 ||
    !['오류', '제안', '기타', '채팅 문의'].includes(b.category) ||
    !b.title?.trim() ||
    b.title.length > 80 ||
    !b.body?.trim() ||
    b.body.length > 4000
  )
    throw Error('닉네임·제목·내용을 확인해 주세요.');
  const existing = await one(
    'SELECT id,title,body FROM inquiries WHERE owner=? AND request_id=?',
    owner,
    b.requestId,
  );
  if (existing) {
    if (existing.title !== b.title || existing.body !== b.body)
      throw Error('이미 사용된 전송 번호입니다.');
    return existing.id as string;
  }
  const id = crypto.randomUUID(),
    now = Date.now();
  const saved = await run(
    `INSERT INTO inquiries(id,owner,request_id,name,category,title,body,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM inquiries WHERE owner=? AND created_at>?)<10 ON CONFLICT(owner,request_id) DO NOTHING`,
    id,
    owner,
    b.requestId,
    b.name.trim(),
    b.category,
    b.title.trim(),
    b.body.trim(),
    now,
    now,
    owner,
    now - 3600000,
  );
  if (!saved.meta.changes) {
    const retry = await one(
      'SELECT id FROM inquiries WHERE owner=? AND request_id=?',
      owner,
      b.requestId,
    );
    if (retry) return retry.id as string;
    throw Error('문의는 한 시간에 10개까지 접수할 수 있어요.');
  }
  return id;
}

// Kept separate from ordinary inquiries: callers cannot choose the account or category.
export async function requestAccountDeletion(owner: string) {
  const id = crypto.randomUUID(),
    now = Date.now();
  await run(
    `INSERT INTO inquiries(id,owner,request_id,name,category,title,body,created_at,updated_at)
     SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS
     (SELECT 1 FROM inquiries WHERE owner=? AND category='계정 삭제' AND status!='closed')`,
    id,
    owner,
    id,
    '본인 계정',
    '계정 삭제',
    '계정 및 연결 기록 삭제 요청',
    '로그인한 본인이 계정 및 연결된 기록의 삭제 검토를 요청했습니다. 연결된 프로필과 공유 기록의 처리 범위는 관리자 확인 후 안내합니다. 요청 접수만으로 데이터가 삭제되지 않습니다.',
    now,
    now,
    owner,
  );
  const ticket = await one(
    "SELECT id FROM inquiries WHERE owner=? AND category='계정 삭제' AND status!='closed' ORDER BY created_at,id LIMIT 1",
    owner,
  );
  if (!ticket) throw Error('요청을 접수하지 못했어요. 다시 시도해 주세요.');
  return ticket.id as string;
}
