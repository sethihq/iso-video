import { create } from 'zustand';

/**
 * Playback clock, kept out of the persisted editor store so ticking time
 * doesn't serialize the project or re-render the editor every frame.
 * Components that need the time subscribe with a selector; the preview
 * canvas subscribes outside React and draws on each tick.
 */

interface PlaybackState {
  isPlaying: boolean;
  currentTime: number; // ms
  duration: number; // ms, kept in sync with the project's scenes
  play: () => void;
  pause: () => void;
  toggle: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setDuration: (duration: number) => void;
}

let frameId: number | null = null;
let lastTimestamp = 0;
let inTick = false;

export const usePlaybackStore = create<PlaybackState>()((set, get) => ({
  isPlaying: false,
  currentTime: 0,
  duration: 0,

  play: () => {
    const { isPlaying, duration, currentTime } = get();
    if (isPlaying || duration <= 0) return;
    set({ isPlaying: true, currentTime: currentTime >= duration ? 0 : currentTime });
    startClock();
  },

  pause: () => {
    if (!get().isPlaying) return;
    set({ isPlaying: false });
    stopClock();
  },

  toggle: () => (get().isPlaying ? get().pause() : get().play()),

  stop: () => {
    set({ isPlaying: false, currentTime: 0 });
    stopClock();
  },

  seek: (time) => set({ currentTime: Math.min(Math.max(0, time), get().duration) }),

  setDuration: (duration) => {
    const { currentTime, isPlaying } = get();
    if (duration <= 0 && isPlaying) stopClock();
    set({
      duration,
      currentTime: Math.min(currentTime, duration),
      isPlaying: duration > 0 && isPlaying,
    });
  },
}));

/** True while the clock is advancing time inside its animation frame. */
export function isPlaybackTick(): boolean {
  return inTick;
}

function startClock() {
  if (frameId !== null) return;
  lastTimestamp = 0;
  frameId = requestAnimationFrame(tick);
}

function stopClock() {
  if (frameId !== null) cancelAnimationFrame(frameId);
  frameId = null;
}

function tick(timestamp: number) {
  frameId = null;
  const { isPlaying, currentTime, duration } = usePlaybackStore.getState();
  if (!isPlaying) return;

  // Cap the step so a backgrounded tab doesn't jump ahead when it returns
  const delta = lastTimestamp ? Math.min(timestamp - lastTimestamp, 250) : 0;
  lastTimestamp = timestamp;

  inTick = true;
  try {
    if (currentTime + delta >= duration) {
      // Rewind and stop at the end
      usePlaybackStore.setState({ currentTime: 0, isPlaying: false });
      return;
    }
    usePlaybackStore.setState({ currentTime: currentTime + delta });
  } finally {
    inTick = false;
  }
  frameId = requestAnimationFrame(tick);
}
