'use client';
import { useMemo, useState } from 'react';
import { CharacterAvatar } from '@/components/game/character-avatar';
import { HomeExplorer } from './home-explorer';
import { ArrowLeft, ArrowRight, Gamepad2 } from 'lucide-react';
const SLOTS = [
  { x: 25, y: 40 },
  { x: 75, y: 40 },
  { x: 25, y: 78 },
  { x: 75, y: 78 },
];
function approach(button: HTMLButtonElement, slot: number, action: () => void) {
  const p = SLOTS[slot];
  button
    .closest('.neighborhood-scene')
    ?.dispatchEvent(
      new CustomEvent('home-approach', { detail: { point: { x: p.x, y: p.y + 6 }, action } }),
    );
}
type Neighbor = { id: string; name: string; avatar: string; skin?: string };
export function HomeNeighborhood({
  profile,
  friends,
  onVisit,
  onHome,
}: {
  profile: Omit<Neighbor, 'id'>;
  friends: Neighbor[];
  onVisit: (id: string) => void;
  onHome: () => void;
}) {
  const [page, setPage] = useState(0);
  const houses = friends.slice(page * 3, page * 3 + 3);
  const obstacles = useMemo(
    () =>
      SLOTS.slice(0, Math.min(4, friends.length - page * 3 + 1)).map((p) => ({
        id: 'home-sofa',
        x: p.x,
        y: p.y,
        flipped: false,
        collisionWidth: 13,
        collisionDepth: 17,
      })),
    [friends.length, page],
  );
  return (
    <section className="neighborhood-wrap" aria-label="이웃 골목">
      <div
        className="neighborhood-scene"
        tabIndex={0}
        role="group"
        aria-label="이웃 골목. 바닥을 누르거나 방향키로 이동"
      >
        <div className="lane-cloud cloud-one" />
        <div className="lane-cloud cloud-two" />
        <div className="lane-hill" />
        <div className="lane-path" />
        <header className="lane-sign">
          <span>콩알 골목</span>
          <small>
            {page + 1} / {Math.max(1, Math.ceil(friends.length / 3))}
          </small>
        </header>
        <div className="lane-houses">
          <button
            className="neighbor-house own-house"
            onClick={(e) => approach(e.currentTarget, 0, onHome)}
          >
            <span className="house-roof" />
            <span className="house-front">
              <i className="house-pane" />
              <i className="house-entry" />
              <CharacterAvatar avatar={profile.avatar} skin={profile.skin} />
            </span>
            <b>내 집</b>
          </button>
          {houses.map((f, i) => (
            <button
              className={`neighbor-house house-color-${i}`}
              key={f.id}
              onClick={(e) => approach(e.currentTarget, i + 1, () => onVisit(f.id))}
              aria-label={`${f.name}의 집 방문`}
            >
              <span className="house-roof" />
              <span className="house-front">
                <i className="house-pane" />
                <i className="house-entry" />
                <CharacterAvatar avatar={f.avatar} skin={f.skin} />
              </span>
              <b>{f.name}</b>
            </button>
          ))}
          {!houses.length && (
            <div className="neighbor-empty">
              <span className="empty-flower">✿</span>
              <p>
                친구가 생기면
                <br />이 골목에서 만나요.
              </p>
              <a href="/?lobby=1">친구 만나러 가기 →</a>
            </div>
          )}
        </div>
        <span className="lane-flower flower-one">✿</span>
        <span className="lane-flower flower-two">✿</span>
        <span className="lane-flower flower-three">✿</span>
        <HomeExplorer
          avatar={profile.avatar}
          skin={profile.skin}
          name={profile.name}
          key={page}
          furniture={obstacles}
          paused={false}
          onExit={onHome}
          onPet={() => {}}
        />
      </div>
      <nav className="neighborhood-nav" aria-label="골목 이동">
        <button onClick={onHome}>
          <ArrowLeft size={18} /> 내 집
        </button>
        <a href="/?lobby=1">
          <Gamepad2 size={20} /> 게임하러 가기
        </a>
        {friends.length > 3 && (
          <div>
            <button
              aria-label="이전 골목"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ArrowLeft size={18} />
            </button>
            <button
              aria-label="다음 골목"
              disabled={(page + 1) * 3 >= friends.length}
              onClick={() => setPage((p) => p + 1)}
            >
              <ArrowRight size={18} />
            </button>
          </div>
        )}
      </nav>
      <p className="neighborhood-note">
        서로 친구인 이웃의 집에 방문할 수 있어요. 집은 마지막 저장 모습으로 보여요.
      </p>
    </section>
  );
}
