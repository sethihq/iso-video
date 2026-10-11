'use client';

import { useState, useCallback, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Download,
  Film,
  Image,
  Zap,
  Check,
  Loader2,
  Rocket,
  Settings2,
  AlertCircle,
  createLucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  ExportQuality,
  ExportSettings,
  EXPORT_PRESETS,
  DEFAULT_EXPORT_SETTINGS,
  ExportFormat,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { useEditorStore, useTotalDuration } from '@/lib/store';
import { usePlaybackStore } from '@/lib/playback';
import { GIF_FPS, gifDimensions, outputDimensions, videoBitrate } from '@/lib/export-settings';
import { FieldLabel, IconButton, SectionTitle, Segmented } from './ui';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string; icon: typeof Film; desc: string }[] = [
  { value: 'mp4', label: 'MP4', icon: Film, desc: 'Universal video' },
  { value: 'webm', label: 'WebM', icon: Film, desc: 'High quality video' },
  { value: 'gif', label: 'GIF', icon: Image, desc: 'Animated image' },
];

const QUALITY_OPTIONS: { value: ExportQuality; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'ultra', label: 'Ultra' },
];

// Lucide 1.0 removed its brand icons, so these keep the outlines lucide-react 0.562 shipped.
const Twitter = createLucideIcon('twitter', [
  ['path', { d: 'M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z', key: 'pff0z6' }],
]);
const Instagram = createLucideIcon('instagram', [
  ['rect', { width: '20', height: '20', x: '2', y: '2', rx: '5', ry: '5', key: '2e1cvw' }],
  ['path', { d: 'M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z', key: '9exkf1' }],
  ['line', { x1: '17.5', x2: '17.51', y1: '6.5', y2: '6.5', key: 'r4j83e' }],
]);
const Youtube = createLucideIcon('youtube', [
  ['path', { d: 'M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17', key: '1q2vi4' }],
  ['path', { d: 'm10 15 5-3-5-3z', key: '1jp15x' }],
]);

const PLATFORM_ICONS: Record<string, typeof Twitter> = {
  Twitter: Twitter,
  Instagram: Instagram,
  YouTube: Youtube,
  'Product Hunt': Rocket,
};


