'use client';

import { useState } from 'react';
import {
  ChevronDown,
  RotateCcw,
  SlidersHorizontal,
  Music,
  Upload,
  Trash2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { CustomSlider } from '@/components/ui/custom-slider';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore, useSelectedScene } from '@/lib/store';
import {
  ISOMETRIC_PRESETS,
  DEFAULT_TRANSFORM,
  DEFAULT_SECTION_CAMERA,
  DEFAULT_GLOBAL_CAMERA,
  DEFAULT_DOF,
  AnimationType,
  EasingType,
  CameraMoveDirection,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { FieldLabel, IconButton, SectionTitle, TabSwitch } from './ui';

const CAMERA_DIRECTION_OPTIONS: { value: CameraMoveDirection; label: string }[] = [
  { value: 'top-to-bottom', label: 'Top to Bottom' },
  { value: 'bottom-to-top', label: 'Bottom to Top' },
  { value: 'left-to-right', label: 'Left to Right' },
  { value: 'right-to-left', label: 'Right to Left' },
  { value: 'none', label: 'No Movement' },
];

const ANIMATION_OPTIONS: { value: AnimationType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade' },
  { value: 'slide-up', label: 'Slide Up' },
  { value: 'slide-down', label: 'Slide Down' },
  { value: 'slide-left', label: 'Slide Left' },
  { value: 'slide-right', label: 'Slide Right' },
  { value: 'zoom-in', label: 'Zoom In' },
  { value: 'zoom-out', label: 'Zoom Out' },
  { value: 'rotate', label: 'Rotate' },
];

const EASING_OPTIONS: { value: EasingType; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'ease-in', label: 'Ease In' },
  { value: 'ease-out', label: 'Ease Out' },
  { value: 'ease-in-out', label: 'Ease In Out' },
  { value: 'spring', label: 'Spring' },
];

type TabType = 'camera' | 'style' | 'audio';

const TABS: { value: TabType; label: string }[] = [
  { value: 'camera', label: 'Camera' },
  { value: 'style', label: 'Style' },
  { value: 'audio', label: 'Audio' },
];

