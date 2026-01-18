'use client';

import { useMemo } from 'react';

interface TimelineRulerProps {
  duration: number;
  zoom: number;
  width?: number;
}

export function TimelineRuler({ duration, zoom }: TimelineRulerProps) {
  const markers = useMemo(() => {
    if (duration === 0) return [];

    // Determine interval based on zoom level
    let interval: number;
    if (zoom >= 2) {
      interval = 1000; // Every second when zoomed in
    } else if (zoom >= 1) {
      interval = 2000; // Every 2 seconds
    } else {
      interval = 5000; // Every 5 seconds when zoomed out
    }

    const count = Math.ceil(duration / interval) + 1;

    return Array.from({ length: count }, (_, i) => ({
      time: i * interval,
      isMajor: i % 2 === 0,
    }));
  }, [duration, zoom]);

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${seconds}s`;
  };

  return (
    <div className="relative h-6 border-b border-border bg-muted/30 shrink-0">
      {markers.map(({ time, isMajor }, index) => {
        const position = duration > 0 ? (time / duration) * 100 : 0;
        const isFirst = index === 0;
        const isLast = index === markers.length - 1;

        return (
          <div
            key={time}
            className="absolute top-0 h-full"
            style={{ left: `${position}%` }}
          >
            <div
              className={`w-px ${
                isMajor ? 'h-2.5 bg-muted-foreground/50' : 'h-1.5 bg-muted-foreground/30'
              }`}
            />
            {isMajor && (
              <span
                className="absolute top-2.5 text-[10px] font-mono text-muted-foreground whitespace-nowrap"
                style={{
                  transform: isFirst ? 'translateX(0)' : isLast ? 'translateX(-100%)' : 'translateX(-50%)',
                }}
              >
                {formatTime(time)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
