'use client';

import { useState, useRef, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Film } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore, useTotalDuration } from '@/lib/store';
import { usePlaybackStore } from '@/lib/playback';
import { TimelineToolbar } from './timeline-toolbar';
import { TimelineRuler } from './timeline-ruler';
import { TimelineTrack } from './timeline-track';
import { TimelinePlayhead } from './timeline-playhead';
import { ExportModal } from '../export-modal';

export function Timeline() {
  const [zoom, setZoom] = useState(1);
  const trackRef = useRef<HTMLDivElement>(null);

  const {
    scenes,
    screens,
    selectedSceneId,
    isExportOpen,
    setExportOpen,
    selectScene,
    removeScene,
    reorderScenes,
  } = useEditorStore(
    useShallow((s) => ({
      scenes: s.project.scenes,
      screens: s.project.screens,
      selectedSceneId: s.selectedSceneId,
      isExportOpen: s.isExportOpen,
      setExportOpen: s.setExportOpen,
      selectScene: s.selectScene,
      removeScene: s.removeScene,
      reorderScenes: s.reorderScenes,
    }))
  );
  const seek = usePlaybackStore((s) => s.seek);

  const totalDuration = useTotalDuration();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = scenes.findIndex((s) => s.id === active.id);
      const newIndex = scenes.findIndex((s) => s.id === over.id);
      const newScenes = arrayMove(scenes, oldIndex, newIndex);
      reorderScenes(newScenes);
    }
  };

  const handleSeek = useCallback((time: number) => {
    seek(Math.max(0, Math.min(totalDuration, time)));
  }, [seek, totalDuration]);

  const handleTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current || totalDuration === 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = (x / rect.width) * totalDuration;
    handleSeek(time);
  }, [totalDuration, handleSeek]);

  // Empty state
  if (scenes.length === 0) {
    return (
      <div className="squircle flex h-[150px] items-center justify-center rounded-[22px] bg-card">
        <div className="flex items-center gap-3">
          <span className="squircle grid size-10 place-items-center rounded-[12px] bg-well text-muted-foreground">
            <Film className="size-4.5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[13px] font-medium">No scenes yet</p>
            <p className="text-[12px] text-faint">Capture a website to start editing</p>
          </div>
        </div>
      </div>
    );
  }

  // Calculate track width based on zoom
  const minTrackWidth = 800;
  const trackWidth = Math.max(minTrackWidth, totalDuration * zoom * 0.15);

  return (
    <div className="squircle flex h-[150px] flex-col rounded-[22px] bg-card select-none">
      {/* Toolbar */}
      <TimelineToolbar
        totalDuration={totalDuration}
        zoom={zoom}
        onZoomChange={setZoom}
        sceneCount={scenes.length}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setExportOpen(false)}
      />

      {/* Timeline Content */}
      <div className="scroll-slim flex-1 overflow-x-auto overflow-y-hidden px-3 pb-3">
        <div
          ref={trackRef}
          className="relative h-full"
          style={{ width: `${trackWidth}px`, minWidth: '100%' }}
          onClick={handleTrackClick}
        >
          {/* Ruler */}
          <TimelineRuler
            duration={totalDuration}
            zoom={zoom}
            width={trackWidth}
          />

          {/* Track */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={scenes.map((s) => s.id)}
              strategy={horizontalListSortingStrategy}
            >
              <TimelineTrack
                scenes={scenes}
                screens={screens}
                selectedSceneId={selectedSceneId}
                totalDuration={totalDuration}
                onSelectScene={selectScene}
                onRemoveScene={removeScene}
              />
            </SortableContext>
          </DndContext>

          {/* Playhead */}
          <TimelinePlayhead
            totalDuration={totalDuration}
            onSeek={handleSeek}
          />
        </div>
      </div>
    </div>
  );
}
