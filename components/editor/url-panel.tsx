'use client';

import { useState } from 'react';
import {
  Globe,
  Loader2,
  Check,
  Scan,
  Layers,
  Wand2,
  ImagePlus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEditorStore } from '@/lib/store';
import { VIDEO_STYLE_PRESETS } from '@/lib/presets';
import { DetectedSection } from '@/lib/types';
import { cn } from '@/lib/utils';

// Capture progress steps
const CAPTURE_STEPS = [
  { id: 'connect', label: 'Connecting', icon: Globe },
  { id: 'capture', label: 'Capturing page', icon: Scan },
  { id: 'detect', label: 'Detecting sections', icon: Layers },
  { id: 'process', label: 'Processing', icon: Wand2 },
];

// Skeleton section card
function SkeletonSection() {
  return (
    <div className="flex items-start gap-3 p-2 rounded-lg border border-border bg-background animate-pulse">
      <div className="shrink-0 w-5 h-5 rounded border border-muted-foreground/20 mt-0.5" />
      <div className="shrink-0 w-16 h-12 rounded bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-3 bg-muted rounded w-1/2" />
      </div>
    </div>
  );
}

type Step = 'url' | 'sections' | 'ready';

// Normalize URL - add https:// if missing
function normalizeUrl(input: string): string {
  let url = input.trim();
  if (!url) return '';

  // Remove any leading/trailing whitespace
  url = url.trim();

  // If it doesn't start with a protocol, add https://
  if (!url.match(/^https?:\/\//i)) {
    // Check if it looks like a domain
    if (url.match(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+/)) {
      url = 'https://' + url;
    }
  }

  return url;
}

export function UrlPanel() {
  const [url, setUrl] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureStep, setCaptureStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('url');

  const {
    capturedPage,
    selectedSectionIds,
    selectedStyleId,
    baseDuration,
    isManualMode,
    setCapturedPage,
    toggleSectionSelection,
    selectAllSections,
    deselectAllSections,
    setSelectedStyle,
    setBaseDuration,
    generateVideoFromSections,
    setManualMode,
    addManualScreens,
    project,
  } = useEditorStore();

  const handleCapture = async () => {
    if (!url.trim()) return;

    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) {
      setError('Please enter a valid URL');
      return;
    }

    setIsCapturing(true);
    setCaptureStep(0);
    setError(null);

    // Simulate progress steps for better UX
    const stepInterval = setInterval(() => {
      setCaptureStep((prev) => Math.min(prev + 1, CAPTURE_STEPS.length - 1));
    }, 800);

    try {
      const response = await fetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalizedUrl }),
      });

      clearInterval(stepInterval);
      setCaptureStep(CAPTURE_STEPS.length - 1);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Capture failed');
      }

      const data = await response.json();
      setCapturedPage(data);

      // Auto-select all sections except footer
      const nonFooterIds = data.sections
        .filter((s: DetectedSection) => s.type !== 'footer')
        .map((s: DetectedSection) => s.id);

      // Set selected sections in store
      useEditorStore.setState({ selectedSectionIds: nonFooterIds });

      // Small delay to show completion before transition
      await new Promise((resolve) => setTimeout(resolve, 300));
      setStep('sections');
    } catch (err) {
      clearInterval(stepInterval);
      setError(err instanceof Error ? err.message : 'Failed to capture website');
    } finally {
      setIsCapturing(false);
      setCaptureStep(0);
    }
  };

  const handleGenerate = () => {
    if (selectedSectionIds.length === 0) return;
    generateVideoFromSections();
    setStep('ready');
  };

  const handleReset = () => {
    setCapturedPage(null);
    useEditorStore.setState({ selectedSectionIds: [] });
    setStep('url');
    setUrl('');
    setError(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      setError('Please select image files');
      return;
    }

    setError(null);
    await addManualScreens(imageFiles);
    setStep('ready');
  };

  return (
    <div className="flex h-full w-full flex-col bg-card">
      {/* Pill Tabs - only show on url step */}
      {step === 'url' && (
        <div className="p-2 border-b border-border shrink-0">
          <div className="flex items-center gap-1 p-1 bg-muted/60 rounded-lg">
            <button
              onClick={() => setManualMode(false)}
              className={cn(
                'relative flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                isManualMode && 'text-muted-foreground hover:text-foreground'
              )}
            >
              {!isManualMode && (
                <motion.div
                  layoutId="urlPanelActiveTab"
                  className="absolute inset-0 bg-card rounded-md shadow-sm"
                  transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
                />
              )}
              <span className={cn('relative flex items-center gap-1.5', !isManualMode && 'text-foreground')}>
                <Globe className="h-3.5 w-3.5" />
                URL
              </span>
            </button>
            <button
              onClick={() => setManualMode(true)}
              className={cn(
                'relative flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                !isManualMode && 'text-muted-foreground hover:text-foreground'
              )}
            >
              {isManualMode && (
                <motion.div
                  layoutId="urlPanelActiveTab"
                  className="absolute inset-0 bg-card rounded-md shadow-sm"
                  transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
                />
              )}
              <span className={cn('relative flex items-center gap-1.5', isManualMode && 'text-foreground')}>
                <ImagePlus className="h-3.5 w-3.5" />
                Upload
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Header for other steps */}
      {step !== 'url' && (
        <div className="border-b border-border p-4">
          <h2 className="text-sm font-medium text-foreground mb-1">
            {step === 'sections' && 'Select Sections'}
            {step === 'ready' && 'Video Ready'}
          </h2>
          <p className="text-xs text-muted-foreground">
            {step === 'sections' && 'Choose which sections to include'}
            {step === 'ready' && 'Your video is ready to preview and export'}
          </p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {step === 'url' && (
            <motion.div
              key="url-input"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-4 space-y-4"
            >
              {isManualMode ? (
                <>
                  {/* Manual Upload */}
                  <div className="space-y-2">
                    <label
                      htmlFor="screenshot-upload"
                      className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <ImagePlus className="w-8 h-8 mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">PNG, JPG, WebP</p>
                      </div>
                      <input
                        id="screenshot-upload"
                        type="file"
                        className="hidden"
                        accept="image/*"
                        multiple
                        onChange={handleFileUpload}
                      />
                    </label>
                    {error && (
                      <p className="text-xs text-destructive">{error}</p>
                    )}
                  </div>

                  {/* Style selector for manual mode */}
                  <div className="pt-4 border-t border-border">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Video Style
                    </label>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {VIDEO_STYLE_PRESETS.slice(0, 4).map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => setSelectedStyle(preset.id)}
                          className={cn(
                            'p-2 rounded-lg border text-left transition-all',
                            selectedStyleId === preset.id
                              ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                              : 'border-border hover:border-primary/50'
                          )}
                        >
                          <div className="text-xs font-medium">{preset.name}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* URL Input */}
                  <div className="space-y-2">
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="example.com"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCapture()}
                        className="pl-9"
                        autoComplete="url"
                        spellCheck={false}
                      />
                    </div>
                    {error && (
                      <p className="text-xs text-destructive">{error}</p>
                    )}
                  </div>

                  <Button
                    onClick={handleCapture}
                    disabled={!url.trim() || isCapturing}
                    className="w-full"
                    size="lg"
                  >
                    {isCapturing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {CAPTURE_STEPS[captureStep]?.label || 'Processing'}...
                      </>
                    ) : (
                      'Capture Website'
                    )}
                  </Button>
                </>
              )}

              {/* Capture Progress */}
              <AnimatePresence>
                {isCapturing && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-4 space-y-4">
                      {/* Progress Steps */}
                      <div className="flex items-center justify-between">
                        {CAPTURE_STEPS.map((s, i) => {
                          const Icon = s.icon;
                          const isActive = i === captureStep;
                          const isComplete = i < captureStep;
                          return (
                            <div key={s.id} className="flex flex-col items-center gap-1">
                              <motion.div
                                className={cn(
                                  'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                                  isComplete && 'bg-green-500/10 text-green-500',
                                  isActive && 'bg-primary/10 text-primary',
                                  !isComplete && !isActive && 'bg-muted text-muted-foreground'
                                )}
                                animate={isActive ? { scale: [1, 1.1, 1] } : {}}
                                transition={{ repeat: Infinity, duration: 1 }}
                              >
                                {isComplete ? (
                                  <Check className="h-4 w-4" />
                                ) : (
                                  <Icon className="h-4 w-4" />
                                )}
                              </motion.div>
                              <span className={cn(
                                'text-[9px] text-center',
                                isActive ? 'text-foreground' : 'text-muted-foreground'
                              )}>
                                {s.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Skeleton Preview */}
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">Detecting sections...</div>
                        <SkeletonSection />
                        <SkeletonSection />
                        <SkeletonSection />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* How it works */}
              {!isManualMode && (
                <div className="pt-4 border-t border-border">
                  <h3 className="text-xs font-medium text-muted-foreground mb-3">How it works</h3>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex gap-2">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-medium">1</span>
                      <span>Paste a website URL</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-medium">2</span>
                      <span>Select which sections to include</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-medium">3</span>
                      <span>Export as video</span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {step === 'sections' && capturedPage && (
            <motion.div
              key="sections"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-4 space-y-4"
            >
              {/* Section selection */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {selectedSectionIds.length} of {capturedPage.sections.length} selected
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={selectAllSections}
                    className="h-7 px-2 text-xs"
                  >
                    All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={deselectAllSections}
                    className="h-7 px-2 text-xs"
                  >
                    None
                  </Button>
                </div>
              </div>

              {/* Section cards */}
              <div className="space-y-2">
                {capturedPage.sections.map((section, index) => {
                  const isSelected = selectedSectionIds.includes(section.id);
                  return (
                    <motion.button
                      key={section.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: index * 0.03,
                        duration: 0.15,
                        ease: [0.16, 1, 0.3, 1]
                      }}
                      onClick={() => toggleSectionSelection(section.id)}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      className={cn(
                        'w-full flex items-start gap-3 p-2 rounded-lg border text-left transition-colors',
                        isSelected
                          ? 'border-primary bg-primary/5 shadow-sm shadow-primary/10'
                          : 'border-border bg-background hover:border-primary/50 hover:bg-accent/50'
                      )}
                    >
                      {/* Checkbox */}
                      <motion.div
                        className={cn(
                          'shrink-0 w-5 h-5 rounded border flex items-center justify-center mt-0.5 transition-colors',
                          isSelected
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-muted-foreground/30'
                        )}
                        animate={isSelected ? { scale: [1, 1.2, 1] } : {}}
                        transition={{ duration: 0.2 }}
                      >
                        <AnimatePresence>
                          {isSelected && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              exit={{ scale: 0 }}
                            >
                              <Check className="h-3 w-3" />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>

                      {/* Thumbnail with hover zoom */}
                      <div className="shrink-0 w-16 h-12 rounded overflow-hidden bg-muted group/thumb relative">
                        {section.thumbnail ? (
                          <>
                            <img
                              src={section.thumbnail}
                              alt={section.label}
                              className="w-full h-full object-cover object-top transition-transform group-hover/thumb:scale-110"
                            />
                            {/* Hover overlay with full preview indicator */}
                            <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/20 transition-colors flex items-center justify-center">
                              <Scan className="h-4 w-4 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity" />
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
                            No preview
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">
                            {section.label}
                          </span>
                          <span className={cn(
                            'shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                            section.type === 'hero' && 'bg-blue-500/10 text-blue-500',
                            section.type === 'features' && 'bg-green-500/10 text-green-500',
                            section.type === 'pricing' && 'bg-amber-500/10 text-amber-500',
                            section.type === 'testimonials' && 'bg-purple-500/10 text-purple-500',
                            section.type === 'cta' && 'bg-red-500/10 text-red-500',
                            section.type === 'footer' && 'bg-gray-500/10 text-gray-500',
                            section.type === 'content' && 'bg-gray-500/10 text-gray-500',
                          )}>
                            {section.type}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {section.bounds.height}px tall
                        </span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              {/* Style selector */}
              <div className="pt-4 border-t border-border">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Video Style
                </label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {VIDEO_STYLE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => setSelectedStyle(preset.id)}
                      className={cn(
                        'p-2 rounded-lg border text-left transition-all',
                        selectedStyleId === preset.id
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                          : 'border-border hover:border-primary/50'
                      )}
                    >
                      <div className="text-xs font-medium">{preset.name}</div>
                      <div className="text-[10px] text-muted-foreground line-clamp-1">
                        {preset.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration slider */}
              <div className="pt-4 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Pacing
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {baseDuration < 2500 ? 'Quick' : baseDuration > 3500 ? 'Detailed' : 'Normal'}
                  </span>
                </div>
                <input
                  type="range"
                  min={2000}
                  max={5000}
                  step={250}
                  value={baseDuration}
                  onChange={(e) => setBaseDuration(Number(e.target.value))}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>Quick</span>
                  <span>Detailed</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4">
                <motion.div className="flex-1" whileTap={{ scale: 0.97 }}>
                  <Button
                    variant="outline"
                    onClick={handleReset}
                    className="w-full"
                  >
                    Cancel
                  </Button>
                </motion.div>
                <motion.div
                  className="flex-1"
                  whileTap={{ scale: 0.97 }}
                >
                  <Button
                    onClick={handleGenerate}
                    disabled={selectedSectionIds.length === 0}
                    className="w-full"
                  >
                    Create Video
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          )}

          {step === 'ready' && (
            <motion.div
              key="ready"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="p-4 space-y-4"
            >
              {/* Success state - subtle, immediate feedback */}
              <div className="text-center py-6">
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3"
                >
                  <Check className="h-6 w-6 text-green-500" />
                </motion.div>
                <h3 className="text-sm font-semibold text-foreground">
                  Video Generated
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {project.scenes.length} scenes ready to preview
                </p>
              </div>

              {/* Scene summary */}
              <div className="space-y-2">
                {project.scenes.slice(0, 5).map((scene, i) => {
                  const screen = project.screens.find((s) => s.id === scene.screenId);
                  return (
                    <div
                      key={scene.id}
                      className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 transition-colors"
                    >
                      <div className="w-12 h-8 rounded overflow-hidden bg-muted shrink-0">
                        {screen?.thumbnail && (
                          <img
                            src={screen.thumbnail}
                            alt=""
                            className="w-full h-full object-cover object-top"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">
                          Scene {i + 1}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {(scene.duration / 1000).toFixed(1)}s · {scene.motion.entry}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {project.scenes.length > 5 && (
                  <div className="text-xs text-center text-muted-foreground py-1">
                    +{project.scenes.length - 5} more scenes
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t border-border">
                <Button
                  variant="outline"
                  onClick={handleReset}
                  className="flex-1"
                >
                  Start New
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
