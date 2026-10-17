export const ROOM_ROUND_MS = 5 * 60 * 1000;
export function deadlinePassed(endsAt: number | null | undefined, now: number) {
  return endsAt != null && now >= endsAt;
}
// Only attempted, unfinished daily plays expire. Legacy unlimited rounds and interrupted rounds stay intact.
export const EXPIRE_ROUND_SQL = `UPDATE plays SET status='lost',finished_at=?,updated_at=? WHERE round_id=? AND status='playing' AND guesses<>'[]' AND EXISTS(SELECT 1 FROM rounds r WHERE r.id=plays.round_id AND r.mode='daily' AND r.phase='running' AND r.ends_at IS NOT NULL AND r.ends_at<=?)`;
