'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Download,
  Film,
  Image,
  Zap,
  Check,
  Loader2,
  Twitter,
  Instagram,
  Youtube,
  Rocket,
  Settings2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ExportQuality,
  ExportSettings,
  EXPORT_PRESETS,
  DEFAULT_EXPORT_SETTINGS,
  Resolution,
  AspectRatio,
  ExportFormat,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { useEditorStore, useTotalDuration } from '@/lib/store';
import { exportScenesAsVideo, downloadBlob, SceneExportData } from '@/lib/video-export';
import { DEFAULT_TRANSFORM } from '@/lib/types';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string; icon: typeof Film; desc: string }[] = [
  { value: 'webm', label: 'WebM', icon: Film, desc: 'High quality video' },
  { value: 'gif', label: 'GIF', icon: Image, desc: 'Animated image' },
];

const QUALITY_OPTIONS: { value: ExportQuality; label: string; desc: string }[] = [
  { value: 'low', label: 'Low', desc: '~2 Mbps' },
  { value: 'medium', label: 'Medium', desc: '~5 Mbps' },
  { value: 'high', label: 'High', desc: '~10 Mbps' },
  { value: 'ultra', label: 'Ultra', desc: '~20 Mbps' },
];

const PLATFORM_ICONS: Record<string, typeof Twitter> = {
  Twitter: Twitter,
  Instagram: Instagram,
  YouTube: Youtube,
  'Product Hunt': Rocket,
};

