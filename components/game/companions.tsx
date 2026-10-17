'use client';
import { CharacterAvatar } from '@/components/game/character-avatar';

import { useEffect, useState } from 'react';
import { Users, UserPlus, ArrowRight, Check, X } from 'lucide-react';
import { checkedFetch, readResume } from '@/lib/recovery.mjs';
type Room = { id: string; name: string };
type Person = {
  id: string;
  name: string;
  avatar: string;
  skin?: string | null;
  online: boolean;
  room: Room | null;
  linked?: boolean;
  status?: string;
  outgoing?: boolean;
};
export type PeopleSnapshot = { signedIn: boolean; recent: Person[]; friends: Person[] };
export function Companions({
  snapshot,
  onRoom,
  onRegister,
}: {
  snapshot?: PeopleSnapshot;
  onRoom: (room: Room) => void;
  onRegister: () => void;
}) {
  const [data, setData] = useState<PeopleSnapshot | undefined>(snapshot),
    [tab, setTab] = useState<'friends' | 'recent'>('recent'),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [expanded, setExpanded] = useState(false),
    [resume, setResume] = useState<any>(null);
  useEffect(() => {
    setData(snapshot);
  }, [snapshot]);
  useEffect(() => {
    setResume(readResume(localStorage));
  }, []);
  async function act(action: string, p: Person) {
    if (busy) return;
    setBusy(p.id);
    setError('');
    try {
      const r = await checkedFetch('/api/companions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id: p.id, member: p.id }),
      });
      const d: any = await r.json();
      if (!r.ok) throw Error(d.error);
      setData(d);
      if (action === 'request') setTab('friends');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  const list = data?.[tab] || [],
    incoming = data?.friends.filter((p) => p.status === 'pending' && !p.outgoing).length || 0;
  return (
    <>
      {resume && (
        <button
          className="resume-room"
          onClick={() => {
            if (resume.mode === 'speed') location.assign('/speed?room=' + resume.room);
            else if (resume.mode === 'practice')
              location.assign('/?r=' + resume.room + '&m=practice');
            else onRoom({ id: resume.room, name: resume.name });
          }}
        >
          <span>↩</span>
          <b>{resume.name}</b>
          <small>이어서 들어가기</small>
          <ArrowRight size={16} />
        </button>
      )}
      <section className="companions" aria-label="친구와 최근 함께한 사람">
        <div className="companions-heading">
          <Users size={18} />
          <div role="tablist" aria-label="함께한 사람 분류">
            <button
              role="tab"
              aria-selected={tab === 'recent'}
              onClick={() => {
                setTab('recent');
                setExpanded(false);
              }}
            >
              최근 함께한 사람
            </button>
            <button
              role="tab"
              aria-selected={tab === 'friends'}
              onClick={() => {
                setTab('friends');
                setExpanded(false);
              }}
            >
              친구 {incoming > 0 && <b>{incoming}</b>}
            </button>
          </div>
          {list.length > 8 && (
            <button className="text-btn" onClick={() => setExpanded((x) => !x)}>
              {expanded ? '접기' : `전체 ${list.length}`}
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {tab === 'friends' && !data?.signedIn ? (
          <button className="text-btn" onClick={onRegister}>
            로그인하고 친구 연결하기 →
          </button>
        ) : list.length ? (
          <div className="companion-list">
            {(expanded ? list : list.slice(0, 8)).map((p) => (
              <div className="companion" key={p.id}>
                <span className="companion-avatar">
                  <CharacterAvatar avatar={p.avatar} skin={p.skin} />
                  <i className={p.online ? 'online' : ''} />
                </span>
                <div>
                  <b>{p.name}</b>
                  <small>
                    {p.status === 'pending'
                      ? p.outgoing
                        ? '요청 보냄'
                        : '친구 요청'
                      : p.online
                        ? p.room?.name || '대기실'
                        : '미접속'}
                  </small>
                </div>
                {p.status === 'pending' ? (
                  <div className="companion-actions">
                    {!p.outgoing && (
                      <button
                        aria-label={`${p.name} 친구 수락`}
                        disabled={!!busy}
                        onClick={() => void act('accept', p)}
                      >
                        <Check size={16} />
                      </button>
                    )}
                    <button
                      aria-label={`${p.name} 요청 ${p.outgoing ? '취소' : '거절'}`}
                      disabled={!!busy}
                      onClick={() => void act(p.outgoing ? 'remove' : 'decline', p)}
                    >
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="companion-actions">
                    {p.room && (
                      <button
                        className="companion-join"
                        aria-label={`${p.name}의 방 합류`}
                        onClick={() => onRoom(p.room!)}
                      >
                        <ArrowRight size={17} />
                      </button>
                    )}
                    {tab === 'recent' && p.linked && data?.signedIn && (
                      <button
                        aria-label={`${p.name} 친구 요청`}
                        disabled={!!busy}
                        onClick={() => void act('request', p)}
                      >
                        <UserPlus size={16} />
                      </button>
                    )}
                    {tab === 'friends' && (
                      <button
                        aria-label={`${p.name} 친구 삭제`}
                        disabled={!!busy}
                        onClick={() => void act('remove', p)}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <small className="companions-empty">
            {tab === 'friends'
              ? '최근 함께한 사람에게 친구를 요청해 보세요.'
              : '함께 플레이한 사람이 여기에 표시됩니다.'}
          </small>
        )}
      </section>
    </>
  );
}
