import { CharacterAvatar } from '@/components/game/character-avatar';
import { RoomChat } from '@/components/game/chat';
import { ParticipantCard } from '@/components/game/participant-card';
import { titleNames } from '@/components/game/party-panel';
import { Copy, Trophy } from 'lucide-react';
import type { SpeedGame } from './use-speed-game';
export function SpeedParticipants({
  setProfileTarget,
  chatOpenRequest,
  setChatOpenRequest,
  cheerCooling,
  receiveChat,
  bubbles,
  copyInvite,
  cheer,
  room,
  data,
  round,
}: SpeedGame) {
  return (
    <aside className="social-panel">
      <section className="room-members-card">
        <div className="card-heading">
          <div>
            <h2>{data.room.name}</h2>
            <span className="member-count">
              참가자 {data.roster.filter((m: any) => !m.spectator).length}명
            </span>
          </div>
          <button className="secondary-btn" onClick={() => void copyInvite()}>
            <Copy size={14} />
            초대
          </button>
        </div>
        <div className="room-members">
          {data.roster.map((m: any) => {
            const p = data.players?.find((p: any) => p.id === m.id),
              rank = data.ranking?.find((p: any) => p.id === m.id)?.rank,
              status = m.spectator ? '관전 중' : `${p?.solved || 0}/5 완료`;
            return (
              <ParticipantCard
                cardSkin={m.cardSkin}
                key={`${round?.id || 'ready'}:${m.id}`}
                memberId={m.id}
                reactions={data.reactions || []}
                serverNow={data.serverNow}
                roundId={round?.id || 'ready'}
                rank={p?.solved === 5 ? rank : undefined}
                won={p?.solved === 5}
                attempts={5}
                successLabel="5문제 완주"
                status={status}
                name={m.name}
              >
                <div className="room-member-heading">
                  <button
                    className={`room-member-avatar profile-avatar avatar-frame frame-${m.avatarFrame}`}
                    aria-label={`${m.name} 캐릭터 · 프로필 보기`}
                    onClick={() => setProfileTarget({ id: m.id, name: m.name })}
                  >
                    <CharacterAvatar avatar={m.avatar} skin={m.skin} />
                  </button>
                  <button
                    className={`room-member-name profile-name name-color-${m.nameColor}`}
                    aria-label={`${m.name} 프로필 보기`}
                    onClick={() => setProfileTarget({ id: m.id, name: m.name })}
                  >
                    {m.name}
                    {m.title && <small className="equipped-title">{titleNames[m.title]}</small>}
                    {m.id === data.me.id && <small>나</small>}
                    {m.id === data.room.hostId && <small>방장</small>}
                  </button>
                  <span className={`presence ${m.presence}`}>
                    <i />
                    {m.presence === 'online'
                      ? '접속 중'
                      : m.presence === 'away'
                        ? '자리 비움'
                        : '미접속'}
                    <small className={`membership-badge ${m.linked ? 'linked' : 'guest'}`}>
                      {m.linked ? `Lv.${m.level}` : '게스트'}
                    </small>
                  </span>
                  <div className="member-speech-slot">
                    {bubbles[m.id] && (
                      <button
                        className="member-chat-bubble"
                        onClick={() => setChatOpenRequest((n) => n + 1)}
                        aria-label={`${m.name}: ${bubbles[m.id].body}. 채팅 열기`}
                      >
                        <span>{bubbles[m.id].body}</span>
                      </button>
                    )}
                  </div>
                </div>
                <span className="sheet-member-status">{status}</span>
                <div className="member-progress">
                  <div
                    className="speed-member-steps"
                    aria-label={`${m.name} ${p?.solved || 0}개 완료`}
                  >
                    {Array.from({ length: 5 }, (_, i) => (
                      <i key={i} className={p?.statuses[i] || 'open'}>
                        {p?.statuses[i] === 'won' ? '✓' : p?.statuses[i] === 'lost' ? '×' : i + 1}
                      </i>
                    ))}
                  </div>
                </div>
              </ParticipantCard>
            );
          })}
        </div>
        <div className="office-footer">
          <span>응원 보내기</span>
          <div>
            {['👏', '👀', '🔥', '☕'].map((emoji) => (
              <button
                key={emoji}
                aria-label={`${emoji} 응원 보내기`}
                disabled={cheerCooling || data.me.spectator}
                onClick={() => void cheer(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </section>
      <section className="ranking-card">
        <div className="card-heading">
          <h2>
            <Trophy size={18} />
            이번 묶음 순위
          </h2>
          <span>성공 개수 · 정답 제출 순</span>
        </div>
        {data.ranking?.filter((p: any) => p.solved).length ? (
          data.ranking
            .filter((p: any) => p.solved)
            .map((p: any) => (
              <div className="rank-row" key={p.id}>
                <b className={`rank-number rank-${p.rank}`}>
                  {['', '🥇', '🥈', '🥉'][p.rank] || p.rank}
                </b>
                <span>
                  <CharacterAvatar avatar={p.avatar} skin={p.skin} />
                </span>
                <strong>{p.name}</strong>
                <span>{p.solved}/5</span>
              </div>
            ))
        ) : (
          <div className="empty-rank">
            <Trophy size={26} />
            <p>아직 정답을 맞힌 사람이 없어요.</p>
          </div>
        )}
      </section>
      <RoomChat
        bundled
        snapshot={data.chat}
        roomId={room}
        meId={data.me.id}
        isHost={data.room.isHost}
        spectator={data.me.spectator}
        onMessages={receiveChat}
        openRequest={chatOpenRequest}
      />
    </aside>
  );
}
