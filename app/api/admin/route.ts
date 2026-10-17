import { isSiteAdmin, tokenHash } from '@/lib/account';
import { all, one } from '@/lib/store';
const reply = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
  });
// Owner keys stay on the server. No session hashes, emails, answers or chat bodies are returned.
const people = `WITH identity_rows AS (
 SELECT 'account:'||id owner,name,avatar,created_at at FROM profiles
 UNION ALL SELECT CASE WHEN account_id IS NOT NULL THEN 'account:'||account_id ELSE 'guest:'||token_hash END,name,avatar,last_seen FROM members
 UNION ALL SELECT owner,CASE WHEN owner LIKE 'account:%' THEN '개인 도전 회원' ELSE '개인 도전 게스트' END,'👤',0 FROM solo_progress
), ranked AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY owner ORDER BY at DESC,name) rn FROM identity_rows), people AS (SELECT owner,name,avatar FROM ranked WHERE rn=1),
activity AS (
 SELECT CASE WHEN m.account_id IS NOT NULL THEN 'account:'||m.account_id ELSE 'guest:'||m.token_hash END owner,p.id,r.mode,CASE WHEN p.status='playing' AND r.retired_at IS NOT NULL THEN 'interrupted' WHEN p.status='playing' AND COALESCE((SELECT ends_at FROM item_loadouts l WHERE l.round_id=p.round_id AND l.member_id=p.member_id),r.ends_at) IS NOT NULL AND COALESCE((SELECT ends_at FROM item_loadouts l WHERE l.round_id=p.round_id AND l.member_id=p.member_id),r.ends_at)<=? THEN 'timeout' ELSE p.status END status,p.updated_at at,json_array_length(p.guesses) attempts FROM plays p JOIN members m ON m.id=p.member_id JOIN rounds r ON r.id=p.round_id
 UNION ALL SELECT owner,id,'solo',CASE WHEN status='playing' AND ends_at IS NOT NULL AND ends_at<=? THEN 'timeout' ELSE status END,updated_at,attempts FROM solo_runs
)`;
export async function GET(req: Request) {
  if (!isSiteAdmin(req)) return reply({ error: '관리자 계정으로 로그인해 주세요.' }, 403);
  try {
    const url = new URL(req.url),
      view = url.searchParams.get('view') || 'users',
      q = (url.searchParams.get('q') || '').trim().slice(0, 60),
      offset = Number(url.searchParams.get('offset') || 0),
      days = Number(url.searchParams.get('days') || 7);
    if (
      !['users', 'rooms', 'records'].includes(view) ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 100000 ||
      ![1, 7, 30, 36500].includes(days)
    )
      return reply({ error: '조회 조건을 확인해 주세요.' }, 400);
    const selectedMode = url.searchParams.get('mode') || '';
    if (!['', 'solo', 'daily', 'practice', 'live', 'speed'].includes(selectedMode))
      return reply({ error: '모드를 확인해 주세요.' }, 400);
    const now = Date.now(),
      since = now - days * 86400000,
      search = '%' + q.replace(/[!%_]/g, '!$&') + '%';
    const summary = await one(
      `${people} SELECT (SELECT COUNT(*) FROM people) users,(SELECT COUNT(*) FROM rooms WHERE archived_at IS NULL) rooms,COUNT(*) plays,COUNT(DISTINCT owner) activeUsers,COALESCE(SUM(mode='solo'),0) solo,COALESCE(SUM(status='won'),0) wins FROM activity WHERE at>=? AND (attempts>0 OR mode='solo')`,
      now,
      now,
      since,
    );
    let rows: any[];
    if (view === 'users')
      rows = await all(
        `${people} SELECT p.owner,p.name,p.avatar,CASE WHEN p.owner LIKE 'account:%' THEN '회원' ELSE '게스트' END kind,MAX(a.at) lastAt,COUNT(a.id) plays,COALESCE(SUM(a.status='won'),0) wins,COALESCE(SUM(a.mode='solo'),0) solo,COALESCE((SELECT json_extract(s.state,'$.xp') FROM solo_progress s WHERE s.owner=p.owner),0) soloXp FROM people p LEFT JOIN activity a ON a.owner=p.owner AND a.at>=? AND (a.attempts>0 OR a.mode='solo') WHERE p.name LIKE ? ESCAPE '!' GROUP BY p.owner ORDER BY lastAt DESC,p.owner LIMIT 51 OFFSET ?`,
        now,
        now,
        since,
        search,
        offset,
      );
    else if (view === 'rooms')
      rows = await all(
        `SELECT r.id,r.name,r.archived_at archivedAt,r.round_no roundNo,MAX(m.last_seen) lastAt,COUNT(m.id) members,COALESCE(SUM(m.blocked=0 AND m.last_seen>=?),0) online,(SELECT name FROM members WHERE id=r.host_id) host,(SELECT COUNT(*) FROM plays p JOIN rounds rd ON rd.id=p.round_id WHERE rd.room_id=r.id AND p.updated_at>=? AND p.guesses<>'[]') plays FROM rooms r LEFT JOIN members m ON m.room_id=r.id WHERE r.name LIKE ? ESCAPE '!' GROUP BY r.id ORDER BY lastAt DESC,r.id LIMIT 51 OFFSET ?`,
        now - 20000,
        since,
        search,
        offset,
      );
    else
      rows = await all(
        `${people} SELECT a.id,a.owner,p.name,p.avatar,CASE WHEN a.owner LIKE 'account:%' THEN '회원' ELSE '게스트' END kind,a.mode,a.status,a.at lastAt,a.attempts,s.stage,s.stars FROM activity a JOIN people p ON p.owner=a.owner LEFT JOIN solo_runs s ON s.id=a.id AND a.mode='solo' WHERE a.at>=? AND (a.attempts>0 OR a.mode='solo') AND p.name LIKE ? ESCAPE '!' AND (?='' OR a.mode=?) ORDER BY a.at DESC,a.id LIMIT 51 OFFSET ?`,
        now,
        now,
        since,
        search,
        selectedMode,
        selectedMode,
        offset,
      );
    const result = await Promise.all(
      rows.slice(0, 50).map(async ({ owner, ...row }) => ({
        ...row,
        ...(owner ? { userKey: (await tokenHash(owner)).slice(0, 12) } : {}),
      })),
    );
    return reply({
      summary,
      rows: result,
      nextOffset: rows.length > 50 ? offset + 50 : null,
      serverNow: now,
    });
  } catch (e) {
    console.error('admin read failed');
    return reply({ error: '운영 현황을 불러오지 못했어요. 다시 시도해 주세요.' }, 503);
  }
}
