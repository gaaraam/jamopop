import { isSiteAdmin } from '@/lib/account';
import { database } from '@/lib/store';
import { ALL_SKINS } from '@/lib/skins';
import { CHARACTER_ART } from '@/lib/character-art';
import { CARD_SKINS } from '@/lib/card-skins';
import { FURNITURE } from '@/lib/furniture';
import {
  GOLD_SUMMARY,
  GOLD_DAILY,
  GOLD_SOURCES,
  GOLD_PRODUCTS,
  GOLD_WALLETS,
  GOLD_HISTORY,
} from '@/lib/gold-economy.mjs';
const reply = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
  });
export async function GET(req: Request) {
  if (!isSiteAdmin(req)) return reply({ error: '관리자 계정으로 로그인해 주세요.' }, 403);
  const u = new URL(req.url),
    days = Number(u.searchParams.get('days') || 30),
    offset = Number(u.searchParams.get('offset') || 0),
    q = (u.searchParams.get('q') || '').trim().slice(0, 80),
    account = u.searchParams.get('account');
  if (
    ![7, 30, 90].includes(days) ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 100000 ||
    (account && account.length > 200)
  )
    return reply({ error: '조회 조건을 확인해 주세요.' }, 400);
  try {
    const db = database(),
      now = Date.now(),
      start = new Date(now + 9 * 3600000 - (days - 1) * 86400000).toISOString().slice(0, 10);
    const names = new Map([
      ...ALL_SKINS.map((s) => [s.id, `${s.name} ${CHARACTER_ART[s.avatar]?.name || ''}`] as const),
      ...CARD_SKINS.map((s) => [s.id, s.name] as const),
      ...FURNITURE.map((s) => [s.id, s.name] as const),
    ]);
    if (account) {
      const r = await db.prepare(GOLD_HISTORY).bind(account).all();
      return reply({
        rows: r.results.map((r: any) => ({ ...r, itemName: names.get(r.item) || r.item })),
        serverNow: now,
      });
    }
    const results = await db.batch([
      db.prepare(GOLD_SUMMARY),
      db.prepare(GOLD_DAILY).bind(start),
      db.prepare(GOLD_SOURCES).bind(start),
      db.prepare(GOLD_PRODUCTS).bind(start),
      db.prepare(GOLD_WALLETS).bind(q, q, q, offset),
    ]);
    return reply({
      summary: results[0].results[0],
      daily: results[1].results,
      sources: results[2].results,
      products: results[3].results.map((r: any) => ({ ...r, name: names.get(r.item) || r.item })),
      wallets: results[4].results,
      serverNow: now,
      start,
      days,
    });
  } catch {
    return reply({ error: '골드 현황을 불러오지 못했어요.' }, 503);
  }
}
