'use client';
import { useState } from 'react';
import { SOLO_SKINS, soloRewardIds } from '@/lib/skins';
import { CHARACTER_ART } from '@/lib/character-art';
import { CharacterAvatar } from './character-avatar';
export function SoloRewards({
  best,
  signedIn,
  celebrate = false,
}: {
  best: Record<string, number>;
  signedIn: boolean;
  celebrate?: boolean;
}) {
  const earned = soloRewardIds(best),
    [busy, setBusy] = useState(''),
    [notice, setNotice] = useState('');
  async function equip(id: string) {
    if (busy) return;
    setBusy(id);
    setNotice('');
    try {
      const r = await fetch('/api/shop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'equip', skin: id }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error);
      setNotice('장착했어요. 게임방에서도 함께할게요!');
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  return (
    <section className={`solo-rewards ${celebrate ? 'celebrate' : ''}`} aria-label="모험 스킨 보상">
      <header>
        <h2>함께한 모험의 선물</h2>
        <span>{earned.length} / 4</span>
      </header>
      <div className="solo-reward-grid">
        {SOLO_SKINS.map((s) => {
          const unlocked = earned.includes(s.id);
          return (
            <article key={s.id} data-earned={unlocked}>
              <CharacterAvatar avatar={s.avatar} skin={s.id} />
              <strong>
                {s.name}
                <br />
                {CHARACTER_ART[s.avatar].name}
              </strong>
              <small>{s.reward}</small>
              {unlocked ? (
                <>
                  {signedIn ? (
                    <button disabled={!!busy} onClick={() => void equip(s.id)}>
                      {busy === s.id ? '장착 중…' : '장착하기'}
                    </button>
                  ) : (
                    <span className="solo-reward-state">달성 · 게스트 기록</span>
                  )}
                </>
              ) : (
                <span className="solo-reward-state">미획득</span>
              )}
            </article>
          );
        })}
      </div>
      {!signedIn && (
        <p>
          게스트의 보상 조건은 이 브라우저에 저장됩니다. 계정에 자동 이전되지 않으며 스킨 장착은
          회원 기록 기준입니다.
        </p>
      )}
      <p role="status">{notice}</p>
    </section>
  );
}