export function ControlsPanel() {
  const [activeTab, setActiveTab] = useState<TabType>('camera');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const selectedScene = useSelectedScene();
  const {
    audioTracks,
    globalCameraSettings,
    dofProjectSettings,
    updateSceneTransform,
    updateSceneMotion,
    applyPresetToScene,
    updateSceneDuration,
    updateSceneCamera,
    updateGlobalCamera,
    updateDOFSettings,
    addAudioFile,
    removeAudioTrack,
    updateAudioTrack,
  } = useEditorStore(
    useShallow((s) => ({
      audioTracks: s.project.audioTracks,
      globalCameraSettings: s.project.settings.globalCamera,
      dofProjectSettings: s.project.settings.dof,
      updateSceneTransform: s.updateSceneTransform,
      updateSceneMotion: s.updateSceneMotion,
      applyPresetToScene: s.applyPresetToScene,
      updateSceneDuration: s.updateSceneDuration,
      updateSceneCamera: s.updateSceneCamera,
      updateGlobalCamera: s.updateGlobalCamera,
      updateDOFSettings: s.updateDOFSettings,
      addAudioFile: s.addAudioFile,
      removeAudioTrack: s.removeAudioTrack,
      updateAudioTrack: s.updateAudioTrack,
    }))
  );

  if (!selectedScene) {
    return (
      <div className="flex h-full w-full flex-col">
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <div className="flex flex-col items-center">
            <span className="squircle mb-3 grid size-11 place-items-center rounded-[14px] bg-white text-muted-foreground shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_8px_20px_-10px_rgba(0,0,0,0.25)]">
              <SlidersHorizontal className="size-4.5" aria-hidden="true" />
            </span>
            <p className="text-[13px] font-medium text-foreground">No scene selected</p>
            <p className="mt-0.5 max-w-[200px] text-[12px] text-faint">
              Select a scene to customize its appearance
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleTransformChange = (key: string, value: number) => {
    updateSceneTransform(selectedScene.id, { [key]: value });
  };

  const handleMotionChange = (key: string, value: string | number) => {
    updateSceneMotion(selectedScene.id, { [key]: value });
  };

  const handlePresetApply = (presetId: string) => {
    const preset = ISOMETRIC_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      applyPresetToScene(selectedScene.id, preset.transform);
    }
  };

  const handleReset = () => {
    applyPresetToScene(selectedScene.id, DEFAULT_TRANSFORM);
  };

  const handleCameraChange = (key: string, value: string | number) => {
    updateSceneCamera(selectedScene.id, { [key]: value });
  };

  const cameraSettings = selectedScene.camera || DEFAULT_SECTION_CAMERA;
  const globalCamera = globalCameraSettings || DEFAULT_GLOBAL_CAMERA;
  const dofSettings = dofProjectSettings || DEFAULT_DOF;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="shrink-0 px-3 pt-3">
        <TabSwitch label="Controls panels" value={activeTab} tabs={TABS} onChange={setActiveTab} idPrefix="controls" />
      </div>

      {/* Content */}
      <div className="scroll-slim flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'style' && (
            <motion.div
              key="style"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-4 p-3"
              role="tabpanel"
              id="controls-panel-style"
              aria-labelledby="controls-tab-style"
            >
              {/* Duration */}
              <Section title="Duration">
                <CustomSlider
                  label="Scene Length"
                  value={selectedScene.duration}
                  min={1000}
                  max={10000}
                  step={250}
                  valueSubtext="ms"
                  onChange={(v) => updateSceneDuration(selectedScene.id, v)}
                />
              </Section>

              {/* Presets */}
              <Section title="Style Presets">
                <div className="grid grid-cols-3 gap-1.5">
                  {ISOMETRIC_PRESETS.slice(0, 6).map((preset) => (
                    <Button
                      key={preset.id}
                      variant="outline"
                      size="sm"
                      onClick={() => handlePresetApply(preset.id)}
                      className={cn(
                        'h-8 px-2',
                        JSON.stringify(selectedScene.transform) === JSON.stringify(preset.transform) &&
                          'bg-primary text-primary-foreground hover:bg-primary-press'
                      )}
                    >
                      {preset.name}
                    </Button>
                  ))}
                </div>
              </Section>

              {/* Animation */}
              <Section title="Transitions">
                <div className="space-y-3">
                  <div>
                    <FieldLabel>Entry Animation</FieldLabel>
                    <DropdownMenu>
                      <DropdownMenuTrigger>
                        {ANIMATION_OPTIONS.find((o) => o.value === selectedScene.motion.entry)?.label || 'Select'}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {ANIMATION_OPTIONS.map((option) => (
                          <DropdownMenuItem
                            key={option.value}
                            onClick={() => handleMotionChange('entry', option.value)}
                            selected={selectedScene.motion.entry === option.value}
                          >
                            {option.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div>
                    <FieldLabel>Exit Animation</FieldLabel>
                    <DropdownMenu>
                      <DropdownMenuTrigger>
                        {ANIMATION_OPTIONS.find((o) => o.value === selectedScene.motion.exit)?.label || 'Select'}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {ANIMATION_OPTIONS.map((option) => (
                          <DropdownMenuItem
                            key={option.value}
                            onClick={() => handleMotionChange('exit', option.value)}
                            selected={selectedScene.motion.exit === option.value}
                          >
                            {option.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div>
                    <FieldLabel>Easing</FieldLabel>
                    <DropdownMenu>
                      <DropdownMenuTrigger>
                        {EASING_OPTIONS.find((o) => o.value === selectedScene.motion.easing)?.label || 'Select'}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {EASING_OPTIONS.map((option) => (
                          <DropdownMenuItem
                            key={option.value}
                            onClick={() => handleMotionChange('easing', option.value)}
                            selected={selectedScene.motion.easing === option.value}
                          >
                            {option.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </Section>

              {/* Advanced Transform */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="squircle flex h-8 w-full items-center gap-1.5 rounded-[10px] px-2 text-[12px] font-medium text-muted-foreground transition-colors duration-100 hover:bg-black/[0.04] hover:text-foreground"
                aria-expanded={showAdvanced}
                aria-controls="advanced-transform-section"
              >
                <ChevronDown className={cn('size-3.5 transition-transform duration-200 ease-snappy', showAdvanced && 'rotate-180')} aria-hidden="true" />
                Advanced Transform
              </button>

              <AnimatePresence>
                {showAdvanced && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden space-y-4"
                    id="advanced-transform-section"
                  >
                    <Section
                      title="3D Transform"
                      action={
                        <Button variant="ghost" size="xs" onClick={handleReset}>
                          <RotateCcw aria-hidden="true" />
                          Reset
                        </Button>
                      }
                    >
                      <div className="space-y-2">
                        <CustomSlider
                          label="Rotate X"
                          value={selectedScene.transform.rotateX}
                          min={-60}
                          max={60}
                          valueSubtext="°"
                          onChange={(v) => handleTransformChange('rotateX', v)}
                        />
                        <CustomSlider
                          label="Rotate Y"
                          value={selectedScene.transform.rotateY}
                          min={-60}
                          max={60}
                          valueSubtext="°"
                          onChange={(v) => handleTransformChange('rotateY', v)}
                        />
                        <CustomSlider
                          label="Rotate Z"
                          value={selectedScene.transform.rotateZ}
                          min={-45}
                          max={45}
                          valueSubtext="°"
                          onChange={(v) => handleTransformChange('rotateZ', v)}
                        />
                        <CustomSlider
                          label="Scale"
                          value={selectedScene.transform.scale}
                          min={0.3}
                          max={1.5}
                          step={0.05}
                          valueSubtext="x"
                          onChange={(v) => handleTransformChange('scale', v)}
                        />
                        <CustomSlider
                          label="Perspective"
                          value={selectedScene.transform.perspective}
                          min={500}
                          max={2000}
                          step={50}
                          valueSubtext="px"
                          onChange={(v) => handleTransformChange('perspective', v)}
                        />
                      </div>
                    </Section>

                    <Section title="Animation Timing">
                      <div className="space-y-2">
                        <CustomSlider
                          label="Entry Duration"
                          value={selectedScene.motion.entryDuration}
                          min={100}
                          max={2000}
                          step={50}
                          valueSubtext="ms"
                          onChange={(v) => handleMotionChange('entryDuration', v)}
                        />
                        <CustomSlider
                          label="Exit Duration"
                          value={selectedScene.motion.exitDuration}
                          min={100}
                          max={2000}
                          step={50}
                          valueSubtext="ms"
                          onChange={(v) => handleMotionChange('exitDuration', v)}
                        />
                      </div>
                    </Section>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {activeTab === 'camera' && (
            <motion.div
              key="camera"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-4 p-3"
              role="tabpanel"
              id="controls-panel-camera"
              aria-labelledby="controls-tab-camera"
            >
              {/* Scene Camera */}
              <Section title="Scene Movement">
                <div className="space-y-3">
                  <div>
                    <FieldLabel>Direction</FieldLabel>
                    <DropdownMenu>
                      <DropdownMenuTrigger>
                        {CAMERA_DIRECTION_OPTIONS.find((o) => o.value === cameraSettings.moveDirection)?.label || 'Select'}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {CAMERA_DIRECTION_OPTIONS.map((option) => (
                          <DropdownMenuItem
                            key={option.value}
                            onClick={() => handleCameraChange('moveDirection', option.value)}
                            selected={cameraSettings.moveDirection === option.value}
                          >
                            {option.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CustomSlider
                    label="Offset X"
                    value={cameraSettings.moveOffsetX}
                    min={-200}
                    max={200}
                    step={10}
                    valueSubtext="px"
                    onChange={(v) => handleCameraChange('moveOffsetX', v)}
                  />
                  <CustomSlider
                    label="Offset Y"
                    value={cameraSettings.moveOffsetY}
                    min={-200}
                    max={200}
                    step={10}
                    valueSubtext="px"
                    onChange={(v) => handleCameraChange('moveOffsetY', v)}
                  />
                  <CustomSlider
                    label="Transition Time"
                    value={cameraSettings.transitionDuration}
                    min={200}
                    max={2000}
                    step={50}
                    valueSubtext="ms"
                    onChange={(v) => handleCameraChange('transitionDuration', v)}
                  />
                </div>
              </Section>

              {/* Global Camera */}
              <Section title="Global Settings">
                <div className="space-y-2">
                  <CustomSlider
                    label="Layer Spacing"
                    value={globalCamera.zSpacing}
                    min={400}
                    max={1200}
                    step={50}
                    valueSubtext="px"
                    onChange={(v) => updateGlobalCamera({ zSpacing: v })}
                  />
                </div>
              </Section>

              {/* Depth of Field */}
              <Section title="Depth of Field">
                <div className="space-y-3">
                  <div className="squircle flex h-8 items-center justify-between rounded-[10px] bg-well pl-2.5 pr-1.5">
                    <span className="text-[12px] font-medium text-muted-foreground" aria-hidden="true">Enable DOF</span>
                    <Switch
                      aria-label="Enable DOF"
                      checked={dofSettings.enabled}
                      onCheckedChange={(checked) => updateDOFSettings({ enabled: checked })}
                    />
                  </div>
                  {dofSettings.enabled && (
                    <>
                      <CustomSlider
                        label="Aperture"
                        value={dofSettings.aperture}
                        min={1}
                        max={10}
                        step={0.1}
                        valueSubtext="f/"
                        onChange={(v) => updateDOFSettings({ aperture: v })}
                      />
                      <CustomSlider
                        label="Max Blur"
                        value={dofSettings.maxBlur}
                        min={0}
                        max={20}
                        step={1}
                        valueSubtext="px"
                        onChange={(v) => updateDOFSettings({ maxBlur: v })}
                      />
                    </>
                  )}
                </div>
              </Section>
            </motion.div>
          )}

          {activeTab === 'audio' && (
            <motion.div
              key="audio"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-4 p-3"
              role="tabpanel"
              id="controls-panel-audio"
              aria-labelledby="controls-tab-audio"
            >
              {/* Audio Upload */}
              <Section title="Background Music">
                <div className="space-y-3">
                  {audioTracks.length === 0 ? (
                    <label
                      htmlFor="audio-upload"
                      className="squircle flex h-24 w-full cursor-pointer flex-col items-center justify-center rounded-[16px] bg-well outline-2 -outline-offset-4 outline-dashed outline-black/10 transition-colors duration-100 hover:bg-well-hover has-focus-visible:outline-solid has-focus-visible:outline-primary"
                    >
                      <div className="flex flex-col items-center justify-center">
                        <Upload className="mb-1.5 size-5 text-muted-foreground" aria-hidden="true" />
                        <p className="text-[13px] font-medium text-foreground">Upload audio</p>
                        <p className="mt-0.5 text-[11px] text-faint" id="audio-format-hint">MP3, WAV, OGG</p>
                      </div>
                      <input
                        id="audio-upload"
                        type="file"
                        className="sr-only"
                        accept="audio/*"
                        aria-describedby="audio-format-hint"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file) return;
                          setAudioError(null);
                          try {
                            await addAudioFile(file);
                          } catch (error) {
                            setAudioError(error instanceof Error ? error.message : 'Could not add this audio file');
                          }
                        }}
                      />
                    </label>
                  ) : (
                    <div className="space-y-2">
                      {audioTracks.map((track) => (
                        <div
                          key={track.id}
                          className="squircle flex items-center gap-2.5 rounded-[14px] bg-well p-1.5 pr-1"
                        >
                          <span className="squircle grid size-8 shrink-0 place-items-center rounded-[10px] bg-white text-primary-press shadow-[0_0_0_1px_rgba(0,0,0,0.05)]">
                            <Music className="size-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium">{track.name}</p>
                            <p className="text-[12px] tabular-nums text-faint">
                              {Math.floor(track.duration / 1000)}s
                            </p>
                          </div>
                          <IconButton
                            label={`Remove ${track.name}`}
                            size="sm"
                            tipSide="top"
                            onClick={() => removeAudioTrack(track.id)}
                            className="hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                          </IconButton>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Section>

              {audioError && (
                <p className="text-[12px] text-destructive-foreground" role="alert">{audioError}</p>
              )}

              {/* Volume Control */}
              {audioTracks.length > 0 && (
                <Section title="Volume">
                  <div className="space-y-3">
                    {audioTracks.map((track) => (
                      <CustomSlider
                        key={track.id}
                        label={track.name.slice(0, 20)}
                        value={track.volume * 100}
                        min={0}
                        max={100}
                        step={1}
                        valueSubtext="%"
                        onChange={(v) => updateAudioTrack(track.id, { volume: v / 100 })}
                      />
                    ))}
                  </div>
                </Section>
              )}

            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// A titled group of controls
function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <SectionTitle action={action}>{title}</SectionTitle>
      {children}
    </section>
  );
}
