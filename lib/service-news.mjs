export const ATTENDANCE_GOLD = 50;
export const kstDay = (now) => new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
export function validateNews(raw) {
  if (
    !raw ||
    !['notice', 'update', 'event'].includes(raw.kind) ||
    !['draft', 'published', 'archived'].includes(raw.status)
  )
    return null;
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const body = typeof raw.body === 'string' ? raw.body.trim() : '';
  if (!title || title.length > 80 || !body || body.length > 6000) return null;
  const event = raw.kind === 'event';
  const gold = event ? raw.gold : 0;
  const starts = event ? raw.startsAt : null;
  const ends = event ? raw.endsAt : null;
  if (
    event &&
    (!Number.isSafeInteger(gold) ||
      gold < 1 ||
      gold > 10000 ||
      !Number.isSafeInteger(starts) ||
      !Number.isSafeInteger(ends) ||
      starts < 0 ||
      ends > 8640000000000000 ||
      ends <= starts ||
      ends - starts > 90 * 86400000)
  )
    return null;
  return { title, body, kind: raw.kind, status: raw.status, gold, starts, ends };
}
export const NEWS_COLUMNS =
  'id,kind,title,body,status,gold,starts_at AS startsAt,ends_at AS endsAt,revision,created_at AS createdAt,updated_at AS updatedAt';
// Eligibility and insertion share one statement. The unique key spans all linked profiles.
export const CLAIM_EVENT_SQL = `INSERT INTO service_gold_claims(subject,account_id,kind,claim_key,amount,created_at)
 SELECT ?,?,'event',id,gold,? FROM service_news WHERE id=? AND kind='event' AND status='published' AND starts_at<=? AND ends_at>? ON CONFLICT(subject,kind,claim_key) DO NOTHING`;
