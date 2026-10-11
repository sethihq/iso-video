'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, Keyboard } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconButton, SectionTitle } from './ui';

const SHORTCUTS = [
  { category: 'Playback', items: [
    { keys: ['Space'], description: 'Play / Pause' },
    { keys: ['K'], description: 'Play / Pause (alternative)' },
  ]},
  { category: 'Navigation', items: [
    { keys: ['\u2190'], description: 'Seek backward 500ms' },
    { keys: ['\u2192'], description: 'Seek forward 500ms' },
    { keys: ['Shift', '\u2190'], description: 'Seek backward 2s' },
    { keys: ['Shift', '\u2192'], description: 'Seek forward 2s' },
    { keys: ['Home'], description: 'Go to start' },
    { keys: ['End'], description: 'Go to end' },
    { keys: ['0-9'], description: 'Jump to 0-90%' },
  ]},
  { category: 'Scenes', items: [
    { keys: ['J'], description: 'Previous scene' },
    { keys: ['L'], description: 'Next scene' },
  ]},
  { category: 'General', items: [
    { keys: ['E'], description: 'Export video' },
    { keys: ['?'], description: 'Show keyboard shortcuts' },
  ]},
];

// A key cap: white, lifted off the panel by a hairline and a bottom edge
const KEY_CAP =
  'squircle inline-grid h-6 min-w-6 place-items-center rounded-[7px] bg-white px-1.5 text-[12px] font-medium text-foreground shadow-[0_1px_0_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06)]';

export function KeyboardShortcutsModal() {
  const [isOpen, setIsOpen] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if typing in an input
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      (e.target as HTMLElement)?.isContentEditable
    ) {
      return;
    }

    // Open modal with '?' key
    if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) {
      e.preventDefault();
      setIsOpen(true);
    }

    // Close modal with Escape
    if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      setIsOpen(false);
    }
  }, [isOpen]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/20"
            onClick={() => setIsOpen(false)}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
          >
            {/* No overflow clip here, so the close button's tooltip can spill past the corner */}
            <div className="squircle rounded-[22px] bg-card shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_24px_60px_-20px_rgba(0,0,0,0.35)]">
              {/* Header */}
              <div className="flex items-center justify-between gap-3 px-5 pt-5">
                <div className="flex items-center gap-2.5">
                  <Keyboard className="size-4 text-muted-foreground" aria-hidden="true" />
                  <h2 id="shortcuts-title" className="text-[15px] font-semibold text-foreground">Keyboard Shortcuts</h2>
                </div>
                <IconButton label="Close" shortcut="Esc" size="sm" onClick={() => setIsOpen(false)}>
                  <X className="size-4" aria-hidden="true" />
                </IconButton>
              </div>

              {/* Content */}
              <div className="scroll-slim max-h-[60vh] space-y-4 overflow-y-auto px-5 py-3">
                {SHORTCUTS.map((category) => (
                  <div key={category.category}>
                    <SectionTitle>{category.category}</SectionTitle>
                    <div>
                      {category.items.map((shortcut) => (
                        <div
                          key={shortcut.description}
                          className="flex min-h-8 items-center justify-between gap-3"
                        >
                          <span className="text-[13px] text-foreground">
                            {shortcut.description}
                          </span>
                          <div className="flex shrink-0 items-center gap-1">
                            {shortcut.keys.map((key, keyIndex) => (
                              <span key={key} className="flex items-center gap-1">
                                <kbd className={KEY_CAP}>{key}</kbd>
                                {keyIndex < shortcut.keys.length - 1 && (
                                  <span className="text-[12px] text-faint">+</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="px-5 pt-1 pb-5">
                <p className="text-center text-[12px] text-faint">
                  Press{' '}
                  <kbd className={cn(KEY_CAP, 'h-5 min-w-5 rounded-[6px] px-1 align-middle text-[11px]')}>Esc</kbd>{' '}
                  or click outside to close
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
