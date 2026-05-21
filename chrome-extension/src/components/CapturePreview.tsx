import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  Download,
  Trash2,
  PenTool,
  FileText,
  Maximize2,
  Copy,
  Share2,
  ChevronLeft,
  Loader2,
  GitCompare,
} from 'lucide-react';
import { Capture } from '@/lib/types';
import { useAppStore, AppView } from '@/store';
import { Badge } from './ui/Badge';
import { AnnotationEditor } from './AnnotationEditor';
import { getFullCapture } from '@/lib/messages';
import { storage } from '@/lib/storage';

interface CapturePreviewProps {
  capture: Capture;
  onNavigate: (view: AppView | string) => void;
}

export function CapturePreview({ capture: initialCapture, onNavigate }: CapturePreviewProps) {
  const setView = useAppStore((s) => s.setView);
  const goBack = useAppStore((s) => s.goBack);
  const removeCapture = useAppStore((s) => s.removeCapture);
  const updateCapture = useAppStore((s) => s.updateCapture);
  const setSelectedCapture = useAppStore((s) => s.setSelectedCapture);
  const [showFullscreenEditor, setShowFullscreenEditor] = useState(false);
  const [capture, setCapture] = useState<Capture>(initialCapture);
  const [isLoadingImage, setIsLoadingImage] = useState(false);

  // Lazy load imageData if missing (e.g., when opened from gallery with bg-only data)
  // Also always re-check IndexedDB to pick up annotated versions saved in the editor tab
  useEffect(() => {
    const loadImage = async () => {
      // Always try to load from IndexedDB first (may have annotated version)
      if (capture.id) {
        setIsLoadingImage(true);
        try {
          await storage.init();
          const idbCapture = await storage.getCapture(capture.id);
          if (idbCapture?.imageData && idbCapture.imageData.length > 100) {
            // Check if IndexedDB version is newer (annotated)
            if (!capture.imageData || idbCapture.imageData !== capture.imageData) {
              console.log('[CapturePreview] Updated image from IndexedDB (annotated version found)');
              setCapture(idbCapture);
              updateCapture(capture.id, { imageData: idbCapture.imageData });
              setIsLoadingImage(false);
              return;
            }
          }
        } catch {
          // Fall through
        }
        setIsLoadingImage(false);
      }
    };

    loadImage();
  }, [capture.id]); // Re-run when capture ID changes (navigating between captures)

  const formattedDate = useMemo(() => {
    return new Date(capture.timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [capture.timestamp]);

  const fileSize = useMemo(() => {
    if (!capture.imageData) return '--';
    const base64Length = capture.imageData.split(',')[1]?.length ?? 0;
    const sizeBytes = Math.round((base64Length * 3) / 4);
    if (sizeBytes < 1024) return `${sizeBytes} B`;
    if (sizeBytes < 1048576) return `${(sizeBytes / 1024).toFixed(1)} KB`;
    return `${(sizeBytes / 1048576).toFixed(1)} MB`;
  }, [capture.imageData]);

  const filename = useMemo(() => {
    const date = new Date(capture.timestamp);
    const ts = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `screenshot-${ts}.${capture.format === 'jpeg' ? 'jpg' : capture.format}`;
  }, [capture.timestamp, capture.format]);

  const handleDelete = () => {
    removeCapture(capture.id);
    goBack();
  };

  const handleAction = (view: AppView) => {
    if (view === 'annotate') {
      // Open annotation editor in a NEW TAB
      openAnnotateInNewTab();
      return;
    }
    setView(view);
  };

  const openAnnotateInNewTab = useCallback(async () => {
    if (!capture.imageData) return;
    try {
      // Ensure capture is persisted to IndexedDB BEFORE opening the editor tab.
      // This is the primary data bridge — much more reliable than chrome.storage.local
      // temp keys which can be lost when the service worker is killed.
      try {
        await storage.init();
        await storage.addCapture(capture).catch(async () => {
          // addCapture may fail on duplicate key — update instead
          await storage.updateCapture(capture.id, capture);
        });
      } catch (idbErr) {
        console.warn('[CapturePreview] IndexedDB write failed, falling back to chrome.storage.local:', idbErr);
      }

      const editorUrl = chrome.runtime.getURL('src/editor/index.html');

      // Primary: pass captureId so the editor loads from IndexedDB
      // Also pass tempKey as fallback (for chrome.storage.local)
      const hashPayload = { captureId: capture.id, filename };

      // Also write to chrome.storage.local as a secondary fallback
      const tempKey = `annotate-temp-${Date.now()}`;
      try {
        await chrome.storage.local.set({ [tempKey]: capture.imageData });
        (hashPayload as Record<string, string>).tempKey = tempKey;
      } catch (storageErr) {
        console.warn('[CapturePreview] chrome.storage.local write failed:', storageErr);
      }

      chrome.tabs.create({
        url: `${editorUrl}#${encodeURIComponent(JSON.stringify(hashPayload))}`,
      });
    } catch (err) {
      // Fallback: open as overlay (e.g., if chrome API not available)
      console.warn('[CapturePreview] Could not open new tab, using overlay:', err);
      setShowFullscreenEditor(true);
    }
  }, [capture, filename]);

  const handleDownload = useCallback(() => {
    if (!capture.imageData) return;
    const a = document.createElement('a');
    a.href = capture.imageData;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [capture.imageData, filename]);

  const handleCopyToClipboard = useCallback(async () => {
    if (!capture.imageData) return;
    try {
      const response = await fetch(capture.imageData);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  }, [capture.imageData]);

  const handleEditorClose = useCallback(() => {
    setShowFullscreenEditor(false);
  }, []);

  // Fullscreen Annotation Editor overlay (fallback only — normally opens in new tab)
  if (showFullscreenEditor && capture.imageData) {
    return (
      <div className="fixed inset-0 z-[9999]" style={{ backgroundColor: '#0B0F1A' }}>
        <AnnotationEditor
          imageUrl={capture.imageData}
          filename={filename}
          onClose={handleEditorClose}
        />
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Image Preview */}
      <div
        className="rounded-xl overflow-hidden mb-3"
        style={{
          backgroundColor: '#0F172A',
          border: '1px solid rgba(255,255,255,0.05)',
          maxHeight: '260px',
        }}
      >
        {isLoadingImage ? (
          <div className="w-full flex items-center justify-center" style={{ height: '160px' }}>
            <div className="text-center">
              <Loader2 size={24} className="text-primary mx-auto mb-2 animate-spin" />
              <span className="text-xs text-text-muted">Loading image...</span>
            </div>
          </div>
        ) : capture.imageData ? (
          <div className="overflow-y-auto scrollbar-thin" style={{ maxHeight: '260px' }}>
            <img
              src={capture.imageData}
              alt={capture.title}
              className="w-full h-auto object-contain"
            />
          </div>
        ) : (
          <div className="w-full flex items-center justify-center" style={{ height: '160px' }}>
            <div className="text-center">
              <Maximize2 size={24} className="text-text-muted mx-auto mb-2 opacity-40" />
              <span className="text-xs text-text-muted">No image data available</span>
            </div>
          </div>
        )}
      </div>

      {/* Metadata Bar */}
      <div
        className="rounded-xl p-3 mb-3 space-y-2"
        style={{
          backgroundColor: '#1E293B',
          border: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <div>
          <p className="text-xs font-semibold text-text-primary truncate">
            {filename}
          </p>
          <p className="text-[10px] text-text-muted truncate mt-0.5">
            {capture.url}
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="primary">{capture.format.toUpperCase()}</Badge>
          <Badge variant="default">{capture.width} × {capture.height}</Badge>
          <Badge variant="default">{fileSize}</Badge>
          <Badge variant="default">{formattedDate}</Badge>
          {capture.annotations.length > 0 && (
            <Badge variant="info">
              {capture.annotations.length} annotation{capture.annotations.length > 1 ? 's' : ''}
            </Badge>
          )}
          {capture.ocrText && (
            <Badge variant="success">OCR</Badge>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-5 gap-1.5">
        <ActionButton
          icon={<PenTool size={14} />}
          label="Annotate"
          onClick={() => handleAction('annotate')}
          color="text-[#22C55E]"
        />
        <ActionButton
          icon={<FileText size={14} />}
          label="OCR"
          onClick={() => handleAction('ocr')}
          color="text-[#0EA5E9]"
        />
        <ActionButton
          icon={<GitCompare size={14} />}
          label="Diff"
          onClick={() => setView('diff-select')}
          color="text-[#F59E0B]"
        />
        <ActionButton
          icon={<Download size={14} />}
          label="Export"
          onClick={() => handleAction('export')}
          color="text-[#F59E0B]"
        />
        <ActionButton
          icon={<Trash2 size={14} />}
          label="Delete"
          onClick={handleDelete}
          color="text-[#EF4444]"
        />
      </div>
    </div>
  );
}

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  color: string;
}

function ActionButton({ icon, label, onClick, color }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 py-2.5 rounded-lg transition-smooth cursor-pointer
        hover:bg-surface-elevated active:bg-surface-hover`}
    >
      <span className={color}>{icon}</span>
      <span className="text-[10px] text-text-secondary font-medium">{label}</span>
    </button>
  );
}

// ===== Fullscreen Editor Standalone Component =====
// This is the component that renders when opened as a new tab

interface FullscreenEditorProps {
  imageUrl: string;
  filename?: string;
}

export function FullscreenAnnotationEditor({ imageUrl, filename }: FullscreenEditorProps) {
  const handleClose = useCallback(() => {
    // Close the tab
    window.close();
  }, []);

  return (
    <div className="fixed inset-0" style={{ backgroundColor: '#0B0F1A' }}>
      <AnnotationEditor
        imageUrl={imageUrl}
        filename={filename || 'screenshot'}
        onClose={handleClose}
      />
    </div>
  );
}
