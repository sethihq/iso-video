'use client';

import { memo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Play,
  Pause,
  Square,
  Download,
  Trash2,
  GripVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEditorStore, useTotalDuration } from '@/lib/store';
import { usePlayback } from '@/hooks/use-playback';
import { Scene, Screen } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ExportModal } from './export-modal';

export function SceneList() {
  const {
    project,
    isPlaying,
    currentTime,
    selectedSceneId,
    play,
    pause,
    stop,
    selectScene,
    removeScene,
    reorderScenes,
  } = useEditorStore();

  // Initialize playback hook
  usePlayback();

  const totalDuration = useTotalDuration();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const oldIndex = project.scenes.findIndex((s) => s.id === active.id);
      const newIndex = project.scenes.findIndex((s) => s.id === over.id);
      const newScenes = arrayMove(project.scenes, oldIndex, newIndex);
      reorderScenes(newScenes);
    }
  };

  const activeScene = activeId ? project.scenes.find(s => s.id === activeId) : null;
  const activeScreen = activeScene ? project.screens.find(s => s.id === activeScene.screenId) : null;

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Progress bar percentage
  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  if (project.scenes.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center bg-card">
        <p className="text-sm text-muted-foreground">
          Capture a website to generate your video
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-40 flex-col bg-card">
      {/* Controls */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2 shrink-0">
        <div className="flex items-center gap-2">
          {/* Playback controls */}
          <Button
            variant="ghost"
            size="sm"
            onClick={isPlaying ? pause : play}
            className="h-8 w-8 p-0"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={stop}
            className="h-8 w-8 p-0"
          >
            <Square className="h-4 w-4" />
          </Button>

          <div className="mx-2 h-4 w-px bg-border" />

          {/* Time display */}
          <span className="font-mono text-xs text-foreground tabular-nums">
            {formatTime(currentTime)}
          </span>
          <span className="text-xs text-muted-foreground">/</span>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {formatTime(totalDuration)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {project.scenes.length} scenes
          </span>
          <Button
            variant="default"
            size="sm"
            className="gap-1.5"
            onClick={() => setShowExportModal(true)}
            disabled={project.scenes.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
      />

      {/* Progress bar */}
      <div className="h-1 bg-muted shrink-0">
        <div
          className="h-full bg-primary transition-all duration-75"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Scene cards */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-3">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={project.scenes.map((s) => s.id)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex gap-2 h-full">
              {project.scenes.map((scene, index) => {
                const screen = project.screens.find((s) => s.id === scene.screenId);

                // Check if this scene is currently playing
                let sceneStart = 0;
                for (const s of project.scenes) {
                  if (s.id === scene.id) break;
                  sceneStart += s.duration;
                }
                const isCurrentScene =
                  currentTime >= sceneStart && currentTime < sceneStart + scene.duration;

                return (
                  <SortableSceneCard
                    key={scene.id}
                    scene={scene}
                    screen={screen}
                    index={index}
                    isSelected={selectedSceneId === scene.id}
                    isPlaying={isCurrentScene && isPlaying}
                    isDragOverlay={false}
                    onSelect={() => selectScene(scene.id)}
                    onRemove={() => removeScene(scene.id)}
                  />
                );
              })}
            </div>
          </SortableContext>

          {/* Drag Overlay - renders the dragged item smoothly */}
          <DragOverlay dropAnimation={{ duration: 200, easing: 'ease-out' }}>
            {activeScene && activeScreen ? (
              <SceneCardContent
                scene={activeScene}
                screen={activeScreen}
                index={project.scenes.findIndex(s => s.id === activeId)}
                isSelected={false}
                isPlaying={false}
                isDragOverlay={true}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}

interface SceneCardContentProps {
  scene: Scene;
  screen?: Screen;
  index: number;
  isSelected: boolean;
  isPlaying: boolean;
  isDragOverlay?: boolean;
  onSelect?: () => void;
  onRemove?: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

// Pure visual component - no sortable logic
const SceneCardContent = memo(function SceneCardContent({
  scene,
  screen,
  index,
  isSelected,
  isPlaying,
  isDragOverlay = false,
  onSelect,
  onRemove,
  dragHandleProps,
}: SceneCardContentProps) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        'group relative flex flex-col w-28 shrink-0 rounded-lg border cursor-pointer transition-colors overflow-hidden',
        isSelected
          ? 'border-primary ring-1 ring-primary/30'
          : 'border-border hover:border-primary/50',
        isPlaying && 'ring-2 ring-green-500/50 border-green-500',
        isDragOverlay && 'shadow-xl ring-2 ring-primary/50 cursor-grabbing'
      )}
    >
      {/* Playing indicator */}
      {isPlaying && (
        <div className="absolute top-1 right-1 z-10 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
      )}

      {/* Drag handle */}
      {dragHandleProps && (
        <div
          {...dragHandleProps}
          className="absolute top-1 left-1 z-10 cursor-grab rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-muted/80 active:cursor-grabbing"
        >
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </div>
      )}

      {/* Thumbnail */}
      <div className="flex-1 bg-muted overflow-hidden">
        {screen?.thumbnail ? (
          <img
            src={screen.thumbnail}
            alt=""
            className="w-full h-full object-cover object-top"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-[10px] text-muted-foreground">No image</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex items-center justify-between px-2 py-1 bg-background">
        <span className="text-[10px] font-medium text-foreground">
          {index + 1}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {(scene.duration / 1000).toFixed(1)}s
        </span>
      </div>

      {/* Delete button */}
      {onRemove && (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute top-1 right-1 h-5 w-5 p-0 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
});

interface SortableSceneCardProps {
  scene: Scene;
  screen?: Screen;
  index: number;
  isSelected: boolean;
  isPlaying: boolean;
  isDragOverlay: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

function SortableSceneCard({
  scene,
  screen,
  index,
  isSelected,
  isPlaying,
  onSelect,
  onRemove,
}: SortableSceneCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: scene.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <SceneCardContent
        scene={scene}
        screen={screen}
        index={index}
        isSelected={isSelected}
        isPlaying={isPlaying}
        onSelect={onSelect}
        onRemove={onRemove}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}
