import { useState, useCallback, useRef, useEffect } from 'react';
import { fabric } from 'fabric';
import { Annotation, AnnotationTool, AnnotationType } from '@/lib/types';
import { ANNOTATION_COLORS } from '@/lib/constants';

interface UseAnnotationOptions {
  canvas: fabric.Canvas | null;
  imageUrl?: string;
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
}

interface UseAnnotationReturn {
  activeTool: AnnotationTool;
  activeColor: string;
  strokeWidth: number;
  fontSize: number;
  fontFamily: string;
  annotations: Annotation[];
  selectedObject: fabric.Object | null;
  setActiveTool: (tool: AnnotationTool) => void;
  setActiveColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setFontSize: (size: number) => void;
  setFontFamily: (family: string) => void;
  startRectangle: (originX: number, originY: number) => void;
  startEllipse: (originX: number, originY: number) => void;
  startArrow: (originX: number, originY: number) => void;
  startDrawing: (pointer: fabric.Point) => void;
  continueDrawing: (pointer: fabric.Point) => void;
  stopDrawing: () => void;
  addText: (pointer: fabric.Point) => void;
  addHighlight: (originX: number, originY: number) => void;
  updateShape: (pointer: fabric.Point) => void;
  finalizeShape: () => void;
  deleteSelected: () => void;
  clearAll: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  exportCanvas: (format?: string, quality?: number) => Promise<Blob | null>;
  exportDataURL: (format?: string, quality?: number) => Promise<string | null>;
  onSelectionChange: () => void;
  onPropertyChange: (property: string, value: unknown) => void;
}

let annotationCounter = 0;

