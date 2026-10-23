'use client';
import { createContext, useContext, type ReactNode } from 'react';
const CommunityContext = createContext(false);
export function CommunityAccess({ allowed, children }: { allowed: boolean; children: ReactNode }) {
  return <CommunityContext.Provider value={allowed}>{children}</CommunityContext.Provider>;
}
export function useCommunityAccess() {
  return useContext(CommunityContext);
}
