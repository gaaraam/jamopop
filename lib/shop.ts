import { all, one } from './store';
import { soloRewardIds } from './skins';
export const BALANCE_SQL = `SELECT COALESCE(SUM(g.amount),0)+30*COUNT(DISTINCT CASE WHEN g.won=1 THEN g.day END)-(SELECT COALESCE(SUM(price),0) FROM skin_purchases WHERE account_id=?) balance FROM gold_rewards g JOIN members m ON m.id=g.member_id WHERE m.account_id=?`;
export async function shopState(id: string) {
  const [balance, owned, profile, solo, card, care] = await Promise.all([
    one(BALANCE_SQL, id, id),
    all('SELECT skin_id FROM skin_purchases WHERE account_id=?', id),
    one('SELECT avatar,skin_id FROM profiles WHERE id=?', id),
    one('SELECT state FROM solo_progress WHERE owner=?', `account:${id}`),
    one('SELECT skin_id FROM equipped_card_skins WHERE account_id=?', id),
    one('SELECT COUNT(*) n FROM home_care WHERE account_id=?', id),
  ]);
  return {
    cardEquipped: card?.skin_id || null,
    balance: Number(balance?.balance || 0),
    owned: [
      ...new Set([
        ...owned.map((x) => x.skin_id),
        ...['home-nap-rabbit', 'home-snack-cat', 'home-star-bear'].filter(
          (_, i) => Number(care?.n || 0) >= [12, 36, 72][i],
        ),
        ...soloRewardIds(solo ? JSON.parse(solo.state).best || {} : {}),
      ]),
    ],
    equipped: profile?.skin_id || null,
    avatar: profile?.avatar || '🐱',
  };
}