const exportFileName = (format: string) => `video-${Date.now()}.${format}`;

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const { sceneCount, hasAudio, projectSettings, updateSettings, setExporting } = useEditorStore(
    useShallow((s) => ({
      sceneCount: s.project.scenes.length,
      hasAudio: s.project.audioTracks.length > 0,
      projectSettings: s.project.settings,
      updateSettings: s.updateSettings,
      setExporting: s.setExporting,
    }))
  );
  const totalDuration = useTotalDuration();
  // Size, shape and frame rate live on the project, so the preview matches the export
  const [options, setOptions] = useState({
    format: DEFAULT_EXPORT_SETTINGS.format,
    quality: DEFAULT_EXPORT_SETTINGS.quality,
    includeAudio: DEFAULT_EXPORT_SETTINGS.includeAudio,
  });
  const settings: ExportSettings = {
    ...options,
    resolution: projectSettings.resolution,
    aspectRatio: projectSettings.aspectRatio,
    fps: projectSettings.fps,
  };
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handlePresetSelect = useCallback((presetId: string) => {
    const preset = EXPORT_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setOptions({ format: preset.format, quality: preset.quality, includeAudio: true });
      updateSettings({ resolution: preset.resolution, aspectRatio: preset.aspectRatio, fps: preset.fps });
      setActivePreset(presetId);
    }
  }, [updateSettings]);

  const handleSettingChange = useCallback(<K extends keyof ExportSettings>(
    key: K,
    value: ExportSettings[K]
  ) => {
    if (key === 'resolution' || key === 'aspectRatio' || key === 'fps') {
      updateSettings({ [key]: value });
    } else {
      setOptions((prev) => ({ ...prev, [key]: value }));
    }
    setActivePreset(null); // Clear preset when manually changing
  }, [updateSettings]);

  const dimensions = outputDimensions(settings.resolution, settings.aspectRatio);

  const handleExport = async () => {
    if (sceneCount === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;
    usePlaybackStore.getState().pause();
    setIsExporting(true);
    setExporting(true);
    setExportProgress(0);
    setExportError(null);

    try {
      const { width, height } = outputDimensions(settings.resolution, settings.aspectRatio);
      const { format, quality, fps, includeAudio } = settings;

      // Loaded on demand, so the encoder isn't part of the editor's first load
      const { exportVideo, downloadBlob } = await import('@/lib/video-export');
      const blob = await exportVideo(useEditorStore.getState().project, {
        width,
        height,
        fps,
        quality,
        format,
        includeAudio: includeAudio && format !== 'gif',
        signal: controller.signal,
        onProgress: setExportProgress,
      });

      // Cancel can land while the file is being finalized
      if (controller.signal.aborted) return;
      downloadBlob(blob, exportFileName(format));

      // Brief delay to show 100%
      await new Promise((resolve) => setTimeout(resolve, 300));
      onClose();
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error('Export failed:', error);
        setExportError(error instanceof Error ? error.message : 'Export failed');
      }
    } finally {
      abortRef.current = null;
      setIsExporting(false);
      setExporting(false);
      setExportProgress(0);
    }
  };

  const handleCancelExport = () => {
    abortRef.current?.abort();
  };

  // Closing is blocked mid-export; cancel first
  const handleClose = () => {
    if (!isExporting) onClose();
  };

  const gifSize = gifDimensions(dimensions.width, dimensions.height);
  const bitrateFor = (quality: ExportQuality) => videoBitrate(quality, dimensions.width, dimensions.height, settings.fps);
  // Video bitrate is a target, so the real file is usually a little smaller
  const estimatedSize = Math.max(1, Math.round(((totalDuration / 1000) * bitrateFor(settings.quality)) / 8 / 1_000_000));

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
        onClick={handleClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
      >
        {/* No overflow clip here, so the close button's tooltip can spill past the corner */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="squircle relative mx-4 w-full max-w-lg rounded-[22px] bg-card shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_24px_60px_-20px_rgba(0,0,0,0.35)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-5 pt-5">
            <div className="flex items-center gap-3">
              <div className="squircle grid size-9 shrink-0 place-items-center rounded-[12px] bg-white">
                <Download className="size-4 text-primary-press" aria-hidden="true" />
              </div>
              <div>
                <h2 id="export-modal-title" className="text-[15px] font-semibold text-foreground">Export Video</h2>
                <p className="text-[12px] tabular-nums text-muted-foreground">
                  {sceneCount} scenes &middot; {(totalDuration / 1000).toFixed(1)}s
                </p>
              </div>
            </div>
            <IconButton label="Close export modal" size="sm" onClick={handleClose} disabled={isExporting}>
              <X className="size-4" aria-hidden="true" />
            </IconButton>
          </div>

          {/* Content */}
          <div className="scroll-slim max-h-[70vh] space-y-5 overflow-y-auto px-5 py-4">
            {/* Quick Presets */}
            <div>
              <SectionTitle>
                <span id="quick-export-label">Quick Export</span>
              </SectionTitle>
              <div className="grid grid-cols-2 gap-1.5" role="group" aria-labelledby="quick-export-label">
                {EXPORT_PRESETS.map((preset) => {
                  const Icon = PLATFORM_ICONS[preset.platform] || Film;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handlePresetSelect(preset.id)}
                      aria-pressed={activePreset === preset.id}
                      className={cn(
                        'squircle flex min-w-0 items-center gap-2.5 rounded-[14px] p-2 text-left transition-colors duration-100',
                        activePreset === preset.id ? 'bg-primary-soft' : 'bg-well hover:bg-well-hover'
                      )}
                    >
                      <div className="squircle grid size-8 shrink-0 place-items-center rounded-[10px] bg-white">
                        <Icon
                          className={cn(
                            'size-4',
                            activePreset === preset.id ? 'text-primary-press' : 'text-muted-foreground'
                          )}
                          aria-hidden="true"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-foreground">{preset.name}</p>
                        <p className="text-[11px] tabular-nums text-muted-foreground">
                          {preset.aspectRatio} &middot; {preset.resolution} &middot; {preset.format.toUpperCase()}
                        </p>
                      </div>
                      {activePreset === preset.id && (
                        <Check className="ml-auto size-4 shrink-0 text-primary-press" strokeWidth={2.5} aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Format Selection */}
            <div>
              <SectionTitle>Format</SectionTitle>
              <Segmented
                label="Format"
                value={settings.format}
                options={FORMAT_OPTIONS.map((option) => ({
                  value: option.value,
                  label: (
                    <span className="flex flex-col items-center gap-0.5 leading-4">
                      <option.icon className="mb-0.5 size-4" aria-hidden="true" />
                      <span>{option.label}</span>
                      <span className="text-[11px] font-normal opacity-80">{option.desc}</span>
                    </span>
                  ),
                }))}
                onChange={(format) => handleSettingChange('format', format)}
                className="h-[72px]"
              />
            </div>

            {/* Quality */}
            <div>
              <SectionTitle>Quality</SectionTitle>
              <Segmented
                label="Quality"
                value={settings.quality}
                options={QUALITY_OPTIONS.map((option) => ({
                  value: option.value,
                  label: (
                    <span className="flex flex-col items-center gap-0.5 leading-4">
                      <span>{option.label}</span>
                      <span className="text-[11px] font-normal tabular-nums opacity-80">
                        ~{Math.round(bitrateFor(option.value) / 1_000_000)} Mbps
                      </span>
                    </span>
                  ),
                }))}
                onChange={(quality) => handleSettingChange('quality', quality)}
                className="h-[52px]"
              />
            </div>

            {/* Advanced Toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="squircle -ml-2 flex h-7 items-center gap-1.5 rounded-[8px] px-2 text-[12px] font-medium text-muted-foreground transition-colors duration-100 hover:bg-black/5 hover:text-foreground"
              aria-expanded={showAdvanced}
              aria-controls="advanced-export-settings"
            >
              <Settings2 className="size-3.5" aria-hidden="true" />
              <span>{showAdvanced ? 'Hide' : 'Show'} Advanced Settings</span>
            </button>

            {/* Advanced Settings */}
            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  // Clipped only while it grows and shrinks, so the menus inside can open past its edge
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }}
                  exit={{ height: 0, opacity: 0, overflow: 'hidden' }}
                  className="space-y-4 overflow-hidden"
                  id="advanced-export-settings"
                >
                  <div className="grid grid-cols-2 gap-3">
                    {/* Resolution */}
                    <div>
                      <FieldLabel>Resolution</FieldLabel>
                      <DropdownMenu>
                        <DropdownMenuTrigger>
                          {settings.resolution === '720p' && '720p (HD)'}
                          {settings.resolution === '1080p' && '1080p (Full HD)'}
                          {settings.resolution === '4k' && '4K (Ultra HD)'}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            onClick={() => handleSettingChange('resolution', '720p')}
                            selected={settings.resolution === '720p'}
                          >
                            720p (HD)
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleSettingChange('resolution', '1080p')}
                            selected={settings.resolution === '1080p'}
                          >
                            1080p (Full HD)
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleSettingChange('resolution', '4k')}
                            selected={settings.resolution === '4k'}
                          >
                            4K (Ultra HD)
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Aspect Ratio */}
                    <div>
                      <FieldLabel>Aspect Ratio</FieldLabel>
                      <DropdownMenu>
                        <DropdownMenuTrigger>
                          {settings.aspectRatio === '16:9' && '16:9 (Landscape)'}
                          {settings.aspectRatio === '1:1' && '1:1 (Square)'}
                          {settings.aspectRatio === '9:16' && '9:16 (Portrait)'}
                          {settings.aspectRatio === '4:3' && '4:3 (Classic)'}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            onClick={() => handleSettingChange('aspectRatio', '16:9')}
                            selected={settings.aspectRatio === '16:9'}
                          >
                            16:9 (Landscape)
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleSettingChange('aspectRatio', '1:1')}
                            selected={settings.aspectRatio === '1:1'}
                          >
                            1:1 (Square)
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleSettingChange('aspectRatio', '9:16')}
                            selected={settings.aspectRatio === '9:16'}
                          >
                            9:16 (Portrait)
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleSettingChange('aspectRatio', '4:3')}
                            selected={settings.aspectRatio === '4:3'}
                          >
                            4:3 (Classic)
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* FPS */}
                    <div>
                      <FieldLabel>Frame Rate</FieldLabel>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="tabular-nums">
                          {settings.fps} FPS
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            onClick={() => handleSettingChange('fps', 30)}
                            selected={settings.fps === 30}
                          >
                            30 FPS
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleSettingChange('fps', 60)}
                            selected={settings.fps === 60}
                          >
                            60 FPS
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Include Audio, level with the Frame Rate field beside it */}
                    <div className="flex h-8 items-center justify-between self-end">
                      <span className="text-[12px] font-medium text-muted-foreground" aria-hidden="true">Include Audio</span>
                      <Switch
                        aria-label="Include audio"
                        checked={settings.includeAudio && hasAudio && settings.format !== 'gif'}
                        onCheckedChange={(v) => handleSettingChange('includeAudio', v)}
                        disabled={settings.format === 'gif' || !hasAudio}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Output Info */}
            <div className="squircle flex items-center justify-between gap-3 rounded-[14px] bg-white px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <Zap className="size-4 text-faint" aria-hidden="true" />
                <div>
                  <p className="text-[12px] font-medium tabular-nums text-foreground">
                    {settings.format === 'gif' ? `${gifSize.width} x ${gifSize.height}` : `${dimensions.width} x ${dimensions.height}`}
                  </p>
                  <p className="text-[11px] tabular-nums text-muted-foreground">
                    {settings.format === 'gif' ? `${Math.min(settings.fps, GIF_FPS)} FPS` : `${settings.fps} FPS`}
                    {settings.format !== 'gif' && <> &middot; ~{estimatedSize} MB estimated</>}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[12px] font-medium uppercase text-foreground">{settings.format}</p>
                <p className="text-[11px] capitalize text-muted-foreground">{settings.quality} quality</p>
              </div>
            </div>

            {/* Error Display */}
            {exportError && (
              <div role="alert" className="squircle flex items-center gap-2 rounded-[12px] bg-destructive/10 px-3 py-2.5 text-destructive-foreground">
                <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                <p className="text-[12px]">{exportError}</p>
              </div>
            )}

            {/* Format Note */}
            {settings.format === 'gif' && (
              <p className="text-[11px] text-muted-foreground">
                GIFs are optimized for smaller file sizes (max 800px wide, {GIF_FPS} FPS, no audio).
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 pt-1 pb-5">
            {/* Export progress */}
            {isExporting && (
              <div className="relative mr-1 h-1.5 flex-1 overflow-hidden rounded-full bg-well">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary"
                  initial={{ width: '0%' }}
                  animate={{ width: `${exportProgress}%` }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                />
              </div>
            )}
            <Button variant="ghost" size="lg" onClick={isExporting ? handleCancelExport : onClose}>
              Cancel
            </Button>
            <Button
              size="lg"
              onClick={handleExport}
              disabled={isExporting || sceneCount === 0}
              className="min-w-[120px]"
            >
              {isExporting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  <span className="tabular-nums">{Math.round(exportProgress)}%</span>
                </>
              ) : (
                <>
                  <Download className="size-4" aria-hidden="true" />
                  Export
                </>
              )}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
