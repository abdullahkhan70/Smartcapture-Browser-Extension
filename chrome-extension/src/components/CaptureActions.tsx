import React from 'react';
import { Camera, Frame, Loader2, AlertCircle, X } from 'lucide-react';
import { useCapture } from '@/hooks/useCapture';

export function CaptureActions() {
  const {
    isCapturing,
    progress,
    error,
    startFullPageCapture,
    startVisibleCapture,
    cancel,
    clearError,
  } = useCapture();

  const handleCapture = (type: 'fullpage' | 'visible') => {
    switch (type) {
      case 'fullpage':
        startFullPageCapture();
        break;
      case 'visible':
        startVisibleCapture();
        break;
    }
  };

  const buttons = [
    {
      type: 'fullpage' as const,
      label: 'Capture Full Page',
      shortcut: 'Alt+Shift+S',
      icon: Camera,
      primary: true,
    },
    {
      type: 'visible' as const,
      label: 'Capture Visible Area',
      shortcut: 'Alt+Shift+V',
      icon: Frame,
      primary: false,
    },
  ];

  const getProgressText = () => {
    if (progress.total > 0) {
      return `Section ${progress.current} of ${progress.total}`;
    }
    return 'Preparing...';
  };

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col gap-3">
        {buttons.map((btn) => {
          const Icon = btn.icon;
          const isLoading = isCapturing;

          return (
            <button
              key={btn.type}
              onClick={() => handleCapture(btn.type)}
              disabled={isCapturing}
              className={`
                flex items-center gap-3 h-10 px-4 rounded-lg font-medium text-sm
                transition-smooth cursor-pointer w-full
                disabled:opacity-60 disabled:cursor-not-allowed
                ${btn.primary
                  ? 'bg-primary text-white hover:bg-primary-dark active:bg-primary-dark shadow-sm'
                  : 'bg-transparent text-text-primary border hover:bg-surface-elevated active:bg-surface-elevated'
                }
                ${!isCapturing ? 'hover:scale-[1.02] active:scale-[0.98]' : ''}
              `}
              style={btn.primary ? {} : { borderColor: 'rgba(255,255,255,0.1)' }}
            >
              {isLoading ? (
                <Loader2 size={18} className="animate-spin shrink-0" />
              ) : (
                <Icon size={18} className="shrink-0" />
              )}
              <span className="flex-1 text-left">{btn.label}</span>
              {btn.shortcut && (
                <span className={`text-[11px] font-normal shrink-0 ${
                  btn.primary ? 'text-white/70' : 'text-text-muted'
                }`}>
                  {btn.shortcut}
                </span>
              )}
            </button>
          );
        })}

        {/* Progress indicator */}
        {isCapturing && (
          <div className="px-1 py-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-text-muted">{getProgressText()}</span>
              <span className="text-xs text-text-muted">{progress.percentage}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-surface-elevated overflow-hidden">
              <div
                className="h-full rounded-full gradient-primary transition-all duration-300"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
            <button
              onClick={() => cancel()}
              className="mt-2 text-xs text-text-muted hover:text-error transition-colors flex items-center gap-1 cursor-pointer"
            >
              <X size={12} />
              Cancel
            </button>
          </div>
        )}

        {/* Error indicator */}
        {error && !isCapturing && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-error/10 border border-error/20">
            <AlertCircle size={16} className="text-error shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-error font-medium mb-1">Capture failed</p>
              <p className="text-[11px] text-text-muted break-words">{error}</p>
              <button
                onClick={clearError}
                className="mt-1.5 text-[11px] text-primary hover:text-primary-dark transition-colors cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
