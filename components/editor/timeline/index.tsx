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
import { useEditorStore, useTotalDuration } from '@/lib/store';
import { usePlayback } from '@/hooks/use-playback';
import { TimelineToolbar } from './timeline-toolbar';
import { TimelineRuler } from './timeline-ruler';
import { TimelineTrack } from './timeline-track';
import { TimelinePlayhead } from './timeline-playhead';
import { ExportModal } from '../export-modal';

export function Timeline() {
  const [zoom, setZoom] = useState(1);
  const [showExportModal, setShowExportModal] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const {
    project,
    isPlaying,
    currentTime,
    selectedSceneId,
    play,
    pause,
    stop,
    seek,
    selectScene,
    removeScene,
    reorderScenes,
  } = useEditorStore();

  usePlayback();

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
      const oldIndex = project.scenes.findIndex((s) => s.id === active.id);
      const newIndex = project.scenes.findIndex((s) => s.id === over.id);
      const newScenes = arrayMove(project.scenes, oldIndex, newIndex);
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
  if (project.scenes.length === 0) {
    return (
      <div className="flex h-28 items-center justify-center rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Film className="h-5 w-5" />
          <div>
            <p className="text-sm font-medium">No scenes yet</p>
            <p className="text-xs text-muted-foreground/70">Capture a website to start editing</p>
          </div>
        </div>
      </div>
    );
  }

  // Calculate track width based on zoom
  const minTrackWidth = 800;
  const trackWidth = Math.max(minTrackWidth, totalDuration * zoom * 0.15);

  return (
    <div className="flex h-28 flex-col rounded-xl border border-border bg-card shadow-sm overflow-hidden select-none">
      {/* Toolbar */}
      <TimelineToolbar
        isPlaying={isPlaying}
        currentTime={currentTime}
        totalDuration={totalDuration}
        zoom={zoom}
        onPlay={play}
        onPause={pause}
        onStop={stop}
        onZoomChange={setZoom}
        sceneCount={project.scenes.length}
        onExport={() => setShowExportModal(true)}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
      />

      {/* Timeline Content */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
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
              items={project.scenes.map((s) => s.id)}
              strategy={horizontalListSortingStrategy}
            >
              <TimelineTrack
                scenes={project.scenes}
                screens={project.screens}
                selectedSceneId={selectedSceneId}
                currentTime={currentTime}
                totalDuration={totalDuration}
                isPlaying={isPlaying}
                onSelectScene={selectScene}
                onRemoveScene={removeScene}
              />
            </SortableContext>
          </DndContext>

          {/* Playhead */}
          <TimelinePlayhead
            currentTime={currentTime}
            totalDuration={totalDuration}
            onSeek={handleSeek}
          />
        </div>
      </div>
    </div>
  );
}
