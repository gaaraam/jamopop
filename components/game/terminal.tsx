'use client';
import { useEffect, useRef, useState } from 'react';
import { ConsoleOutput, ConsolePrompt } from './terminal-output';
import type { GameState } from '@/lib/game';
import { blocksEnter } from '@/lib/input';
import { parseTerminalCommand, consoleUpdate, type ConsoleSnapshot } from '@/lib/terminal';
type Props = {
  data: GameState;
  draft: string;
  busy: boolean;
  connection: boolean;
  message: string;
  onDraft: (s: string) => void;
  onComposition: (active: boolean) => void;
  onSubmit: (s: string) => Promise<any>;
  onView: () => void;
  onNext: () => Promise<any>;
  onMode: (s: string) => Promise<void>;
};
export function TerminalView({
  data,
  draft,
  busy,
  connection,
  message,
  onDraft,
  onComposition,
  onSubmit,
  onView,
  onNext,
  onMode,
}: Props) {
  const [line, setLine] = useState(draft),
    [log, setLog] = useState<string[]>([]),
    [working, setWorking] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    composing = useRef(false),
    ended = useRef(0),
    pending = useRef(false);
  useEffect(() => {
    setLine(draft);
  }, [draft, data.round.id]);
  useEffect(() => {
    if (!busy && !working) input.current?.focus();
  }, [busy, working]);
  const scroll = useRef<HTMLElement>(null),
    follow = useRef(true),
    previous = useRef<ConsoleSnapshot | null>(null);
  const history = useRef<string[]>([]),
    historyIndex = useRef(0),
    unsent = useRef('');
  const prompt = `${data.me.name}@bubblecon:~/wordle $`;
  const write = (text: string) => setLog((old) => [...old, text].slice(-200));
  useEffect(() => {
    const next = consoleUpdate(data, previous.current);
    previous.current = next.snapshot;
    if (next.lines.length) setLog((old) => [...old, ...next.lines].slice(-200));
  }, [data]);
  useEffect(() => {
    if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [log, line, working]);
  async function execute() {
    if (pending.current || busy || composing.current || Date.now() - ended.current < 80) return;
    const text = line.trim();
    if (!text) return;
    pending.current = true;
    setWorking(true);
    follow.current = true;
    history.current = [...history.current, text].slice(-100);
    historyIndex.current = history.current.length;
    write(`${prompt} ${text}`);
    try {
      const command = parseTerminalCommand(text);
      if (command.kind === 'guess') {
        const result = await onSubmit(text);
        if (result) setLine('');
        else write('입력을 확인해 주세요. 제출 기록은 변경되지 않았습니다.');
        return;
      }
      setLine('');
      switch (command.name) {
        case 'help':
          write(
            '단어 + Enter: 제출\n/help 도움말  /room 참가자  /rank 순위\n/next 다음 문제(방장)  /practice 연습  /daily 방 문제\n/view 일반 화면  /clear 콘솔 메시지 지우기',
          );
          break;
        case 'room':
          write(
            data.roster
              .map((m) => {
                const p = data.players.find((p) => p.id === m.id);
                return `${m.name}${m.id === data.room.hostId ? ' [host]' : ''}  ${p?.status === 'won' ? '완료' : p?.status === 'lost' ? '종료' : p?.attempts ? `${p.attempts}/5` : '대기'}`;
              })
              .join('\n'),
          );
          break;
        case 'rank':
          write(
            data.weekly.length
              ? data.weekly
                  .map((p) => `${p.rank}. ${p.name}  ${p.wins}승  평균 ${p.average.toFixed(2)}회`)
                  .join('\n')
              : '이번 주 기록 없음',
          );
          break;
        case 'next':
          if (data.round.mode !== 'daily') write('/daily로 방 문제에 돌아온 뒤 실행하세요.');
          else if (!data.room.isHost) write('방장만 다음 문제를 낼 수 있습니다.');
          else if (!data.room.canReset) write('풀이 중인 참가자가 있습니다.');
          else if (await onNext()) write('다음 문제를 시작했습니다.');
          break;
        case 'practice':
          await onMode('practice');
          break;
        case 'daily':
          await onMode('daily');
          break;
        case 'view':
          onView();
          break;
        case 'clear':
          setLog([]);
          break;
        default:
          write('알 수 없는 명령입니다. /help');
      }
    } finally {
      pending.current = false;
      setWorking(false);
      input.current?.focus();
    }
  }
  const finished = data.play.status === 'won' || data.play.status === 'lost';
  return (
    <main
      className="terminal-view console-view"
      ref={scroll}
      onScroll={() => {
        const el = scroll.current;
        if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
    >
      <div className="console-start">
        bubblecon word session — {data.room.name}
        <br />
        <span className="ansi-command">/help</span> commands ·{' '}
        <span className="ansi-command">/view</span> GUI ·{' '}
        <span className="ansi-exact">■ exact</span> /{' '}
        <span className="ansi-present">▨ present</span> /{' '}
        <span className="ansi-absent">· absent</span>
      </div>
      {!connection && (
        <div className="console-warning">[connection] reconnecting… saved records retained</div>
      )}
      <div className="terminal-log" role="log" aria-label="명령 결과">
        {log.map((entry, i) => (
          <pre key={i}>
            <ConsoleOutput text={entry} />
          </pre>
        ))}
      </div>
      <form
        className="terminal-prompt"
        onSubmit={(e) => {
          e.preventDefault();
          void execute();
        }}
      >
        <label htmlFor="terminal-command">
          <ConsolePrompt name={data.me.name} />
        </label>
        <input
          id="terminal-command"
          ref={input}
          autoFocus
          aria-label="터미널 명령 또는 단어"
          value={line}
          autoComplete="off"
          spellCheck={false}
          disabled={busy || working}
          onChange={(e) => {
            const v = e.target.value.slice(0, 64);
            setLine(v);
            historyIndex.current = history.current.length;
            if (!v.startsWith('/')) onDraft(v);
          }}
          onCompositionStart={() => {
            composing.current = true;
            onComposition(true);
          }}
          onCompositionEnd={(e) => {
            composing.current = false;
            onComposition(false);
            ended.current = Date.now();
            const v = e.currentTarget.value;
            setLine(v);
            if (!v.startsWith('/')) onDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229 || composing.current)
              return;
            if (e.key === 'Enter') {
              e.preventDefault();
              if (!blocksEnter(e.nativeEvent, composing.current, ended.current)) void execute();
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              if (historyIndex.current === history.current.length) unsent.current = line;
              historyIndex.current = Math.max(
                0,
                Math.min(
                  history.current.length,
                  historyIndex.current + (e.key === 'ArrowUp' ? -1 : 1),
                ),
              );
              const value = history.current[historyIndex.current] ?? unsent.current;
              setLine(value);
              if (!value.startsWith('/')) onDraft(value);
            }
          }}
        />
      </form>
      <div className="terminal-input-status" role="status">
        {busy || working
          ? 'processing…'
          : line.startsWith('/')
            ? ''
            : finished
              ? 'session complete · /next or /practice'
              : line
                ? message
                : ''}
      </div>
    </main>
  );
}
