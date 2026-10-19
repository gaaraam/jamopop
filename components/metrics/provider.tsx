'use client';
import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  changeMeasurement,
  flushMeasurements,
  measurementAllowed,
  measureScene,
  METRIC_CHANGED,
} from '@/lib/product-metrics-client';
import { metricScene } from '@/lib/product-metrics.mjs';
import './metrics.css';
export function ProductMeasurement() {
  const pathname = usePathname(),
    params = useSearchParams(),
    scene = metricScene(pathname, params.toString());
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const update = () => {
      setRevision((n) => n + 1);
      if (!measurementAllowed()) void flushMeasurements();
    };
    window.addEventListener(METRIC_CHANGED, update);
    window.addEventListener('storage', update);
    const timer = setInterval(() => void flushMeasurements(), 10000);
    const hide = () => {
        if (document.hidden) void flushMeasurements(true);
      },
      leave = () => void flushMeasurements(true);
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', leave);
    return () => {
      clearInterval(timer);
      window.removeEventListener(METRIC_CHANGED, update);
      window.removeEventListener('storage', update);
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', leave);
    };
  }, []);
  useEffect(() => {
    if (scene && pathname !== '/') measureScene(scene);
  }, [scene, pathname, revision]);
  return null;
}
export function MeasurementSettings() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    const update = () => setAllowed(measurementAllowed());
    update();
    window.addEventListener(METRIC_CHANGED, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(METRIC_CHANGED, update);
      window.removeEventListener('storage', update);
    };
  }, []);
  return (
    <div className="product-measurement">
      <label>
        <input
          type="checkbox"
          checked={allowed === true}
          disabled={allowed === null}
          onChange={(e) => changeMeasurement(e.target.checked)}
        />{' '}
        기본 이용 통계 허용
      </label>
      <p>
        브라우저의 추적 거부 신호가 켜져 있으면 이 설정과 관계없이 집계하지 않습니다. 꺼도 게임
        기능에 제한이 없습니다.
      </p>
    </div>
  );
}
