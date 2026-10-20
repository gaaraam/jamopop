import { accountId, isSiteAdmin } from '@/lib/account';
import { one, all, run } from '@/lib/store';
import {
  ATTENDANCE_GOLD,
  kstDay,
  validateNews,
  NEWS_COLUMNS,
  CLAIM_EVENT_SQL,
} from '@/lib/service-news.mjs';
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function identity(req: Request) {
  const id = accountId(req);
  if (!id) return null;
  const owner = await one('SELECT subject FROM google_accounts WHERE game_account_id=?', id);
  return owner ? { id, subject: owner.subject } : null;
}
export async function GET(req: Request) {
  try {
    const url = new URL(req.url),
      admin = url.searchParams.get('admin') === '1';
    if (admin && !isSiteAdmin(req)) return reply({ error: '관리자만 확인할 수 있어요.' }, 403);
    if (url.searchParams.get('attendance') === '1') {
      const owner = await identity(req),
        day = kstDay(Date.now());
      if (!owner) return reply({ signedIn: false, received: false, day, gold: ATTENDANCE_GOLD });
      const claim = await one(
        "SELECT 1 FROM service_gold_claims WHERE subject=? AND kind='attendance' AND claim_key=?",
        owner.subject,
        day,
      );
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode('attendance:' + owner.subject + ':' + day),
      );
      const welcomeKey = Array.from(new Uint8Array(digest), (v) =>
        v.toString(16).padStart(2, '0'),
      ).join('');
      return reply({ signedIn: true, received: !!claim, day, gold: ATTENDANCE_GOLD, welcomeKey });
    }
    const offset = Number(url.searchParams.get('offset') || 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000)
      return reply({ error: '목록 범위를 확인해 주세요.' }, 400);
    const id = url.searchParams.get('post');
    if (id && !/^[a-zA-Z0-9-]{1,64}$/.test(id))
      return reply({ error: '소식을 확인해 주세요.' }, 400);
    const items = await all(
      `SELECT ${NEWS_COLUMNS}${admin ? ", (SELECT COUNT(*) FROM service_gold_claims WHERE kind='event' AND claim_key=service_news.id) AS claimCount, (SELECT COALESCE(SUM(amount),0) FROM service_gold_claims WHERE kind='event' AND claim_key=service_news.id) AS goldIssued" : ''} FROM service_news WHERE ${admin ? '1=1' : "status='published'"} ${id ? 'AND id=?' : ''} ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET ?`,
      ...(id ? [id] : []),
      offset,
    );
    const owner = await identity(req),
      now = Date.now(),
      day = kstDay(now);
    const claims = owner
      ? await all(
          "SELECT kind,claim_key AS key,amount,account_id AS account FROM service_gold_claims WHERE subject=? AND (kind='event' OR (kind='attendance' AND claim_key=?))",
          owner.subject,
          day,
        )
      : [];
    return reply({
      items: items.slice(0, 20),
      more: items.length > 20,
      serverNow: now,
      day,
      attendanceGold: ATTENDANCE_GOLD,
      signedIn: !!owner,
      claims: claims.map(({ kind, key, amount, account }) => ({
        kind,
        key,
        amount,
        otherProfile: account !== owner?.id,
      })),
    });
  } catch {
    return reply({ error: '소식을 불러오지 못했어요. 다시 시도해 주세요.' }, 503);
  }
}
export async function POST(req: Request) {
  if (req.headers.get('origin') !== new URL(req.url).origin)
    return reply({ error: '현재 페이지에서 다시 시도해 주세요.' }, 403);
  try {
    const text = await req.text();
    if (text.length > 16000) return reply({ error: '내용이 너무 길어요.' }, 400);
    let b: any;
    try {
      b = JSON.parse(text);
    } catch {
      return reply({ error: '요청을 확인해 주세요.' }, 400);
    }
    if (b?.action === 'attendance' || b?.action === 'claim') {
      const owner = await identity(req);
      if (!owner) return reply({ error: 'Google 로그인 후 보상을 받을 수 있어요.' }, 401);
      const now = Date.now(),
        key = b.action === 'attendance' ? kstDay(now) : b.id;
      if (typeof key !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(key))
        return reply({ error: '이벤트를 확인해 주세요.' }, 400);
      const result =
        b.action === 'attendance'
          ? await run(
              "INSERT INTO service_gold_claims(subject,account_id,kind,claim_key,amount,created_at) VALUES(?,?,'attendance',?,?,?) ON CONFLICT(subject,kind,claim_key) DO NOTHING",
              owner.subject,
              owner.id,
              key,
              ATTENDANCE_GOLD,
              now,
            )
          : await run(CLAIM_EVENT_SQL, owner.subject, owner.id, now, key, now, now);
      const claim = await one(
        'SELECT amount,account_id FROM service_gold_claims WHERE subject=? AND kind=? AND claim_key=?',
        owner.subject,
        b.action === 'attendance' ? 'attendance' : 'event',
        key,
      );
      if (!claim) return reply({ error: '지금은 보상을 받을 수 없는 이벤트예요.' }, 409);
      return reply({
        received: !!result.meta.changes,
        amount: claim.amount,
        otherProfile: claim.account_id !== owner.id,
      });
    }
    if (!isSiteAdmin(req)) return reply({ error: '관리자만 소식을 관리할 수 있어요.' }, 403);
    if (b?.action !== 'save') return reply({ error: '요청을 확인해 주세요.' }, 400);
    const n = validateNews(b);
    if (!n)
      return reply({ error: '제목·내용과 이벤트 보상·기간(최대 90일)을 확인해 주세요.' }, 400);
    const now = Date.now();
    if (b.id) {
      if (
        typeof b.id !== 'string' ||
        !/^[a-zA-Z0-9-]{1,64}$/.test(b.id) ||
        !Number.isSafeInteger(b.revision)
      )
        return reply({ error: '소식을 확인해 주세요.' }, 400);
      const r = await run(
        `UPDATE service_news SET kind=?,title=?,body=?,status=?,gold=?,starts_at=?,ends_at=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND (NOT EXISTS(SELECT 1 FROM service_gold_claims WHERE kind='event' AND claim_key=service_news.id) OR (kind=? AND gold=?))`,
        n.kind,
        n.title,
        n.body,
        n.status,
        n.gold,
        n.starts,
        n.ends,
        now,
        b.id,
        b.revision,
        n.kind,
        n.gold,
      );
      if (!r.meta.changes)
        return reply(
          {
            error:
              '다른 창에서 변경됐거나 이미 지급된 이벤트의 종류·금액을 바꾸려는 요청이에요. 목록을 다시 확인해 주세요.',
          },
          409,
        );
      return reply({ id: b.id });
    }
    const id = crypto.randomUUID();
    await run(
      'INSERT INTO service_news(id,kind,title,body,status,gold,starts_at,ends_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
      id,
      n.kind,
      n.title,
      n.body,
      n.status,
      n.gold,
      n.starts,
      n.ends,
      now,
      now,
    );
    return reply({ id }, 201);
  } catch {
    return reply(
      { error: '처리 결과를 확인하지 못했어요. 다시 시도해도 보상은 한 번만 지급돼요.' },
      503,
    );
  }
}
