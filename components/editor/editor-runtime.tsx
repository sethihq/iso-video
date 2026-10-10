'use client';

import { useEffect } from 'react';
import { useEditorStore } from '@/lib/store';
import { usePlaybackStore } from '@/lib/playback';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';

// Drift allowed between the music and the timeline before it is re-synced
const AUDIO_DRIFT = 0.3;

/**
 * Editor side effects with no UI: restores the saved project, handles
 * keyboard shortcuts, and plays the background music in step with playback.
 */
export function EditorRuntime() {
  useEffect(() => {
    // Loaded after mount so server and client render the same first frame
    void useEditorStore.persist.rehydrate();
  }, []);

  useKeyboardShortcuts();
  useAudioPreview();

  return null;
}

function useAudioPreview() {
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    let source = '';
    let wasPlaying = false;
    // Set when the browser refuses to start audio, so we don't retry every frame
    let refused = false;

    const sync = () => {
      const track = useEditorStore.getState().project.audioTracks[0];
      const { isPlaying, currentTime } = usePlaybackStore.getState();

      if (!track) {
        if (!audio.paused) audio.pause();
        wasPlaying = isPlaying;
        return;
      }
      if (track.url !== source) {
        source = track.url;
        audio.src = track.url;
      }
      audio.volume = Math.min(1, Math.max(0, track.volume));

      const offset = (currentTime - track.startTime) / 1000;
      const inTrack = offset >= 0 && offset < track.duration / 1000;

      if (isPlaying && !wasPlaying) refused = false;

      if (isPlaying && inTrack && !refused) {
        const started = !wasPlaying || audio.paused;
        if (started || Math.abs(audio.currentTime - offset) > AUDIO_DRIFT) audio.currentTime = offset;
        if (audio.paused) {
          audio.play().catch(() => {
            refused = true;
          });
        }
      } else if (!audio.paused) {
        audio.pause();
      }
      wasPlaying = isPlaying;
    };

    const unsubscribePlayback = usePlaybackStore.subscribe(sync);
    const unsubscribeEditor = useEditorStore.subscribe((state, prev) => {
      if (state.project.audioTracks !== prev.project.audioTracks) sync();
    });

    return () => {
      unsubscribePlayback();
      unsubscribeEditor();
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, []);
}
