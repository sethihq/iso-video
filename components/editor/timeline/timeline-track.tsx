'use client';

import { memo, useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { Trash2, GripVertical } from 'lucide-react';
import { Scene, Screen } from '@/lib/types';
import { usePlaybackStore } from '@/lib/playback';
import { getSceneTimings, sceneIndexAt } from '@/lib/render/frame';
import { cn } from '@/lib/utils';

interface TimelineTrackProps {
  scenes: Scene[];
  screens: Screen[];
  selectedSceneId: string | null;
  totalDuration: number;
  onSelectScene: (id: string) => void;
  onRemoveScene: (id: string) => void;
}

export function TimelineTrack({
  scenes,
  screens,
  selectedSceneId,
  totalDuration,
  onSelectScene,
  onRemoveScene,
}: TimelineTrackProps) {
  // Clips sit at their start time on the same linear scale as the ruler and playhead
  const timings = useMemo(() => getSceneTimings(scenes).timings, [scenes]);

  // Only changes at scene boundaries, so clips don't re-render every frame
  const playingIndex = usePlaybackStore((s) =>
    s.isPlaying && scenes.length > 0 ? sceneIndexAt(scenes, s.currentTime) : -1
  );

  return (
    <div className="absolute inset-x-0 top-6 bottom-0">
      {scenes.map((scene, index) => {
        const screen = screens.find((s) => s.id === scene.screenId);
        const { start } = timings[index];
        const leftPercent = totalDuration > 0 ? (start / totalDuration) * 100 : 0;
        const widthPercent = totalDuration > 0
          ? (scene.duration / totalDuration) * 100
          : 100 / scenes.length;

        return (
          <TimelineElement
            key={scene.id}
            scene={scene}
            screen={screen}
            index={index}
            isSelected={selectedSceneId === scene.id}
            isPlaying={playingIndex === index}
            leftPercent={leftPercent}
            widthPercent={widthPercent}
            onSelect={onSelectScene}
            onRemove={onRemoveScene}
          />
        );
      })}
    </div>
  );
}

interface TimelineElementProps {
  scene: Scene;
  screen?: Screen;
  index: number;
  isSelected: boolean;
  isPlaying: boolean;
  leftPercent: number;
  widthPercent: number;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

const TimelineElement = memo(function TimelineElement({
  scene,
  screen,
  index,
  isSelected,
  isPlaying,
  leftPercent,
  widthPercent,
  onSelect,
  onRemove,
}: TimelineElementProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: scene.id,
  });

  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
    // A 2px inset on each side keeps a gap between clips without shifting them off the time scale
    left: `calc(${leftPercent}% + 2px)`,
    width: `calc(${widthPercent}% - 4px)`,
    zIndex: isDragging ? 50 : isSelected ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(scene.id);
      }}
      className={cn(
        'squircle group absolute inset-y-0 cursor-pointer overflow-hidden rounded-[10px] bg-well transition-shadow duration-100',
        isSelected
          ? 'shadow-[0_0_0_2px_var(--primary),0_4px_12px_-6px_rgba(0,0,0,0.3)]'
          : 'shadow-[0_0_0_1px_rgba(0,0,0,0.06)]',
        isDragging && 'shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_12px_28px_-12px_rgba(0,0,0,0.4)]'
      )}
    >
      {/* Thumbnail */}
      <div className="absolute inset-0 bg-well">
        {screen?.thumbnail ? (
          <img
            src={screen.thumbnail}
            alt=""
            className="w-full h-full object-cover object-top"
            decoding="async"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-[11px] text-faint">No preview</span>
          </div>
        )}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />

      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-1 left-1 cursor-grab rounded-[6px] bg-black/45 p-0.5 opacity-0 transition-opacity duration-100 group-hover:opacity-100 active:cursor-grabbing"
        aria-label={`Drag to reorder ${screen?.section || `Scene ${index + 1}`}`}
      >
        <GripVertical className="h-3 w-3 text-white" aria-hidden="true" />
      </div>

      {/* Delete button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(scene.id);
        }}
        className="absolute top-1 right-1 grid size-5 place-items-center rounded-[6px] bg-black/45 text-white opacity-0 transition-[opacity,background-color] duration-100 group-hover:opacity-100 hover:bg-destructive"
        aria-label={`Remove ${screen?.section || `Scene ${index + 1}`}`}
      >
        <Trash2 className="h-2.5 w-2.5" aria-hidden="true" />
      </button>

      {/* Info */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-1 px-2 py-1.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-white">
          {isPlaying && (
            <span
              className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary"
              role="status"
              aria-label="Currently playing"
            />
          )}
          <span className="truncate">{screen?.section || `Scene ${index + 1}`}</span>
        </span>
        <span className="text-[11px] tabular-nums text-white/75">
          {(scene.duration / 1000).toFixed(1)}s
        </span>
      </div>
    </div>
  );
});
