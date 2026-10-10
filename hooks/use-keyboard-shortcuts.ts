'use client';

import { useEffect } from 'react';
import { useEditorStore } from '@/lib/store';
import { usePlaybackStore } from '@/lib/playback';

const SEEK_AMOUNT = 500; // 500ms per arrow key press
const SEEK_AMOUNT_LARGE = 2000; // 2s with shift held

export function useKeyboardShortcuts() {
  // Registered once; handlers read the latest state when a key is pressed
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      const editor = useEditorStore.getState();
      const playback = usePlaybackStore.getState();
      const { scenes } = editor.project;

      // The export dialog owns the keyboard while it is open
      if (editor.isExportOpen) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const selectedIndex = editor.selectedSceneId
        ? scenes.findIndex((s) => s.id === editor.selectedSceneId)
        : -1;

      switch (e.code) {
        // Space / K - Play/Pause
        case 'Space':
        case 'KeyK':
          e.preventDefault();
          if (scenes.length === 0) return;
          playback.toggle();
          break;

        // Left Arrow - Seek backward
        case 'ArrowLeft':
          e.preventDefault();
          playback.seek(playback.currentTime - (e.shiftKey ? SEEK_AMOUNT_LARGE : SEEK_AMOUNT));
          break;

        // Right Arrow - Seek forward
        case 'ArrowRight':
          e.preventDefault();
          playback.seek(playback.currentTime + (e.shiftKey ? SEEK_AMOUNT_LARGE : SEEK_AMOUNT));
          break;

        // Home - Go to start
        case 'Home':
          e.preventDefault();
          playback.seek(0);
          break;

        // End - Go to end
        case 'End':
          e.preventDefault();
          playback.seek(playback.duration);
          break;

        // J - Previous scene
        case 'KeyJ':
          e.preventDefault();
          if (scenes.length === 0) return;
          if (selectedIndex > 0) {
            editor.selectScene(scenes[selectedIndex - 1].id);
          } else if (selectedIndex === -1) {
            editor.selectScene(scenes[scenes.length - 1].id);
          }
          break;

        // L - Next scene
        case 'KeyL':
          e.preventDefault();
          if (scenes.length === 0) return;
          if (selectedIndex < scenes.length - 1) {
            editor.selectScene(scenes[selectedIndex + 1].id);
          }
          break;

        // E - Export
        case 'KeyE':
          if (scenes.length === 0) return;
          e.preventDefault();
          playback.pause();
          editor.setExportOpen(true);
          break;

        // 0-9 - Jump to percentage
        case 'Digit0':
        case 'Digit1':
        case 'Digit2':
        case 'Digit3':
        case 'Digit4':
        case 'Digit5':
        case 'Digit6':
        case 'Digit7':
        case 'Digit8':
        case 'Digit9': {
          e.preventDefault();
          const digit = parseInt(e.code.replace('Digit', ''));
          playback.seek(playback.duration * (digit / 10));
          break;
        }

        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
