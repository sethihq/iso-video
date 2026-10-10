'use client';

import { useState, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Globe,
  Check,
  Scan,
  ImagePlus,
  ArrowRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CustomSlider } from '@/components/ui/custom-slider';
import { useEditorStore } from '@/lib/store';
import { VIDEO_STYLE_PRESETS } from '@/lib/presets';
import { CapturedPage, DetectedSection } from '@/lib/types';
import { cn } from '@/lib/utils';
import type { CapturePhase, CaptureSummary } from '@/lib/capture/events';
import { CaptureFailure, isCaptureStream, readCaptureEvents, readErrorMessage } from '@/lib/capture/client';

// Capture phases, in the order the server reports them
const CAPTURE_PHASES: { id: CapturePhase; label: string }[] = [
  { id: 'connect', label: 'Connecting to site' },
  { id: 'capture', label: 'Capturing full page' },
  { id: 'analyze', label: 'Analyzing layout' },
  { id: 'detect', label: 'Detecting sections' },
];

// Give up on a capture when the server sends nothing for this long
const CAPTURE_STALL_MS = 90_000;

// The capture in flight. Bumping `id` turns anything an older capture still reports into a no-op.
interface CaptureHandle {
  id: number;
  controller: AbortController | null;
  stallTimer?: ReturnType<typeof setTimeout>;
  finishTimer?: ReturnType<typeof setTimeout>;
}

// Aborts the request and clears its timers
function stopCapture(capture: CaptureHandle) {
  capture.id += 1;
  capture.controller?.abort();
  capture.controller = null;
  clearTimeout(capture.stallTimer);
  clearTimeout(capture.finishTimer);
}