const RESOLUTION_MAP: Record<Resolution, { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '4k': { width: 3840, height: 2160 },
};

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const { project } = useEditorStore();
  const totalDuration = useTotalDuration();
  const [settings, setSettings] = useState<ExportSettings>(DEFAULT_EXPORT_SETTINGS);
  const [activePreset, setActivePreset] = useState<string | null>('twitter-landscape');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handlePresetSelect = useCallback((presetId: string) => {
    const preset = EXPORT_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setSettings({
        format: preset.format,
        quality: preset.quality,
        resolution: preset.resolution,
        aspectRatio: preset.aspectRatio,
        fps: preset.fps,
        includeAudio: true,
      });
      setActivePreset(presetId);
    }
  }, []);

  const handleSettingChange = useCallback(<K extends keyof ExportSettings>(
    key: K,
    value: ExportSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setActivePreset(null); // Clear preset when manually changing
  }, []);

  const getOutputDimensions = useCallback(() => {
    const base = RESOLUTION_MAP[settings.resolution];
    if (settings.aspectRatio === '16:9') {
      return base;
    } else if (settings.aspectRatio === '1:1') {
      const size = Math.min(base.width, base.height);
      return { width: size, height: size };
    } else if (settings.aspectRatio === '9:16') {
      return { width: base.height, height: base.width };
    } else if (settings.aspectRatio === '4:3') {
      return { width: base.height * (4 / 3), height: base.height };
    }
    return base;
  }, [settings.resolution, settings.aspectRatio]);

  const handleExport = useCallback(async () => {
    if (project.scenes.length === 0) return;

    setIsExporting(true);
    setExportProgress(0);
    setExportError(null);

    try {
      const dimensions = getOutputDimensions();
      const { fps, quality, format } = settings;

      // Prepare scene data with high-quality images
      const sceneData: SceneExportData[] = project.scenes.map((scene) => {
        const screen = project.screens.find((s) => s.id === scene.screenId);
        // Use imageUrl (high quality) first, fall back to thumbnail
        const imageUrl = screen?.imageUrl || screen?.thumbnail || '';

        return {
          imageUrl,
          duration: scene.duration,
          transform: scene.transform || DEFAULT_TRANSFORM,
        };
      }).filter((s) => s.imageUrl); // Only include scenes with images

      if (sceneData.length === 0) {
        throw new Error('No valid scenes to export. Make sure scenes have images.');
      }

      // Export video with progress tracking
      const blob = await exportScenesAsVideo(sceneData, {
        width: dimensions.width,
        height: dimensions.height,
        fps,
        quality,
        format,
        onProgress: setExportProgress,
      });

      // Download with correct extension
      const extension = format === 'gif' ? 'gif' : 'webm';
      const filename = `video-${Date.now()}.${extension}`;
      downloadBlob(blob, filename);

      // Brief delay to show 100%
      await new Promise((resolve) => setTimeout(resolve, 300));
      onClose();
    } catch (error) {
      console.error('Export failed:', error);
      setExportError(error instanceof Error ? error.message : 'Export failed');
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  }, [project.scenes, project.screens, settings, getOutputDimensions, onClose]);

  const dimensions = getOutputDimensions();
  const estimatedSize = Math.round(
    (totalDuration / 1000) *
      (settings.quality === 'ultra' ? 2.5 : settings.quality === 'high' ? 1.25 : settings.quality === 'medium' ? 0.625 : 0.25)
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-lg mx-4 bg-card rounded-xl border border-border shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Download className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Export Video</h2>
                <p className="text-xs text-muted-foreground">
                  {project.scenes.length} scenes &middot; {(totalDuration / 1000).toFixed(1)}s
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
            {/* Quick Presets */}
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 block">
                Quick Export
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {EXPORT_PRESETS.map((preset) => {
                  const Icon = PLATFORM_ICONS[preset.platform] || Film;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => handlePresetSelect(preset.id)}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-lg border text-left transition-all',
                        activePreset === preset.id
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                          : 'border-border hover:border-primary/50 hover:bg-muted/50'
                      )}
                    >
                      <div
                        className={cn(
                          'w-8 h-8 rounded-md flex items-center justify-center shrink-0',
                          activePreset === preset.id ? 'bg-primary/10' : 'bg-muted'
                        )}
                      >
                        <Icon
                          className={cn(
                            'h-4 w-4',
                            activePreset === preset.id ? 'text-primary' : 'text-muted-foreground'
                          )}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{preset.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {preset.aspectRatio} &middot; {preset.resolution} &middot; {preset.format.toUpperCase()}
                        </p>
                      </div>
                      {activePreset === preset.id && (
                        <Check className="h-4 w-4 text-primary ml-auto shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Format Selection */}
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 block">
                Format
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {FORMAT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleSettingChange('format', option.value)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all',
                      settings.format === option.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    )}
                  >
                    <option.icon
                      className={cn(
                        'h-5 w-5',
                        settings.format === option.value ? 'text-primary' : 'text-muted-foreground'
                      )}
                    />
                    <span className="text-xs font-medium">{option.label}</span>
                    <span className="text-[10px] text-muted-foreground">{option.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Quality */}
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 block">
                Quality
              </Label>
              <div className="grid grid-cols-4 gap-2">
                {QUALITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleSettingChange('quality', option.value)}
                    className={cn(
                      'flex flex-col items-center gap-1 p-2.5 rounded-lg border transition-all',
                      settings.quality === option.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    )}
                  >
                    <span className="text-xs font-medium">{option.label}</span>
                    <span className="text-[10px] text-muted-foreground">{option.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced Toggle */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span>{showAdvanced ? 'Hide' : 'Show'} Advanced Settings</span>
            </button>

            {/* Advanced Settings */}
            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="space-y-4 overflow-hidden"
                >
                  <div className="grid grid-cols-2 gap-4">
                    {/* Resolution */}
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Resolution</Label>
                      <Select
                        value={settings.resolution}
                        onValueChange={(v) => handleSettingChange('resolution', v as Resolution)}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="720p" className="text-xs">720p (HD)</SelectItem>
                          <SelectItem value="1080p" className="text-xs">1080p (Full HD)</SelectItem>
                          <SelectItem value="4k" className="text-xs">4K (Ultra HD)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Aspect Ratio */}
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Aspect Ratio</Label>
                      <Select
                        value={settings.aspectRatio}
                        onValueChange={(v) => handleSettingChange('aspectRatio', v as AspectRatio)}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="16:9" className="text-xs">16:9 (Landscape)</SelectItem>
                          <SelectItem value="1:1" className="text-xs">1:1 (Square)</SelectItem>
                          <SelectItem value="9:16" className="text-xs">9:16 (Portrait)</SelectItem>
                          <SelectItem value="4:3" className="text-xs">4:3 (Classic)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* FPS */}
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Frame Rate</Label>
                      <Select
                        value={String(settings.fps)}
                        onValueChange={(v) => handleSettingChange('fps', Number(v) as 30 | 60)}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30" className="text-xs">30 FPS</SelectItem>
                          <SelectItem value="60" className="text-xs">60 FPS</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Include Audio */}
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Include Audio</Label>
                      <Switch
                        checked={settings.includeAudio}
                        onCheckedChange={(v) => handleSettingChange('includeAudio', v)}
                        disabled={settings.format === 'gif'}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Output Info */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center gap-3">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs font-medium text-foreground">
                    {settings.format === 'gif' ? `${Math.min(dimensions.width, 800)} x ${Math.round(Math.min(dimensions.width, 800) * (dimensions.height / dimensions.width))}` : `${dimensions.width} x ${dimensions.height}`}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {settings.format === 'gif' ? `${Math.min(settings.fps, 15)} FPS` : `${settings.fps} FPS`} &middot; ~{settings.format === 'gif' ? Math.round(estimatedSize * 0.5) : estimatedSize} MB estimated
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-foreground uppercase">{settings.format}</p>
                <p className="text-[10px] text-muted-foreground capitalize">{settings.quality} quality</p>
              </div>
            </div>

            {/* Error Display */}
            {exportError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p className="text-xs">{exportError}</p>
              </div>
            )}

            {/* Format Note */}
            {settings.format === 'gif' && (
              <p className="text-[10px] text-muted-foreground">
                GIFs are optimized for smaller file sizes (max 800px wide, 15 FPS).
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border bg-muted/30">
            <Button variant="outline" onClick={onClose} disabled={isExporting}>
              Cancel
            </Button>
            <Button
              onClick={handleExport}
              disabled={isExporting || project.scenes.length === 0}
              className="min-w-[120px]"
            >
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {Math.round(exportProgress)}%
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </>
              )}
            </Button>
          </div>

          {/* Progress Overlay */}
          {isExporting && (
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: exportProgress / 100 }}
              className="absolute bottom-0 left-0 right-0 h-1 bg-primary origin-left"
            />
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
