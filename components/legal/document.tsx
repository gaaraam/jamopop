import { ServiceHeader } from '@/components/game/service-header';
import type { ReactNode } from 'react';
export const operator = '이가람';
// Confirm the public contact address with the operator before publication.
export const contactEmail = 'leegaaraam@gmail.com';
export function Contact() {
  return contactEmail ? (
    <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
  ) : (
    <span>공개 문의처 확인 중</span>
  );
}
export function LegalDocument({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="legal-page">
      <ServiceHeader active="policy" title="자음모음팝" playOnly />
      <article className="legal-document">
        <header>
          <span>자음모음팝</span>
          <h1>
            {title}
            {!contactEmail && <small className="legal-draft">검토용 초안</small>}
          </h1>
          <p>시행일 2026년 10월 18일 · 운영자 {operator}</p>
        </header>
        {children}
        <footer>
          문의 및 권리 행사 · <Contact />
        </footer>
      </article>
      <nav className="legal-links" aria-label="서비스 정책">
        <a href="/privacy">개인정보처리방침</a>
        <a href="/terms">이용약관</a>
      </nav>
    </main>
  );
}
export function LegalLinks() {
  return (
    <nav className="legal-links" aria-label="서비스 정책">
      <a href="/privacy" target="_blank" rel="noopener noreferrer">
        개인정보처리방침
      </a>
      <a href="/terms" target="_blank" rel="noopener noreferrer">
        이용약관
      </a>
      <a href="/how-to-play">게임 방법</a>
      <a href="/support">문의하기</a>
      <span>운영 이가람 · 최반석</span>
    </nav>
  );
}
