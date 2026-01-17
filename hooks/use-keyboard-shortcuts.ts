'use client';

import { useEffect, useCallback } from 'react';
import { useEditorStore, useTotalDuration } from '@/lib/store';

const SEEK_AMOUNT = 500; // 500ms per arrow key press
const SEEK_AMOUNT_LARGE = 2000; // 2s with shift held

export function useKeyboardShortcuts() {
  const {
    isPlaying,
    currentTime,
    project,
    play,
    pause,
    seek,
    selectedSceneId,
    selectScene,
  } = useEditorStore();
  const totalDuration = useTotalDuration();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if typing in an input
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      (e.target as HTMLElement)?.isContentEditable
    ) {
      return;
    }

    switch (e.code) {
      // Space - Play/Pause
      case 'Space':
        e.preventDefault();
        if (project.scenes.length === 0) return;
        if (isPlaying) {
          pause();
        } else {
          play();
        }
        break;

      // Left Arrow - Seek backward
      case 'ArrowLeft':
        e.preventDefault();
        const seekBackAmount = e.shiftKey ? SEEK_AMOUNT_LARGE : SEEK_AMOUNT;
        seek(Math.max(0, currentTime - seekBackAmount));
        break;

      // Right Arrow - Seek forward
      case 'ArrowRight':
        e.preventDefault();
        const seekForwardAmount = e.shiftKey ? SEEK_AMOUNT_LARGE : SEEK_AMOUNT;
        seek(Math.min(totalDuration, currentTime + seekForwardAmount));
        break;

      // Home - Go to start
      case 'Home':
        e.preventDefault();
        seek(0);
        break;

      // End - Go to end
      case 'End':
        e.preventDefault();
        seek(totalDuration);
        break;

      // J - Previous scene
      case 'KeyJ':
        e.preventDefault();
        if (project.scenes.length === 0) return;
        const currentIndex = selectedSceneId
          ? project.scenes.findIndex((s) => s.id === selectedSceneId)
          : -1;
        if (currentIndex > 0) {
          selectScene(project.scenes[currentIndex - 1].id);
        } else if (currentIndex === -1 && project.scenes.length > 0) {
          selectScene(project.scenes[project.scenes.length - 1].id);
        }
        break;

      // K - Play/Pause (alternative)
      case 'KeyK':
        e.preventDefault();
        if (project.scenes.length === 0) return;
        if (isPlaying) {
          pause();
        } else {
          play();
        }
        break;

      // L - Next scene
      case 'KeyL':
        e.preventDefault();
        if (project.scenes.length === 0) return;
        const currIdx = selectedSceneId
          ? project.scenes.findIndex((s) => s.id === selectedSceneId)
          : -1;
        if (currIdx < project.scenes.length - 1) {
          selectScene(project.scenes[currIdx + 1].id);
        } else if (currIdx === -1 && project.scenes.length > 0) {
          selectScene(project.scenes[0].id);
        }
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
      case 'Digit9':
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          const digit = parseInt(e.code.replace('Digit', ''));
          const percentage = digit / 10;
          seek(totalDuration * percentage);
        }
        break;

      default:
        break;
    }
  }, [isPlaying, currentTime, totalDuration, project.scenes, selectedSceneId, play, pause, seek, selectScene]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return {
    shortcuts: [
      { key: 'Space', description: 'Play / Pause' },
      { key: '←', description: 'Seek backward' },
      { key: '→', description: 'Seek forward' },
      { key: 'Shift + ←/→', description: 'Seek 2s' },
      { key: 'J / L', description: 'Previous / Next scene' },
      { key: '0-9', description: 'Jump to 0-90%' },
    ],
  };
}
