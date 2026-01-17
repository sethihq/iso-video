'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, Keyboard } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
    { keys: ['?'], description: 'Show keyboard shortcuts' },
  ]},
];

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
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md"
          >
            <div className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Keyboard className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-sm font-medium">Keyboard Shortcuts</h2>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {/* Content */}
              <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
                {SHORTCUTS.map((category) => (
                  <div key={category.category}>
                    <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      {category.category}
                    </h3>
                    <div className="space-y-1.5">
                      {category.items.map((shortcut, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between py-1"
                        >
                          <span className="text-sm text-muted-foreground">
                            {shortcut.description}
                          </span>
                          <div className="flex items-center gap-1">
                            {shortcut.keys.map((key, keyIndex) => (
                              <span key={keyIndex}>
                                <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 text-xs font-mono bg-muted border border-border rounded shadow-sm">
                                  {key}
                                </kbd>
                                {keyIndex < shortcut.keys.length - 1 && (
                                  <span className="text-muted-foreground mx-1">+</span>
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
              <div className="px-5 py-3 border-t border-border bg-muted/30">
                <p className="text-[11px] text-muted-foreground text-center">
                  Press <kbd className="px-1.5 py-0.5 text-[10px] bg-muted border border-border rounded font-mono">Esc</kbd> or click outside to close
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
