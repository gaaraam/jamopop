import { isSiteAdmin, tokenHash, accountProgressions } from '@/lib/account';
import { all, one } from '@/lib/store';
const reply = (d: unknown, status = 200) =>
  Response.json(d, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
// Group game identities under their Google account, without exposing session credentials.
const base = `WITH owners AS (
 SELECT 'account:'||id owner,name,avatar,created_at at FROM profiles
 UNION ALL SELECT CASE WHEN account_id IS NULL THEN 'guest:'||token_hash ELSE 'account:'||account_id END,name,avatar,last_seen FROM members
 UNION ALL SELECT owner,'개인 도전 사용자','👤',0 FROM solo_progress
 UNION ALL SELECT 'account:'||game_account_id,name,'👤',created_at FROM google_accounts
), ranked AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY owner ORDER BY at DESC) rn FROM owners), identities AS (
 SELECT o.*,g.game_account_id googleId,g.created_at joinedAt,g.last_login_at loginAt,
 CASE WHEN g.game_account_id IS NOT NULL THEN 'google:'||g.game_account_id ELSE o.owner END person
 FROM ranked o LEFT JOIN linked_game_accounts l ON o.owner='account:'||l.account_id
 LEFT JOIN google_accounts g ON g.subject=l.subject OR (l.subject IS NULL AND o.owner='account:'||g.game_account_id) WHERE rn=1
)`;
export async function GET(req: Request) {
  if (!isSiteAdmin(req)) return reply({ error: '관리자 계정으로 로그인해 주세요.' }, 403);
  try {
    const u = new URL(req.url),
      q = (u.searchParams.get('q') || '').trim().slice(0, 80),
      kind = u.searchParams.get('kind') || '',
      link = u.searchParams.get('link') || '',
      active = u.searchParams.get('active') || '',
      offset = Number(u.searchParams.get('offset') || 0),
      key = u.searchParams.get('key');
    if (
      !['', 'google', 'guest', 'legacy'].includes(kind) ||
      !['', 'linked', 'unlinked'].includes(link) ||
      !['', 'day', 'week'].includes(active) ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 100000
    )
      return reply({ error: '조회 조건을 확인해 주세요.' }, 400);
    const identities = await all(`${base} SELECT * FROM identities`),
      groups = new Map<string, any[]>();
    for (const i of identities) {
      const group = groups.get(i.person) || [];
      group.push(i);
      groups.set(i.person, group);
    }
    const connections = await all(
      `SELECT 'google:'||g.game_account_id person,COUNT(*) count,MAX(r.linked_at) linkedAt FROM legacy_link_receipts r JOIN google_accounts g ON g.subject=r.subject GROUP BY g.game_account_id`,
    );
    const activity = await all(
      `SELECT CASE WHEN account_id IS NULL THEN 'guest:'||token_hash ELSE 'account:'||account_id END owner,MAX(last_seen) lastAt,COUNT(DISTINCT room_id) rooms FROM members GROUP BY owner`,
    );
    const registrations = await all("SELECT 'account:'||id owner,created_at at FROM profiles");
    const registered = new Map(registrations.map((x) => [x.owner, x.at]));
    const activityMap = new Map(activity.map((x) => [x.owner, x])),
      connectionMap = new Map(connections.map((x) => [x.person, x]));
    const soloActivity = await all(
      'SELECT owner,MAX(updated_at) lastAt FROM solo_runs GROUP BY owner',
    );
    const soloAt = new Map(soloActivity.map((x) => [x.owner, x.lastAt]));
    const rows = await Promise.all(
      [...groups.entries()].map(async ([person, ids]) => {
        const latest = [...ids].sort((a, b) => b.at - a.at)[0],
          connection = connectionMap.get(person);
        return {
          userKey: (await tokenHash(person)).slice(0, 24),
          name: latest.name,
          avatar: latest.avatar,
          kind: person.startsWith('google:')
            ? 'google'
            : person.startsWith('guest:')
              ? 'guest'
              : 'legacy',
          linked: !!connection,
          linkedAt: connection?.linkedAt || null,
          profiles: ids.length,
          lastAt: Math.max(
            ...ids.map((i) =>
              Math.max(
                i.loginAt || 0,
                soloAt.get(i.owner) || 0,
                activityMap.get(i.owner)?.lastAt || 0,
                i.at || 0,
              ),
            ),
          ),
          createdAt: ids.some((i) => i.joinedAt || registered.get(i.owner))
            ? Math.min(...ids.map((i) => i.joinedAt || registered.get(i.owner) || Infinity))
            : null,
          roomCount: ids.reduce((n, i) => n + (activityMap.get(i.owner)?.rooms || 0), 0),
        };
      }),
    );
    const summary = {
      google: rows.filter((x) => x.kind === 'google').length,
      guest: rows.filter((x) => x.kind === 'guest').length,
      legacy: rows.filter((x) => x.kind === 'legacy').length,
      linked: rows.filter((x) => x.linked).length,
      active: rows.filter((x) => x.lastAt > Date.now() - 86400000).length,
    };
    if (key) {
      const index = rows.findIndex((x) => x.userKey === key);
      if (index < 0) return reply({ error: '사용자를 찾을 수 없어요.' }, 404);
      const ids = [...groups.values()][index],
        owners = ids.map((x) => x.owner),
        marks = owners.map(() => '?').join(','),
        memberWhere = `CASE WHEN m.account_id IS NULL THEN 'guest:'||m.token_hash ELSE 'account:'||m.account_id END IN (${marks})`;
      const [rooms, stats, solo, titles, cosmetics, levels, links] = await Promise.all([
        all(
          `SELECT r.id,r.name,m.name nickname,m.avatar,m.last_seen lastAt,m.blocked,m.spectator,r.archived_at archivedAt FROM members m JOIN rooms r ON r.id=m.room_id WHERE ${memberWhere} ORDER BY m.last_seen DESC LIMIT 100`,
          ...owners,
        ),
        one(
          `SELECT COUNT(*) completed,COALESCE(SUM(p.status='won'),0) wins,AVG(CASE WHEN p.status='won' THEN json_array_length(p.guesses)*1.0/CASE WHEN r.mode='speed' THEN 5 ELSE 1 END END) average FROM plays p JOIN members m ON m.id=p.member_id JOIN rounds r ON r.id=p.round_id WHERE ${memberWhere} AND r.mode<>'practice' AND p.status IN ('won','lost','forfeited')`,
          ...owners,
        ),
        all(`SELECT state FROM solo_progress WHERE owner IN (${marks})`, ...owners),
        all(
          `SELECT title,earned_at earnedAt FROM earned_titles WHERE owner IN (${marks}) ORDER BY earned_at DESC`,
          ...owners,
        ),
        all(
          `SELECT name_color nameColor,avatar_frame avatarFrame FROM account_cosmetics WHERE 'account:'||account_id IN (${marks})`,
          ...owners,
        ),
        accountProgressions(owners.filter((x) => x.startsWith('account:')).map((x) => x.slice(8))),
        all(
          `SELECT l.label,l.linked_at linkedAt,EXISTS(SELECT 1 FROM legacy_link_receipts r WHERE r.account_id=l.account_id AND r.subject=l.subject) imported FROM linked_game_accounts l WHERE 'account:'||l.account_id IN (${marks}) ORDER BY l.linked_at`,
          ...owners,
        ),
      ]);
      return reply({
        user: rows[index],
        stats,
        rooms,
        titles,
        cosmetics,
        links,
        profiles: await Promise.all(
          ids.map(async (i) => ({
            userKey: (await tokenHash(i.owner)).slice(0, 12),
            name: i.name,
            avatar: i.avatar,
            level: levels.get(i.owner.slice(8))?.level || null,
          })),
        ),
        solo: solo.map((x) => {
          const s = JSON.parse(x.state);
          return {
            xp: s.xp || 0,
            cleared: Object.keys(s.best || {}).length,
            active: s.active ? { stage: s.active.stage, status: s.active.status } : null,
          };
        }),
        historyNote:
          '연결 완료 이력만 저장되어 있습니다. 과거 연결 실패·현재 선택 프로필은 서버에 이력이 없어 표시하지 않습니다.',
      });
    }
    const filtered = rows
      .filter(
        (x) =>
          (!kind || x.kind === kind) &&
          (!link || (link === 'linked') === x.linked) &&
          (!active || x.lastAt > Date.now() - (active === 'day' ? 1 : 7) * 86400000) &&
          (!q ||
            x.name.toLowerCase().includes(q.toLowerCase()) ||
            x.userKey.includes(q) ||
            [...groups.values()][rows.indexOf(x)].some((i) =>
              i.name.toLowerCase().includes(q.toLowerCase()),
            )),
      )
      .sort((a, b) => b.lastAt - a.lastAt || a.userKey.localeCompare(b.userKey));
    return reply({
      summary,
      rows: filtered.slice(offset, offset + 50),
      total: filtered.length,
      nextOffset: filtered.length > offset + 50 ? offset + 50 : null,
    });
  } catch (e) {
    console.error('admin users read failed');
    return reply({ error: '사용자 정보를 불러오지 못했어요.' }, 503);
  }
}
