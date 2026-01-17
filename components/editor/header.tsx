'use client';

import { Film } from 'lucide-react';
import { ThemeSwitcher } from '@/components/theme-switcher';

export function Header() {
  return (
    <header className="flex h-11 items-center justify-between rounded-xl border border-border bg-card px-4 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
          <Film className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <span className="text-sm font-semibold text-foreground">ISO Video</span>
      </div>

      <div className="flex items-center gap-3">
        <ThemeSwitcher />
      </div>
    </header>
  );
}
