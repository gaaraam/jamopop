'use client';
import { CharacterAvatar } from '@/components/game/character-avatar';

import { AvatarPicker } from '@/components/game/avatar-picker';
import { useEffect, useState, useRef } from 'react';

import { UserRound } from 'lucide-react';
import { NAME_COLORS, AVATAR_FRAMES, AVATARS, avatarLevel } from '@/lib/cosmetics';
type Props = {
  embedded?: boolean;
  onProfile: (name: string, avatar: string) => void;
  onRoom: (room: { id: string; name: string }) => void;
  defaultName: string;
  defaultAvatar: string;
  openRequest?: number;
  onAvatarAccess?: (allowed: string[]) => void;
  onAuthState?: (signedIn: boolean) => void;
};
export function AccountPanel({
  embedded = false,
  onProfile,
  onRoom,
  defaultName,
  defaultAvatar,
  openRequest = 0,
  onAuthState,
  onAvatarAccess,
}: Props) {
  const [section, setSection] = useState<'overview' | 'records' | 'wardrobe' | 'settings'>(
    'overview',
  );
  const [nameColor, setNameColor] = useState('default'),
    [avatarFrame, setAvatarFrame] = useState('none');
  const generation = useRef(0);
  const lastOpenRequest = useRef(openRequest);
  const [open, setOpen] = useState(false),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(''),
    [avatar, setAvatar] = useState('🐱'),
    [returnTo, setReturnTo] = useState('/home'),
    [notice, setNotice] = useState('');
  async function load(offset = 0, append = false) {
    const ticket = ++generation.current;
    setError('');
    try {
      const r = await fetch(`/api/account?offset=${offset}`);
      const d: any = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (ticket !== generation.current) return;
      onAuthState?.(!!d.signedIn);
      onAvatarAccess?.(d.avatarAccess || []);
      setData((old: any) =>
        append ? { ...d, records: [...(old?.records || []), ...d.records] } : d,
      );
      if (!append) {
        setNameColor(d.cosmetics?.nameColor || 'default');
        setAvatarFrame(d.cosmetics?.avatarFrame || 'none');
        setName(d.profile?.name || defaultName);
        setAvatar(d.profile?.avatar || defaultAvatar);
        if (d.profile) onProfile(d.profile.name, d.profile.avatar);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    setReturnTo(location.pathname + location.search);
    void load();
    return () => {
      generation.current++;
    };
  }, []);
  useEffect(() => {
    if (openRequest !== lastOpenRequest.current) {
      lastOpenRequest.current = openRequest;
      window.location.assign('/home');
    }
  }, [openRequest]);
  useEffect(() => {
    if (open) {
      setReturnTo(location.pathname + location.search);
      setNotice('');
      void load();
    }
  }, [open]);
  async function save(action: 'profile' | 'link' | 'cosmetics') {
    generation.current++;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, name, avatar, nameColor, avatarFrame }),
      });
      const d: any = await r.json();
      if (!r.ok) throw new Error(d.error);
      setData(d);
      onAuthState?.(!!d.signedIn);
      onAvatarAccess?.(d.avatarAccess || []);
      if (d.profile) onProfile(d.profile.name, d.profile.avatar);
      setNotice(
        action === 'cosmetics'
          ? '꾸미기를 적용했어요. 참가자 카드에도 반영됩니다.'
          : action === 'link'
            ? '연결할 수 있는 기존 기록을 계정에 연결했어요.'
            : '기본 프로필을 저장했어요.',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!embedded)
    return (
      <a className="account-trigger" href="/home" aria-label="내 집 · 내 정보" title="내 집">
        <UserRound size={18} />
        <span>내 집</span>
      </a>
    );
  return (
    <section className="home-account profile-page">
      <h2 className="sr-only">내 프로필</h2>
      {error && (
        <p className="error" role="alert">
          {error} <button onClick={() => void load()}>다시 불러오기</button>
        </p>
      )}
      {!data && !error ? (
        <p>불러오는 중…</p>
      ) : data?.signedIn ? (
        <>
          <div className="profile-hero">
            <CharacterAvatar avatar={data.profile?.avatar || avatar} skin={data.profile?.skin} />
            <div>
              <h2>{data.profile?.name || name}</h2>
              <span>Lv. {data.progression?.level || 1}</span>
            </div>
            <a href="/shop">꾸미기 상점 ↗</a>
          </div>
          {notice && <p role="status">{notice}</p>}
          <nav className="profile-sections" aria-label="프로필 메뉴">
            {(
              [
                { id: 'overview', name: '요약' },
                { id: 'records', name: '플레이 기록' },
                { id: 'wardrobe', name: '꾸미기' },
                { id: 'settings', name: '계정 설정' },
              ] as const
            ).map((t) => (
              <button key={t.id} aria-pressed={section === t.id} onClick={() => setSection(t.id)}>
                {t.name}
              </button>
            ))}
          </nav>
          <div className="profile-overview" hidden={section !== 'overview'}>
            {data.progression && (
              <section className="account-level" aria-label="내 레벨">
                <div>
                  <strong>Lv. {data.progression.level}</strong>
                  <span>{data.progression.xp.toLocaleString()} XP</span>
                </div>
                <progress
                  aria-label="다음 레벨까지 경험치"
                  value={data.progression.current}
                  max={data.progression.required}
                />
                <p>
                  다음 레벨까지 <b>{data.progression.remaining} XP</b>
                </p>
                {AVATARS.some((a) => avatarLevel(a) > data.progression.level) && (
                  <div className="profile-next-reward">
                    <div>
                      {AVATARS.filter(
                        (a) =>
                          avatarLevel(a) ===
                          Math.min(
                            ...AVATARS.map(avatarLevel).filter((l) => l > data.progression.level),
                          ),
                      )
                        .slice(0, 4)
                        .map((a) => (
                          <CharacterAvatar key={a} avatar={a} />
                        ))}
                    </div>
                    <span>
                      Lv.
                      {Math.min(
                        ...AVATARS.map(avatarLevel).filter((l) => l > data.progression.level),
                      )}
                      에서 만나요
                    </span>
                  </div>
                )}
                <details>
                  <summary>경험치 기준</summary>
                  <small>
                    방 문제 성공 +30 XP · 5회 도전 후 실패 +10 XP
                    <br />
                    스피드전 완주 +90 XP · 미완주 참여 +10 XP
                    <br />
                    연습·기권·중단 제외 · 연결한 기존 기록도 반영
                  </small>
                </details>
              </section>
            )}

            <section className="profile-performance">
              <h3>플레이 요약</h3>
              <div className="account-stats">
                <div>
                  <b>{data.stats.completed}</b>
                  <span>완료한 판</span>
                </div>
                <div>
                  <b>{data.stats.wins}</b>
                  <span>성공</span>
                </div>
                <div>
                  <b>
                    {data.stats.completed
                      ? Math.round((data.stats.wins / data.stats.completed) * 100)
                      : 0}
                    %
                  </b>
                  <span>성공률</span>
                </div>
                <div>
                  <b>{data.stats.average == null ? '—' : Number(data.stats.average).toFixed(1)}</b>
                  <span>평균 시도</span>
                </div>
              </div>
              <small>방 문제 기준 · 기권은 종료 판에 포함 · 연습·중단 판 제외</small>
            </section>
          </div>
          <div hidden={section !== 'records'}>
            {' '}
            <section>
              <h3>참여한 방</h3>
              {data.rooms.length ? (
                data.rooms.map((r: any) => (
                  <button
                    className="my-room"
                    key={r.id}
                    disabled={!!r.blocked}
                    onClick={() => {
                      setOpen(false);
                      onRoom(r);
                    }}
                  >
                    <span>
                      <CharacterAvatar avatar={r.avatar} skin={r.skin} /> {r.name}
                    </span>
                    <small>{r.blocked ? '퇴장한 방' : `${r.nickname} · 입장 →`}</small>
                  </button>
                ))
              ) : (
                <p className="account-empty">아직 연결된 방이 없어요.</p>
              )}
            </section>
            <section>
              <h3>내 풀이 기록</h3>
              {data.records.length ? (
                data.records.map((r: any) => (
                  <details className="my-record" key={r.id}>
                    <summary>
                      <span>
                        {r.roomName} ·{' '}
                        {r.mode === 'speed'
                          ? '스피드전 · 5문제 묶음'
                          : r.mode === 'practice'
                            ? '연습'
                            : `${r.width}칸`}
                      </span>
                      <b>
                        {(
                          {
                            won: '성공',
                            lost: '실패',
                            forfeited: '기권',
                            interrupted: '중단',
                            playing: '풀이 중',
                          } as Record<string, string>
                        )[r.status] || r.status}{' '}
                        · {r.guesses.length}회
                      </b>
                    </summary>
                    <small>{new Date(r.updatedAt).toLocaleString('ko-KR')}</small>
                    {r.answer && <p>정답: {r.answer}</p>}
                    {r.guesses.map((g: any, i: number) => (
                      <div className="account-guess" key={i}>
                        {g.letters.map((l: string, j: number) => (
                          <span className={g.colors[j]} key={j}>
                            {l}
                          </span>
                        ))}
                      </div>
                    ))}
                  </details>
                ))
              ) : (
                <p className="account-empty">아직 제출한 기록이 없어요.</p>
              )}
              {data.nextOffset !== null && (
                <button className="secondary-btn" onClick={() => void load(data.nextOffset, true)}>
                  이전 기록 더 보기
                </button>
              )}
            </section>
          </div>
          <div hidden={section !== 'wardrobe'}>
            {' '}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save('profile');
              }}
              className="account-profile"
            >
              <label>
                기본 닉네임
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={16}
                  required
                />
              </label>
              <fieldset>
                <legend>캐릭터</legend>
                <AvatarPicker
                  value={avatar}
                  onChange={setAvatar}
                  allowed={data.avatarAccess || []}
                />
              </fieldset>
              <small>
                캐릭터는 참여 중인 모든 방에 적용됩니다. 기존 방 닉네임과 기록은 유지됩니다.
              </small>
              <button className="secondary-btn" disabled={busy || !name.trim()}>
                프로필 저장
              </button>
            </form>
            <a className="secondary-btn" href="/shop">
              🪙 콩알 옷장 · 스킨 상점
            </a>
            <section className="cosmetics-panel">
              <h3>레벨 보상 · 꾸미기</h3>
              <div className="cosmetics-preview">
                <span className={`avatar-frame frame-${avatarFrame}`}>
                  <CharacterAvatar avatar={avatar} skin={data.profile?.skin} />
                </span>
                <strong className={`name-color-${nameColor}`}>{name || '내 닉네임'}</strong>
                <small>Lv.{data.progression?.level || 1}</small>
              </div>
              <fieldset>
                <legend>닉네임 색상</legend>
                <div className="cosmetics-options">
                  {NAME_COLORS.map((c) => {
                    const locked = c.level > (data.progression?.level || 1);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={locked || busy}
                        aria-pressed={nameColor === c.id}
                        onClick={() => setNameColor(c.id)}
                        title={locked ? `Lv.${c.level}에 해금` : c.name}
                      >
                        <i style={{ background: c.hex }} />
                        <span>{c.name}</span>
                        <small>
                          {locked ? '🔒 ' : ''}Lv.{c.level}
                        </small>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset>
                <legend>캐릭터 장식</legend>
                <div className="cosmetics-options">
                  {AVATAR_FRAMES.map((f) => {
                    const locked = f.level > (data.progression?.level || 1);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        disabled={locked || busy}
                        aria-pressed={avatarFrame === f.id}
                        onClick={() => setAvatarFrame(f.id)}
                        title={locked ? `Lv.${f.level}에 해금` : f.name}
                      >
                        <b>{f.icon}</b>
                        <span>{f.name}</span>
                        <small>
                          {locked ? '🔒 ' : ''}Lv.{f.level}
                        </small>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <small>레벨을 달성하면 해금됩니다. 장착한 꾸미기는 모든 방에 적용됩니다.</small>
              <button
                className="secondary-btn"
                disabled={busy}
                onClick={() => void save('cosmetics')}
              >
                꾸미기 적용
              </button>
            </section>
          </div>
          <div hidden={section !== 'settings'}>
            {' '}
            <div className="account-identity">
              <b>{data.isAdmin ? '전체 방 관리자' : 'Google 계정 연결됨'}</b>
              <small>{data.email}</small>
              <details className="account-key">
                <summary>문의용 계정 ID</summary>
                <code>{data.accountKey}</code>
              </details>
            </div>{' '}
            {(data.pending > 0 || data.guestSolo?.pending) && (
              <section className="account-link">
                <b>
                  이 브라우저의 게스트 기록 · {data.pending}개 방
                  {data.guestSolo?.pending ? ' · 개인 도전' : ''}
                </b>
                <p>내 계정에 연결하면 다른 기기에서도 이어서 할 수 있어요.</p>
                {data.conflicts > 0 && (
                  <p>
                    같은 방에 계정 기록이 있는 {data.conflicts}개는 합치지 않습니다. 기존 게스트
                    기록은 로그아웃 후 이 브라우저에서 이용할 수 있어요.
                  </p>
                )}
                {data.guestSolo?.conflict && (
                  <p>
                    계정과 게스트 모두 개인 도전 기록이 있어 합치지 않습니다. 로그아웃하면 이
                    브라우저의 게스트 도전을 이어할 수 있어요.
                  </p>
                )}
                <button
                  className="primary"
                  disabled={
                    busy ||
                    !name.trim() ||
                    (data.pending === data.conflicts &&
                      (!data.guestSolo?.pending || data.guestSolo?.conflict))
                  }
                  onClick={() => void save('link')}
                >
                  기존 기록 연결
                </button>
              </section>
            )}{' '}
            <a href="/transfer?manage=1" className="secondary-btn">
              기록 가져오기 · 프로필 관리
            </a>
            <form action="/auth/logout" method="post">
              <button className="text-btn">로그아웃</button>
            </form>
          </div>
        </>
      ) : data ? (
        <div className="account-signin">
          <UserRound size={32} />
          <h3>다른 기기에서도 내 기록 그대로</h3>
          <p>
            Google 계정으로 로그인하면 별도 비밀번호 없이 이용할 수 있어요. 기존 게스트 기록을
            연결하면 레벨에도 반영됩니다.
          </p>
          <a
            className="primary"
            href={`/auth/google/start?return_to=${encodeURIComponent(returnTo)}`}
            target="_top"
          >
            Google로 가입 · 로그인
          </a>
        </div>
      ) : null}
    </section>
  );
}
