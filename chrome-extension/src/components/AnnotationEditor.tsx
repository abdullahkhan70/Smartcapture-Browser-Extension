import React, { useRef, useState, useEffect, useCallback } from 'react';
import { fabric } from 'fabric';
import { AnnotationTool } from '@/lib/types';
import { useAnnotation } from '@/hooks/useAnnotation';
import { AnnotationToolbar } from './AnnotationToolbar';
import { PropertiesPanel } from './PropertiesPanel';
import { DownloadFormatPopup } from './DownloadFormatPopup';

const ZOOM_MIN = 0.1;   // 10%
const ZOOM_MAX = 10;    // 1000%
const ZOOM_STEP = 1.15; // 15% per step (multiplicative)

interface AnnotationEditorProps {
  imageUrl: string;
  filename: string;
  captureId?: string;
  annotations?: unknown[];
  onAnnotationsChange?: (annotations: unknown[]) => void;
  onClose?: () => void;
}

export function AnnotationEditor({
  imageUrl,
  filename,
  captureId,
  onClose,
}: AnnotationEditorProps) {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<fabric.Canvas | null>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const [zoom, setZoom] = useState(1);
  const [zoomInput, setZoomInput] = useState('100');
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState<{ x: number; y: number } | null>(null);
  const [activeToolInternal, setActiveToolInternal] = useState<AnnotationTool>('select');
  const [activeColorInternal, setActiveColorInternal] = useState('#EF4444');
  const [strokeWidthInternal, setStrokeWidthInternal] = useState(2);
  const [fontSizeInternal, setFontSizeInternal] = useState(20);
  const [fontFamilyInternal, setFontFamilyInternal] = useState('Inter, system-ui, sans-serif');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [showDownloadPopup, setShowDownloadPopup] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const zoomInputRef = useRef<HTMLInputElement>(null);

  // Initialize canvas
  useEffect(() => {
    if (!canvasElRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const canvas = new fabric.Canvas(canvasElRef.current, {
      width,
      height,
      backgroundColor: 'transparent',
      selection: true,
      selectionColor: 'rgba(0, 168, 255, 0.08)',
      selectionBorderColor: '#00a8ff',
      selectionLineWidth: 1,
      preserveObjectStacking: true,
    });

    // Load background image
    // Note: Do NOT set crossOrigin for data URLs — it causes silent load failures in Chrome extension tabs.
    // crossOrigin is only needed for external URLs (cross-origin images).
    const imageOptions = imageUrl.startsWith('data:') ? {} : { crossOrigin: 'anonymous' };
    fabric.Image.fromURL(imageUrl, (img: any) => {
      if (!img) {
        console.error('[Editor] Failed to load background image from URL (length:', imageUrl.length, ')');
        return;
      }

      const imgWidth = img.width || 800;
      const imgHeight = img.height || 600;

      const padding = 40;
      const scaleX = (width - padding * 2) / imgWidth;
      const scaleY = (height - padding * 2) / imgHeight;
      const scale = Math.min(scaleX, scaleY, 1);

      canvas.setWidth(width);
      canvas.setHeight(height);

      canvas.setBackgroundImage(img, () => {
        canvas.renderAll();
        // Store original image reference for reliable export
        (canvas as any)._screenshotImage = img;
        (canvas as any)._imageScale = scale;
        (canvas as any)._originalWidth = imgWidth;
        (canvas as any)._originalHeight = imgHeight;
        console.log('[Editor] Background image loaded:', imgWidth, 'x', imgHeight, 'scale:', scale);
      }, {
        scaleX: scale,
        scaleY: scale,
        originX: 'left',
        originY: 'top',
        left: (width - imgWidth * scale) / 2,
        top: (height - imgHeight * scale) / 2,
      });
    }, imageOptions);

    fabricCanvasRef.current = canvas;
    setFabricCanvas(canvas);

    return () => {
      canvas.dispose();
      fabricCanvasRef.current = null;
      setFabricCanvas(null);
    };
  }, [imageUrl]);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current || !fabricCanvasRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          fabricCanvasRef.current?.setDimensions({ width, height });
          fabricCanvasRef.current?.renderAll();
        }
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Annotation hook
  const onHistoryChange = useCallback((newCanUndo: boolean, newCanRedo: boolean) => {
    setCanUndo(newCanUndo);
    setCanRedo(newCanRedo);
  }, []);

  const {
    activeTool,
    activeColor,
    strokeWidth,
    fontSize,
    fontFamily,
    selectedObject,
    setActiveTool,
    setActiveColor,
    setStrokeWidth,
    setFontSize,
    setFontFamily,
    startRectangle,
    startEllipse,
    startArrow,
    startDrawing,
    stopDrawing,
    addText,
    addHighlight,
    updateShape,
    finalizeShape,
    deleteSelected,
    clearAll,
    undo,
    redo,
    exportCanvas,
    exportDataURL,
    onSelectionChange,
    onPropertyChange,
  } = useAnnotation({
    canvas: fabricCanvas,
    imageUrl,
    onHistoryChange,
  });

  const stopDrawingRef = useRef(stopDrawing);
  stopDrawingRef.current = stopDrawing;

  // Sync internal state with hook state
  useEffect(() => { setActiveToolInternal(activeTool); }, [activeTool]);
  useEffect(() => { setActiveColorInternal(activeColor); }, [activeColor]);
  useEffect(() => { setStrokeWidthInternal(strokeWidth); }, [strokeWidth]);
  useEffect(() => { setFontSizeInternal(fontSize); }, [fontSize]);
  useEffect(() => { setFontFamilyInternal(fontFamily); }, [fontFamily]);

  // Sync zoom input display
  useEffect(() => {
    setZoomInput(Math.round(zoom * 100).toString());
  }, [zoom]);

  const tempObjectRef = useRef<any>(null);

  const handleToolChange = useCallback((tool: AnnotationTool) => {
    setActiveTool(tool);
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    if (tempObjectRef.current) {
      canvas.remove(tempObjectRef.current);
      canvas.renderAll();
      tempObjectRef.current = null;
    }

    switch (tool) {
      case 'select':
        canvas.isDrawingMode = false;
        canvas.selection = true;
        canvas.defaultCursor = 'default';
        canvas.hoverCursor = 'move';
        canvas.forEachObject((obj: any) => {
          if (!obj._isBackground) {
            obj.selectable = true;
            obj.evented = true;
          }
        });
        break;

      case 'pan':
        canvas.isDrawingMode = false;
        canvas.selection = false;
        canvas.defaultCursor = 'grab';
        canvas.hoverCursor = 'grab';
        canvas.discardActiveObject();
        canvas.forEachObject((obj: any) => {
          obj.selectable = false;
          obj.evented = false;
        });
        canvas.renderAll();
        break;

      case 'draw':
        canvas.isDrawingMode = true;
        canvas.selection = false;
        canvas.defaultCursor = 'crosshair';
        if (canvas.freeDrawingBrush) {
          canvas.freeDrawingBrush.color = activeColorInternal;
          canvas.freeDrawingBrush.width = strokeWidthInternal;
        }
        canvas.forEachObject((obj: any) => {
          obj.selectable = false;
          obj.evented = false;
        });
        break;

      case 'rectangle':
      case 'ellipse':
      case 'arrow':
      case 'text':
      case 'highlight':
        canvas.isDrawingMode = false;
        canvas.selection = false;
        canvas.defaultCursor = 'crosshair';
        canvas.hoverCursor = 'crosshair';
        canvas.discardActiveObject();
        canvas.forEachObject((obj: any) => {
          obj.selectable = false;
          obj.evented = false;
        });
        canvas.renderAll();
        break;
    }
  }, [setActiveTool, activeColorInternal, strokeWidthInternal]);

  const handleMouseDown = useCallback((opt: fabric.IEvent<MouseEvent>) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !opt.e) return;

    const pointer = canvas.getPointer(opt.e);
    const tool = activeTool;

    if (tool === 'pan') {
      setIsPanning(true);
      setLastPanPoint({ x: opt.e.clientX, y: opt.e.clientY });
      canvas.defaultCursor = 'grabbing';
      return;
    }

    if (tool === 'text') {
      addText(pointer);
      return;
    }

    if (tool === 'rectangle') {
      startRectangle(pointer.x, pointer.y);
    } else if (tool === 'ellipse') {
      startEllipse(pointer.x, pointer.y);
    } else if (tool === 'arrow') {
      startArrow(pointer.x, pointer.y);
    } else if (tool === 'highlight') {
      addHighlight(pointer.x, pointer.y);
    }
  }, [activeTool, addText, startRectangle, startEllipse, startArrow, addHighlight]);

  const handleMouseMove = useCallback((opt: fabric.IEvent<MouseEvent>) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !opt.e) return;

    if (isPanning && lastPanPoint) {
      const dx = opt.e.clientX - lastPanPoint.x;
      const dy = opt.e.clientY - lastPanPoint.y;
      const vpt = canvas.viewportTransform!;
      vpt[4] += dx;
      vpt[5] += dy;
      canvas.requestRenderAll();
      setLastPanPoint({ x: opt.e.clientX, y: opt.e.clientY });
      return;
    }

    const tool = activeTool;
    if (['rectangle', 'ellipse', 'arrow', 'highlight'].includes(tool)) {
      const pointer = canvas.getPointer(opt.e);
      updateShape(pointer);
    }
  }, [activeTool, isPanning, lastPanPoint, updateShape]);

  const handleMouseUp = useCallback((_opt: fabric.IEvent<MouseEvent>) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    if (isPanning) {
      setIsPanning(false);
      canvas.defaultCursor = 'grab';
      setLastPanPoint(null);
      return;
    }

    const tool = activeTool;
    if (['rectangle', 'ellipse', 'arrow', 'highlight'].includes(tool)) {
      finalizeShape();
    }
  }, [activeTool, isPanning, finalizeShape]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);

    canvas.on('selection:created', onSelectionChange);
    canvas.on('selection:updated', onSelectionChange);
    canvas.on('selection:cleared', onSelectionChange);

    return () => {
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:up', handleMouseUp);
      canvas.off('selection:created', onSelectionChange);
      canvas.off('selection:updated', onSelectionChange);
      canvas.off('selection:cleared', onSelectionChange);
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp, onSelectionChange]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const handlePathCreated = () => {
      stopDrawingRef.current();
    };

    canvas.on('path:created', handlePathCreated);
    return () => canvas.off('path:created', handlePathCreated);
  }, []);

  // ===== ZOOM: Apply zoom to canvas =====
  const applyZoom = useCallback((newZoom: number, centerX?: number, centerY?: number) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));
    setZoom(newZoom);

    if (centerX !== undefined && centerY !== undefined) {
      canvas.zoomToPoint(new fabric.Point(centerX, centerY), newZoom);
    } else {
      const center = canvas.getCenter();
      canvas.zoomToPoint(new fabric.Point(center.left, center.top), newZoom);
    }
    canvas.requestRenderAll();
  }, []);

  const handleZoomIn = useCallback(() => {
    applyZoom(zoom * ZOOM_STEP);
  }, [zoom, applyZoom]);

  const handleZoomOut = useCallback(() => {
    applyZoom(zoom / ZOOM_STEP);
  }, [zoom, applyZoom]);

  const handleZoomInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setZoomInput(e.target.value);
  }, []);

  const handleZoomInputCommit = useCallback(() => {
    const parsed = parseInt(zoomInput, 10);
    if (!isNaN(parsed) && parsed >= 10 && parsed <= 1000) {
      applyZoom(parsed / 100);
    } else {
      setZoomInput(Math.round(zoom * 100).toString());
    }
    zoomInputRef.current?.blur();
  }, [zoomInput, zoom, applyZoom]);

  const handleZoomInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleZoomInputCommit();
    } else if (e.key === 'Escape') {
      setZoomInput(Math.round(zoom * 100).toString());
      zoomInputRef.current?.blur();
    }
  }, [handleZoomInputCommit, zoom]);

  const handleZoomInputFocus = useCallback(() => {
    zoomInputRef.current?.select();
  }, []);

  // ===== TOAST =====
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  }, []);

  // ===== SAVE (Ctrl+S) =====
  // Saves the annotated canvas as a high-quality PNG to IndexedDB.
  // The annotated image replaces the original, so re-opening shows the annotated version.
  const handleSave = useCallback(async () => {
    if (!captureId || isSaving) return;
    setIsSaving(true);
    try {
      // Always save as PNG for lossless quality (quality=1)
      const dataURL = await exportDataURL('image/png', 1);

      if (!dataURL || dataURL.length < 100) {
        console.error('[Editor] Export produced invalid/empty data URL, length:', dataURL?.length);
        showToast('Export produced empty image. The canvas may be empty.');
        return;
      }

      if (!dataURL.startsWith('data:image/')) {
        console.error('[Editor] Export produced invalid data URL format');
        showToast('Export failed: invalid image format');
        return;
      }

      console.log('[Editor] Saving image, data URL length:', dataURL.length);

      const { storage } = await import('@/lib/storage');
      await storage.init();

      // Check if capture exists in IndexedDB
      const existingCapture = await storage.getCapture(captureId);
      if (existingCapture) {
        // Update the stored image data with the annotated version
        await storage.updateCapture(captureId, {
          ...existingCapture,
          imageData: dataURL,
          // Update dimensions to match exported image
          width: existingCapture.width,
          height: existingCapture.height,
        });
        showToast('Saved successfully! Close and reopen to see the annotated version.');
      } else {
        // Capture not in IndexedDB — try to fetch from background and store it first
        console.warn('[Editor] Capture not found in IndexedDB, trying background fallback...');
        try {
          const { getFullCapture } = await import('@/lib/messages');
          const bgCapture = await getFullCapture(captureId);
          if (bgCapture?.id) {
            await storage.addCapture({
              ...bgCapture,
              imageData: dataURL,
            });
            showToast('Saved successfully!');
          } else {
            showToast('Capture not found. Please re-capture the image.');
          }
        } catch (bgErr) {
          console.error('[Editor] Background fallback failed:', bgErr);
          showToast('Save failed: could not find original capture.');
        }
      }
    } catch (err) {
      console.error('[Editor] Save failed:', err);
      showToast('Save failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSaving(false);
    }
  }, [captureId, isSaving, exportDataURL, showToast]);

  // ===== DOWNLOAD =====
  const handleDownload = useCallback(async (format: 'png' | 'jpeg', quality: number) => {
    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
    const blob = await exportCanvas(mimeType, quality);
    if (blob && blob.size > 0) {
      const ext = format === 'png' ? 'png' : 'jpg';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `annotated-${filename}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      const sizeKB = (blob.size / 1024).toFixed(0);
      const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
      const sizeStr = blob.size > 1048576 ? `${sizeMB} MB` : `${sizeKB} KB`;
      showToast(`Downloaded as ${format.toUpperCase()} (${sizeStr})`);
    } else {
      console.error('[Editor] Download failed: exportCanvas returned', blob ? `empty blob (size: ${blob.size})` : 'null');
      showToast('Export failed — canvas may be empty or export timed out');
    }
    setShowDownloadPopup(false);
  }, [exportCanvas, filename, showToast]);

  const handleCopyToClipboard = useCallback(async () => {
    const blob = await exportCanvas('image/png', 1);
    if (blob) {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
      } catch (err) {
        console.error('Failed to copy to clipboard:', err);
      }
    }
  }, [exportCanvas]);

  // ===== KEYBOARD SHORTCUTS =====
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const canvas = fabricCanvasRef.current;
      const activeObj = canvas?.getActiveObject();
      if (activeObj && (activeObj as fabric.IText).isEditing) return;

      const key = e.key.toLowerCase();

      if (!e.ctrlKey && !e.metaKey) {
        switch (key) {
          case 'v': handleToolChange('select'); break;
          case 'h': handleToolChange('pan'); break;
          case 'd': handleToolChange('draw'); break;
          case 'r': handleToolChange('rectangle'); break;
          case 'e': handleToolChange('ellipse'); break;
          case 'a': handleToolChange('arrow'); break;
          case 't': handleToolChange('text'); break;
          case 'l': handleToolChange('highlight'); break;
          case 'delete':
          case 'backspace':
            deleteSelected();
            break;
          case 'escape':
            if (activeTool !== 'select') {
              handleToolChange('select');
            } else {
              onClose?.();
            }
            break;
        }
      }

      if (e.ctrlKey || e.metaKey) {
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if ((key === 'z' && e.shiftKey) || key === 'y') {
          e.preventDefault();
          redo();
        } else if (key === 's') {
          e.preventDefault();
          // Ctrl+S = Save (not download)
          handleSave();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToolChange, undo, redo, deleteSelected, activeTool, onClose, handleSave]);

  // ===== ZOOM WITH CTRL+SCROLL =====
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        // Multiplicative zoom: each scroll step = ~10%
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * factor));

        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        setZoom(newZoom);
        canvas.zoomToPoint(new fabric.Point(mouseX, mouseY), newZoom);
        canvas.requestRenderAll();
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [zoom]);

  // ===== PROPERTIES PANEL LOGIC =====
  // Show panel when: a drawing tool is selected, OR an object is selected
  const isDrawingTool = ['draw', 'rectangle', 'ellipse', 'arrow', 'text', 'highlight'].includes(activeTool);
  const showPanel = selectedObject || isDrawingTool;
  const panelMode = selectedObject ? 'object' : 'tool';

  // Close panel handler (switch back to select)
  const handleClosePanel = useCallback(() => {
    fabricCanvasRef.current?.discardActiveObject();
    fabricCanvasRef.current?.renderAll();
    // Switch to select mode only if in tool mode
    if (panelMode === 'tool') {
      handleToolChange('select');
    }
  }, [panelMode, handleToolChange]);

  return (
    <div className="flex flex-col w-full h-full bg-ed-bg">
      {/* ===== Top Action Bar (48px) ===== */}
      <div className="flex items-center justify-between px-3 h-12 shrink-0 bg-ed-bg-secondary border-b border-ed-border">
        {/* Left: Back + Filename */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-ed cursor-pointer ed-transition
              text-ed-text-muted hover:text-ed-text-primary hover:bg-ed-bg-hover"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div className="w-7 h-7 rounded-md flex items-center justify-center bg-ed-accent/10 shrink-0">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="12" height="12" rx="2" stroke="#00a8ff" strokeWidth="1.5"/>
              <circle cx="5.5" cy="5.5" r="1.5" fill="#00a8ff"/>
              <path d="M2 11L5.5 7.5L8 10L11 7L14 10" stroke="#00a8ff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="text-xs font-medium text-ed-text-primary truncate">{filename}</span>
        </div>

        {/* Center: Undo/Redo + Zoom controls */}
        <div className="flex items-center gap-1">
          {/* Undo */}
          <button
            onClick={undo}
            disabled={!canUndo}
            className={`flex items-center justify-center w-8 h-8 rounded-ed cursor-pointer ed-transition
              ${canUndo ? 'text-ed-text-secondary hover:text-ed-text-primary hover:bg-ed-bg-hover' : 'text-ed-text-muted/40 cursor-not-allowed'}`}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 5.5C3 3.567 4.567 2 6.5 2C8.433 2 10 3.567 10 5.5V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M5 4L3 5.5L5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {/* Redo */}
          <button
            onClick={redo}
            disabled={!canRedo}
            className={`flex items-center justify-center w-8 h-8 rounded-ed cursor-pointer ed-transition
              ${canRedo ? 'text-ed-text-secondary hover:text-ed-text-primary hover:bg-ed-bg-hover' : 'text-ed-text-muted/40 cursor-not-allowed'}`}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M11 5.5C11 3.567 9.433 2 7.5 2C5.567 2 4 3.567 4 5.5V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M9 4L11 5.5L9 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Separator */}
          <div className="w-px h-5 bg-ed-border mx-1" />

          {/* Zoom controls with editable input */}
          <div className="flex items-center gap-0.5 bg-ed-bg rounded-ed-lg px-1 py-0.5">
            <button
              onClick={handleZoomOut}
              className="flex items-center justify-center w-7 h-7 rounded-ed cursor-pointer ed-transition
                text-ed-text-secondary hover:text-ed-text-primary hover:bg-ed-bg-hover"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
            <div className="relative flex items-center">
              <input
                ref={zoomInputRef}
                type="text"
                value={zoomInput}
                onChange={handleZoomInputChange}
                onBlur={handleZoomInputCommit}
                onKeyDown={handleZoomInputKeyDown}
                onFocus={handleZoomInputFocus}
                className="w-[44px] text-[11px] text-ed-text-primary font-semibold tabular-nums text-center
                  bg-transparent border-none outline-none cursor-text select-none"
                inputMode="numeric"
              />
              <span className="absolute right-0 text-[10px] text-ed-text-muted pointer-events-none">%</span>
            </div>
            <button
              onClick={handleZoomIn}
              className="flex items-center justify-center w-7 h-7 rounded-ed cursor-pointer ed-transition
                text-ed-text-secondary hover:text-ed-text-primary hover:bg-ed-bg-hover"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 2V10M2 6H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Right: Save + Share + Download + Close */}
        <div className="flex items-center gap-2 flex-1 justify-end">
          {/* Share / Copy */}
          <button
            onClick={handleCopyToClipboard}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-ed cursor-pointer ed-transition text-xs font-medium
              text-ed-text-secondary hover:text-ed-text-primary border border-ed-border hover:border-ed-text-muted/30"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M8 2.333L11.667 6L8 9.667" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2.333 8C2.333 9.473 3.527 10.667 5 10.667H11.667" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            Share
          </button>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={!captureId || isSaving}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-ed cursor-pointer ed-transition text-xs font-semibold
              ${captureId && !isSaving
                ? 'text-ed-text-primary border border-ed-border hover:border-ed-accent/40 hover:bg-ed-accent/10'
                : 'text-ed-text-muted/40 cursor-not-allowed border border-ed-border'
              }`}
            title={!captureId ? 'No capture ID available' : 'Save (Ctrl+S)'}
          >
            {isSaving ? (
              <div className="w-3.5 h-3.5 rounded-full ed-animate-spin border-2 border-ed-text-muted/30" style={{ borderTopColor: 'currentColor' }} />
            ) : (
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M11.667 7V11.667H2.333V7M10.5 4.667L7 1.333L3.5 4.667M7 1.333V9.333" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            Save
          </button>

          {/* Download */}
          <button
            onClick={() => setShowDownloadPopup(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-ed cursor-pointer ed-transition text-xs font-semibold
              text-white bg-ed-accent hover:bg-ed-accent-hover shadow-ed-glow-sm"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M7 2V9M7 9L4.5 6.5M7 9L9.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2.5 11V11.5C2.5 12.05 2.95 12.5 3.5 12.5H10.5C11.05 12.5 11.5 12.05 11.5 11.5V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Download
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-ed cursor-pointer ed-transition
              text-ed-text-muted hover:text-ed-text-primary hover:bg-ed-bg-hover"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ===== Main Content Area ===== */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Annotation Toolbar */}
        <AnnotationToolbar
          activeTool={activeToolInternal}
          onToolChange={handleToolChange}
          activeColor={activeColorInternal}
          onColorChange={(c) => {
            setActiveColor(c);
            const canvas = fabricCanvasRef.current;
            if (canvas && canvas.freeDrawingBrush) {
              canvas.freeDrawingBrush.color = c;
            }
          }}
          onUndo={undo}
          onRedo={redo}
          onClear={clearAll}
          onDeleteSelected={deleteSelected}
          canUndo={canUndo}
          canRedo={canRedo}
        />

        {/* Canvas Area */}
        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden ed-canvas-bg"
        >
          <canvas ref={canvasElRef} />

          {/* Zoom indicator (bottom left) */}
          <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-ed bg-ed-bg-secondary/80 border border-ed-border
            backdrop-blur-sm">
            <span className="text-[10px] text-ed-text-muted font-medium">
              Zoom: {Math.round(zoom * 100)}%
            </span>
          </div>
        </div>

        {/* Right Properties Panel — shows for both tool mode and object mode */}
        {showPanel && (
          <PropertiesPanel
            mode={panelMode}
            toolProps={
              panelMode === 'tool'
                ? {
                    activeTool: activeTool,
                    activeColor: activeColor,
                    strokeWidth,
                    fontSize,
                    fontFamily,
                    onColorChange: setActiveColor,
                    onStrokeWidthChange: setStrokeWidth,
                    onFontSizeChange: setFontSize,
                    onFontFamilyChange: setFontFamily,
                  }
                : undefined
            }
            objectProps={
              panelMode === 'object' && selectedObject
                ? {
                    selectedObject,
                    onPropertyChange,
                    onDelete: deleteSelected,
                  }
                : undefined
            }
            onClose={handleClosePanel}
          />
        )}
      </div>

      {/* Download Format Popup */}
      {showDownloadPopup && (
        <DownloadFormatPopup
          onSelect={handleDownload}
          onClose={() => setShowDownloadPopup(false)}
        />
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] ed-animate-fade-in">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-ed-lg bg-ed-bg-secondary border border-ed-border
            shadow-lg backdrop-blur-sm">
            <div className={`w-2 h-2 rounded-full ${toastMessage.includes('fail') ? 'bg-ed-danger' : 'bg-ed-success'}`} />
            <span className="text-xs font-medium text-ed-text-primary">{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}
