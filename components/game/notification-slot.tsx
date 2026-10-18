'use client';
import { useLayoutEffect, useRef } from 'react';
/** All service and room headers offer the same home for friend notifications. */
export function NotificationSlot() {
  const slot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    window.dispatchEvent(new CustomEvent('jamopop-header-slot', { detail: slot.current }));
    return () => {
      window.dispatchEvent(new CustomEvent('jamopop-header-slot', { detail: null }));
    };
  }, []);
  return <div ref={slot} id="service-notifications" />;
}
