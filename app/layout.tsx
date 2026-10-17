import { SafetyNotice } from '@/components/safety/settings';
import './safety.css';
import { FriendInvitations } from '@/components/game/friend-invitations';
import type { Metadata } from 'next';
import './globals.css';
import './theme.css';
import './speech.css';
import './chat-ui.css';
import './polish.css';
import './mobile-play.css';
import './characters.css';
import { Announcement } from '@/components/announcement';
import './announcement.css';
import './typography.css';
import './design-system.css';
import './room-system.css';
import './card-skins.css';
import './entry-system.css';
import './service-header.css';
import './mini.css';
import './first-play.css';
import './play-accessibility.css';
import { AppearanceProvider } from '@/components/theme';
import { LegalLinks } from '@/components/legal/document';

export const metadata: Metadata = {
  metadataBase: new URL('https://play.jamopop.workers.dev'),
  alternates: { canonical: 'https://play.jamopop.workers.dev/' },
  openGraph: {
    title: '자음모음팝',
    description: '자모와 색깔로 푸는 한글 단어 추리 게임',
    url: 'https://play.jamopop.workers.dev/',
    type: 'website',
    locale: 'ko_KR',
    images: [
      { url: '/og/jamopop.png', width: 1200, height: 630, alt: '콩알친구들과 25칸 단어 게임판' },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '자음모음팝',
    description: '자모와 색깔로 푸는 한글 단어 추리 게임',
    images: ['/og/jamopop.png'],
  },
  title: '자음모음팝',
  description:
    '자모와 색깔 단서로 정답을 찾는 한글 단어 추리 게임. 로그인 없이 오늘의 단어를 풀거나 친구들과 같은 방에서 즐기세요.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="antialiased">
        <AppearanceProvider>
          <Announcement />
          <SafetyNotice />
          <FriendInvitations />
          {children}
          <LegalLinks />
        </AppearanceProvider>
      </body>
    </html>
  );
}
