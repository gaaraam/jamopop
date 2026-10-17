'use client';
import { useEffect, useState, type RefObject } from 'react';
import { type GameState, splitWord } from '@/lib/game';
import { inputShape, previewKey, appendKey, keyboardJamo } from '@/lib/input';
import { deadlinePassed } from '@/lib/round-timer';
import { createGuessPreview } from '@/lib/guess-preview.mjs';
const knownWord = createGuessPreview(
  async () => {
    const response = await fetch('/dictionaries/allowed-words.json', {
      credentials: 'omit',
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw Error('Dictionary unavailable');
    return response.json();
  },
  (word: string) => splitWord(word).join(''),
);
type InputOptions = {
  data: GameState | null;
  draft: string;
  composing: boolean;
  connection: boolean;
  help: boolean;
  settings: boolean;
  dataRef: RefObject<GameState | null>;
  modeRef: RefObject<string>;
  draftRef: RefObject<string>;
  busyRef: RefObject<boolean>;
  composingRef: RefObject<boolean>;
  compositionEnded: RefObject<number>;
  offset: RefObject<number>;
  act: (action: string, extra?: any) => Promise<any>;
  refresh: () => Promise<void>;
  updateDraft: (value: string) => void;
  press: (key: string) => void;
  rejectInput: () => void;
  ping: (kind?: 'type' | 'submit' | 'win') => void;
};
export function useWordInput({
  data,
  draft,
  composing,
  connection,
  help,
  settings,
  dataRef,
  modeRef,
  draftRef,
  busyRef,
  composingRef,
  compositionEnded,
  offset,
  act,
  refresh,
  updateDraft,
  press,
  rejectInput,
  ping,
}: InputOptions) {
  const [pendingSubmission, setPendingSubmission] = useState<{
    roundId: string;
    row: number;
  } | null>(null);
  const [preview, setPreview] = useState<{
    key: string;
    status: 'valid' | 'invalid' | 'error';
  } | null>(null);
  async function submit(value = draftRef.current) {
    const d = dataRef.current;
    if (
      !d ||
      !connection ||
      busyRef.current ||
      composingRef.current ||
      Date.now() - compositionEnded.current < 80 ||
      d.play.status !== 'playing' ||
      d.round.mode !== modeRef.current ||
      d.round.phase !== 'running' ||
      deadlinePassed(d.round.endsAt, Date.now() + offset.current)
    )
      return null;
    const shape = inputShape(value, d.round.width);
    if (!shape.valid) {
      rejectInput();
      return null;
    }
    const key = previewKey(d.round.id, value);
    if (d.round.dictionaryVersion === 1 && preview?.key === key && preview.status === 'invalid') {
      rejectInput();
      return null;
    }
    setPendingSubmission({ roundId: d.round.id, row: d.play.guesses.length });
    ping('submit');
    try {
      const r = await act('guess', {
        fast: true,
        mode: modeRef.current,
        roundId: d.round.id,
        word: value,
        expected: d.play.guesses.length,
      });
      if (r) {
        updateDraft('');
      } else {
        rejectInput();
        void refresh();
      }
      return r;
    } finally {
      setPendingSubmission(null);
    }
  }
  function typeKey(key: string) {
    const d = dataRef.current;
    if (
      !d ||
      busyRef.current ||
      composingRef.current ||
      d.play.status !== 'playing' ||
      d.round.mode !== modeRef.current ||
      d.round.phase !== 'running' ||
      Date.now() + offset.current < d.round.startsAt ||
      deadlinePassed(d.round.endsAt, Date.now() + offset.current)
    )
      return;
    if (key === 'Enter') {
      void submit();
      return;
    }
    const next =
      key === 'Backspace'
        ? splitWord(draftRef.current).slice(0, -1).join('')
        : appendKey(draftRef.current, key, d.round.width);
    if (next === draftRef.current) {
      if (key !== 'Backspace') rejectInput();
      return;
    }
    updateDraft(next);
    press(key);
  }
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target?.closest(
          'input,textarea,select,[contenteditable="true"],[role="dialog"],[role="alertdialog"]',
        ) ||
        document.querySelector('[role="dialog"],[role="alertdialog"]') ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.isComposing ||
        e.keyCode === 229 ||
        help ||
        settings
      )
        return;
      if (
        e.key === 'Enter' &&
        (e.repeat || target?.closest('button,[role="tab"],[role="combobox"]'))
      )
        return;
      const key = keyboardJamo(e.key, e.shiftKey);
      if (key) {
        e.preventDefault();
        typeKey(key);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  });
  useEffect(() => {
    if (data?.round.dictionaryVersion === 1) void knownWord.warm();
  }, [data?.round.dictionaryVersion]);
  useEffect(() => {
    const d = data;
    if (
      !d ||
      composing ||
      d.play.status !== 'playing' ||
      d.round.dictionaryVersion !== 1 ||
      !inputShape(draft, d.round.width).valid
    )
      return;
    const key = previewKey(d.round.id, draft);
    if (knownWord.peek(draft)) {
      setPreview({ key, status: 'valid' });
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setPreview({ key, status: 'error' });
      controller.abort();
    }, 5000);
    const timer = setTimeout(async () => {
      try {
        if (await knownWord(draft)) {
          if (!controller.signal.aborted) setPreview({ key, status: 'valid' });
          return;
        }
        if (controller.signal.aborted) return;
        const response = await fetch('/api/game', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'check_word',
            room: d.room.id,
            mode: d.round.mode,
            roundId: d.round.id,
            word: draft,
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('check failed');
        const result: any = await response.json();
        if (
          !controller.signal.aborted &&
          result.roundId === d.round.id &&
          result.word === splitWord(draft).join('')
        )
          setPreview({ key, status: result.valid ? 'valid' : 'invalid' });
      } catch {
        if (!controller.signal.aborted) setPreview({ key, status: 'error' });
      } finally {
        clearTimeout(timeout);
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      clearTimeout(timeout);
      controller.abort();
    };
  }, [draft, composing, data?.round.id, data?.round.dictionaryVersion, data?.play.status]);
  return { submit, typeKey, preview, pendingSubmission };
}
