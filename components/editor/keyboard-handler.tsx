'use client';

import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';

export function KeyboardHandler() {
  // Initialize keyboard shortcuts
  useKeyboardShortcuts();

  // This component doesn't render anything
  return null;
}
