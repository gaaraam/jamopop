'use client';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
export function Rules({
  open,
  onOpenChange,
  mode = 'normal',
}: {
  mode?: 'normal' | 'speed';
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rule-dialog">
        <DialogTitle className="dialog-title">게임 방법</DialogTitle>
        <DialogDescription>선택한 난이도(5·6·7칸)의 단어를 5번 안에 맞혀 주세요.</DialogDescription>
        <div className="rule-sample">
          <span className="tile green">ㅅ</span>
          <span className="tile yellow">ㅏ</span>
          <span className="tile gray">ㄱ</span>
          <span className="tile gray">ㅗ</span>
          <span className="tile gray">ㅏ</span>
        </div>
        <ul className="rules">
          <li>
            <i className="green" />✓ 자모와 위치가 모두 맞아요.
          </li>
          <li>
            <i className="yellow" />• 단어에 있지만 위치가 달라요.
          </li>
          <li>
            <i className="gray" />− 없거나, 이미 맞힌 개수보다 많아요.
          </li>
        </ul>
        <p>
          복합모음·쌍자음·겹받침은 풀어 씁니다.
          <br />
          <b>사과 → ㅅ ㅏ ㄱ ㅗ ㅏ</b>
        </p>
        <details className="rule-details">
          <summary>진행 · 순위 규칙</summary>
          {mode === 'speed' ? (
            <p className="secondary-text">
              같은 주제의 5문제를 3분 안에 풀어요. 문제마다 5번 시도할 수 있고, 건너뛴 문제는 번호를
              눌러 다시 풀 수 있습니다. 성공 개수, 마지막 정답 제출 시각 순으로 순위를 매깁니다.
              5문제 완주 시 1승·90XP, 미완주 참여는 10XP입니다.
            </p>
          ) : (
            <p className="secondary-text">
              방마다 문제를 따로 풉니다. 새 방 문제는 시작부터 5분 제한이며, 늦게 입장해도 같은 종료
              시각을 적용합니다. 연습은 시간제한이 없습니다. 아무도 풀이 중이지 않을 때 방장이 새
              문제로 바꿀 수 있습니다. 풀이 중이어도 방장이 강제 다음 문제를 선택하면 이전 제출
              기록을 보관하고 새 판을 시작합니다. 미참여자는 기다리지 않습니다. 시도 횟수가 적은
              순으로 순위를 매기며, 횟수가 같으면 먼저 정답을 제출한 사람이 앞섭니다.
            </p>
          )}
        </details>
        <details className="rule-details">
          <summary>입력 가능한 단어</summary>
          <p className="secondary-text">
            정답은 익숙한 단어에서 출제합니다. 새 판부터는 사전에 등록된 단어만 제출할 수 있습니다.
            자판으로 풀어 쓴 자모도 검사하며, 사전에 없는 입력은 기회를 차감하지 않습니다. 기존 판은
            이전 규칙을 유지합니다.
          </p>
          <a
            className="secondary-text"
            href="/dictionaries/SOURCE.txt"
            target="_blank"
            rel="noreferrer"
          >
            입력 사전 출처·이용 조건
          </a>
        </details>
        <a href="/how-to-play">예제로 보는 게임 방법 →</a>
      </DialogContent>
    </Dialog>
  );
}
