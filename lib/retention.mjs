// Policies never remove game, reward, inventory or account records.
export const RETENTION_POLICY = Object.freeze({
  version: '2026-10-18',
  minimumAge: 14,
  chatDays: 90,
  drawingDays: 90,
  closedCaseDays: 365,
  presenceDays: 30,
  backupDays: 30,
});
const DAY = 86400000;
// Destructive content cleanup is deliberately not exported. The operator reviews counts first.
export const CONTENT_CANDIDATES = [
  ['방 대화', 'chat_messages', 'created_at', 90, '1=1'],
  ['대기실 대화', 'lobby_messages', 'created_at', 90, '1=1'],
  ['그림 힌트', 'drawing_hints', 'updated_at', 90, '1=1'],
  ['완료 문의', 'inquiries', 'updated_at', 365, "status='closed' AND category!='계정 삭제'"],
  ['완료 신고', 'safety_reports', 'updated_at', 365, "status='closed'"],
  ['최근 접속 표시', 'account_presence', 'last_seen', 30, '1=1'],
];
const EXPIRING = ['google_sessions', 'deletion_previews', 'deletion_receipts', 'safety_rate'];
export async function retentionPreview(db, now = Date.now()) {
  const rows = [];
  for (const [label, table, column, days, filter] of CONTENT_CANDIDATES) {
    const cutoff = now - days * DAY;
    const row = await db
      .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column}<? AND ${filter}`)
      .bind(cutoff)
      .first();
    rows.push({ label, days, cutoff, count: row.count });
  }
  return { policy: RETENTION_POLICY, mode: 'preview-only', rows, generatedAt: now };
}
export async function cleanupExpiredTechnical(db, now = Date.now()) {
  // Each call is bounded; the exact expiry is rechecked in the DELETE itself.
  const statements = EXPIRING.map((table) =>
    db
      .prepare(
        `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE expires_at<=? LIMIT 500) AND expires_at<=?`,
      )
      .bind(now, now),
  );
  const results = await db.batch(statements);
  return Object.fromEntries(EXPIRING.map((table, i) => [table, results[i].meta?.changes || 0]));
}
