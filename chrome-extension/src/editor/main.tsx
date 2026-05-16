import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { AnnotationEditor } from '@/components/AnnotationEditor';
import './index.css';

// Parse annotation data from URL hash or chrome.storage.local
interface EditorData {
  imageUrl?: string;
  filename: string;
  captureId?: string;
  tempKey?: string;
}

function getInitialData(): EditorData | null {
  const hash = window.location.hash;
  if (!hash || hash === '#') {
    return null;
  }

  try {
    const data = JSON.parse(decodeURIComponent(hash.slice(1)));

    // New format (primary): { captureId, filename } — load from IndexedDB
    if (data.captureId) {
      return {
        captureId: data.captureId,
        filename: data.filename || 'screenshot',
        // Also check for tempKey fallback
        tempKey: data.tempKey || undefined,
      };
    }

    // Older format: { tempKey, filename } — load from chrome.storage.local
    if (data.tempKey) {
      return { filename: data.filename || 'screenshot', tempKey: data.tempKey };
    }

    // Legacy format: { imageUrl, filename } — direct data URL in hash
    if (data.imageUrl) {
      return { imageUrl: data.imageUrl, filename: data.filename || 'screenshot' };
    }

    return null;
  } catch {
    return null;
  }
}

function App() {
  const initialData = getInitialData();
  const [imageUrl, setImageUrl] = useState<string | null>(initialData?.imageUrl || null);
  const [filename] = useState<string>(initialData?.filename || 'screenshot');
  const [captureId] = useState<string | undefined>(initialData?.captureId);
  const [tempKey] = useState<string | undefined>(initialData?.tempKey);
  const [isLoading, setIsLoading] = useState(!!(captureId || tempKey));
  const [error, setError] = useState<string | null>(null);

  // Load image using multi-strategy approach
  useEffect(() => {
    if (imageUrl) return; // Already have direct imageUrl

    const loadImage = async () => {
      try {
        // Strategy 1: Load from IndexedDB using captureId (most reliable)
        // This will load the annotated version if the user previously saved
        if (captureId) {
          try {
            const { storage } = await import('@/lib/storage');
            await storage.init();
            const capture = await storage.getCapture(captureId);
            if (capture?.imageData && capture.imageData.length > 100) {
              console.log('[Editor] Loaded image from IndexedDB (length:', capture.imageData.length, ')');
              setImageUrl(capture.imageData);
              setIsLoading(false);
              return;
            }
            console.warn('[Editor] Capture not found in IndexedDB or has empty data for id:', captureId);
          } catch (idbErr) {
            console.warn('[Editor] IndexedDB access failed:', idbErr);
          }
        }

        // Strategy 2: Load from chrome.storage.local using tempKey (fallback)
        if (tempKey) {
          try {
            const result: Record<string, string> = await chrome.storage.local.get(tempKey);
            const dataUrl = result[tempKey];
            if (dataUrl) {
              setImageUrl(dataUrl);
              // Clean up temp data
              chrome.storage.local.remove(tempKey).catch(() => {});
              setIsLoading(false);
              return;
            }
            console.warn('[Editor] Temp key not found in chrome.storage.local:', tempKey);
          } catch (storageErr) {
            console.warn('[Editor] chrome.storage.local access failed:', storageErr);
          }
        }

        // Strategy 3: Try loading from background via getFullCapture (last resort)
        if (captureId) {
          try {
            const { getFullCapture } = await import('@/lib/messages');
            const fullCapture = await getFullCapture(captureId);
            if (fullCapture?.imageData) {
              setImageUrl(fullCapture.imageData);
              // Cache to IndexedDB for future use
              try {
                const { storage } = await import('@/lib/storage');
                await storage.init();
                await storage.addCapture(fullCapture).catch(async () => {
                  await storage.updateCapture(fullCapture.id, fullCapture);
                });
              } catch {
                // Best effort
              }
              setIsLoading(false);
              return;
            }
          } catch (bgErr) {
            console.warn('[Editor] Background getFullCapture failed:', bgErr);
          }
        }

        // All strategies failed
        setError('Image data not found. The capture may have been deleted or the storage quota was exceeded.');
      } catch (err) {
        console.error('[Editor] Failed to load image data:', err);
        setError('Failed to load image data.');
      } finally {
        setIsLoading(false);
      }
    };

    loadImage();
  }, [captureId, tempKey, imageUrl]);

  const handleClose = useCallback(() => {
    window.close();
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center w-full h-screen bg-ed-bg">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-ed-bg-secondary border border-ed-border">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="2"/>
              <path d="M12 8V12M12 16H12.01" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-ed-text-primary mb-1">Error</h2>
          <p className="text-xs text-ed-text-muted mb-4 max-w-[240px]">{error}</p>
          <button
            onClick={() => window.close()}
            className="px-4 py-2 rounded-ed-lg text-xs font-medium cursor-pointer ed-transition
              bg-surface-elevated text-ed-text-secondary hover:bg-surface-hover hover:text-ed-text-primary"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center w-full h-screen bg-ed-bg">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center ed-animate-spin
            border-2 border-ed-border" style={{ borderTopColor: '#00a8ff' }} />
          <p className="text-xs text-ed-text-secondary">Loading image...</p>
        </div>
      </div>
    );
  }

  if (!imageUrl) {
    return (
      <div className="flex items-center justify-center w-full h-screen bg-ed-bg">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-ed-bg-secondary border border-ed-border">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M12 8L16 4L20 8" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M16 4V16" stroke="#64748b" strokeWidth="2" strokeLinecap="round"/>
              <path d="M22 12V20C22 21.1 21.1 22 20 22H8C6.9 22 6 21.1 6 20V12" stroke="#64748b" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-ed-text-primary mb-1">No Image to Edit</h2>
          <p className="text-xs text-ed-text-muted">Open a screenshot from SmartCapture Pro to start annotating</p>
          <button
            onClick={() => window.close()}
            className="mt-4 px-4 py-2 rounded-ed-lg text-xs font-medium cursor-pointer ed-transition
              bg-surface-elevated text-ed-text-secondary hover:bg-surface-hover hover:text-ed-text-primary"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-ed-bg">
      <AnnotationEditor
        imageUrl={imageUrl}
        filename={filename}
        captureId={captureId}
        onClose={handleClose}
      />
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
