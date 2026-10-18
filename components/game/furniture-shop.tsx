'use client';
import { AsyncStatus } from '@/components/ui/async-status';
import { useShopWallet } from './hooks/use-shop-wallet';
import { ServiceHeader } from '@/components/game/service-header';
import { useState } from 'react';
import { FURNITURE } from '@/lib/furniture';
import { FurnitureArt } from './furniture-art';
type Wallet = { balance: number; owned: string[] };
export function FurnitureShop({ onBack }: { onBack: () => void }) {
  const { data, loading, busy, guest, error, request } = useShopWallet<Wallet>();
  const [selected, setSelected] = useState<string>('home-sofa'),
    [confirm, setConfirm] = useState(false),
    [notice, setNotice] = useState('');
  const item = FURNITURE.find((f) => f.id === selected)!,
    owned = item.price === 0 || !!data?.owned.includes(item.id);
  async function buy() {
    if (await request({ action: 'buy', slot: 'home', skin: item.id })) {
      setConfirm(false);
      setNotice('내 가구에 추가했어요. 집에 놓아 보세요.');
    }
  }
  return (
    <main className="skin-shop">
      <ServiceHeader active="shop">
        <b className="gold-wallet">{data?.balance.toLocaleString() ?? '—'} G</b>
      </ServiceHeader>
      <nav className="shop-categories" aria-label="꾸미기 종류">
        <button onClick={onBack}>스킨 상점</button>
        <button aria-pressed>가구 · 소품</button>
      </nav>
      <div className="shop-layout">
        <section className="skin-preview">
          <span className="skin-series">작은 집의 첫 번째 살림</span>
          <div className="skin-stage furniture-stage">
            <FurnitureArt id={item.id} />
          </div>
          <h2>{item.name}</h2>
          <span className="skin-tag">{data && owned ? '보유 중' : '가구 · 소품'}</span>
          {!data ? (
            <button className="shop-primary" disabled>
              {loading ? '보유 정보 확인 중…' : guest ? '로그인 후 이용' : '정보 확인 필요'}
            </button>
          ) : owned ? (
            <a href="/home" className="shop-primary">
              내 집에 배치하기
            </a>
          ) : confirm ? (
            <div className="skin-confirm">
              <p>
                <b>{item.price} G</b>로 구매할까요?
              </p>
              <div>
                <button disabled={busy} onClick={() => setConfirm(false)}>
                  취소
                </button>
                <button disabled={busy} className="shop-primary" onClick={() => void buy()}>
                  {busy ? '구매 중…' : '구매 확정'}
                </button>
              </div>
            </div>
          ) : (
            <button
              className="shop-primary"
              disabled={!data || busy || data.balance < item.price}
              onClick={() => setConfirm(true)}
            >
              {item.price.toLocaleString()} G · 구매
            </button>
          )}
          {!owned && data && data.balance < item.price && (
            <small>{item.price - data.balance} G 더 필요해요.</small>
          )}
          <p role="status">{notice}</p>
          {!data && !guest ? (
            <AsyncStatus
              label="보유 정보를 확인하고 있어요"
              error={error}
              retrying={loading}
              onRetry={() => void request()}
            />
          ) : (
            error && (
              <p role="alert">
                {error}{' '}
                {guest ? (
                  <a href="/auth/google/start?return_to=%2Fshop%3Fcategory%3Dhome">로그인</a>
                ) : (
                  <button disabled={loading || busy} onClick={() => void request()}>
                    다시 불러오기
                  </button>
                )}
              </p>
            )
          )}
        </section>
        <section className="shop-catalog">
          <div className="skin-grid">
            {FURNITURE.map((f) => (
              <button
                disabled={busy}
                className={`skin-product ${f.id === selected ? 'selected' : ''}`}
                key={f.id}
                aria-pressed={f.id === selected}
                onClick={() => {
                  setSelected(f.id);
                  setConfirm(false);
                  setNotice('');
                }}
              >
                <FurnitureArt id={f.id} />
                <strong>{f.name}</strong>
                <small>
                  {f.price === 0
                    ? '기본 가구'
                    : data?.owned.includes(f.id)
                      ? '보유'
                      : `${f.price.toLocaleString()} G`}
                </small>
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
