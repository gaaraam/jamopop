'use client';
import { AsyncStatus } from '@/components/ui/async-status';
import { useEffect, useState, useRef } from 'react';
import { CharacterAvatar } from '@/components/game/character-avatar';
import { AccountPanel } from '@/components/game/account-panel';
import { FurnitureArt } from '@/components/game/furniture-art';
import { DEFAULT_HOME, FURNITURE, type Placement } from '@/lib/furniture';
import './home.css';
import './home-world.css';
import { HomeExplorer } from '@/components/home/home-explorer';
import { HomeWardrobe } from '@/components/home/home-wardrobe';
import { useCommunityAccess } from '@/components/community-access';
import { HomeNeighborhood } from '@/components/home/home-neighborhood';
import { ServiceHeader } from '@/components/game/service-header';
import { HomeResident } from '@/components/game/home-resident';
import {
  Shirt,
  DoorOpen,
  Heart,
  Cookie,
  Sparkles,
  Footprints,
  Star,
  ArrowLeft,
  Gift,
  Users,
  Armchair,
  UserRound,
  X,
  Check,
} from 'lucide-react';
import { CARE_REWARDS, careDay, bondProgress } from '@/lib/home-life';
type Life = {
  day: string;
  care: { points: number; done: string[]; next: { name: string; points: number } | null };
  friends: { id: string; name: string; avatar: string; skin?: string }[];
  visits: { name: string; avatar: string; skin?: string; stamp: string; createdAt: number }[];
  visiting: null | {
    layout: Placement[];
    profile: { name: string; avatar: string; skin?: string };
    stamp: string | null;
  };
};
type HomeState = {
  layout: Placement[];
  revision: number;
  owned: string[];
  profile: { name: string; avatar: string; skin?: string } | null;
};
export default function Home() {
  const community = useCommunityAccess();
  const [outside, setOutside] = useState(false);
  const [wardrobe, setWardrobe] = useState(false);
  const [data, setData] = useState<HomeState | null>(null),
    [layout, setLayout] = useState<Placement[]>(DEFAULT_HOME),
    [tab, setTab] = useState<'house' | 'profile'>('house'),
    [selected, setSelected] = useState(''),
    [editing, setEditing] = useState(false),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [guest, setGuest] = useState(false),
    [loading, setLoading] = useState(true);
  const loadLock = useRef(false),
    saveLock = useRef(false);
  const [panel, setPanel] = useState<'friends' | 'gifts' | null>(null),
    [effect, setEffect] = useState('pet');
  const [life, setLife] = useState<Life | null>(null),
    [friend, setFriend] = useState(''),
    [lifeError, setLifeError] = useState(''),
    [careBusy, setCareBusy] = useState(false),
    [reaction, setReaction] = useState(0),
    [careMessage, setCareMessage] = useState(''),
    [careGain, setCareGain] = useState(0);
  useEffect(() => {
    if (!careMessage) return;
    const timer = setTimeout(() => setCareMessage(''), 3200);
    return () => clearTimeout(timer);
  }, [careMessage, reaction]);
  const lifeLock = useRef(false),
    lifeVersion = useRef(0);
  async function loadLife(target = '') {
    const version = ++lifeVersion.current;
    setLifeError('');
    try {
      const r = await fetch(
        '/api/home/life' + (target ? '?friend=' + encodeURIComponent(target) : ''),
        { signal: AbortSignal.timeout(10000) },
      );
      if (r.status === 401) return;
      const d = (await r.json()) as Life & { error?: string };
      if (!r.ok) throw Error(d.error);
      if (version === lifeVersion.current) setLife(d);
    } catch (e) {
      if (version === lifeVersion.current) setLifeError((e as Error).message);
    }
  }
  useEffect(() => {
    void loadLife(friend);
    return () => {
      lifeVersion.current++;
    };
  }, [friend]);
  function reactToCare(action: string, gain: number) {
    setEffect(action);
    setCareGain(gain);
    setCareMessage(
      action === 'snack'
        ? '냠냠, 맛있다!'
        : action === 'play'
          ? '한 번 더 놀자!'
          : action === 'visit'
            ? '인사 남기고 왔어!'
            : '헤헤, 좋아!',
    );
    setReaction((n) => n + 1);
  }
  async function care(action: string, stamp?: string) {
    if (lifeLock.current || !life || editing) return;
    if (action !== 'visit' && life.day === careDay() && life.care.done.includes(action)) {
      reactToCare(action, 0);
      return;
    }
    lifeLock.current = true;
    setCareBusy(true);
    setLifeError('');
    const version = lifeVersion.current;
    try {
      const r = await fetch('/api/home/life', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(friend ? { friend, stamp } : {}) }),
        signal: AbortSignal.timeout(10000),
      });
      const d = (await r.json()) as Life & { error?: string };
      if (!r.ok) throw Error(d.error);
      if (version === lifeVersion.current) {
        setLife(d);
        reactToCare(action, Math.max(0, d.care.points - life.care.points));
      }
    } catch (e) {
      if (version === lifeVersion.current) setLifeError((e as Error).message);
    } finally {
      lifeLock.current = false;
      setCareBusy(false);
    }
  }
  function visit(id: string) {
    if (dirty && !window.confirm('저장하지 않은 배치를 버리고 방문할까요?')) return;
    setOutside(false);
    setPanel(null);
    setCareMessage('');
    setEditing(false);
    setDirty(false);
    setSelected('');
    if (data) setLayout(data.layout);
    setLife(null);
    setFriend(id);
  }
  async function load() {
    if (loadLock.current) return;
    loadLock.current = true;
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/home', { signal: AbortSignal.timeout(10000) });
      if (r.status === 401) {
        setGuest(true);
        return;
      }
      const d = (await r.json()) as HomeState & { error?: string };
      if (!r.ok) throw Error(d.error || '처리하지 못했어요.');
      setGuest(false);
      setData(d);
      setLayout(d.layout);
      setDirty(false);
      setSelected('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      loadLock.current = false;
      setLoading(false);
    }
  }
  useEffect(() => {
    if (new URLSearchParams(location.search).get('tab') === 'profile') setTab('profile');
    void load();
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function change(next: Placement[]) {
    setLayout(next);
    setDirty(true);
    setNotice('');
  }
  function place(x: number, y: number) {
    if (!selected || !editing || busy) return;
    const next = {
      id: selected,
      x: Math.round(Math.max(18, Math.min(82, x))),
      y: Math.round(Math.max(48, Math.min(86, y))),
      flipped: layout.find((p) => p.id === selected)?.flipped || false,
    };
    change([...layout.filter((p) => p.id !== selected), next]);
  }
  async function save() {
    if (!data || saveLock.current || loadLock.current) return;
    if (!dirty) {
      setEditing(false);
      setSelected('');
      return;
    }
    saveLock.current = true;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/home', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout, revision: data.revision }),
        signal: AbortSignal.timeout(10000),
      });
      const d = (await r.json()) as HomeState & { error?: string };
      if (!r.ok) throw Error(d.error || '처리하지 못했어요.');
      setData(d);
      setDirty(false);
      setEditing(false);
      setSelected('');
      setNotice('집을 저장했어요.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saveLock.current = false;
      setBusy(false);
    }
  }
  const visiting = life?.visiting;
  const displayLayout = friend ? visiting?.layout || [] : layout;
  const resident = visiting?.profile || data?.profile;
  const current = layout.find((p) => p.id === selected);
  const bond = bondProgress(life?.care.points || 0);
  const todayDone = life?.day === careDay() ? life.care.done : [];
  return (
    <main className="kongal-home">
      <ServiceHeader
        active="home"
        title={
          tab === 'profile'
            ? '내 프로필'
            : outside
              ? '이웃 골목'
              : friend && visiting
                ? `${visiting.profile.name}의 집`
                : '내 집'
        }
      >
        <button
          className="profile-toggle"
          aria-label={tab === 'house' ? '프로필' : '집으로'}
          onClick={() => setTab(tab === 'house' ? 'profile' : 'house')}
        >
          <UserRound size={17} />
          <span>{tab === 'house' ? '프로필' : '집으로'}</span>
        </button>
      </ServiceHeader>
      {tab === 'house' && !data && !guest && (
        <AsyncStatus
          label="내 집을 불러오고 있어요"
          error={error}
          retrying={loading}
          onRetry={() => void load()}
        />
      )}
      {wardrobe && (
        <HomeWardrobe onClose={() => setWardrobe(false)} onChanged={() => void load()} />
      )}
      {outside && !life && (
        <AsyncStatus
          label="이웃을 불러오고 있어요"
          error={lifeError}
          onRetry={() => void loadLife(friend)}
        />
      )}
      {outside && tab === 'house' && data?.profile && life && (
        <HomeNeighborhood
          profile={data.profile}
          friends={life?.friends || []}
          onVisit={visit}
          onHome={() => {
            setOutside(false);
            if (friend) visit('');
          }}
        />
      )}
      <div hidden={tab !== 'house' || outside || (!data && !guest)} className="house-game">
        <div className="house-shell" hidden={outside}>
          <div
            className={`home-scene ${editing ? 'is-editing' : ''}`}
            role="group"
            tabIndex={0}
            aria-label={
              editing
                ? '가구 선택 후 빈 자리를 눌러 배치'
                : '콩알이의 집. 바닥을 누르거나 방향키로 이동'
            }
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('button')) return;
              const r = e.currentTarget.getBoundingClientRect();
              place(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
            }}
          >
            <div className="home-wall" />
            <div className="room-light" />
            <div className="room-hud">
              <span className="resident-plaque">
                {resident?.name || '콩알이'}
                {friend ? '의 집' : ''}
              </span>
              {life && (
                <button
                  className="bond-pill"
                  onClick={() => setPanel(panel === 'gifts' ? null : 'gifts')}
                  aria-label={`콩알 친밀도 ${life.care.points}, 보상 보기`}
                  aria-expanded={panel === 'gifts'}
                >
                  <Heart size={17} fill="currentColor" />
                  <span className="bond-label">
                    콩알 친밀도<b>{life.care.points}</b>
                  </span>
                  <span className="bond-meter">
                    <i
                      style={{
                        width: `${bond.percent}%`,
                      }}
                    />
                  </span>
                  <Gift size={16} />
                </button>
              )}
            </div>
            <div className="home-floor" />
            {editing && <div className="home-placement-grid" aria-hidden="true" />}
            {editing && (
              <p className="home-edit-hint">
                {selected ? '바닥을 눌러 옮기기' : '아래에서 가구 선택'}
              </p>
            )}
            <div className="home-window">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="home-picture">
              <span>✦</span>
            </div>
            <div className="home-baseboard" />
            {displayLayout
              .slice()
              .sort((a, b) => (a.id === 'home-rug' ? -1 : b.id === 'home-rug' ? 1 : a.y - b.y))
              .map((p) => {
                const f = FURNITURE.find((f) => f.id === p.id)!;
                return (
                  <button
                    key={p.id}
                    className={`placed-furniture ${selected === p.id && editing ? 'selected' : ''}`}
                    disabled={!editing || busy}
                    aria-label={`${f.name} 선택`}
                    onClick={() => setSelected(p.id)}
                    style={{
                      left: `${p.x}%`,
                      top: `${p.y}%`,
                      width: `${f.width}%`,
                      zIndex: p.id === 'home-rug' ? 2 : Math.round(p.y),
                      transform: `translate(-50%,-100%) scaleX(${p.flipped ? -1 : 1})`,
                    }}
                  >
                    <FurnitureArt id={p.id} />
                  </button>
                );
              })}
            {visiting && (
              <HomeResident
                furniture={displayLayout}
                avatar={resident?.avatar || '🐱'}
                skin={resident?.skin}
                name={resident?.name || '콩알이'}
                paused={editing || outside || tab !== 'house'}
                reaction={reaction}
              />
            )}
            {data?.profile && (!friend || visiting) && (
              <HomeExplorer
                key={friend || 'self'}
                furniture={displayLayout}
                avatar={data.profile.avatar}
                skin={data.profile.skin}
                name={data.profile.name}
                paused={editing || tab !== 'house' || outside || wardrobe || !!panel}
                message={careMessage}
                onPet={() => !friend && void care('pet')}
                onExit={() => {
                  setPanel(null);
                  if (community) setOutside(true);
                }}
                onWardrobe={!friend ? () => setWardrobe(true) : undefined}
              />
            )}
          </div>
          {data && (
            <div className="house-dock" aria-label="집에서 하기">
              {friend ? (
                <>
                  <button className="dock-tool" disabled={careBusy} onClick={() => visit('')}>
                    <span>
                      <ArrowLeft />
                    </span>
                    <strong>내 집</strong>
                  </button>
                  {[
                    { id: 'heart', name: '하트', Icon: Heart },
                    { id: 'paw', name: '발도장', Icon: Footprints },
                    { id: 'star', name: '별', Icon: Star },
                  ].map(({ id, name, Icon }) => (
                    <button
                      className="dock-tool"
                      key={id}
                      disabled={careBusy || !!visiting?.stamp || !visiting}
                      onClick={() => void care('visit', id)}
                    >
                      <span>
                        <Icon />
                      </span>
                      <strong>{name}</strong>
                    </button>
                  ))}
                </>
              ) : (
                <>
                  {[
                    { id: 'pet', name: '쓰담쓰담', Icon: Heart },
                    { id: 'snack', name: '간식', Icon: Cookie },
                    { id: 'play', name: '놀기', Icon: Sparkles },
                  ].map(({ id, name, Icon }) => (
                    <button
                      className={`dock-tool tool-${id} ${todayDone.includes(id) ? 'is-done' : ''}`}
                      aria-label={`${name}${todayDone.includes(id) ? ' · 오늘 돌봄 완료' : ' · 친밀도 1'}`}
                      key={id}
                      disabled={careBusy || editing || !life}
                      onClick={() => void care(id)}
                    >
                      <span>
                        <Icon />
                        {todayDone.includes(id) && (
                          <i>
                            <Check size={10} />
                          </i>
                        )}
                      </span>
                      <strong>{name}</strong>
                    </button>
                  ))}
                  <button
                    className="dock-tool"
                    disabled={editing || busy}
                    onClick={() => setWardrobe(true)}
                  >
                    <span>
                      <Shirt />
                    </span>
                    <strong>옷장</strong>
                  </button>
                  <em />
                  <button
                    className="dock-tool"
                    disabled={busy}
                    aria-pressed={editing}
                    onClick={() => {
                      setPanel(null);
                      if (editing) void save();
                      else setEditing(true);
                    }}
                  >
                    <span>
                      <Armchair />
                    </span>
                    <strong>
                      {busy ? '저장 중' : editing ? (dirty ? '저장' : '완료') : '꾸미기'}
                    </strong>
                  </button>
                </>
              )}
              <button
                className="dock-tool"
                disabled={busy || editing || !community}
                title={!community ? '관리자 승인 후 이용할 수 있어요' : undefined}
                onClick={() => {
                  setPanel(null);
                  if (community) setOutside(true);
                }}
              >
                <span>
                  <DoorOpen />
                </span>
                <strong>골목</strong>
              </button>
              <button
                className="dock-tool"
                disabled={busy || editing || !community}
                title={!community ? '관리자 승인 후 이용할 수 있어요' : undefined}
                aria-expanded={panel === 'friends'}
                onClick={() => community && setPanel(panel === 'friends' ? null : 'friends')}
              >
                <span>
                  <Users />
                </span>
                <strong>친구</strong>
              </button>
            </div>
          )}
          {panel && life && (
            <section
              className="house-drawer"
              aria-label={panel === 'friends' ? '친구 집과 방문 인사' : '콩알 친밀도 선물'}
            >
              <header>
                <h2>{panel === 'friends' ? '친구들' : '콩알 친밀도'}</h2>
                <button aria-label="닫기" onClick={() => setPanel(null)}>
                  <X size={18} />
                </button>
              </header>
              {panel === 'friends' ? (
                <>
                  <div className="home-friends">
                    {life.friends.length ? (
                      life.friends.map((f) => (
                        <button
                          key={f.id}
                          disabled={careBusy || friend === f.id}
                          onClick={() => visit(f.id)}
                        >
                          <CharacterAvatar avatar={f.avatar} skin={f.skin} />
                          <span>{f.name}</span>
                          <small>놀러 가기</small>
                        </button>
                      ))
                    ) : (
                      <p>게임방에서 친구를 맺고 놀러 가요.</p>
                    )}
                  </div>
                  <h3>다녀간 친구</h3>
                  <div className="home-guestbook">
                    {life.visits.length ? (
                      life.visits.map((v, i) => (
                        <article key={i}>
                          <CharacterAvatar avatar={v.avatar} skin={v.skin} />
                          <strong>{v.name}</strong>
                          {v.stamp === 'heart' ? (
                            <Heart size={16} />
                          ) : v.stamp === 'paw' ? (
                            <Footprints size={16} />
                          ) : (
                            <Star size={16} />
                          )}
                          <time>
                            {new Date(v.createdAt).toLocaleDateString('ko-KR', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </time>
                        </article>
                      ))
                    ) : (
                      <p>아직 다녀간 친구가 없어요.</p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="bond-summary">
                    <Heart size={20} fill="currentColor" />
                    <strong>{life.care.points}</strong>
                    <span>{bond.next ? `다음 선물까지 ${bond.remaining}` : '모든 선물 획득!'}</span>
                  </div>
                  <div className="house-gifts">
                    {CARE_REWARDS.map((r) => (
                      <a
                        href="/shop"
                        key={r.id}
                        className={life.care.points >= r.points ? 'earned' : ''}
                      >
                        <CharacterAvatar
                          avatar={
                            r.id.includes('rabbit') ? '🐰' : r.id.includes('cat') ? '🐱' : '🐻'
                          }
                          skin={r.id}
                        />
                        <strong>{r.name}</strong>
                        <progress
                          aria-label={`${r.name} 해금 진행`}
                          value={Math.min(life.care.points, r.points)}
                          max={r.points}
                        />
                        <small>
                          {life.care.points >= r.points
                            ? '획득 · 장착하기'
                            : `${life.care.points} / ${r.points}`}
                        </small>
                      </a>
                    ))}
                  </div>
                  <p>돌봄마다 하루 1, 친구 방문 1. 쉬어도 줄지 않아요.</p>
                </>
              )}
            </section>
          )}
        </div>
        {life && !friend && !editing && (
          <button
            className="home-next-gift"
            onClick={() => setPanel(panel === 'gifts' ? null : 'gifts')}
            aria-expanded={panel === 'gifts'}
          >
            <CharacterAvatar
              avatar={
                bond.next?.id.includes('rabbit')
                  ? '🐰'
                  : bond.next?.id.includes('cat')
                    ? '🐱'
                    : '🐻'
              }
              skin={bond.next?.id || 'home-star-bear'}
            />
            <span>
              <strong>{bond.next?.name || '친밀도 선물 모두 획득'}</strong>
              <small>
                {bond.next ? `친밀도 ${bond.remaining} 더 모으면 해금` : '상점에서 장착하기'}
              </small>
            </span>
            <Gift size={18} />
          </button>
        )}
        {lifeError && (
          <p role="alert" className="home-error">
            {lifeError}
            <button onClick={() => void loadLife(friend)}>다시 시도</button>
          </p>
        )}
        {guest && (
          <div className="home-login">
            <p>로그인하면 내 집과 가구를 저장할 수 있어요.</p>
            <a className="home-action" href="/auth/google/start?return_to=%2Fhome">
              Google로 로그인
            </a>
          </div>
        )}
        {error && (
          <p role="alert" className="home-error">
            {error}{' '}
            <button
              disabled={busy}
              onClick={() => {
                if (!dirty || window.confirm('저장하지 않은 배치를 버리고 다시 불러올까요?'))
                  void load();
              }}
            >
              다시 불러오기
            </button>
          </p>
        )}
        {notice && (
          <p role="status" className="home-notice">
            {notice}
          </p>
        )}
        {editing && data && (
          <section className="home-workbench">
            <div className="home-workbench-heading">
              <h2>내 가구</h2>
              <button
                disabled={busy}
                onClick={() => {
                  setLayout(data.layout);
                  setDirty(false);
                  setEditing(false);
                  setSelected('');
                }}
              >
                취소
              </button>
            </div>
            <div className="home-inventory">
              {FURNITURE.filter((f) => data.owned.includes(f.id)).map((f) => (
                <button
                  key={f.id}
                  disabled={busy}
                  aria-pressed={selected === f.id}
                  onClick={() => {
                    setSelected(f.id);
                    if (!layout.some((p) => p.id === f.id))
                      change([...layout, { id: f.id, x: 50, y: 70, flipped: false }]);
                  }}
                >
                  <FurnitureArt id={f.id} />
                  <strong>{f.name}</strong>
                  <small>{layout.some((p) => p.id === f.id) ? '배치됨' : '보관 중'}</small>
                </button>
              ))}
              <a href="/shop?category=home" className="home-buy-more">
                ＋<span>가구 구경하기</span>
              </a>
            </div>
            {current && (
              <div className="home-placement-controls">
                <span>{FURNITURE.find((f) => f.id === selected)?.name}</span>
                <label>
                  가로
                  <input
                    aria-label="가구 가로 위치"
                    type="range"
                    min="18"
                    max="82"
                    value={current.x}
                    disabled={busy}
                    onChange={(e) => place(Number(e.target.value), current.y)}
                  />
                </label>
                <label>
                  세로
                  <input
                    aria-label="가구 세로 위치"
                    type="range"
                    min="48"
                    max="86"
                    value={current.y}
                    disabled={busy}
                    onChange={(e) => place(current.x, Number(e.target.value))}
                  />
                </label>
                <button
                  disabled={busy}
                  onClick={() =>
                    change(
                      layout.map((p) => (p.id === selected ? { ...p, flipped: !p.flipped } : p)),
                    )
                  }
                >
                  좌우 반전
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    change(layout.filter((p) => p.id !== selected));
                    setSelected('');
                  }}
                >
                  보관하기
                </button>
              </div>
            )}
          </section>
        )}
      </div>
      <div hidden={tab !== 'profile'}>
        <AccountPanel
          embedded
          defaultName={data?.profile?.name || ''}
          defaultAvatar={data?.profile?.avatar || '🐱'}
          onProfile={(name, avatar) =>
            setData((d) =>
              d
                ? {
                    ...d,
                    profile: {
                      name,
                      avatar,
                      skin: d.profile?.avatar === avatar ? d.profile?.skin : undefined,
                    },
                  }
                : d,
            )
          }
          onRoom={(r) => window.location.assign('/?r=' + encodeURIComponent(r.id))}
        />
      </div>
    </main>
  );
}
