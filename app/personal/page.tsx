'use client';
import { useEffect, useState } from 'react';
import { ServiceHeader } from '@/components/game/service-header';
import { CharacterAvatar } from '@/components/game/character-avatar';
import './personal.css';
export default function Personal() {
  const [status, setStatus] = useState('loading'),
    [error, setError] = useState('');
  async function refresh() {
    setError('');
    try {
      const r = await fetch('/api/access');
      if (!r.ok) throw Error();
      const d = (await r.json()) as { social: boolean; status: string };
      if (d.social) {
        location.replace('/?lobby=1');
        return;
      }
      setStatus(d.status);
    } catch {
      setError('접속 상태를 확인하지 못했어요. 다시 시도해 주세요.');
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <main className="personal-page">
      <ServiceHeader active="personal" title="자음모음팝" playOnly />
      <section className="personal-welcome">
        <CharacterAvatar avatar="🐱" />
        <h2>
          {status === 'guest'
            ? '혼자서도 한 판'
            : status === 'pending'
              ? '가입 승인 대기 중'
              : status === 'rejected'
                ? '가입이 승인되지 않았어요'
                : '접속 확인 중'}
        </h2>
        <p>
          {status === 'guest'
            ? '방과 회원 기능은 가입 후 관리자 승인이 필요해요.'
            : status === 'pending'
              ? '승인 전에도 개인 게임은 계속 즐길 수 있어요.'
              : status === 'rejected'
                ? '개인 게임은 이용할 수 있어요. 문의가 있다면 문의하기를 이용해 주세요.'
                : ''}
        </p>
        {error && <p role="alert">{error}</p>}
        <div>
          {status === 'guest' ? (
            <a className="primary" href="/auth/google/start?return_to=%2Fpersonal">
              Google로 가입·로그인
            </a>
          ) : (
            <button onClick={refresh}>승인 상태 확인</button>
          )}
          {status === 'rejected' && <a href="/support">문의하기</a>}
        </div>
      </section>
      <div className="personal-games">
        {[
          ['/daily', '오늘의 단어', '하루 한 문제'],
          ['/solo', '개인 도전', '콩알친구들과 퍼즐'],
        ].map(([href, title, detail]) => (
          <a key={href} href={href}>
            <h2>{title}</h2>
            <span>{detail} →</span>
          </a>
        ))}
      </div>
    </main>
  );
}
