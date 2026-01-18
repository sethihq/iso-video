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
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
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

const TABS: { id: TabType; label: string }[] = [
  { id: 'camera', label: 'Camera' },
  { id: 'style', label: 'Style' },
  { id: 'audio', label: 'Audio' },
];

export function ControlsPanel() {
  const [activeTab, setActiveTab] = useState<TabType>('camera');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const selectedScene = useSelectedScene();
  const {
    project,
    updateSceneTransform,
    updateSceneMotion,
    applyPresetToScene,
    updateSceneDuration,
    updateSceneCamera,
    updateGlobalCamera,
    updateDOFSettings,
    addAudioTrack,
    removeAudioTrack,
    updateAudioTrack,
  } = useEditorStore();

  if (!selectedScene) {
    return (
      <div className="flex h-full w-full flex-col bg-card">
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
              <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No Scene Selected</p>
              <p className="text-xs text-muted-foreground mt-1">
                Select a scene to customize its appearance
              </p>
            </div>
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
  const globalCamera = project.settings.globalCamera || DEFAULT_GLOBAL_CAMERA;
  const dofSettings = project.settings.dof || DEFAULT_DOF;

  return (
    <div className="flex h-full w-full flex-col bg-card">
      {/* Pill Tabs */}
      <div className="p-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1 p-1 bg-muted/60 rounded-lg" role="tablist" aria-label="Controls panels">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                className={cn(
                  'relative flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  !isActive && 'text-muted-foreground hover:text-foreground'
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="controlsActiveTab"
                    className="absolute inset-0 bg-card rounded-md shadow-sm"
                    transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
                  />
                )}
                <span className={cn('relative', isActive && 'text-foreground')}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'style' && (
            <motion.div
              key="style"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="p-4 space-y-5"
              role="tabpanel"
              id="tabpanel-style"
              aria-labelledby="tab-style"
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
                        'h-8 text-[10px] px-2',
                        JSON.stringify(selectedScene.transform) === JSON.stringify(preset.transform) &&
                          'border-primary bg-primary/10 text-primary'
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
                    <Label className="text-[10px] text-muted-foreground mb-1.5 block">Entry Animation</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="h-9 text-xs">
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
                    <Label className="text-[10px] text-muted-foreground mb-1.5 block">Exit Animation</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="h-9 text-xs">
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
                    <Label className="text-[10px] text-muted-foreground mb-1.5 block">Easing</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="h-9 text-xs">
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
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
                aria-expanded={showAdvanced}
                aria-controls="advanced-transform-section"
              >
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showAdvanced && 'rotate-180')} aria-hidden="true" />
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
                        <Button variant="ghost" size="sm" onClick={handleReset} className="h-6 px-2 text-[10px]">
                          <RotateCcw className="mr-1 h-3 w-3" />
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
              className="p-4 space-y-5"
              role="tabpanel"
              id="tabpanel-camera"
              aria-labelledby="tab-camera"
            >
              {/* Scene Camera */}
              <Section title="Scene Movement">
                <div className="space-y-3">
                  <div>
                    <Label className="text-[10px] text-muted-foreground mb-1 block">Direction</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="h-8 text-xs">
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
            </motion.div>
          )}

          {activeTab === 'audio' && (
            <motion.div
              key="audio"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="p-4 space-y-5"
              role="tabpanel"
              id="tabpanel-audio"
              aria-labelledby="tab-audio"
            >
              {/* Audio Upload */}
              <Section title="Background Music">
                <div className="space-y-3">
                  {project.audioTracks.length === 0 ? (
                    <label
                      htmlFor="audio-upload"
                      className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex flex-col items-center justify-center pt-3 pb-3">
                        <Upload className="w-6 h-6 mb-1.5 text-muted-foreground" aria-hidden="true" />
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Upload audio</span>
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5" id="audio-format-hint">MP3, WAV, OGG</p>
                      </div>
                      <input
                        id="audio-upload"
                        type="file"
                        className="hidden"
                        accept="audio/*"
                        aria-describedby="audio-format-hint"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;

                          const url = await new Promise<string>((resolve) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result as string);
                            reader.readAsDataURL(file);
                          });

                          // Get audio duration
                          const audio = new Audio(url);
                          await new Promise<void>((resolve) => {
                            audio.onloadedmetadata = () => resolve();
                          });

                          addAudioTrack({
                            id: `audio-${Date.now()}`,
                            name: file.name,
                            url,
                            duration: audio.duration * 1000,
                            startTime: 0,
                            volume: 0.8,
                          });
                        }}
                      />
                    </label>
                  ) : (
                    <div className="space-y-2">
                      {project.audioTracks.map((track) => (
                        <div
                          key={track.id}
                          className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border"
                        >
                          <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                            <Music className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{track.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {Math.floor(track.duration / 1000)}s
                            </p>
                          </div>
                          <button
                            onClick={() => removeAudioTrack(track.id)}
                            className="p-1.5 text-muted-foreground hover:text-destructive rounded transition-colors"
                            aria-label={`Remove ${track.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Section>

              {/* Volume Control */}
              {project.audioTracks.length > 0 && (
                <Section title="Volume">
                  <div className="space-y-3">
                    {project.audioTracks.map((track) => (
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

              {/* Depth of Field */}
              <Section title="Depth of Field">
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-foreground">Enable DOF</span>
                    <Switch
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
        </AnimatePresence>
      </div>
    </div>
  );
}

// Helper component for sections
function Section({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon?: typeof Music;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
          <Label className="text-xs font-medium text-foreground">{title}</Label>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
