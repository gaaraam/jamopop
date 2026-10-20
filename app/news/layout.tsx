import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: '소식·이벤트 · 자음모음팝',
  alternates: { canonical: 'https://play.jamopop.workers.dev/news' },
};
export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
