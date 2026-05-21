import React from 'react';
import { Camera, ChevronLeft } from 'lucide-react';
import { useAppStore, AppView } from '@/store';

const VIEW_TITLES: Record<string, string> = {
  main: 'SmartCapture Pro',
  gallery: 'Gallery',
  settings: 'Settings',
  preview: 'Preview',
  annotate: 'Annotate',
  ocr: 'OCR Text',
  export: 'Export',
  diff: 'Visual Diff',
};

interface PopupHeaderProps {
  currentView: AppView;
}

export function PopupHeader({ currentView }: PopupHeaderProps) {
  const setView = useAppStore((s) => s.setView);
  const goBack = useAppStore((s) => s.goBack);
  const showBack = currentView !== 'main';

  return (
    <header className="flex items-center justify-between h-14 px-4 border-b shrink-0"
      style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
      <div className="flex items-center gap-2.5">
        {showBack && (
          <button
            onClick={goBack}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-smooth cursor-pointer"
            aria-label="Go back"
          >
            <ChevronLeft size={18} />
          </button>
        )}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg gradient-primary flex items-center justify-center shrink-0">
            <Camera size={14} className="text-white" />
          </div>
          <h1 className="text-sm font-semibold text-text-primary tracking-tight leading-none">
            {VIEW_TITLES[currentView] ?? 'SmartCapture Pro'}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {currentView === 'main' && (
          <span
            className="text-[10px] text-text-muted font-medium px-1.5 py-0.5 rounded-md"
            style={{ backgroundColor: 'rgba(51, 65, 85, 0.5)' }}
          >
            v1.0
          </span>
        )}
      </div>
    </header>
  );
}
