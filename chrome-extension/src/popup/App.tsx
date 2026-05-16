import React, { useEffect } from 'react';
import { PopupHeader } from '@/components/PopupHeader';
import { CaptureActions } from '@/components/CaptureActions';
import { QuickTools } from '@/components/QuickTools';
import { RecentCaptures } from '@/components/RecentCaptures';
import { PopupFooter } from '@/components/PopupFooter';
import { Gallery } from '@/components/Gallery';
import { CapturePreview } from '@/components/CapturePreview';
import { OCRPanel } from '@/components/OCRPanel';
import { SettingsPanel } from '@/components/SettingsPanel';
import { ExportPanel } from '@/components/ExportPanel';
import { VisualDiffView } from '@/components/VisualDiffView';
import { useAppStore, AppView } from '@/store';
import { useSettings } from '@/hooks/useSettings';
import { useGallery } from '@/hooks/useGallery';
import { useCapture } from '@/hooks/useCapture';

export default function App() {
  const currentView = useAppStore((s) => s.currentView);
  const setView = useAppStore((s) => s.setView);
  const goBack = useAppStore((s) => s.goBack);
  const selectedCapture = useAppStore((s) => s.selectedCapture);
  const setSelectedCapture = useAppStore((s) => s.setSelectedCapture);
  const isCapturing = useAppStore((s) => s.isCapturing);
  const captureProgress = useAppStore((s) => s.captureProgress);
  const diffCaptureBefore = useAppStore((s) => s.diffCaptureBefore);
  const diffCaptureAfter = useAppStore((s) => s.diffCaptureAfter);

  // Initialize settings and gallery data
  useSettings();
  const { refresh } = useGallery();
  const { cancel: cancelCapture } = useCapture();

  useEffect(() => {
    refresh();
  }, [refresh]);

  const navigateToView = (view: AppView | string) => {
    setView(view as AppView);
  };

  const handleCaptureClick = (capture: { id: string }) => {
    setSelectedCapture(capture as any);
  };

  const showFooter = currentView === 'main';

  const renderMainContent = () => {
    switch (currentView) {
      case 'main':
        return (
          <div className="px-4 pb-4 space-y-3">
            <CaptureActions />
            <QuickTools onNavigate={navigateToView} />
            <RecentCaptures onNavigate={navigateToView} onCaptureClick={handleCaptureClick} />
          </div>
        );
      case 'gallery':
        return <Gallery />;
      case 'settings':
        return <SettingsPanel />;
      case 'preview':
        return selectedCapture ? (
          <CapturePreview capture={selectedCapture} onNavigate={navigateToView} />
        ) : (
          <EmptyState message="No capture selected" onGoBack={goBack} />
        );
      case 'annotate':
        // Annotation editor now always opens in a new tab via CapturePreview
        return <EmptyState message="Use Annotate from the preview screen" onGoBack={goBack} />;
      case 'ocr':
        return selectedCapture ? (
          <OCRPanel capture={selectedCapture} />
        ) : (
          <EmptyState message="No capture selected for OCR" onGoBack={goBack} />
        );
      case 'export':
        return selectedCapture ? (
          <ExportPanel capture={selectedCapture} />
        ) : (
          <EmptyState message="No capture selected for export" onGoBack={goBack} />
        );
      case 'diff':
        return diffCaptureBefore && diffCaptureAfter ? (
          <VisualDiffView
            imageBefore={diffCaptureBefore}
            imageAfter={diffCaptureAfter}
          />
        ) : (
          <EmptyState message="Select two captures to compare" onGoBack={goBack} />
        );
      default:
        return null;
    }
  };

  return (
    <div className="popup-root">
      <PopupHeader currentView={currentView} />

      {/* Capture Progress Overlay - shows in the extension popup */}
      {isCapturing && captureProgress && (
        <div className="capture-overlay">
          <div className="flex flex-col items-center gap-3 w-full px-6">
            {/* Spinning icon */}
            <div className="relative">
              <div
                className="w-14 h-14 rounded-full border-3 border-surface-elevated animate-spin"
                style={{
                  borderWidth: 3,
                  borderTopColor: '#0EA5E9',
                  borderRightColor: 'transparent',
                }}
              />
              {/* Center percentage */}
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-bold text-text-primary tabular-nums">
                  {captureProgress.percentage}%
                </span>
              </div>
            </div>

            {/* Status label */}
            <div className="text-center">
              <p className="text-sm font-semibold text-text-primary mb-0.5">
                {getProgressLabel(captureProgress.status)}
              </p>
              <p className="text-[11px] text-text-muted">
                {getProgressDetail(captureProgress)}
              </p>
            </div>

            {/* Progress bar */}
            <div className="w-full max-w-[220px]">
              <div className="w-full h-2 rounded-full bg-surface-elevated overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${captureProgress.percentage}%`,
                    background: captureProgress.status === 'stitching' || captureProgress.status === 'processing'
                      ? 'linear-gradient(90deg, #10B981, #34D399)'
                      : 'linear-gradient(90deg, #0EA5E9, #38BDF8)',
                  }}
                />
              </div>
            </div>

            {/* Section indicators - visual section blocks */}
            {captureProgress.total > 1 && captureProgress.status === 'capturing' && (
              <div className="flex items-center gap-1 flex-wrap justify-center max-w-[240px]">
                {Array.from({ length: captureProgress.total }, (_, i) => {
                  const isDone = i < captureProgress.current;
                  const isCurrent = i === captureProgress.current;
                  return (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-sm transition-all duration-200"
                      style={{
                        backgroundColor: isDone
                          ? '#0EA5E9'
                          : isCurrent
                            ? '#38BDF8'
                            : '#334155',
                        boxShadow: isCurrent ? '0 0 6px rgba(14, 165, 233, 0.6)' : 'none',
                        transform: isCurrent ? 'scale(1.3)' : 'scale(1)',
                      }}
                    />
                  );
                })}
              </div>
            )}

            {/* Cancel button */}
            <button
              onClick={() => cancelCapture()}
              className="text-[11px] text-text-muted hover:text-error transition-colors mt-1 px-3 py-1 rounded-md hover:bg-error/10 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
        <div key={currentView} className="view-enter">
          {renderMainContent()}
        </div>
      </main>

      {showFooter && <PopupFooter onNavigate={navigateToView} />}
    </div>
  );
}

function getProgressLabel(status: string): string {
  switch (status) {
    case 'capturing': return 'Capturing page...';
    case 'stitching': return 'Stitching sections...';
    case 'processing': return 'Processing image...';
    case 'complete': return 'Capture complete!';
    case 'error': return 'Capture failed';
    default: return 'Preparing...';
  }
}

function getProgressDetail(progress: { status: string; current: number; total: number; percentage: number }): string {
  if (progress.status === 'capturing') {
    return `Section ${progress.current} of ${progress.total}`;
  }
  if (progress.status === 'stitching') {
    return 'Combining captured sections...';
  }
  if (progress.status === 'processing') {
    return 'Generating thumbnail...';
  }
  if (progress.status === 'complete') {
    return `Done — ${progress.total} section${progress.total !== 1 ? 's' : ''} captured`;
  }
  return `${progress.percentage}%`;
}

interface EmptyStateProps {
  message: string;
  onGoBack: () => void;
}

function EmptyState({ message, onGoBack }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-surface-elevated flex items-center justify-center mb-3">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 15s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
      </div>
      <p className="text-sm text-text-secondary mb-3">{message}</p>
      <button
        onClick={onGoBack}
        className="text-xs text-primary hover:text-primary-dark transition-colors"
      >
        Go back
      </button>
    </div>
  );
}