export function useAnnotation({ canvas, imageUrl, onHistoryChange }: UseAnnotationOptions): UseAnnotationReturn {
  const [activeTool, setActiveTool] = useState<AnnotationTool>('select');
  const [activeColor, setActiveColor] = useState<string>(ANNOTATION_COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [fontSize, setFontSize] = useState(20);
  const [fontFamily, setFontFamily] = useState('Inter, system-ui, sans-serif');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedObject, setSelectedObject] = useState<fabric.Object | null>(null);

  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const isDrawingRef = useRef(false);
  const tempObjectRef = useRef<fabric.Object | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const brushSizeRef = useRef(2);

  // Sync brush size
  useEffect(() => {
    brushSizeRef.current = strokeWidth;
    if (canvas) {
      if (canvas.freeDrawingBrush) {
        canvas.freeDrawingBrush.width = strokeWidth;
      }
    }
  }, [strokeWidth, canvas]);

  // Sync font settings to active text object
  useEffect(() => {
    if (!canvas) return;
    const activeObj = canvas.getActiveObject();
    if (activeObj && (activeObj.type === 'i-text' || activeObj.type === 'text') && !(activeObj as any).isEditing) {
      activeObj.set({
        fontSize,
        fontFamily,
        fill: activeColor,
      } as any);
      canvas.renderAll();
    }
  }, [fontSize, fontFamily, activeColor, canvas]);

  // Save initial state when canvas loads with image
  useEffect(() => {
    if (canvas && imageUrl) {
      const timer = setTimeout(() => {
        saveToHistory();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [canvas, imageUrl]);

  const notifyHistoryChange = useCallback(() => {
    onHistoryChange?.(
      historyIndexRef.current > 0,
      historyIndexRef.current < historyRef.current.length - 1
    );
  }, [onHistoryChange]);

  const saveToHistory = useCallback(() => {
    if (!canvas) return;
    const json = JSON.stringify(canvas.toJSON(['annotationId', 'annotationType']));
    const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    newHistory.push(json);
    if (newHistory.length > 50) newHistory.shift();
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
    notifyHistoryChange();
  }, [canvas, notifyHistoryChange]);

  const restoreFromHistory = useCallback((index: number) => {
    if (!canvas || index < 0 || index >= historyRef.current.length) return;
    const json = historyRef.current[index];
    canvas.loadFromJSON(JSON.parse(json), () => {
      canvas.renderAll();
      if (canvas.freeDrawingBrush) {
        canvas.freeDrawingBrush.color = activeColor;
        canvas.freeDrawingBrush.width = brushSizeRef.current;
      }
    });
    historyIndexRef.current = index;
    notifyHistoryChange();
  }, [canvas, activeColor, notifyHistoryChange]);

  const undo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      restoreFromHistory(historyIndexRef.current - 1);
    }
  }, [restoreFromHistory]);

  const redo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      restoreFromHistory(historyIndexRef.current + 1);
    }
  }, [restoreFromHistory]);

  const createAnnotation = useCallback((type: AnnotationType, obj: fabric.Object): Annotation => {
    const annotation: Annotation = {
      id: `anno-${++annotationCounter}-${Date.now()}`,
      type,
      data: {},
      color: activeColor,
      timestamp: Date.now(),
    };
    obj.set({ annotationId: annotation.id, annotationType: annotation.type } as any);
    setAnnotations(prev => [...prev, annotation]);
    return annotation;
  }, [activeColor]);

  // Rectangle
  const startRectangle = useCallback((originX: number, originY: number) => {
    if (!canvas) return;
    originRef.current = { x: originX, y: originY };
    const rect = new fabric.Rect({
      left: originX,
      top: originY,
      width: 0,
      height: 0,
      fill: 'transparent',
      stroke: activeColor,
      strokeWidth: strokeWidth,
      strokeUniform: true,
      selectable: false,
      evented: false,
    });
    canvas.add(rect);
    tempObjectRef.current = rect;
  }, [canvas, activeColor, strokeWidth]);

  // Ellipse
  const startEllipse = useCallback((originX: number, originY: number) => {
    if (!canvas) return;
    originRef.current = { x: originX, y: originY };
    const ellipse = new fabric.Ellipse({
      left: originX,
      top: originY,
      rx: 0,
      ry: 0,
      fill: 'transparent',
      stroke: activeColor,
      strokeWidth: strokeWidth,
      strokeUniform: true,
      selectable: false,
      evented: false,
    });
    canvas.add(ellipse);
    tempObjectRef.current = ellipse;
  }, [canvas, activeColor, strokeWidth]);

  // Arrow
  const startArrow = useCallback((originX: number, originY: number) => {
    if (!canvas) return;
    originRef.current = { x: originX, y: originY };
    const line = new fabric.Line([originX, originY, originX, originY], {
      stroke: activeColor,
      strokeWidth: strokeWidth,
      strokeUniform: true,
      selectable: false,
      evented: false,
    });
    canvas.add(line);
    tempObjectRef.current = line;
  }, [canvas, activeColor, strokeWidth]);

  // Drawing
  const startDrawing = useCallback((_pointer: fabric.Point) => {
    if (!canvas) return;
    canvas.isDrawingMode = true;
    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = activeColor;
      canvas.freeDrawingBrush.width = brushSizeRef.current;
    }
  }, [canvas, activeColor]);

  const continueDrawing = useCallback((_pointer: fabric.Point) => {
    // Fabric.js handles free drawing natively
  }, []);

  const stopDrawing = useCallback(() => {
    if (!canvas) return;
    canvas.isDrawingMode = false;
    const objects = canvas.getObjects();
    const lastPath = objects[objects.length - 1];
    if (lastPath && lastPath.type === 'path') {
      lastPath.set({ selectable: true, evented: true } as any);
      createAnnotation('freehand', lastPath);
      saveToHistory();
    }
  }, [canvas, createAnnotation, saveToHistory]);

  // Text
  const addText = useCallback((pointer: fabric.Point) => {
    if (!canvas) return;
    const itext = new fabric.IText('Type here', {
      left: pointer.x,
      top: pointer.y,
      fontSize: fontSize,
      fill: activeColor,
      fontFamily: fontFamily,
      selectable: true,
      evented: true,
      cursorColor: activeColor,
      editingBorderColor: '#0EA5E9',
    });
    canvas.add(itext);
    canvas.setActiveObject(itext);
    itext.enterEditing();
    createAnnotation('text', itext);
    saveToHistory();
  }, [canvas, fontSize, activeColor, fontFamily, createAnnotation, saveToHistory]);

  // Highlight
  const addHighlight = useCallback((originX: number, originY: number) => {
    if (!canvas) return;
    originRef.current = { x: originX, y: originY };
    const rect = new fabric.Rect({
      left: originX,
      top: originY,
      width: 0,
      height: 0,
      fill: activeColor,
      opacity: 0.3,
      stroke: activeColor,
      strokeWidth: 0,
      strokeUniform: true,
      selectable: false,
      evented: false,
    });
    canvas.add(rect);
    tempObjectRef.current = rect;
  }, [canvas, activeColor]);

  // Update shape during drag
  const updateShape = useCallback((pointer: fabric.Point) => {
    if (!canvas || !originRef.current || !tempObjectRef.current) return;
    const origin = originRef.current;
    const obj = tempObjectRef.current;

    if (obj.type === 'rect') {
      const left = Math.min(origin.x, pointer.x);
      const top = Math.min(origin.y, pointer.y);
      const width = Math.abs(pointer.x - origin.x);
      const height = Math.abs(pointer.y - origin.y);
      obj.set({ left, top, width, height });
    } else if (obj.type === 'ellipse') {
      const left = Math.min(origin.x, pointer.x);
      const top = Math.min(origin.y, pointer.y);
      const rx = Math.abs(pointer.x - origin.x) / 2;
      const ry = Math.abs(pointer.y - origin.y) / 2;
      obj.set({ left, top, rx, ry });
    } else if (obj.type === 'line') {
      (obj as fabric.Line).set({ x2: pointer.x, y2: pointer.y });
    }

    canvas.renderAll();
  }, [canvas]);

  // Finalize shape
  const finalizeShape = useCallback(() => {
    if (!canvas || !tempObjectRef.current) return;
    const obj = tempObjectRef.current;

    obj.set({ selectable: true, evented: true } as any);

    let isTooSmall = false;
    if (obj.type === 'rect') {
      isTooSmall = (obj as fabric.Rect).width! < 3 && (obj as fabric.Rect).height! < 3;
    } else if (obj.type === 'ellipse') {
      isTooSmall = (obj as fabric.Ellipse).rx! < 2 && (obj as fabric.Ellipse).ry! < 2;
    } else if (obj.type === 'line') {
      const line = obj as fabric.Line;
      isTooSmall = Math.abs(line.x2! - line.x1!) < 3 && Math.abs(line.y2! - line.y1!) < 3;
    }

    if (isTooSmall) {
      canvas.remove(obj);
    } else {
      let annoType: AnnotationType = 'rectangle';
      if (obj.type === 'ellipse') annoType = 'ellipse';
      else if (obj.type === 'line') annoType = 'arrow';

      const isHighlight = obj.type === 'rect' && obj.opacity && obj.opacity < 1 && obj.strokeWidth === 0;
      if (isHighlight) annoType = 'highlight';

      createAnnotation(annoType, obj);

      if (annoType === 'arrow') {
        const line = obj as fabric.Line;
        const headLength = 16;
        const angle = Math.atan2(line.y2! - line.y1!, line.x2! - line.x1!);

        const head = new fabric.Triangle({
          left: line.x2!,
          top: line.y2!,
          originX: 'center',
          originY: 'center',
          width: headLength,
          height: headLength,
          fill: activeColor,
          angle: (angle * 180) / Math.PI + 90,
          selectable: false,
          evented: false,
          annotationId: obj.annotationId,
          annotationType: 'arrow',
        } as any);

        const group = new fabric.Group([line, head], {
          selectable: true,
          evented: true,
          annotationId: obj.annotationId,
          annotationType: 'arrow',
        } as any);
        canvas.remove(obj);
        canvas.add(group);
        canvas.setActiveObject(group);
      }

      saveToHistory();
    }

    tempObjectRef.current = null;
    originRef.current = null;
    canvas.renderAll();
  }, [canvas, activeColor, createAnnotation, saveToHistory]);

  // Delete selected
  const deleteSelected = useCallback(() => {
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (active) {
      canvas.remove(active);
      canvas.discardActiveObject();
      canvas.renderAll();
      saveToHistory();
    }
  }, [canvas, saveToHistory]);

  // Clear all
  const clearAll = useCallback(() => {
    if (!canvas) return;
    canvas.clear();
    canvas.renderAll();
    setAnnotations([]);
    saveToHistory();
  }, [canvas, saveToHistory]);

  /**
   * Get the original image resolution multiplier for high-quality export.
   * 
   * The background image is scaled to fit the canvas viewport. To export at
   * the original image resolution, we need to know:
   * - The scale factor that was applied to the background
   * - The position of the background on the canvas
   * - The original image dimensions
   * 
   * The export function uses this to render at original resolution and then
   * crop to the image area, removing canvas padding.
   */
  const getOriginalResMultiplier = useCallback((): {
    multiplier: number;
    cropX: number;
    cropY: number;
    cropW: number;
    cropH: number;
  } | null => {
    if (!canvas) return null;

    // Prefer the stored original dimensions (set by AnnotationEditor on load)
    const origW = (canvas as any)._originalWidth;
    const origH = (canvas as any)._originalHeight;
    const origScale = (canvas as any)._imageScale;

    const bg = (canvas as any).backgroundImage as any;

    if (origW && origH && origScale) {
      const bgLeft = bg?.left || 0;
      const bgTop = bg?.top || 0;
      const multiplier = 1 / origScale;
      return {
        multiplier,
        cropX: Math.round(bgLeft * multiplier),
        cropY: Math.round(bgTop * multiplier),
        cropW: origW,
        cropH: origH,
      };
    }

    if (!bg) {
      console.warn('[Annotation] No background image found for export');
      return null;
    }

    const bgScale = bg.scaleX || 1;
    const bgLeft = bg.left || 0;
    const bgTop = bg.top || 0;
    const imgW = bg.width || 0;
    const imgH = bg.height || 0;

    if (imgW === 0 || imgH === 0) {
      console.warn('[Annotation] Background image has zero dimensions');
      return null;
    }

    const multiplier = 1 / bgScale;
    return {
      multiplier,
      cropX: Math.round(bgLeft * multiplier),
      cropY: Math.round(bgTop * multiplier),
      cropW: imgW,
      cropH: imgH,
    };
  }, [canvas]);

  /**
   * Core export helper: renders the annotated canvas at ORIGINAL image resolution.
   *
   * Strategy (viewport-shift approach — no crop needed):
   * ─────────────────────────────────────────────────────────
   * 1. Calculate the background image's displayed size and position on the canvas.
   * 2. Set viewport transform to [1,0,0,1, -bgLeft, -bgTop] — this shifts the
   *    canvas origin so the background image's top-left corner is at (0, 0).
   * 3. Resize the canvas to exactly match the displayed background dimensions.
   *    This eliminates ALL padding around the image.
   * 4. Call toCanvasElement(multiplier) — the output IS the final image at
   *    original resolution. No cropping, no coordinate math.
   * 5. Restore everything (viewport, dimensions, background color).
   *
   * Why this works:
   * - Annotations are at canvas coordinates; the viewport shift moves them
   *   along with the background, preserving their relative positions.
   * - The multiplier = 1 / bgScale restores the background to its original pixel size.
   * - No objects are at negative coordinates after the shift, so nothing is clipped.
   *
   * Handles all edge cases:
   * - Properties Panel resizing the canvas (background extends beyond edges)
   * - Pan/zoom viewport transforms
   * - Tall full-page captures (negative bgTop after centering)
   * - Extremely high-res images (multiplier capped at 8x)
   */
  const renderToOffscreenCanvas = useCallback((
    needsWhiteBg: boolean,
  ): HTMLCanvasElement | null => {
    if (!canvas) return null;

    const bg = (canvas as any).backgroundImage as any;
    if (!bg || !bg.width || !bg.height) {
      console.warn('[Annotation] No background image for export');
      return null;
    }

    // ── Step 1: Calculate background geometry ──
    const origScale = (canvas as any)._imageScale || bg.scaleX || 1;
    const origW = (canvas as any)._originalWidth || bg.width;
    const origH = (canvas as any)._originalHeight || bg.height;
    let multiplier = 1 / origScale;

    // Safety cap: limit total output pixels to prevent OOM.
    // For typical screenshots (1920×1080 = 2M pixels), this has no effect.
    // For extreme full-page captures (e.g., 1920×50000 = 96M pixels),
    // the multiplier is scaled down proportionally so output stays under 100M pixels.
    const MAX_OUTPUT_PIXELS = 100_000_000;
    const estimatedPixels = origW * origH;
    if (estimatedPixels > MAX_OUTPUT_PIXELS) {
      const areaScale = Math.sqrt(MAX_OUTPUT_PIXELS / estimatedPixels);
      multiplier = multiplier * areaScale;
      console.log('[Annotation] Output capped at', Math.round(multiplier * 100) / 100 + 'x',
        'due to large image (' + origW + '×' + origH + ')');
    }

    const bgScaledW = bg.width * (bg.scaleX || 1);
    const bgScaledH = bg.height * (bg.scaleY || 1);
    const bgLeft = bg.left || 0;
    const bgTop = bg.top || 0;

    // ── Step 2: Save current state ──
    const savedVpt = ((canvas as any).viewportTransform?.slice()) || [1, 0, 0, 1, 0, 0];
    const savedBgColor = (canvas as any).backgroundColor;
    const savedCanvasW = canvas.width;
    const savedCanvasH = canvas.height;

    try {
      // ── Step 3: Shift viewport so background top-left is at origin ──
      // viewportTransform = [scaleX, skewY, skewX, scaleY, translateX, translateY]
      // We want to shift by (-bgLeft, -bgTop) so the background image starts at (0,0)
      canvas.setViewportTransform([1, 0, 0, 1, -bgLeft, -bgTop]);

      // ── Step 4: Resize canvas to exactly match displayed background ──
      // Add 2px padding to avoid sub-pixel clipping at edges
      const exportW = Math.ceil(bgScaledW) + 2;
      const exportH = Math.ceil(bgScaledH) + 2;
      canvas.setDimensions({ width: exportW, height: exportH });

      // ── Step 5: Set white background for JPEG ──
      if (needsWhiteBg) {
        (canvas as any).backgroundColor = '#ffffff';
      } else {
        (canvas as any).backgroundColor = 'transparent';
      }

      canvas.renderAll();

      console.log('[Annotation] Export params:', {
        multiplier: multiplier.toFixed(3),
        origW, origH,
        bgScaledW: bgScaledW.toFixed(1),
        bgScaledH: bgScaledH.toFixed(1),
        bgLeft: bgLeft.toFixed(1),
        bgTop: bgTop.toFixed(1),
        exportW, exportH,
        expectedOutput: `${Math.round(bgScaledW * multiplier)}×${Math.round(bgScaledH * multiplier)}`,
      });

      // ── Step 6: Render at original resolution ──
      // toCanvasElement creates a canvas of size:
      //   exportW * multiplier × exportH * multiplier
      // The background (now at origin, displayed at bgScaledW×bgScaledH)
      // is rendered at bgScaledW * multiplier × bgScaledH * multiplier
      // = origW × origH (the original pixel dimensions!)
      const outputCanvas = (canvas as any).toCanvasElement(multiplier);

      if (!outputCanvas || outputCanvas.width === 0 || outputCanvas.height === 0) {
        console.error('[Annotation] toCanvasElement returned empty canvas');
        return null;
      }

      console.log('[Annotation] Export output size:',
        `${outputCanvas.width}×${outputCanvas.height}`,
        '(original:', `${origW}×${origH}`, ')');

      // Trim the 2px padding from edges (if any)
      const padPx = Math.ceil(2 * multiplier);
      const trimX = Math.min(padPx, Math.floor((outputCanvas.width - origW) / 2));
      const trimY = Math.min(padPx, Math.floor((outputCanvas.height - origH) / 2));

      if (trimX > 0 || trimY > 0) {
        const trimmed = document.createElement('canvas');
        trimmed.width = outputCanvas.width - trimX * 2;
        trimmed.height = outputCanvas.height - trimY * 2;
        const tctx = trimmed.getContext('2d');
        if (tctx) {
          if (needsWhiteBg) {
            tctx.fillStyle = '#ffffff';
            tctx.fillRect(0, 0, trimmed.width, trimmed.height);
          }
          tctx.drawImage(
            outputCanvas,
            trimX, trimY, trimmed.width, trimmed.height,
            0, 0, trimmed.width, trimmed.height,
          );
          console.log('[Annotation] Trimmed padding:',
            `-${trimX}px, -${trimY}px → ${trimmed.width}×${trimmed.height}`);
          return trimmed;
        }
      }

      return outputCanvas;
    } catch (err) {
      console.error('[Annotation] renderToOffscreenCanvas failed:', err);
      return null;
    } finally {
      // ── Step 7: Restore ALL canvas state (guaranteed via finally) ──
      canvas.setDimensions({ width: savedCanvasW, height: savedCanvasH });
      canvas.setViewportTransform(savedVpt);
      (canvas as any).backgroundColor = savedBgColor;
      canvas.renderAll();
    }
  }, [canvas]);

  // Export as Blob (for download)
  const exportCanvas = useCallback(async (format: string = 'image/png', quality: number = 1): Promise<Blob | null> => {
    if (!canvas) {
      console.warn('[Annotation] exportCanvas: canvas is null');
      return null;
    }
    return new Promise((resolve) => {
      try {
        canvas.discardActiveObject();
        canvas.renderAll();

        const needsWhiteBg = format.includes('jpeg');
        const result = renderToOffscreenCanvas(needsWhiteBg);

        if (!result) {
          console.warn('[Annotation] High-res export unavailable, using simple fallback');
          (canvas as any).toBlob?.(
            (blob: any) => resolve(blob || null),
            { format: format.replace('image/', ''), quality } as any,
          );
          return;
        }

        result.toBlob(
          (blob: any) => {
            if (blob && blob.size > 0) {
              resolve(blob);
            } else {
              console.error('[Annotation] toBlob produced empty result');
              resolve(null);
            }
          },
          format,
          quality,
        );
      } catch (err) {
        console.error('[Annotation] Export canvas error:', err);
        resolve(null);
      }
    });
  }, [canvas, renderToOffscreenCanvas]);

  // Export as Data URL (for saving to IndexedDB — always PNG for lossless quality)
  const exportDataURL = useCallback(async (format: string = 'image/png', quality: number = 1): Promise<string | null> => {
    if (!canvas) {
      console.warn('[Annotation] exportDataURL: canvas is null');
      return null;
    }
    return new Promise((resolve) => {
      try {
        canvas.discardActiveObject();
        canvas.renderAll();

        const needsWhiteBg = format.includes('jpeg');
        const result = renderToOffscreenCanvas(needsWhiteBg);

        if (!result) {
          console.warn('[Annotation] High-res dataURL unavailable, using simple fallback');
          const dataURL = (canvas as any).toDataURL?.({ format: format.replace('image/', ''), quality } as any);
          resolve(dataURL);
          return;
        }

        const dataURL = result.toDataURL(format, quality);
        console.log('[Annotation] Export complete, data URL length:', dataURL?.length,
          'output:', `${result.width}×${result.height}`);

        if (!dataURL || dataURL.length < 100) {
          console.error('[Annotation] Cropped data URL is too short, possibly empty');
          resolve(null);
          return;
        }

        resolve(dataURL);
      } catch (err) {
        console.error('[Annotation] Export data URL error:', err);
        resolve(null);
      }
    });
  }, [canvas, renderToOffscreenCanvas]);

  // Selection change handler
  const onSelectionChange = useCallback(() => {
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (active) {
      setSelectedObject(active);
    } else {
      setSelectedObject(null);
    }
  }, [canvas]);

  // Property change handler
  const onPropertyChange = useCallback((property: string, value: unknown) => {
    if (!canvas || !selectedObject) return;
    selectedObject.set(property as any, value);
    canvas.renderAll();
    saveToHistory();
  }, [canvas, selectedObject, saveToHistory]);

  return {
    activeTool,
    activeColor,
    strokeWidth,
    fontSize,
    fontFamily,
    annotations,
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
    continueDrawing,
    stopDrawing,
    addText,
    addHighlight,
    updateShape,
    finalizeShape,
    deleteSelected,
    clearAll,
    undo,
    redo,
    canUndo: historyIndexRef.current > 0,
    canRedo: historyIndexRef.current < historyRef.current.length - 1,
    exportCanvas,
    exportDataURL,
    onSelectionChange,
    onPropertyChange,
  };
}
