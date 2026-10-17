// All mutations are a single D1 batch (transaction). Never call this with a client-supplied scope.
export class DeletionError extends Error {
  constructor(message, status = 409) {
    super(message);
    this.status = status;
  }
}
const one = (db, sql, ...args) =>
  db
    .prepare(sql)
    .bind(...args)
    .first();
const rows = async (db, sql, ...args) =>
  (
    await db
      .prepare(sql)
      .bind(...args)
      .all()
  ).results;
const inJson = (value) =>
  `IN (SELECT value FROM json_each('${JSON.stringify(value).replaceAll("'", "''")}'))`;
// Only server-resolved identifiers are interpolated; escaping still applies to imported IDs.
export async function scopeFor(db, inquiry, adminId) {
  const ticket = await one(
    db,
    "SELECT * FROM inquiries WHERE id=? AND category='계정 삭제'",
    inquiry,
  );
  if (!ticket || !ticket.owner.startsWith('account:') || ticket.status === 'closed')
    throw new DeletionError('진행 중인 삭제 요청이 아닙니다.');
  const id = ticket.owner.slice(8);
  const google = await one(
    db,
    `SELECT a.subject FROM google_accounts a WHERE a.game_account_id=? OR EXISTS(SELECT 1 FROM linked_game_accounts l WHERE l.subject=a.subject AND l.account_id=?)`,
    id,
    id,
  );
  if (!google) throw new DeletionError('연결 계정을 확인할 수 없습니다. 수동 확인이 필요합니다.');
  const profiles = await rows(
    db,
    `SELECT account_id id,is_admin FROM linked_game_accounts WHERE subject=? UNION SELECT game_account_id,0 FROM google_accounts WHERE subject=?`,
    google.subject,
    google.subject,
  );
  if (profiles.some((p) => p.is_admin || p.id === adminId))
    throw new DeletionError(
      '관리자 계정은 이 화면에서 삭제할 수 없습니다. 권한 이전을 먼저 처리해 주세요.',
    );
  const accounts = [...new Set(profiles.map((p) => p.id))].sort();
  const members = await rows(
    db,
    `SELECT id,room_id,name FROM members WHERE account_id ${inJson(accounts)} ORDER BY id`,
  );
  if (accounts.length > 20 || members.length > 100)
    throw new DeletionError('처리 범위가 큽니다. 별도의 검증된 일괄 처리 절차가 필요합니다.');
  const migrationSessions = !!(await one(
    db,
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='migration_sessions'",
  ));
  return {
    inquiry,
    subject: google.subject,
    accounts,
    members: members.map((m) => m.id),
    revision: ticket.revision,
    migrationSessions,
  };
}
function selectors(scope) {
  const a = inJson(scope.accounts),
    m = inJson(scope.members),
    o = inJson(scope.accounts.map((a) => 'account:' + a));
  return { a, m, o };
}
export function targets(scope) {
  const { a, m, o } = selectors(scope);
  return [
    ['profiles', `id ${a}`, '프로필'],
    ['google_sessions', `subject=${quote(scope.subject)}`, '로그인 세션'],
    ['legacy_link_attempts', `subject=${quote(scope.subject)}`, '진행 중인 기록 연결'],
    ['legacy_link_receipts', `subject=${quote(scope.subject)}`, '기록 연결 이력'],
    ['linked_game_accounts', `subject=${quote(scope.subject)}`, '연결 프로필 정보'],
    ['google_accounts', `subject=${quote(scope.subject)}`, 'Google 로그인 정보'],
    ...(scope.migrationSessions
      ? [['migration_sessions', `account_id ${a}`, '이전 로그인 세션']]
      : []),
    ...[
      'account_cosmetics',
      'equipped_card_skins',
      'skin_purchases',
      'kongal_homes',
      'home_care',
      'account_presence',
    ].map((t) => [
      t,
      `account_id ${a}`,
      {
        account_cosmetics: '꾸미기 설정',
        equipped_card_skins: '장착 카드',
        skin_purchases: '구매·가구',
        kongal_homes: '집',
        home_care: '돌봄',
        account_presence: '접속 정보',
      }[t],
    ]),
    ...[
      'solo_progress',
      'solo_runs',
      'earned_titles',
      'equipped_titles',
      'daily_plays',
      'lobby_messages',
    ].map((t) => [
      t,
      `owner ${o}`,
      {
        solo_progress: '개인 도전',
        solo_runs: '개인 도전 기록',
        earned_titles: '칭호',
        equipped_titles: '장착 칭호',
        daily_plays: '오늘의 단어',
        lobby_messages: '대기실 대화',
      }[t],
    ]),
    ...[
      'plays',
      'speed_plays',
      'chat_messages',
      'drawing_hints',
      'gold_rewards',
      'reactions',
      'live_participants',
      'item_loadouts',
      'spectators',
      'hint_views',
    ].map((t) => [
      t,
      `member_id ${m}`,
      {
        plays: '방 플레이',
        speed_plays: '스피드전',
        chat_messages: '방 대화',
        drawing_hints: '그림',
        gold_rewards: '골드',
        reactions: '응원',
        live_participants: '대전 참여',
        item_loadouts: '아이템',
        spectators: '관전',
        hint_views: '힌트 열람',
      }[t],
    ]),
    ['friendships', `requester ${a} OR recipient ${a}`, '친구 관계'],
    ['room_invitations', `sender ${a} OR recipient ${a}`, '초대'],
    ['home_visits', `owner ${a} OR visitor ${a}`, '집 방문'],
    ['inquiries', `owner ${o}`, '문의'],
    ['members', `id ${m}`, '방 참가자 익명화'],
    ['rooms', `host_id ${m}`, '방장 이전·빈 방 보관'],
    ['item_events', `actor ${m} OR target ${m}`, '아이템 이력 익명화'],
  ];
}
// Counts, scope identity, request revision and data revision guard the preview. No message content is persisted.
export function snapshotSql(scope) {
  const { a, m, o } = selectors(scope);
  const queries = [
    ...targets(scope).map(([t, w]) => [t, w]),
    ['safety_reports', `reporter ${o} OR subject ${o}`],
  ];
  // SQLite json_group_array carries only lightweight IDs/counts and mutation versions.
  return `SELECT json_array(${queries.map(([t, w]) => `(SELECT json_array(COUNT(*),COALESCE(MAX(rowid),0)) FROM ${t} WHERE ${w})`).join(',')},
    (SELECT json_group_array(json_array(account_id,subject,is_admin)) FROM (SELECT * FROM linked_game_accounts WHERE subject=${quote(scope.subject)} ORDER BY account_id)),
    (SELECT json_group_array(json_array(id,account_id,room_id)) FROM (SELECT * FROM members WHERE id ${m} ORDER BY id)),
    (SELECT revision FROM inquiries WHERE id=${quote(scope.inquiry)}),
    (SELECT version FROM derived_revision WHERE id=1)) AS snapshot`;
}
const quote = (s) => "'" + String(s).replaceAll("'", "''") + "'";
export async function previewDeletion(db, inquiry, actor, adminId, now = Date.now()) {
  const scope = await scopeFor(db, inquiry, adminId);
  if (scope.accounts.includes(actor))
    throw new DeletionError('본인 계정은 직접 처리할 수 없습니다.');
  const snapshot = (await one(db, snapshotSql(scope))).snapshot;
  const counts = [];
  for (const [table, where, label] of targets(scope))
    counts.push({
      label,
      count: (await one(db, `SELECT COUNT(*) n FROM ${table} WHERE ${where}`)).n,
    });
  const token = crypto.randomUUID();
  await db.batch([
    db.prepare('DELETE FROM deletion_previews WHERE expires_at<=?').bind(now),
    db
      .prepare('INSERT INTO deletion_previews VALUES(?,?,?,?,?)')
      .bind(token, inquiry, actor, JSON.stringify({ scope, snapshot, counts }), now + 300000),
  ]);
  return {
    token,
    counts,
    profiles: await rows(
      db,
      `SELECT id,name FROM profiles WHERE id ${inJson(scope.accounts)} ORDER BY id`,
    ),
    profileCount: scope.accounts.length,
    expiresAt: now + 300000,
  };
}
export async function executeDeletion(db, inquiry, token, actor, adminId, now = Date.now()) {
  const done = await one(db, 'SELECT completed_at FROM deletion_audit WHERE inquiry_id=?', inquiry);
  if (done) return { completedAt: done.completed_at, alreadyCompleted: true };
  const preview = await one(
    db,
    'SELECT * FROM deletion_previews WHERE id=? AND inquiry_id=? AND actor=? AND expires_at>?',
    token,
    inquiry,
    actor,
    now,
  );
  if (!preview) throw new DeletionError('미리보기가 만료됐습니다. 다시 확인해 주세요.');
  const { scope, snapshot, counts } = JSON.parse(preview.snapshot);
  if (
    !(await one(
      db,
      'SELECT 1 FROM deletion_receipts WHERE inquiry_id=? AND expires_at>?',
      inquiry,
      now,
    ))
  )
    throw new DeletionError('요청자가 완료 조회 코드를 발급받은 뒤 실행할 수 있습니다.');
  const current = await scopeFor(db, inquiry, adminId);
  if (JSON.stringify(current) !== JSON.stringify(scope) || scope.accounts.includes(actor))
    throw new DeletionError('연결 정보가 바뀌었습니다. 다시 미리보기해 주세요.');
  const { a, m, o } = selectors(scope),
    subject = scope.subject;
  const statements = [],
    add = (sql, ...args) => statements.push(db.prepare(sql).bind(...args));
  // CHECK(valid=1) aborts the complete transaction if any preview input changed.
  add(
    `INSERT INTO deletion_audit SELECT ?,?,?,?,CASE WHEN (${snapshotSql(scope)})=? AND EXISTS(SELECT 1 FROM inquiries WHERE id=? AND category='계정 삭제' AND status!='closed' AND revision=?) AND EXISTS(SELECT 1 FROM deletion_receipts WHERE inquiry_id=? AND expires_at>?) THEN 1 ELSE 0 END`,
    inquiry,
    actor,
    now,
    JSON.stringify(counts),
    snapshot,
    inquiry,
    scope.revision,
    inquiry,
    now,
  );
  // Shared rooms survive. Pick a remaining participant; archive rooms with no successor.
  add(
    `UPDATE rooms SET host_id=COALESCE((SELECT id FROM members WHERE room_id=rooms.id AND id NOT ${m} AND blocked=0 ORDER BY last_seen DESC,id LIMIT 1),''),archived_at=CASE WHEN EXISTS(SELECT 1 FROM members WHERE room_id=rooms.id AND id NOT ${m} AND blocked=0) THEN archived_at ELSE COALESCE(archived_at,?) END WHERE host_id ${m}`,
    now,
  );
  // Remove child rows before purchases (foreign key).
  for (const [table, where] of targets(scope)) {
    if (['inquiries', 'members', 'rooms', 'item_events'].includes(table)) continue;
    add(`DELETE FROM ${table} WHERE ${where}`);
  }
  add(`DELETE FROM inquiries WHERE owner ${o} AND id<>?`, inquiry);
  add(
    `UPDATE item_events SET actor=CASE WHEN actor ${m} THEN 'deleted' ELSE actor END,target=CASE WHEN target ${m} THEN 'deleted' ELSE target END WHERE actor ${m} OR target ${m}`,
  );
  // Profile IDs, tokens and names are removed; member placeholders keep shared references valid.
  add(
    `UPDATE members SET account_id=NULL,token_hash='deleted:'||id,name='탈퇴-'||id,avatar='🐱',skin_id=NULL,blocked=1,last_seen=0,last_active=0,chat_seen=0,practice_id=NULL WHERE id ${m}`,
  );

  add(`UPDATE rounds SET owner_id=NULL WHERE owner_id ${m}`);
  // Keep report rows for other reporters, but erase identifying evidence concerning this account.
  add(
    `UPDATE safety_actions SET reason='' WHERE report_id IN(SELECT id FROM safety_reports WHERE reporter ${o} OR subject ${o})`,
  );
  add(
    `UPDATE safety_reports SET reporter=CASE WHEN reporter ${o} THEN 'deleted:'||id ELSE reporter END,subject=CASE WHEN subject ${o} THEN 'deleted:'||id ELSE subject END,subject_alias=NULL,name='탈퇴한 사용자',details='',evidence='{}' WHERE reporter ${o} OR subject ${o}`,
  );
  add(`DELETE FROM safety_blocks WHERE owner ${o} OR target ${o} OR target_alias ${o}`);
  add(`DELETE FROM safety_restrictions WHERE subject ${o}`);
  add(`UPDATE safety_actions SET actor='deleted',reason='' WHERE actor ${o}`);
  add(
    `DELETE FROM safety_rate WHERE ${scope.accounts.map((id) => `instr(key,${quote('account:' + id)})>0`).join(' OR ')}`,
  );
  for (const [kind, values] of [
    ['account', scope.accounts],
    ['owner', scope.accounts.map((id) => 'account:' + id)],
    ['member', scope.members],
  ])
    add(
      'INSERT OR IGNORE INTO deleted_identifiers SELECT ?,value FROM json_each(?)',
      kind,
      JSON.stringify(values),
    );
  add(
    "UPDATE inquiries SET owner=?,name='탈퇴한 사용자',body='계정 삭제 실행 완료',answer='계정과 연결된 개인 기록을 삭제했습니다. 공유 방의 참가자 표시는 익명화했으며 다른 참가자의 기록은 유지했습니다.',status='closed',revision=revision+1,updated_at=? WHERE id=?",
    'deleted:' + inquiry,
    now,
    inquiry,
  );
  add('UPDATE deletion_receipts SET expires_at=? WHERE inquiry_id=?', now + 90 * 86400000, inquiry);
  add('DELETE FROM deletion_previews WHERE inquiry_id=?', inquiry);
  try {
    await db.batch(statements);
  } catch {
    const retry = await one(
      db,
      'SELECT completed_at FROM deletion_audit WHERE inquiry_id=?',
      inquiry,
    );
    if (retry) return { completedAt: retry.completed_at, alreadyCompleted: true };
    throw new DeletionError(
      '변경 사항이 있거나 실행에 실패했습니다. 삭제는 반영하지 않았습니다. 다시 미리보기해 주세요.',
    );
  }
  return { completedAt: now, alreadyCompleted: false };
}
export async function digest(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}
