import type { Metadata } from 'next';
import { DailyGame } from './play';
import './daily.css';
export const metadata: Metadata = {
  title: '오늘의 단어 · 자음모음팝',
  description:
    '매일 같은 한글 단어를 다섯 번 안에 맞혀 보세요. 로그인 없이 플레이하고 색깔 격자로 결과를 공유하세요.',
  alternates: { canonical: 'https://play.jamopop.workers.dev/daily' },
  openGraph: {
    title: '오늘의 단어 · 자음모음팝',
    description: '오늘은 몇 번 만에 맞힐까요? 5칸, 5번의 기회.',
    url: 'https://play.jamopop.workers.dev/daily',
    type: 'website',
  },
};
export default function DailyPage() {
  return <DailyGame />;
}
