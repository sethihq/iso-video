import { Header } from '@/components/editor/header';
import { EditorLayout } from '@/components/editor/editor-layout';
import { Timeline } from '@/components/editor/timeline';
import { KeyboardHandler } from '@/components/editor/keyboard-handler';
import { KeyboardShortcutsModal } from '@/components/editor/keyboard-shortcuts-modal';

export default function EditorPage() {
  return (
    <div className="flex h-screen max-h-screen flex-col bg-muted/40 overflow-hidden p-3 gap-3">
      {/* Keyboard shortcuts handler */}
      <KeyboardHandler />
      <KeyboardShortcutsModal />

      {/* Header - floating */}
      <Header />

      {/* Main Editor Area - takes remaining space */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <EditorLayout />
      </div>

      {/* Bottom - Timeline (fixed height) */}
      <Timeline />
    </div>
  );
}
