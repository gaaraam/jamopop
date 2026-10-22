/** Read-only projection of the same sources used by BALANCE_SQL. No historical ledger is invented. */
export const GOLD_LEDGER = `WITH game AS (
 SELECT m.account_id account_id,g.day,g.amount,g.won,
 COALESCE(p.finished_at,p.updated_at,CAST(strftime('%s',g.day||' 00:00:00','-9 hours') AS INTEGER)*1000) at
 FROM gold_rewards g JOIN members m ON m.id=g.member_id LEFT JOIN plays p ON p.id=g.play_id
 WHERE m.account_id IS NOT NULL
), ledger AS (
 SELECT account_id,day,at,'game' kind,amount,'' item FROM game
 UNION ALL SELECT account_id,day,MIN(at),'first_win',30,'' FROM game WHERE won=1 GROUP BY account_id,day
 UNION ALL SELECT account_id,date(created_at/1000,'unixepoch','+9 hours'),created_at,kind,amount,CASE WHEN kind='event' THEN claim_key ELSE '' END FROM service_gold_claims
 UNION ALL SELECT account_id,date(purchased_at/1000,'unixepoch','+9 hours'),purchased_at,'purchase',-price,skin_id FROM skin_purchases
), owners AS (
 SELECT id account_id FROM profiles UNION SELECT account_id FROM ledger
), wallets AS (
 SELECT o.account_id,COALESCE(p.name,'프로필 없음') name,COALESCE(p.avatar,'🐱') avatar,
 COALESCE(SUM(CASE WHEN l.amount>0 THEN l.amount ELSE 0 END),0) issued,
 COALESCE(SUM(CASE WHEN l.amount<0 THEN -l.amount ELSE 0 END),0) spent,
 COALESCE(SUM(l.amount),0) balance,MAX(l.at) lastAt
 FROM owners o LEFT JOIN profiles p ON p.id=o.account_id LEFT JOIN ledger l ON l.account_id=o.account_id GROUP BY o.account_id
)`;
export const GOLD_SUMMARY = `${GOLD_LEDGER} SELECT
 COALESCE(SUM(issued),0) issued,COALESCE(SUM(spent),0) spent,COALESCE(SUM(balance),0) balance,
 COUNT(*) wallets,COALESCE(SUM(balance>0),0) holders,COALESCE(SUM(balance<0),0) negative,
 COALESCE((SELECT SUM(balance) FROM (SELECT balance FROM wallets WHERE balance>0 ORDER BY balance DESC LIMIT 10)),0) topTen,
 COALESCE((SELECT SUM(amount)+30*COUNT(DISTINCT CASE WHEN won=1 THEN token_hash||':'||day END) FROM gold_rewards g JOIN members m ON m.id=g.member_id WHERE account_id IS NULL),0) guestPending,
 (SELECT COUNT(*) FROM gold_rewards g LEFT JOIN members m ON m.id=g.member_id WHERE m.id IS NULL) orphanRewards
 FROM wallets`;
export const GOLD_DAILY = `${GOLD_LEDGER} SELECT day,
 SUM(CASE WHEN amount>0 THEN amount ELSE 0 END) issued,
 SUM(CASE WHEN amount<0 THEN -amount ELSE 0 END) spent,SUM(amount) net
 FROM ledger WHERE day>=? GROUP BY day ORDER BY day`;
export const GOLD_SOURCES = `${GOLD_LEDGER} SELECT kind,SUM(ABS(amount)) amount,COUNT(*) count FROM ledger WHERE day>=? GROUP BY kind`;
export const GOLD_PRODUCTS = `${GOLD_LEDGER} SELECT item,COUNT(*) count,SUM(-amount) amount FROM ledger WHERE kind='purchase' AND day>=? GROUP BY item ORDER BY amount DESC,item LIMIT 20`;
export const GOLD_WALLETS = `${GOLD_LEDGER} SELECT *,COUNT(*) OVER() total FROM wallets WHERE (?='' OR instr(lower(name),lower(?))>0 OR account_id=?) ORDER BY balance DESC,account_id LIMIT 50 OFFSET ?`;
export const GOLD_HISTORY = `${GOLD_LEDGER} SELECT day,at,kind,amount,item FROM ledger WHERE account_id=? ORDER BY at DESC,kind,item LIMIT 100`;
