import { accountId } from '@/lib/account';
import { one, all, run, database } from '@/lib/store';
import { careDay, careProgress, CARE_ACTIONS } from '@/lib/home-life';
import { DEFAULT_HOME } from '@/lib/furniture';
const reply = (d: unknown, status = 200) =>
  Response.json(d, { status, headers: { 'Cache-Control': 'no-store' } });
async function friend(owner: string, id: string) {
  return one(
    `SELECT CASE WHEN requester=? THEN recipient ELSE requester END AS target FROM friendships WHERE id=? AND status='accepted' AND (requester=? OR recipient=?)`,
    owner,
    id,
    owner,
    owner,
  );
}
export async function GET(req: Request) {
  try {
    const id = accountId(req);
    if (!id) return reply({ error: '로그인 후 이용해 주세요.' }, 401);
    const link = new URL(req.url).searchParams.get('friend');
    const f = link ? await friend(id, link) : null;
    if (link && !f) return reply({ error: '친구의 집만 방문할 수 있어요.' }, 403);
    const target = f?.target || id,
      day = careDay();
    const [total, today, friends, visits, home, profile, stamp] = await Promise.all([
      one('SELECT COUNT(*) points FROM home_care WHERE account_id=?', id),
      all('SELECT action FROM home_care WHERE account_id=? AND day=?', id, day),
      all(
        `SELECT f.id,p.name,p.avatar,p.skin_id AS skin FROM friendships f JOIN profiles p ON p.id=CASE WHEN f.requester=? THEN f.recipient ELSE f.requester END WHERE f.status='accepted' AND (f.requester=? OR f.recipient=?) ORDER BY p.name LIMIT 100`,
        id,
        id,
        id,
      ),
      all(
        `SELECT p.name,p.avatar,p.skin_id AS skin,v.stamp,v.created_at AS createdAt FROM home_visits v JOIN profiles p ON p.id=v.visitor WHERE v.owner=? AND EXISTS(SELECT 1 FROM friendships f WHERE f.status='accepted' AND ((f.requester=v.owner AND f.recipient=v.visitor) OR (f.recipient=v.owner AND f.requester=v.visitor))) ORDER BY v.created_at DESC LIMIT 12`,
        target,
      ),
      f ? one('SELECT layout FROM kongal_homes WHERE account_id=?', target) : null,
      f ? one('SELECT name,avatar,skin_id AS skin FROM profiles WHERE id=?', target) : null,
      f
        ? one(
            'SELECT stamp FROM home_visits WHERE owner=? AND visitor=? AND day=?',
            target,
            id,
            day,
          )
        : null,
    ]);
    return reply({
      day,
      care: careProgress(
        Number(total?.points || 0),
        today.map((x) => x.action),
      ),
      friends,
      visits,
      visiting: f
        ? {
            layout: home ? JSON.parse(home.layout) : DEFAULT_HOME,
            profile,
            stamp: stamp?.stamp || null,
          }
        : null,
    });
  } catch {
    return reply({ error: '집 소식을 불러오지 못했어요.' }, 503);
  }
}
export async function POST(req: Request) {
  try {
    const id = accountId(req);
    if (!id) return reply({ error: '로그인 후 이용해 주세요.' }, 401);
    if (req.headers.get('origin') !== new URL(req.url).origin)
      return reply({ error: '현재 페이지에서 다시 시도해 주세요.' }, 403);
    const b = (await req.json()) as { action: string; friend?: string; stamp?: string };
    const day = careDay(),
      now = Date.now();
    if (!CARE_ACTIONS.includes(b.action as (typeof CARE_ACTIONS)[number]))
      return reply({ error: '돌보기 행동을 확인해 주세요.' }, 400);
    if (b.action === 'visit') {
      if (typeof b.friend !== 'string' || !['heart', 'paw', 'star'].includes(b.stamp || ''))
        return reply({ error: '방문 인사를 선택해 주세요.' }, 400);
      const f = await friend(id, b.friend);
      if (!f) return reply({ error: '친구의 집만 방문할 수 있어요.' }, 403);
      await database().batch([
        database()
          .prepare(
            'INSERT OR IGNORE INTO home_visits(owner,visitor,day,stamp,created_at) VALUES(?,?,?,?,?)',
          )
          .bind(f.target, id, day, b.stamp, now),
        database()
          .prepare(
            "INSERT OR IGNORE INTO home_care(account_id,day,action,created_at) VALUES(?,?,'visit',?)",
          )
          .bind(id, day, now),
      ]);
    } else {
      if (b.friend) return reply({ error: '내 콩알이만 돌볼 수 있어요.' }, 403);
      await run(
        'INSERT OR IGNORE INTO home_care(account_id,day,action,created_at) VALUES(?,?,?,?)',
        id,
        day,
        b.action,
        now,
      );
    }
    const url = new URL(req.url);
    if (b.friend) url.searchParams.set('friend', b.friend);
    return GET(new Request(url, { headers: req.headers }));
  } catch {
    return reply({ error: '저장하지 못했어요. 다시 시도해 주세요.' }, 503);
  }
}
