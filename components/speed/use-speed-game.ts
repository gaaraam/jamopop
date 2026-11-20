import { useGameMeasurement } from '@/components/metrics/game';
import { writeDraft } from '@/lib/recovery.mjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { splitWord, type Color } from '@/lib/game';
import { appendKey, inputShape, keyboardJamo } from '@/lib/input';
import { activeChatBubbles, type BubbleMessage } from '@/lib/chat-bubbles';
import { useSpeedSync } from './use-speed-sync';
export function useSpeedGame() {
  const [theme, setTheme] = useState('food');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');
  const [pressed, setPressed] = useState('');
  const [shake, setShake] = useState(0);
  const [isComposing, setIsComposing] = useState(false);
  const [reveal, setReveal] = useState<{ roundId: string; row: number } | null>(null);
  const [sound, setSound] = useState(false);
  const [help, setHelp] = useState(false);
  const [settings, setSettings] = useState(false);
  const [settingsData, setSettingsData] = useState<any>(null);
  const [profileTarget, setProfileTarget] = useState<{ id: string; name: string } | null>(null);
  const [messages, setMessages] = useState<BubbleMessage[]>([]);
  const [chatOpenRequest, setChatOpenRequest] = useState(0);
  const [cheerCooling, setCheerCooling] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    cheerTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    audio = useRef<AudioContext | null>(null);
  const receiveChat = useCallback((_room: string, m: BubbleMessage[], serverNow: number) => {
    setMessages(m);
    offset.current = serverNow - Date.now();
  }, []);
  useEffect(() => {
    setSound(localStorage.getItem('bw_sound') === '1');
    return () => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
      if (cheerTimer.current) clearTimeout(cheerTimer.current);
      void audio.current?.close();
    };
  }, []);
  function ping() {
    if (!sound) return;
    try {
      const a = audio.current ?? (audio.current = new AudioContext());
      void a.resume();
      const o = a.createOscillator(),
        g = a.createGain();
      o.connect(g);
      g.connect(a.destination);
      o.frequency.setValueAtTime(520, a.currentTime);
      o.frequency.exponentialRampToValueAtTime(320, a.currentTime + 0.045);
      g.gain.setValueAtTime(0.025, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.045);
      o.start();
      o.stop(a.currentTime + 0.045);
      o.onended = () => {
        o.disconnect();
        g.disconnect();
      };
    } catch {}
  }
  function press(k: string) {
    setPressed(k);
    ping();
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => setPressed(''), 120);
  }
  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(
        location.origin + '/?r=' + (data?.room.inviteKey || room),
      );
      setFlash('초대 링크 복사됨');
    } catch {
      setError('주소창의 방 링크를 복사해 주세요.');
    }
  }
  async function openSettings() {
    try {
      const r = await fetch('/api/game?room=' + room);
      const d: any = await r.json();
      if (!r.ok) throw Error(d.error);
      setSettingsData(d);
      setSettings(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function settingsAct(action: string, extra: any = {}) {
    try {
      const r = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, room, mode: 'daily', ...extra }),
      });
      const d: any = await r.json();
      if (!r.ok) throw Error(d.error);
      if (d.room && d.roster) setSettingsData(d);
      void refresh();
      return d;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }
  async function cheer(emoji: string) {
    if (cheerCooling) return;
    setCheerCooling(true);
    await settingsAct('react', { emoji });
    cheerTimer.current = setTimeout(() => setCheerCooling(false), 2000);
  }
  const {
    room,
    data,
    draft,
    setDraft,
    error,
    setError,
    clock,
    connected,
    setConnected,
    lock,
    epoch,
    offset,
    composing,
    compositionEnd,
    input,
    drafts,
    currentKey,
    latest,
    accept,
    refresh,
  } = useSpeedSync();
  const bubbles = activeChatBubbles(messages, clock);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(''), 1500);
    return () => clearTimeout(t);
  }, [flash]);
  function update(value: string) {
    drafts.current[currentKey.current] = value;
    setDraft(value);
    const d = latest.current;
    if (d?.round)
      writeDraft(
        localStorage,
        currentKey.current,
        d.play.puzzles[d.play.current].guesses.length,
        value,
      );
  }
  async function switchMode(variant: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const r = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset',
          room,
          mode: 'daily',
          roundId: data.room.normalRoundId,
          variant,
          width: 5,
        }),
      });
      const d: any = await r.json();
      if (!r.ok) throw Error(d.error);
      location.assign('/?r=' + room);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (lock.current) return;
    lock.current = true;
    epoch.current++;
    setBusy(true);
    setError('');
    const old = latest.current,
      oldKey = currentKey.current;
    try {
      const r = await fetch('/api/speed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            room,
            roundId: old?.round?.id,
            revision: old?.play?.revision,
            ...extra,
          }),
          signal: AbortSignal.timeout(10000),
        }),
        d: any = await r.json();
      if (!r.ok) throw Error(d.error);
      if (action === 'guess') {
        setReveal({
          roundId: old.round.id + ':' + old.play.current,
          row: old.play.puzzles[old.play.current].guesses.length,
        });
        drafts.current[oldKey] = '';
        writeDraft(localStorage, oldKey, 0, '');
        setDraft('');
        const solved = d.play.puzzles.filter((p: any) => p.status === 'won').length,
          previous = old.play.puzzles.filter((p: any) => p.status === 'won').length;
        if (solved > previous) setFlash(solved === 5 ? '5문제 완주!' : `정답! ${solved} / 5`);
      }
      accept(d);
    } catch (e) {
      if (e instanceof TypeError || ['TimeoutError', 'AbortError'].includes((e as Error).name))
        setConnected(false);
      setError((e as Error).message);
      setShake((n) => n + 1);
    } finally {
      lock.current = false;
      setBusy(false);
      if (action !== 'start') input.current?.focus();
      void refresh();
    }
  }
  const round = data?.round,
    play = data?.play,
    puzzle = play?.puzzles[play.current],
    width = round?.widths[play.current] || 5,
    letters = splitWord(draft),
    countdown = round ? Math.max(0, Math.ceil((round.startsAt - clock) / 1000)) : 0,
    remaining = round
      ? Math.max(0, Math.ceil((round.endsAt - Math.max(clock, round.startsAt)) / 1000))
      : 180,
    ended = !!round && clock >= round.endsAt,
    stopped =
      !round ||
      !data?.room.active ||
      countdown > 0 ||
      ended ||
      play?.finished ||
      data?.me.spectator;
  useEffect(() => {
    if (!stopped) input.current?.focus();
  }, [round?.id, play?.current, stopped]);
  function submit() {
    if (
      stopped ||
      !connected ||
      lock.current ||
      composing.current ||
      Date.now() - compositionEnd.current < 80 ||
      !inputShape(draft, width).valid
    )
      return;
    void act('guess', { word: draft });
  }
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement)?.closest(
          'input,textarea,select,button,[contenteditable="true"],[role="dialog"]',
        ) ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        e.isComposing ||
        e.keyCode === 229 ||
        stopped ||
        lock.current
      )
        return;
      const key = keyboardJamo(e.key, e.shiftKey);
      if (!key) return;
      e.preventDefault();
      if (key === 'Enter') {
        if (!e.repeat) submit();
      } else if (key === 'Backspace') update(splitWord(draft).slice(0, -1).join(''));
      else {
        update(appendKey(draft, key, width));
        press(key);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  });
  function typeKey(k: string) {
    if (stopped || lock.current || composing.current) return;
    update(k === 'Backspace' ? splitWord(draft).slice(0, -1).join('') : appendKey(draft, k, width));
    press(k);
    input.current?.focus();
  }
  useGameMeasurement(
    'speed',
    round && !data?.me.spectator ? round.id : null,
    play?.puzzles.reduce((sum: number, p: any) => sum + p.guesses.length, 0) || 0,
    play?.finished
      ? play?.puzzles.every((p: any) => p.status === 'won')
        ? 'won'
        : 'lost'
      : ended
        ? 'timeout'
        : 'playing',
  );
  const keyColors: Record<string, Color> = {};
  for (const g of puzzle?.guesses || [])
    g.letters.forEach((l: string, i: number) => {
      const c = g.colors[i] as Color;
      if (
        !keyColors[l] ||
        { gray: 0, yellow: 1, green: 2 }[c] > { gray: 0, yellow: 1, green: 2 }[keyColors[l]]
      )
        keyColors[l] = c;
    });
  const selectedTheme = data?.themes.find((t: any) => t.id === round?.theme);
  return {
    theme,
    setTheme,
    busy,
    flash,
    pressed,
    shake,
    isComposing,
    setIsComposing,
    reveal,
    sound,
    setSound,
    help,
    setHelp,
    settings,
    setSettings,
    settingsData,
    profileTarget,
    setProfileTarget,
    chatOpenRequest,
    setChatOpenRequest,
    cheerCooling,
    receiveChat,
    bubbles,
    press,
    copyInvite,
    openSettings,
    settingsAct,
    cheer,
    room,
    data,
    draft,
    error,
    connected,
    lock,
    composing,
    compositionEnd,
    input,
    refresh,
    update,
    switchMode,
    width,
    act,
    round,
    play,
    puzzle,
    letters,
    countdown,
    remaining,
    ended,
    stopped,
    submit,
    typeKey,
    keyColors,
    selectedTheme,
  };
}
export type SpeedGame = ReturnType<typeof useSpeedGame>;
