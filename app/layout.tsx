import {FriendInvitations} from '@/components/game/friend-invitations';
import type { Metadata } from "next";
import "./globals.css";
import "./theme.css";
import "./speech.css";
import "./chat-ui.css";
import "./polish.css";
import "./mobile-play.css";
import "./characters.css";
import {Announcement} from '@/components/announcement';
import './announcement.css';
import './typography.css';
import './design-system.css';
import './room-system.css';
import './card-skins.css';
import './entry-system.css';
import './mini.css';
import {AppearanceProvider} from "@/components/theme";
import {LegalLinks} from "@/components/legal/document";

export const metadata: Metadata = {
  title: "자음모음팝",
  description: "자음모음팝 — 동료들과 함께 푸는 한글 단어 게임.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="antialiased"><AppearanceProvider><Announcement/><FriendInvitations/>{children}<LegalLinks/></AppearanceProvider></body>
    </html>
  );
}
