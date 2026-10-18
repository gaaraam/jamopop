'use client';
import { useLayoutEffect } from 'react';

/** A new in-page scene starts at its top; polling and draft edits keep the viewport. */
export function useScreenStart(scene: string) {
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [scene]);
}
