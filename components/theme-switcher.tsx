'use client';

import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

// Safe hydration check using useSyncExternalStore
const emptySubscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

function useHydrated() {
  return useSyncExternalStore(emptySubscribe, getSnapshot, getServerSnapshot);
}

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();

  if (!hydrated) {
    return (
      <div className="flex h-8 items-center gap-0.5 rounded-full border border-border bg-muted/50 p-1">
        <div className="h-6 w-6" />
        <div className="h-6 w-6" />
        <div className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="flex h-8 items-center gap-0.5 rounded-full border border-border bg-muted/50 p-1">
      <ThemeButton
        isActive={theme === 'system'}
        onClick={() => setTheme('system')}
        label="System theme"
      >
        <Monitor className="h-3.5 w-3.5" />
      </ThemeButton>
      <ThemeButton
        isActive={theme === 'light'}
        onClick={() => setTheme('light')}
        label="Light theme"
      >
        <Sun className="h-3.5 w-3.5" />
      </ThemeButton>
      <ThemeButton
        isActive={theme === 'dark'}
        onClick={() => setTheme('dark')}
        label="Dark theme"
      >
        <Moon className="h-3.5 w-3.5" />
      </ThemeButton>
    </div>
  );
}

function ThemeButton({
  isActive,
  onClick,
  label,
  children,
}: {
  isActive: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded-full transition-all',
        isActive
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}
