'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { usePlaybackStore } from '@/lib/playback';

interface TimelinePlayheadProps {
  totalDuration: number;
  onSeek: (time: number) => void;
}

export function TimelinePlayhead({
  totalDuration,
  onSeek,
}: TimelinePlayheadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);

  // Moves with the clock through a store subscription instead of re-rendering every frame
  useEffect(() => {
    const place = (time: number) => {
      if (!headRef.current) return;
      const position = totalDuration > 0 ? (time / totalDuration) * 100 : 0;
      headRef.current.style.left = `${position}%`;
    };
    place(usePlaybackStore.getState().currentTime);
    return usePlaybackStore.subscribe((state, prev) => {
      if (state.currentTime !== prev.currentTime) place(state.currentTime);
    });
  }, [totalDuration]);

  const handleSeekFromEvent = useCallback(
    (clientX: number) => {
      if (!containerRef.current || totalDuration === 0) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const time = (x / rect.width) * totalDuration;
      onSeek(time);
    },
    [totalDuration, onSeek]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      handleSeekFromEvent(e.clientX);
    },
    [handleSeekFromEvent]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      handleSeekFromEvent(e.clientX);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleSeekFromEvent]);

  if (totalDuration === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-20 pointer-events-none"
    >
      {/* Playhead */}
      <div
        ref={headRef}
        className="absolute top-0 bottom-0 pointer-events-auto cursor-ew-resize"
        onMouseDown={handleMouseDown}
      >
        {/* Hit area for easier grabbing */}
        <div className="absolute inset-y-0 -left-2 w-4" />

        {/* Playhead line */}
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-primary" />

        {/* Top handle */}
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-primary rounded-sm" />
      </div>
    </div>
  );
}
