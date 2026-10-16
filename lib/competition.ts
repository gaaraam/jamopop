import {run} from './store';
// Reused inside conditional writes so a mode switch cannot race a submission.
export const normalPlayingSQL=`SELECT 1 FROM plays p JOIN members m ON m.id=p.member_id JOIN rounds r ON r.id=p.round_id LEFT JOIN item_loadouts il ON il.round_id=r.id AND il.member_id=m.id WHERE p.round_id=rooms.current_round_id AND p.status='playing' AND p.guesses<>'[]' AND m.blocked=0 AND m.spectator=0 AND NOT EXISTS(SELECT 1 FROM spectators sp WHERE sp.member_id=m.id AND sp.round_id=p.round_id) AND (COALESCE(il.ends_at,r.ends_at) IS NULL OR COALESCE(il.ends_at,r.ends_at)>?)`;
export const speedPlayingSQL=`SELECT 1 FROM speed_rounds sr WHERE sr.id=rooms.active_speed_id AND sr.ends_at>? AND (sr.starts_at>? OR NOT EXISTS(SELECT 1 FROM speed_plays WHERE round_id=sr.id) OR EXISTS(SELECT 1 FROM speed_plays sp JOIN members sm ON sm.id=sp.member_id,json_each(sp.state,'$.puzzles') q WHERE sp.round_id=sr.id AND sm.blocked=0 AND sm.spectator=0 AND json_extract(q.value,'$.status')='open'))`;
export async function settleSpeed(room:string,now=Date.now()){
 await run(`UPDATE plays SET status='lost',finished_at=(SELECT ends_at FROM rounds WHERE id=plays.round_id),updated_at=? WHERE status='playing' AND round_id IN(SELECT id FROM speed_rounds WHERE room_id=? AND ends_at<=?)`,now,room,now);
}
