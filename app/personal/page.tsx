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
        <h2>{status === 'guest' ? '혼자서도 한 판' : '접속 확인 중'}</h2>
        <p>
          {status === 'guest' ? '방과 회원 기능은 Google 로그인 후 바로 이용할 수 있어요.' : ''}
        </p>
        {error && <p role="alert">{error}</p>}
        <div>
          {status === 'guest' ? (
            <a className="primary" href="/auth/google/start?return_to=%2F%3Flobby%3D1">
              Google로 가입·로그인
            </a>
          ) : (
            <button onClick={refresh}>다시 확인</button>
          )}
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
