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
import { CAPTURE_WIDTHS, type CapturePhase, type CaptureSummary, type CaptureWidth } from '@/lib/capture/events';
import { CaptureFailure, isCaptureStream, readCaptureEvents, readErrorMessage } from '@/lib/capture/client';
import { SectionTitle, Segmented, TabSwitch } from './ui';

// Capture phases, in the order the server reports them
const CAPTURE_PHASES: { id: CapturePhase; label: string }[] = [
  { id: 'connect', label: 'Connecting to site' },
  { id: 'capture', label: 'Loading the full page' },
  { id: 'analyze', label: 'Finding sections' },
  { id: 'detect', label: 'Taking screenshots' },
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
    <div className={cn('squircle relative overflow-hidden rounded-[6px] bg-black/[0.06]', className)}>
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/70 to-transparent"
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
    <div className="squircle relative overflow-hidden rounded-[16px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_12px_32px_-14px_rgba(0,0,0,0.25)]">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex gap-1" aria-hidden="true">
          <div className="size-2 rounded-full bg-black/10" />
          <div className="size-2 rounded-full bg-black/10" />
          <div className="size-2 rounded-full bg-black/10" />
        </div>
        <div className="squircle flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-full bg-well px-2 text-[11px] text-muted-foreground">
          <Globe className="size-3 shrink-0 text-faint" aria-hidden="true" />
          <span className="truncate">{url}</span>
        </div>
      </div>

      {/* Page content area */}
      <div className="relative h-40 overflow-hidden">
        {/* Stylized page skeleton */}
        <div className="space-y-2 px-3 pt-1 pb-3">
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
          className="absolute inset-x-0 h-0.5 bg-primary/60 shadow-[0_0_12px_rgba(245,160,14,0.5)]"
          style={{ top: `${scanProgress}%` }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1, repeat: Infinity }}
        />

        {/* Gradient overlay at bottom */}
        <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-transparent" />
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
  // Once the capture completes, every phase reads as done
  const finished = progress >= 100;

  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="relative h-1.5 overflow-hidden rounded-full bg-well">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-primary"
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

      {/* Phases: done, current, still to come */}
      <ol className="space-y-1.5">
        {CAPTURE_PHASES.map((item, index) => {
          const done = finished || index < phase;
          const current = !done && index === phase;
          return (
            <li
              key={item.id}
              aria-current={current ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2 text-[12px]',
                done ? 'text-muted-foreground' : current ? 'font-medium text-foreground' : 'text-faint'
              )}
            >
              <span className="grid size-4 shrink-0 place-items-center" aria-hidden="true">
                {done ? (
                  <Check className="size-3" strokeWidth={3} />
                ) : (
                  <span
                    className={cn(
                      'size-1.5 rounded-full',
                      current ? 'animate-pulse bg-primary motion-reduce:animate-none' : 'bg-black/15'
                    )}
                  />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {index === phase && detectedCount > 0 && (
                <motion.span
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="shrink-0 font-normal tabular-nums text-muted-foreground"
                >
                  {detectedCount} sections found
                </motion.span>
              )}
            </li>
          );
        })}
      </ol>
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

const INPUT_TABS = [
  { value: 'url', label: <><Globe className="size-3.5" aria-hidden="true" />URL</> },
  { value: 'upload', label: <><ImagePlus className="size-3.5" aria-hidden="true" />Upload</> },
] as const;

const WIDTH_OPTIONS = CAPTURE_WIDTHS.map((width) => ({
  value: width,
  label: <span className="tabular-nums">{width}</span>,
}));

const HOW_IT_WORKS = ['Paste a website URL', 'Select which sections to include', 'Export as video'];

// Style tiles sit in the well; the chosen one turns amber, like a segmented pick
const presetClass = (selected: boolean) =>
  cn(
    'squircle flex min-w-0 flex-col items-start gap-0.5 rounded-[12px] px-2.5 py-2 text-left transition-[background-color,color,scale] duration-100 active:scale-[0.98]',
    selected ? 'bg-primary text-primary-foreground' : 'bg-well text-foreground hover:bg-well-hover'
  );

export function UrlPanel() {
  const [url, setUrl] = useState('');
  const [captureWidth, setCaptureWidth] = useState<CaptureWidth>(CAPTURE_WIDTHS[0]);
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
        body: JSON.stringify({ url: normalizedUrl, viewportWidth: captureWidth }),
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
      {/* Input tabs - only show on url step */}
      {step === 'url' && (
        <div className="shrink-0 px-3 pt-3">
          <TabSwitch
            label="Input method"
            value={isManualMode ? 'upload' : 'url'}
            tabs={INPUT_TABS}
            onChange={(tab) => setManualMode(tab === 'upload')}
            idPrefix="input-method"
          />
        </div>
      )}

      {/* Header for capturing/sections/ready steps */}
      {step !== 'url' && (
        <div className="shrink-0 px-3 pt-4 pb-1">
          <h2 className="text-[14px] font-medium text-foreground">
            {step === 'capturing' && 'Capturing Website'}
            {step === 'sections' && 'Select Sections'}
            {step === 'ready' && 'Video Ready'}
          </h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {step === 'capturing' && 'Analyzing page structure...'}
            {step === 'sections' && 'Choose which sections to include'}
            {step === 'ready' && 'Your video is ready to preview and export'}
          </p>
        </div>
      )}

      {/* Content */}
      <div className="scroll-slim flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {/* URL Input Step */}
          {step === 'url' && (
            <motion.div
              key="url-input"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-3"
            >
              {isManualMode ? (
                <div
                  role="tabpanel"
                  id="input-method-panel-upload"
                  aria-labelledby="input-method-tab-upload"
                  className="space-y-5"
                >
                  <div className="space-y-2">
                    <label
                      htmlFor="screenshot-upload"
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      className="squircle flex h-32 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-[16px] bg-well text-center outline-2 -outline-offset-4 outline-black/10 outline-dashed transition-[background-color,outline-color] duration-100 hover:bg-well-hover hover:outline-black/20 has-focus-visible:outline-solid has-focus-visible:outline-primary"
                    >
                      <ImagePlus className="mb-1 size-6 text-faint" aria-hidden="true" />
                      <p className="text-[13px] text-muted-foreground">
                        <span className="font-medium text-foreground">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-[12px] text-faint" id="upload-format-hint">PNG, JPG, WebP</p>
                      <input
                        id="screenshot-upload"
                        type="file"
                        className="sr-only"
                        accept="image/*"
                        multiple
                        onChange={handleFileUpload}
                        aria-describedby="upload-format-hint"
                      />
                    </label>
                    {error && <p className="text-[12px] text-destructive-foreground" role="alert">{error}</p>}
                  </div>

                  <div>
                    <SectionTitle>Video Style</SectionTitle>
                    <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Video style options">
                      {VIDEO_STYLE_PRESETS.slice(0, 4).map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setSelectedStyle(preset.id)}
                          aria-pressed={selectedStyleId === preset.id}
                          className={presetClass(selectedStyleId === preset.id)}
                        >
                          <span className="text-[12px] font-medium">{preset.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  role="tabpanel"
                  id="input-method-panel-url"
                  aria-labelledby="input-method-tab-url"
                  className="space-y-5"
                >
                  <div className="flex flex-col gap-2">
                    <div className="relative">
                      {/* The field's well paints over earlier siblings, so the icon sits above it */}
                      <Globe
                        className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2 text-faint"
                        aria-hidden="true"
                      />
                      <Input
                        type="text"
                        size="lg"
                        placeholder="example.com"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCapture()}
                        className="pl-6"
                        autoComplete="url"
                        spellCheck={false}
                        aria-label="Website URL"
                      />
                    </div>
                    {error && <p className="text-[12px] text-destructive-foreground" role="alert">{error}</p>}

                    <div className="flex items-center justify-between gap-3">
                      {/* The radiogroup carries the same name, so this copy is for sighted users only */}
                      <span className="text-[12px] text-muted-foreground" aria-hidden="true">
                        Screen width
                      </span>
                      <Segmented
                        label="Screen width"
                        value={captureWidth}
                        options={WIDTH_OPTIONS}
                        onChange={setCaptureWidth}
                        className="w-32"
                      />
                    </div>

                    <Button onClick={handleCapture} disabled={!url.trim()} className="group mt-1 w-full" size="lg">
                      Capture Website
                      <ArrowRight
                        className="size-4 transition-transform duration-150 ease-snappy group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </Button>
                  </div>

                  <div>
                    <SectionTitle>How it works</SectionTitle>
                    <ol className="space-y-2" aria-label="Steps to create video">
                      {HOW_IT_WORKS.map((text, index) => (
                        <li key={text} className="flex items-center gap-2.5 text-[12px] text-muted-foreground">
                          <span
                            className="grid size-5 shrink-0 place-items-center rounded-full bg-well text-[11px] font-medium tabular-nums text-muted-foreground"
                            aria-hidden="true"
                          >
                            {index + 1}
                          </span>
                          <span>{text}</span>
                        </li>
                      ))}
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
              className="space-y-5 p-3"
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
              <Button variant="ghost" onClick={handleReset} className="w-full">
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
              className="space-y-5 p-3"
            >
              <div>
                <div className="flex h-8 items-center justify-between">
                  <span className="text-[12px] tabular-nums text-muted-foreground">
                    {selectedSectionIds.length} of {capturedPage.sections.length} selected
                  </span>
                  <div className="flex gap-0.5">
                    <Button variant="ghost" size="sm" onClick={selectAllSections}>
                      All
                    </Button>
                    <Button variant="ghost" size="sm" onClick={deselectAllSections}>
                      None
                    </Button>
                  </div>
                </div>

                <div className="mt-1 space-y-1">
                  {capturedPage.sections.map((section, index) => {
                    const isSelected = selectedSectionIds.includes(section.id);
                    return (
                      <motion.button
                        key={section.id}
                        type="button"
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        // The stagger delay lives on the entrance only, so a tap answers at once
                        animate={{
                          opacity: 1,
                          y: 0,
                          scale: 1,
                          transition: { delay: index * 0.05, type: 'spring', stiffness: 300, damping: 25 },
                        }}
                        onClick={() => toggleSectionSelection(section.id)}
                        aria-pressed={isSelected}
                        whileTap={{ scale: 0.98 }}
                        className={cn(
                          'squircle flex w-full items-center gap-2.5 rounded-[14px] p-1.5 text-left transition-colors duration-100',
                          isSelected ? 'bg-primary-soft' : 'hover:bg-black/[0.04]'
                        )}
                      >
                        <motion.div
                          className={cn(
                            'squircle grid size-4 shrink-0 place-items-center rounded-[5px] transition-colors duration-100',
                            isSelected
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)]'
                          )}
                          animate={isSelected ? { scale: [1, 1.2, 1] } : {}}
                          transition={{ duration: 0.2 }}
                        >
                          <AnimatePresence>
                            {isSelected && (
                              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                                <Check className="size-3" strokeWidth={3} />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>

                        <div className="group/thumb squircle relative aspect-[16/10] w-20 shrink-0 overflow-hidden rounded-[8px] bg-well shadow-[0_0_0_1px_rgba(0,0,0,0.06)]">
                          {section.thumbnail ? (
                            <>
                              <img
                                src={section.thumbnail}
                                alt={section.label}
                                className="size-full object-cover object-top transition-transform duration-200 ease-snappy group-hover/thumb:scale-105"
                              />
                              <div className="absolute inset-0 grid place-items-center bg-black/0 transition-colors duration-150 group-hover/thumb:bg-black/15">
                                <Scan
                                  className="size-4 text-white opacity-0 transition-opacity duration-150 group-hover/thumb:opacity-100"
                                  aria-hidden="true"
                                />
                              </div>
                            </>
                          ) : (
                            <div className="grid size-full place-items-center text-[11px] text-faint">No preview</div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[13px] font-medium text-foreground">{section.label}</span>
                            {/* A tint rather than the well, so the badge still reads on a selected row */}
                            <span className="shrink-0 rounded-full bg-black/[0.06] px-1.5 text-[11px] text-muted-foreground">
                              {section.type}
                            </span>
                          </div>
                          <span className="text-[12px] tabular-nums text-faint">{section.bounds.height}px tall</span>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              <div>
                <SectionTitle>
                  <span id="video-style-label">Video Style</span>
                </SectionTitle>
                <div className="grid grid-cols-2 gap-1.5" role="group" aria-labelledby="video-style-label">
                  {VIDEO_STYLE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setSelectedStyle(preset.id)}
                      aria-pressed={selectedStyleId === preset.id}
                      className={presetClass(selectedStyleId === preset.id)}
                    >
                      <span className="text-[12px] font-medium">{preset.name}</span>
                      <span className="line-clamp-1 text-[11px] opacity-80">{preset.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <CustomSlider
                label="Pacing"
                value={baseDuration}
                min={2000}
                max={5000}
                step={250}
                valueSubtext={baseDuration < 2500 ? ' Quick' : baseDuration > 3500 ? ' Slow' : ' Normal'}
                onChange={setBaseDuration}
              />

              <div className="flex gap-2">
                <Button variant="ghost" size="lg" onClick={handleReset}>
                  Cancel
                </Button>
                <Button
                  size="lg"
                  onClick={handleGenerate}
                  disabled={selectedSectionIds.length === 0}
                  className="flex-1"
                >
                  Create Video
                </Button>
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
              className="space-y-5 p-3"
            >
              <div className="flex flex-col items-center py-4 text-center">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className="mb-3 grid size-12 place-items-center rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: 'spring', stiffness: 400 }}
                  >
                    <Check className="size-6 text-primary-press" strokeWidth={2.5} aria-hidden="true" />
                  </motion.div>
                </motion.div>
                <h3 className="text-[14px] font-medium text-foreground">Video Generated</h3>
                <p className="mt-0.5 text-[12px] tabular-nums text-muted-foreground">
                  {scenes.length} scenes ready to preview
                </p>
              </div>

              <div className="space-y-1">
                {scenes.slice(0, 5).map((scene, i) => {
                  const screen = screens.find((s) => s.id === scene.screenId);
                  return (
                    <motion.div
                      key={scene.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-2.5 p-1.5"
                    >
                      <div className="squircle aspect-[16/10] w-20 shrink-0 overflow-hidden rounded-[8px] bg-well shadow-[0_0_0_1px_rgba(0,0,0,0.06)]">
                        {screen?.thumbnail && (
                          <img src={screen.thumbnail} alt="" className="size-full object-cover object-top" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-foreground">Scene {i + 1}</div>
                        <div className="text-[12px] tabular-nums text-faint">
                          {(scene.duration / 1000).toFixed(1)}s · {scene.motion.entry}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
                {scenes.length > 5 && (
                  <div className="py-1 text-center text-[12px] tabular-nums text-faint">
                    +{scenes.length - 5} more scenes
                  </div>
                )}
              </div>

              <Button variant="secondary" size="lg" onClick={handleReset} className="w-full">
                Start New
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
