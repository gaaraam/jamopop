import type { Metadata } from 'next';
import { ServiceHeader } from '@/components/game/service-header';
import { JudgmentMark, judgmentLabel } from '@/components/game/judgment-mark';
import { splitWord, score } from '@/lib/game';
import './rules.css';

export const metadata: Metadata = {
  openGraph: {
    title: '게임 방법 · 자음모음팝',
    description: '자모 분해와 중복 글자 판정을 예제로 알아보세요.',
    url: 'https://play.jamopop.workers.dev/how-to-play',
    type: 'website',
    images: [{ url: '/og/jamopop.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '게임 방법 · 자음모음팝',
    images: ['/og/jamopop.png'],
  },
  title: '게임 방법 · 자음모음팝',
  description:
    '한글 자모 분해, 초록·노랑·회색 판정과 중복 자모 규칙을 실제 타일 예제로 알아보세요. 로그인 없이 오늘의 단어를 시작할 수 있습니다.',
  alternates: { canonical: 'https://play.jamopop.workers.dev/how-to-play' },
};
function Example({ answer, guess }: { answer: string; guess: string }) {
  const letters = splitWord(guess);
  const colors = score(letters, splitWord(answer));
  return (
    <figure className="rules-example">
      <figcaption>
        예시 정답 <strong>{answer}</strong> · 제출 <strong>{guess}</strong>
      </figcaption>
      <ol className="rules-tiles" aria-label={`${guess} 판정`}>
        {letters.map((letter, i) => (
          <li
            key={i}
            className={`tile ${colors[i]}`}
            aria-label={`${i + 1}칸 ${letter}, ${judgmentLabel[colors[i]]}`}
          >
            {letter}
            <JudgmentMark color={colors[i]} />
          </li>
        ))}
      </ol>
    </figure>
  );
}
export default function HowToPlay() {
  return (
    <main className="public-rules">
      <ServiceHeader active="rules" title="게임 방법" playOnly />
      <div className="rules-intro">
        <p>자모와 색깔로 푸는 한글 단어 추리 게임</p>
        <a className="rules-start" href="/daily">
          오늘의 단어 시작하기 →
        </a>
      </div>
      <div className="rules-sections">
        <section>
          <h2>한 글자가 아니라, 한 자모씩</h2>
          <p>단어를 자음과 모음으로 풀어 칸에 넣습니다. 기본은 5칸, 기회는 5번입니다.</p>
          <div className="rules-split">
            <strong>사과</strong>
            <span aria-hidden="true">→</span>
            <span>ㅅ ㅏ ㄱ ㅗ ㅏ</span>
            <small>5칸</small>
          </div>
          <p>
            쌍자음·복합모음·겹받침도 나눕니다. <b>ㄲ → ㄱ ㄱ</b>, <b>ㅘ → ㅗ ㅏ</b>,{' '}
            <b>ㄺ → ㄹ ㄱ</b>.
          </p>
          <p>
            게임 자판을 누르거나 PC 키보드로 입력한 뒤 제출하세요. 칸 수에 맞는 사전 단어만
            인정되며, 잘못된 입력은 기회를 쓰지 않습니다.
          </p>
        </section>
        <section>
          <h2>색깔은 다음 시도의 단서</h2>
          <Example answer="가방" guess="사과" />
          <dl className="rules-legend">
            <div>
              <dt>초록 ✓</dt>
              <dd>자모와 위치가 모두 일치</dd>
            </div>
            <div>
              <dt>노랑 •</dt>
              <dd>자모는 있지만 다른 위치</dd>
            </div>
            <div>
              <dt>회색 −</dt>
              <dd>없는 자모 또는 개수 초과</dd>
            </div>
          </dl>
          <p>ㅏ는 두 번째 칸에 맞았습니다. ㄱ과 마지막 ㅏ는 위치를 바꿔 보세요.</p>
        </section>
        <section>
          <h2>같은 자모도 개수만큼만</h2>
          <Example answer="학교" guess="사과" />
          <p>
            ‘학교’에는 ㅏ가 하나입니다. 두 번째 칸에서 이미 초록으로 맞혔으므로, 마지막 ㅏ는
            회색입니다. 회색이라고 항상 그 자모가 없는 것은 아닙니다.
          </p>
          <p>위치까지 맞은 자모를 먼저 판정하고, 남은 개수 안에서 노랑을 표시합니다.</p>
        </section>
        <section>
          <h2>어떤 판을 할까요?</h2>
          <div className="rules-table">
            <table>
              <caption className="sr-only">모드별 플레이 방식</caption>
              <thead>
                <tr>
                  <th scope="col">모드</th>
                  <th scope="col">규칙</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">
                    <a href="/daily">오늘의 단어</a>
                  </th>
                  <td>
                    매일 모두에게 같은 5칸 문제. 5번의 기회, 시간제한 없음. 한국시간 0시에 새 문제.
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    <a href="/?lobby=1">일반전</a>
                  </th>
                  <td>
                    같은 방에서 같은 문제. 5·6·7칸, 5번의 기회. 방 공통 5분이며 늦게 들어와도 종료
                    시각은 같습니다.
                  </td>
                </tr>
                <tr>
                  <th scope="row">아이템전</th>
                  <td>일반전 규칙에 공격·방어·시간 아이템이 추가됩니다.</td>
                </tr>
                <tr>
                  <th scope="row">스피드전</th>
                  <td>같은 주제의 5문제를 3분 안에 풀어요. 문제마다 5번 시도합니다.</td>
                </tr>
                <tr>
                  <th scope="row">
                    <a href="/solo">개인 도전</a>
                  </th>
                  <td>층마다 칸 수·기회·시간 조건이 달라집니다. 시작 전에 조건을 확인하세요.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            일반전·아이템전은 적은 시도 순, 동률이면 먼저 정답을 제출한 순입니다. 스피드전은 성공
            개수 순, 동률이면 마지막 정답을 먼저 제출한 순입니다.
          </p>
        </section>
      </div>
      <footer className="rules-end">
        <a className="rules-start" href="/daily">
          오늘의 단어 시작하기 →
        </a>
        <a href="/">입력부터 연습하기</a>
        <a href="/dictionaries/SOURCE.txt">입력 사전 출처</a>
      </footer>
    </main>
  );
}
