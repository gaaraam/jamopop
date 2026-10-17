'use client';
import {
  Clipboard,
  Copy,
  Scissors,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  WrapText,
  Grid2X2,
  PaintBucket,
  Type,
  ChevronDown,
  MessageSquare,
  Settings,
  HelpCircle,
} from 'lucide-react';

type Props = {
  cell: string;
  finished: boolean;
  onFocus: () => void;
  onClear: () => void;
  onCopy: () => void;
  onChat: () => void;
  onSettings: () => void;
  onHelp: () => void;
};
/** Desktop worksheet chrome. The actual game input is reused as the formula bar. */
export function WorksheetChrome({
  cell,
  finished,
  onFocus,
  onClear,
  onCopy,
  onChat,
  onSettings,
  onHelp,
}: Props) {
  return (
    <div className="sheet-chrome">
      <div className="sheet-menu" aria-label="워크시트 메뉴">
        <button onClick={onSettings}>파일</button>
        <button className="active" onClick={onFocus}>
          홈
        </button>
        <span aria-hidden="true">삽입</span>
        <span aria-hidden="true">페이지 레이아웃</span>
        <span aria-hidden="true">수식</span>
        <span aria-hidden="true">데이터</span>
        <button onClick={onChat}>검토</button>
        <button onClick={onHelp}>보기</button>
      </div>
      <div className="sheet-tools">
        <div className="sheet-tool-group">
          <div className="sheet-clipboard">
            <button className="sheet-large-tool" onClick={onFocus} title="수식 입력줄로 이동">
              <Clipboard size={27} />
              <span>
                입력 <ChevronDown size={10} />
              </span>
            </button>
            <div>
              <button onClick={onClear} title="현재 입력 지우기">
                <Scissors size={13} />
                지우기
              </button>
              <button onClick={onCopy} title="현재 입력 복사">
                <Copy size={13} />
                복사
              </button>
            </div>
          </div>
          <small>클립보드</small>
        </div>
        <div className="sheet-tool-group sheet-font-group">
          <div className="sheet-font-fields" aria-hidden="true">
            <span>
              맑은 고딕 <ChevronDown size={10} />
            </span>
            <span>
              11 <ChevronDown size={10} />
            </span>
          </div>
          <div className="sheet-format-icons" aria-hidden="true">
            <Bold size={14} />
            <Italic size={14} />
            <Underline size={14} />
            <i />
            <Grid2X2 size={14} />
            <PaintBucket size={14} />
            <Type size={14} />
          </div>
          <small>글꼴</small>
        </div>
        <div className="sheet-tool-group sheet-align-group">
          <div className="sheet-format-icons" aria-hidden="true">
            <AlignLeft size={15} />
            <AlignCenter size={15} />
            <AlignRight size={15} />
          </div>
          <span className="sheet-wrap-label" aria-hidden="true">
            <WrapText size={14} />
            자동 줄 바꿈
          </span>
          <small>맞춤</small>
        </div>
        <div className="sheet-tool-group sheet-room-tools">
          <div>
            <button onClick={onChat}>
              <MessageSquare size={20} />
              <span>메모</span>
            </button>
            <button onClick={onSettings}>
              <Settings size={20} />
              <span>설정</span>
            </button>
            <button onClick={onHelp}>
              <HelpCircle size={20} />
              <span>도움말</span>
            </button>
          </div>
          <small>검토</small>
        </div>
      </div>
      <div className="sheet-formula-shell">
        <span className="sheet-name-box">
          {cell}
          <ChevronDown size={10} />
        </span>
        <span className="sheet-formula-tools" aria-hidden="true">
          × <b>✓</b> <i>ƒx</i>
        </span>
        {finished && <span className="sheet-formula-idle">완료</span>}
      </div>
    </div>
  );
}
