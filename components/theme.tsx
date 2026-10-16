'use client';

import {useEffect, useState, type ReactNode} from 'react';
import {ThemeProvider, useTheme} from 'next-themes';
import {Moon, Sun} from 'lucide-react';

export function AppearanceProvider({children}: {children: ReactNode}) {
  return <ThemeProvider attribute="data-theme" storageKey="bw_theme" defaultTheme="system" enableSystem>{children}</ThemeProvider>;
}

export function ThemeSwitch() {
  const {resolvedTheme, setTheme} = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === 'dark';
  const title = dark ? '라이트 모드로 전환' : '다크 모드로 전환';
  return <button type="button" className="theme-switch" role="switch" aria-label="다크 모드" aria-checked={dark} title={title} onClick={() => setTheme(dark ? 'light' : 'dark')}>
    {dark ? <Moon size={16} aria-hidden="true"/> : <Sun size={16} aria-hidden="true"/>}
    <span className="theme-switch-track" aria-hidden="true"><span/></span>
  </button>;
}
