'use client';
import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  changeMeasurement,
  flushMeasurements,
  measurementAllowed,
  measureScene,
  METRIC_CHANGED,
  METRIC_PREFERENCE,
} from '@/lib/product-metrics-client';
import { metricScene } from '@/lib/product-metrics.mjs';
import './metrics.css';
export function ProductMeasurement() {
  const pathname = usePathname(),
    params = useSearchParams();
  const [choice, setChoice] = useState<string | null>(null),
    [allowed, setAllowed] = useState(false);
  const scene = metricScene(pathname, params.toString());
  useEffect(() => {
    const update = () => {
      try {
        setChoice(localStorage.getItem(METRIC_PREFERENCE));
      } catch {}
      setAllowed(measurementAllowed());
      if (!measurementAllowed()) void flushMeasurements();
    };
    update();
    window.addEventListener(METRIC_CHANGED, update);
    window.addEventListener('storage', update);
    const timer = setInterval(() => void flushMeasurements(), 10000);
    const leave = () => {
      if (document.hidden) void flushMeasurements(true);
    };
    const pagehide = () => void flushMeasurements(true);
    document.addEventListener('visibilitychange', leave);
    window.addEventListener('pagehide', pagehide);
    return () => {
      clearInterval(timer);
      window.removeEventListener(METRIC_CHANGED, update);
      window.removeEventListener('storage', update);
      document.removeEventListener('visibilitychange', leave);
      window.removeEventListener('pagehide', pagehide);
    };
  }, []);
  useEffect(() => {
    if (allowed && scene && pathname !== '/') measureScene(scene);
  }, [allowed, scene]);
  if (pathname.startsWith('/admin') || pathname.startsWith('/auth')) return null;
  return (
    <details className="product-measurement">
      <summary>
        플레이 흐름 측정 · {allowed ? '참여 중' : choice === 'no' ? '참여 안 함' : '선택 안 함'}
      </summary>
      <p>
        어떤 게임을 시작하고 끝내는지 측정해 개선에 사용합니다. 계정·단어·채팅은 수집하지 않으며,
        무작위 브라우저 식별값과 이벤트는 7일간 보관합니다. 참여하지 않아도 모든 게임을 이용할 수
        있어요.
      </p>
      <div>
        <button type="button" aria-pressed={allowed} onClick={() => changeMeasurement(true)}>
          측정 참여
        </button>
        <button
          type="button"
          aria-pressed={choice === 'no'}
          onClick={() => changeMeasurement(false)}
        >
          참여 안 함
        </button>
        <a href="/privacy#product-measurement">수집 기준</a>
      </div>
    </details>
  );
}
