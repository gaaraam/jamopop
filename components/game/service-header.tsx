'use client';
import { Home, ShoppingBag, Building2, ArrowLeft, CalendarDays } from 'lucide-react';
import { ThemeSwitch } from '@/components/theme';
import { readActiveRoom } from '@/lib/active-room.mjs';
import { useEffect, useState, type ReactNode } from 'react';
const links = [
  { id: 'daily', href: '/daily', name: '오늘의 단어', Icon: CalendarDays },
  { id: 'solo', href: '/solo', name: '개인 도전', Icon: Building2 },
  { id: 'shop', href: '/shop', name: '상점', Icon: ShoppingBag },
  { id: 'home', href: '/home', name: '내 집', Icon: Home },
];
export function ServiceHeader({
  active,
  title,
  children,
  tools,
  playOnly = false,
}: {
  active: string;
  title?: string;
  playOnly?: boolean;
  children?: ReactNode;
  tools?: ReactNode;
}) {
  const [returnRoom, setReturnRoom] = useState<{ href: string } | null>(null);
  useEffect(() => {
    setReturnRoom(readActiveRoom(sessionStorage));
    window.dispatchEvent(
      new CustomEvent('jamopop-header-slot', {
        detail: document.getElementById('service-notifications'),
      }),
    );
    return () => {
      window.dispatchEvent(new CustomEvent('jamopop-header-slot', { detail: null }));
    };
  }, []);
  return (
    <header className="service-header">
      <div className="service-heading">
        {active !== 'lobby' && (
          <a
            className={`service-back${returnRoom ? ' room-return' : ''}`}
            href={returnRoom?.href || '/?lobby=1'}
            aria-label={returnRoom ? '게임방으로 돌아가기' : '대기실로 돌아가기'}
          >
            <ArrowLeft size={16} />
            <span>{returnRoom ? '게임방' : '대기실'}</span>
          </a>
        )}
        <h1>
          {title ||
            (
              { lobby: '대기실', solo: '개인 도전', shop: '콩알 옷장', home: '내 집' } as Record<
                string,
                string
              >
            )[active]}
        </h1>
      </div>
      <div className="service-header-actions">
        <nav aria-label="주 메뉴">
          {links
            .filter((x) => x.id !== active && (!playOnly || ['solo', 'daily'].includes(x.id)))
            .map(({ id, href, name, Icon }) => (
              <a key={id} href={href} aria-label={name}>
                <Icon size={17} />
                <span>{name}</span>
              </a>
            ))}
        </nav>
        {children}
        <div className="service-header-tools">
          {tools || <ThemeSwitch />}
          <div id="service-notifications" />
        </div>
      </div>
    </header>
  );
}
