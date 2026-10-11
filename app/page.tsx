import { Header } from '@/components/editor/header';
import { EditorLayout } from '@/components/editor/editor-layout';
import { Timeline } from '@/components/editor/timeline';
import { EditorRuntime } from '@/components/editor/editor-runtime';
import { KeyboardShortcutsModal } from '@/components/editor/keyboard-shortcuts-modal';

export default function EditorPage() {
  return (
    <>
      {/* Saved project, keyboard shortcuts and music playback */}
      <EditorRuntime />
      <KeyboardShortcutsModal />

      {/* Panels sit straight on the page: top bar, the three columns, then the timeline */}
      <div className="grid h-dvh grid-rows-[auto_minmax(0,1fr)_auto] gap-2 overflow-hidden bg-background px-2 pb-2 select-none">
        <Header />
        <EditorLayout />
        <Timeline />
      </div>
    </>
  );
}
