'use client';

import { useRef, useCallback, useEffect, useState } from 'react';

interface TimelinePlayheadProps {
  currentTime: number;
  totalDuration: number;
  onSeek: (time: number) => void;
}

export function TimelinePlayhead({
  currentTime,
  totalDuration,
  onSeek,
}: TimelinePlayheadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const position = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

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
      className="absolute inset-0 pointer-events-none"
    >
      {/* Playhead */}
      <div
        className="absolute top-0 bottom-0 pointer-events-auto cursor-ew-resize"
        style={{ left: `${position}%` }}
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
