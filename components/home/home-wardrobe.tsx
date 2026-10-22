'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { CharacterAvatar } from '@/components/game/character-avatar';
import { useShopWallet } from '@/components/game/hooks/use-shop-wallet';
import { ALL_SKINS } from '@/lib/skins';
import { CHARACTER_ART } from '@/lib/character-art';
type Wallet = { owned: string[]; equipped: string | null; avatar: string };
export function HomeWardrobe({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => void;
}) {
  const { data, loading, busy, error, request } = useShopWallet<Wallet>();
  const [selection, setSelection] = useState<string | null>(null);
  const selected = selection ?? data?.equipped ?? '';
  const skin = ALL_SKINS.find((s) => s.id === selected),
    avatar = skin?.avatar || data?.avatar || '🐱';
  const owned = ALL_SKINS.filter((s) => data?.owned.includes(s.id));
  const equipped = selected === (data?.equipped || '');
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="home-wardrobe"
        aria-describedby="wardrobe-description"
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <DialogTitle>내 옷장</DialogTitle>
        <DialogDescription id="wardrobe-description" className="sr-only">
          보유한 스킨을 입어 보고 갈아입으세요.
        </DialogDescription>
        <div className="wardrobe-body">
          <div className="wardrobe-mirror">
            <CharacterAvatar avatar={avatar} skin={skin?.id} />
            <span className="mirror-foot" />
            <strong>
              {skin ? `${skin.name} ${CHARACTER_ART[avatar]?.name || '콩알'}` : '기본 모습'}
            </strong>
            <button
              className="wardrobe-wear"
              disabled={!data || loading || busy || equipped}
              onClick={async () => {
                if (
                  await request({
                    action: selected ? 'equip' : 'unequip',
                    slot: 'character',
                    ...(selected ? { skin: selected } : {}),
                  })
                ) {
                  onChanged();
                }
              }}
            >
              {busy ? '갈아입는 중' : equipped ? '입고 있어요' : '이 옷 입기'}
            </button>
          </div>
          <div className="wardrobe-rack" aria-label="보유 스킨">
            {loading && <p role="status">옷장을 열고 있어요…</p>}
            {data && (
              <button aria-pressed={!selected} onClick={() => setSelection('')}>
                <CharacterAvatar avatar={data.avatar} />
                <span>기본 모습</span>
              </button>
            )}
            {owned.map((s) => (
              <button
                key={s.id}
                aria-pressed={selected === s.id}
                onClick={() => setSelection(s.id)}
              >
                <CharacterAvatar avatar={s.avatar} skin={s.id} />
                <span>
                  {s.name} {CHARACTER_ART[s.avatar]?.name}
                </span>
                {data?.equipped === s.id && <small>착용 중</small>}
              </button>
            ))}
            {data && !owned.length && (
              <p className="wardrobe-empty">
                아직 모은 스킨이 없어요.
                <br />
                상점에서 첫 옷을 골라 보세요.
              </p>
            )}
          </div>
        </div>
        {error && (
          <p role="alert">
            {error} <button onClick={() => void request()}>다시 불러오기</button>
          </p>
        )}
        <a className="wardrobe-shop" href="/shop">
          새 옷 구경하기 →
        </a>
      </DialogContent>
    </Dialog>
  );
}
