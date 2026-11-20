'use client';
import { NotificationSlot } from '@/components/game/notification-slot';
import { clearActiveRoom } from '@/lib/active-room.mjs';
import { ThemeSwitch } from '@/components/theme';
import { PlayerProfile } from '@/components/game/player-profile';
import { AccountPanel } from '@/components/game/account-panel';
import { RoomSettings } from '@/components/game/panels';
import { Rules } from '@/components/game/rules';
import { Toaster } from 'sonner';
import { Users, Copy, Settings, HelpCircle, LogOut, Volume2, VolumeX } from 'lucide-react';
import '../party.css';
import '../game-fx.css';
import './speed.css';

import { useSpeedGame } from '@/components/speed/use-speed-game';
import { SpeedRound } from '@/components/speed/speed-round';
import { SpeedParticipants } from '@/components/speed/speed-participants';
export default function Speed() {
  const game = useSpeedGame();
  const {
    busy,
    flash,
    sound,
    setSound,
    help,
    setHelp,
    settings,
    setSettings,
    settingsData,
    profileTarget,
    setProfileTarget,
    copyInvite,
    openSettings,
    settingsAct,
    room,
    data,
    error,
    refresh,
    width,
    act,
  } = game;
  return (
    <div className="app refined glass speed-room">
      <Toaster position="top-center" richColors />
      <header className="app-header polished-nav">
        <div className="nav-identity">
          <span className="nav-divider" />
          <button
            className="nav-room"
            onClick={() => {
              clearActiveRoom(sessionStorage);
              location.assign('/?lobby=1');
            }}
            aria-label="방 목록 열기"
          >
            <span className="nav-room-icon">
              <Users size={17} />
            </span>
            <span>
              <small>현재 방</small>
              <strong>{data?.room.name || '게임방'}</strong>
            </span>
            <span className="nav-chevron">⌄</span>
          </button>
        </div>
        <div className="nav-actions">
          <NotificationSlot />
          <ThemeSwitch />
          <AccountPanel
            defaultName={data?.roster.find((m: any) => m.id === data.me.id)?.name || ''}
            defaultAvatar={data?.roster.find((m: any) => m.id === data.me.id)?.avatar || '🐱'}
            onProfile={() => {}}
            onRoom={(r) => location.assign('/?r=' + r.id)}
          />
          <button
            className="nav-invite"
            onClick={() => void copyInvite()}
            aria-label="초대 링크 복사"
          >
            <Copy size={18} />
            <span>초대하기</span>
          </button>
          <div className="nav-tools">
            <button aria-label="방 설정" onClick={() => void openSettings()}>
              <Settings size={19} />
            </button>
            <button aria-label="게임 방법" onClick={() => setHelp(true)}>
              <HelpCircle size={19} />
            </button>
            <button
              aria-label={sound ? '소리 끄기' : '소리 켜기'}
              onClick={() => {
                setSound(!sound);
                localStorage.setItem('bw_sound', sound ? '0' : '1');
              }}
            >
              {sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
            </button>
          </div>
          <button
            className="nav-exit"
            aria-label="방 목록으로 나가기"
            onClick={() => {
              clearActiveRoom(sessionStorage);
              location.assign('/?lobby=1');
            }}
          >
            <LogOut size={19} />
          </button>
        </div>
      </header>
      <Rules mode="speed" open={help} onOpenChange={setHelp} />
      {settingsData && (
        <RoomSettings
          data={settingsData}
          open={settings}
          onOpenChange={setSettings}
          busy={busy}
          act={settingsAct}
          onCopy={copyInvite}
        />
      )}
      <PlayerProfile
        roomId={room}
        meId={data?.me.id}
        target={profileTarget}
        onClose={() => setProfileTarget(null)}
      />
      {error && (
        <div className="connection-error" role="alert">
          {error}
          <button onClick={() => void refresh()}>다시 확인</button>
        </div>
      )}
      {!data ? (
        <p className="speed-empty">방을 불러오는 중…</p>
      ) : (
        <>
          <div className="sheet-ribbon" aria-hidden="true">
            <span>파일</span>
            <b>홈</b>
            <span>삽입</span>
            <span>페이지 레이아웃</span>
            <span>수식</span>
            <span>데이터</span>
            <span>보기</span>
          </div>
          <div className="sheet-axis" aria-hidden="true">
            <i />
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i}>{String.fromCharCode(65 + i)}</span>
            ))}
          </div>
          <div className="sheet-gutter" aria-hidden="true">
            {Array.from({ length: 60 }, (_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
          <main className="game-layout" style={{ '--sheet-end': width + 1 } as React.CSSProperties}>
            <SpeedRound {...game} />
            <SpeedParticipants {...game} />
          </main>
        </>
      )}
      {flash && (
        <div className="speed-flash" role="status">
          {flash}
        </div>
      )}
    </div>
  );
}
