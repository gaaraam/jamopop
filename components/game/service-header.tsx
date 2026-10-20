'use client';
import { NotificationSlot } from './notification-slot';
import { Home, ShoppingBag, Building2, ArrowLeft, CalendarDays, Gift } from 'lucide-react';
import { ThemeSwitch } from '@/components/theme';
import { readActiveRoom } from '@/lib/active-room.mjs';
import { useEffect, useState, type ReactNode } from 'react';
const links = [
  { id: 'news', href: '/news', name: '소식·출석', Icon: Gift },
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
  }, []);
  return (
    <header
      className="service-header"
      data-play-only={(playOnly && active !== 'lobby' && !returnRoom) || undefined}
    >
      <div className="service-heading">
        {active !== 'lobby' && (
          <a className="service-back" href="/?lobby=1" aria-label="대기실로 돌아가기">
            <ArrowLeft size={16} />
            <span>대기실</span>
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
          {returnRoom && (
            <a className="room-return" href={returnRoom.href} aria-label="게임방으로 돌아가기">
              <ArrowLeft size={17} />
              <span>게임방 복귀</span>
            </a>
          )}
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
          <NotificationSlot />
        </div>
      </div>
    </header>
  );
}