// Shimmer skeleton with gradient
function ShimmerSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded bg-muted', className)}>
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
        animate={{ x: ['-100%', '100%'] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
}

// Browser mockup component
function BrowserMockup({
  url,
  scanProgress,
  detectedSections,
}: {
  url: string;
  scanProgress: number;
  detectedSections: number;
}) {
  return (
    <div className="relative rounded-lg border border-border bg-card overflow-hidden shadow-lg">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
        </div>
        <div className="flex-1 flex items-center gap-2 px-2 py-1 rounded bg-background/50 text-[10px] text-muted-foreground">
          <Globe className="h-3 w-3" />
          <span className="truncate">{url}</span>
        </div>
      </div>

      {/* Page content area */}
      <div className="relative h-40 bg-gradient-to-b from-muted/30 to-muted/10 overflow-hidden">
        {/* Stylized page skeleton */}
        <div className="p-3 space-y-2">
          <ShimmerSkeleton className="h-8 w-3/4" />
          <ShimmerSkeleton className="h-3 w-full" />
          <ShimmerSkeleton className="h-3 w-5/6" />
          <div className="pt-2 grid grid-cols-3 gap-2">
            <ShimmerSkeleton className="h-12" />
            <ShimmerSkeleton className="h-12" />
            <ShimmerSkeleton className="h-12" />
          </div>
          <ShimmerSkeleton className="h-16 w-full" />
        </div>

        {/* Scanning line effect */}
        <motion.div
          className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent"
          style={{ top: `${scanProgress}%` }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1, repeat: Infinity }}
        />


        {/* Gradient overlay at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-card to-transparent" />
      </div>
    </div>
  );
}

// Progress indicator
function CaptureProgress({
  phase,
  progress,
  detectedCount,
}: {
  phase: number;
  progress: number;
  detectedCount: number;
}) {
  const currentPhase = CAPTURE_PHASES[phase] || CAPTURE_PHASES[0];

  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary via-primary to-primary/50 rounded-full"
          initial={{ width: '0%' }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
        {/* Shimmer effect on progress */}
        <motion.div
          className="absolute inset-y-0 w-20 bg-gradient-to-r from-transparent via-white/30 to-transparent"
          animate={{ x: ['-80px', '300px'] }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
      </div>

      {/* Status text */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-foreground font-medium">
          {currentPhase.label}
        </span>
        {detectedCount > 0 && (
          <motion.span
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-xs text-muted-foreground"
          >
            {detectedCount} sections found
          </motion.span>
        )}
      </div>
    </div>
  );
}

type Step = 'url' | 'capturing' | 'sections' | 'ready';

// Normalize URL - add https:// if missing
function normalizeUrl(input: string): string {
  let url = input.trim();
  if (!url) return '';

  if (!url.match(/^https?:\/\//i)) {
    if (url.match(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+/)) {
      url = 'https://' + url;
    }
  }

  return url;
}

export function UrlPanel() {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('url');
  const [capturePhase, setCapturePhase] = useState(0);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [scanLinePosition, setScanLinePosition] = useState(0);
  const [detectedCount, setDetectedCount] = useState(0);
  const captureRef = useRef<CaptureHandle>({ id: 0, controller: null });

  const {
    capturedPage,
    selectedSectionIds,
    selectedStyleId,
    baseDuration,
    isManualMode,
    scenes,
    screens,
    setCapturedPage,
    toggleSectionSelection,
    selectAllSections,
    deselectAllSections,
    setSelectedStyle,
    setBaseDuration,
    generateVideoFromSections,
    setManualMode,
    addManualScreens,
  } = useEditorStore(
    useShallow((s) => ({
      capturedPage: s.capturedPage,
      selectedSectionIds: s.selectedSectionIds,
      selectedStyleId: s.selectedStyleId,
      baseDuration: s.baseDuration,
      isManualMode: s.isManualMode,
      scenes: s.project.scenes,
      screens: s.project.screens,
      setCapturedPage: s.setCapturedPage,
      toggleSectionSelection: s.toggleSectionSelection,
      selectAllSections: s.selectAllSections,
      deselectAllSections: s.deselectAllSections,
      setSelectedStyle: s.setSelectedStyle,
      setBaseDuration: s.setBaseDuration,
      generateVideoFromSections: s.generateVideoFromSections,
      setManualMode: s.setManualMode,
      addManualScreens: s.addManualScreens,
    }))
  );

  // Animate scan line during capture
  useEffect(() => {
    if (step !== 'capturing') return;

    const interval = setInterval(() => {
      setScanLinePosition((prev) => (prev + 2) % 100);
    }, 50);

    return () => clearInterval(interval);
  }, [step]);

  // Abort a capture that is still running when the panel unmounts
  useEffect(() => {
    const capture = captureRef.current;
    return () => stopCapture(capture);
  }, []);

  // A file dropped outside the upload area would make the browser open it and leave the editor
  useEffect(() => {
    const blockFileDrop = (e: DragEvent) => {
      if (e.defaultPrevented || !e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      if (e.type === 'dragover') e.dataTransfer.dropEffect = 'none';
    };

    window.addEventListener('dragover', blockFileDrop);
    window.addEventListener('drop', blockFileDrop);
    return () => {
      window.removeEventListener('dragover', blockFileDrop);
      window.removeEventListener('drop', blockFileDrop);
    };
  }, []);

  const handleCapture = async () => {
    if (!url.trim()) return;

    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) {
      setError('Please enter a valid URL');
      return;
    }

    const capture = captureRef.current;
    stopCapture(capture);
    const captureId = capture.id;
    const isCurrent = () => capture.id === captureId;
    const controller = new AbortController();
    capture.controller = controller;

    // Restarted on every event, so only a silent server times out
    let stalled = false;
    const watchForStall = () => {
      clearTimeout(capture.stallTimer);
      capture.stallTimer = setTimeout(() => {
        stalled = true;
        controller.abort();
      }, CAPTURE_STALL_MS);
    };

    setStep('capturing');
    setCapturePhase(0);
    setCaptureProgress(0);
    setDetectedCount(0);
    setError(null);
    watchForStall();

    try {
      const response = await fetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalizedUrl }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new CaptureFailure(await readErrorMessage(response, 'Failed to capture website'));
      }
      if (!response.body || !isCaptureStream(response)) {
        throw new CaptureFailure('Failed to capture website');
      }

      // Sections stream in one by one, then the page metadata
      const sections: DetectedSection[] = [];
      let summary: CaptureSummary | null = null;
      for await (const event of readCaptureEvents(response.body)) {
        if (!isCurrent()) return;
        watchForStall();

        if (event.type === 'progress') {
          const phase = CAPTURE_PHASES.findIndex((p) => p.id === event.phase);
          setCapturePhase((prev) => Math.max(prev, phase));
          setCaptureProgress((prev) => Math.max(prev, event.progress));
        } else if (event.type === 'section') {
          sections[event.index] = event.section;
          setDetectedCount((count) => count + 1);
        } else if (event.type === 'done') {
          summary = event.page;
        } else {
          throw new CaptureFailure(event.message);
        }
      }

      if (!isCurrent()) return;
      if (!summary) {
        throw new CaptureFailure('Capture ended unexpectedly. Please try again.');
      }
      clearTimeout(capture.stallTimer);
      capture.controller = null;

      const page: CapturedPage = { ...summary, sections: sections.filter(Boolean) };

      // Complete the progress animation
      setCaptureProgress(100);
      setCapturePhase(CAPTURE_PHASES.length - 1);
      setDetectedCount(page.sections.length);

      // Small delay for completion animation; Cancel clears it
      capture.finishTimer = setTimeout(() => {
        if (!isCurrent()) return;
        setCapturedPage(page);

        // Auto-select all sections except footer
        const nonFooterIds = page.sections
          .filter((s) => s.type !== 'footer')
          .map((s) => s.id);

        useEditorStore.setState({ selectedSectionIds: nonFooterIds });
        setStep('sections');
      }, 500);
    } catch (err) {
      if (!isCurrent()) return;
      clearTimeout(capture.stallTimer);
      capture.controller = null;

      let errorMessage = 'Failed to capture website';
      if (stalled) {
        errorMessage = 'Capture timed out. The page may be too large or slow to load.';
      } else if (err instanceof CaptureFailure) {
        errorMessage = err.message;
      } else {
        console.error('Capture failed:', err);
      }

      setError(errorMessage);
      setStep('url');
    }
  };

  const handleGenerate = () => {
    if (selectedSectionIds.length === 0) return;
    generateVideoFromSections();
    setStep('ready');
  };

  const handleReset = () => {
    stopCapture(captureRef.current);
    setCapturedPage(null);
    useEditorStore.setState({ selectedSectionIds: [] });
    setStep('url');
    setUrl('');
    setError(null);
    setCaptureProgress(0);
    setCapturePhase(0);
    setDetectedCount(0);
  };

  // Shared by the file picker and drag and drop
  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      setError('Please select image files');
      return;
    }

    setError(null);
    try {
      await addManualScreens(imageFiles);
      setStep('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read these images');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    void uploadFiles(e.target.files);
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    void uploadFiles(e.dataTransfer.files);
  };

  return (
    <div className="flex h-full w-full flex-col bg-card">
      {/* Pill Tabs - only show on url step */}
      {step === 'url' && (
        <div className="p-2 border-b border-border shrink-0">
          <div className="flex items-center gap-1 p-1 bg-muted/60 rounded-lg" role="tablist" aria-label="Input method">
            <button
              onClick={() => setManualMode(false)}
              role="tab"
              aria-selected={!isManualMode}
              aria-controls="tabpanel-url"
              tabIndex={!isManualMode ? 0 : -1}
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
                <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                URL
              </span>
            </button>
            <button
              onClick={() => setManualMode(true)}
              role="tab"
              aria-selected={isManualMode}
              aria-controls="tabpanel-upload"
              tabIndex={isManualMode ? 0 : -1}
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
                <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                Upload
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Header for capturing/sections/ready steps */}
      {step !== 'url' && (
        <div className="border-b border-border p-4">
          <h2 className="text-sm font-medium text-foreground mb-1">
            {step === 'capturing' && 'Capturing Website'}
            {step === 'sections' && 'Select Sections'}
            {step === 'ready' && 'Video Ready'}
          </h2>
          <p className="text-xs text-muted-foreground">
            {step === 'capturing' && 'Analyzing page structure...'}
            {step === 'sections' && 'Choose which sections to include'}
            {step === 'ready' && 'Your video is ready to preview and export'}
          </p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {/* URL Input Step */}
          {step === 'url' && (
            <motion.div
              key="url-input"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4 space-y-4"
            >
              {isManualMode ? (
                <div role="tabpanel" id="tabpanel-upload" aria-label="Upload screenshots">
                  <div className="space-y-2">
                    <label
                      htmlFor="screenshot-upload"
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <ImagePlus className="w-8 h-8 mb-2 text-muted-foreground" aria-hidden="true" />
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-xs text-muted-foreground mt-1" id="upload-format-hint">PNG, JPG, WebP</p>
                      </div>
                      <input
                        id="screenshot-upload"
                        type="file"
                        className="hidden"
                        accept="image/*"
                        multiple
                        onChange={handleFileUpload}
                        aria-describedby="upload-format-hint"
                      />
                    </label>
                    {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
                  </div>

                  <div className="pt-4 border-t border-border">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Video Style
                    </label>
                    <div className="grid grid-cols-2 gap-2 mt-2" role="group" aria-label="Video style options">
                      {VIDEO_STYLE_PRESETS.slice(0, 4).map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => setSelectedStyle(preset.id)}
                          aria-pressed={selectedStyleId === preset.id}
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
                </div>
              ) : (
                <div role="tabpanel" id="tabpanel-url" aria-label="Enter website URL">
                  <div className="space-y-2">
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                      <Input
                        type="text"
                        placeholder="example.com"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCapture()}
                        className="pl-9"
                        autoComplete="url"
                        spellCheck={false}
                        aria-label="Website URL"
                      />
                    </div>
                    {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
                  </div>

                  <Button onClick={handleCapture} disabled={!url.trim()} className="w-full group mt-4" size="lg">
                    Capture Website
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </Button>

                  <div className="pt-4 border-t border-border">
                    <h3 className="text-xs font-medium text-muted-foreground mb-3">How it works</h3>
                    <ol className="space-y-2 text-xs text-muted-foreground" aria-label="Steps to create video">
                      <li className="flex gap-2">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-medium" aria-hidden="true">
                          1
                        </span>
                        <span>Paste a website URL</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-medium" aria-hidden="true">
                          2
                        </span>
                        <span>Select which sections to include</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-medium" aria-hidden="true">
                          3
                        </span>
                        <span>Export as video</span>
                      </li>
                    </ol>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Capturing Step - New visual experience */}
          {step === 'capturing' && (
            <motion.div
              key="capturing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4 space-y-4"
            >
              {/* Browser mockup with live preview */}
              <BrowserMockup
                url={url}
                scanProgress={scanLinePosition}
                detectedSections={detectedCount}
              />

              {/* Progress indicator */}
              <CaptureProgress
                phase={capturePhase}
                progress={captureProgress}
                detectedCount={detectedCount}
              />

              {/* Cancel button */}
              <Button variant="ghost" size="sm" onClick={handleReset} className="w-full text-muted-foreground">
                Cancel
              </Button>
            </motion.div>
          )}

          {/* Sections Step */}
          {step === 'sections' && capturedPage && (
            <motion.div
              key="sections"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-4 space-y-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {selectedSectionIds.length} of {capturedPage.sections.length} selected
                </span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={selectAllSections} className="h-7 px-2 text-xs">
                    All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={deselectAllSections} className="h-7 px-2 text-xs">
                    None
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {capturedPage.sections.map((section, index) => {
                  const isSelected = selectedSectionIds.includes(section.id);
                  return (
                    <motion.button
                      key={section.id}
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{
                        delay: index * 0.05,
                        type: 'spring',
                        stiffness: 300,
                        damping: 25,
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
                      <motion.div
                        className={cn(
                          'shrink-0 w-5 h-5 rounded border flex items-center justify-center mt-0.5 transition-colors',
                          isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30'
                        )}
                        animate={isSelected ? { scale: [1, 1.2, 1] } : {}}
                        transition={{ duration: 0.2 }}
                      >
                        <AnimatePresence>
                          {isSelected && (
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                              <Check className="h-3 w-3" />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>

                      <div className="shrink-0 w-16 h-12 rounded overflow-hidden bg-muted group/thumb relative">
                        {section.thumbnail ? (
                          <>
                            <img
                              src={section.thumbnail}
                              alt={section.label}
                              className="w-full h-full object-cover object-top transition-transform group-hover/thumb:scale-110"
                            />
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

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">{section.label}</span>
                          <span
                            className={cn(
                              'shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                              section.type === 'hero' && 'bg-blue-500/10 text-blue-500',
                              section.type === 'features' && 'bg-green-500/10 text-green-500',
                              section.type === 'pricing' && 'bg-amber-500/10 text-amber-500',
                              section.type === 'testimonials' && 'bg-purple-500/10 text-purple-500',
                              section.type === 'cta' && 'bg-red-500/10 text-red-500',
                              section.type === 'footer' && 'bg-gray-500/10 text-gray-500',
                              section.type === 'content' && 'bg-gray-500/10 text-gray-500'
                            )}
                          >
                            {section.type}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{section.bounds.height}px tall</span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-border">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider" id="video-style-label">
                  Video Style
                </label>
                <div className="grid grid-cols-2 gap-2 mt-2" role="group" aria-labelledby="video-style-label">
                  {VIDEO_STYLE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => setSelectedStyle(preset.id)}
                      aria-pressed={selectedStyleId === preset.id}
                      className={cn(
                        'p-2 rounded-lg border text-left transition-all',
                        selectedStyleId === preset.id
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                          : 'border-border hover:border-primary/50'
                      )}
                    >
                      <div className="text-xs font-medium">{preset.name}</div>
                      <div className="text-[10px] text-muted-foreground line-clamp-1">{preset.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <CustomSlider
                  label="Pacing"
                  value={baseDuration}
                  min={2000}
                  max={5000}
                  step={250}
                  valueSubtext={baseDuration < 2500 ? ' Quick' : baseDuration > 3500 ? ' Slow' : ' Normal'}
                  onChange={setBaseDuration}
                />
              </div>

              <div className="flex gap-2 pt-4">
                <motion.div className="flex-1" whileTap={{ scale: 0.97 }}>
                  <Button variant="outline" onClick={handleReset} className="w-full">
                    Cancel
                  </Button>
                </motion.div>
                <motion.div className="flex-1" whileTap={{ scale: 0.97 }}>
                  <Button onClick={handleGenerate} disabled={selectedSectionIds.length === 0} className="w-full">
                    Create Video
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* Ready Step */}
          {step === 'ready' && (
            <motion.div
              key="ready"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="p-4 space-y-4"
            >
              <div className="text-center py-6">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: 'spring', stiffness: 400 }}
                  >
                    <Check className="h-6 w-6 text-green-500" />
                  </motion.div>
                </motion.div>
                <h3 className="text-sm font-semibold text-foreground">Video Generated</h3>
                <p className="text-xs text-muted-foreground mt-1">{scenes.length} scenes ready to preview</p>
              </div>

              <div className="space-y-2">
                {scenes.slice(0, 5).map((scene, i) => {
                  const screen = screens.find((s) => s.id === scene.screenId);
                  return (
                    <motion.div
                      key={scene.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 transition-colors"
                    >
                      <div className="w-12 h-8 rounded overflow-hidden bg-muted shrink-0">
                        {screen?.thumbnail && (
                          <img src={screen.thumbnail} alt="" className="w-full h-full object-cover object-top" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">Scene {i + 1}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {(scene.duration / 1000).toFixed(1)}s · {scene.motion.entry}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
                {scenes.length > 5 && (
                  <div className="text-xs text-center text-muted-foreground py-1">
                    +{scenes.length - 5} more scenes
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-4 border-t border-border">
                <Button variant="outline" onClick={handleReset} className="flex-1">
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
