'use client';
import { useEffect, useState } from 'react';
import {
  METRIC_CHANGED,
  observeGame,
  newMeasuredAttempt,
  measureScene,
} from '@/lib/product-metrics-client';
export function useGameMeasurement(
  mode: string,
  key: string | null | undefined,
  steps: number,
  status: string = 'playing',
) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const change = () => setRevision((n) => n + 1);
    window.addEventListener(METRIC_CHANGED, change);
    window.addEventListener('storage', change);
    return () => {
      window.removeEventListener(METRIC_CHANGED, change);
      window.removeEventListener('storage', change);
    };
  }, []);
  useEffect(() => {
    if (key) observeGame(mode, { key, steps, status });
  }, [mode, key, steps, status, revision]);
  return (kind: 'retry' | 'next') => {
    newMeasuredAttempt(mode, kind);
    setRevision((n) => n + 1);
  };
}

export function useSceneMeasurement(scene: string | null) {
  useEffect(() => {
    const observe = () => {
      if (scene) measureScene(scene);
    };
    observe();
    window.addEventListener(METRIC_CHANGED, observe);
    window.addEventListener('storage', observe);
    return () => {
      window.removeEventListener(METRIC_CHANGED, observe);
      window.removeEventListener('storage', observe);
    };
  }, [scene]);
}
