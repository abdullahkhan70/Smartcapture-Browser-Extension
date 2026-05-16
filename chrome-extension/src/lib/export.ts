/**
 * SmartCapture Pro - Export Utilities
 * Handles image/PDF export with compositing, quality control,
 * watermarking, and clipboard integration.
 */

import jsPDF from 'jspdf';

// ===== Types =====

export type ExportFormat = 'png' | 'jpeg' | 'pdf';

export interface ExportOptions {
  format: ExportFormat;
  quality: number; // 0.1 to 1.0 (for JPEG)
  filename?: string;
  includeAnnotations?: boolean;
  watermark?: boolean;
  metadata?: {
    url?: string;
    title?: string;
    date?: string;
  };
}

// ===== Main Export Function =====

export async function exportCapture(
  imageData: string | Blob,
  options: ExportOptions,
  annotationsBlob?: Blob
): Promise<void> {
  switch (options.format) {
    case 'png':
      await exportAsPNG(imageData, options, annotationsBlob);
      break;
    case 'jpeg':
      await exportAsJPEG(imageData, options, annotationsBlob);
      break;
    case 'pdf':
      await exportAsPDF(imageData, options, annotationsBlob);
      break;
    default:
      throw new Error(`Unsupported export format: ${options.format}`);
  }
}

// ===== PNG Export =====

async function exportAsPNG(
  source: string | Blob,
  options: ExportOptions,
  annotations?: Blob
): Promise<void> {
  const finalBlob = await compositeImages(source, annotations, options);
  const filename =
    options.filename || generateFilename('smartcapture', 'png');

  await downloadBlob(finalBlob, filename, 'image/png');
}

// ===== JPEG Export =====

async function exportAsJPEG(
  source: string | Blob,
  options: ExportOptions,
  annotations?: Blob
): Promise<void> {
  const finalBlob = await compositeImages(source, annotations, options);

  // Convert to JPEG with quality setting using canvas
  const bitmap = await createImageBitmap(finalBlob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;

  // Fill white background for JPEG (no alpha support)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  // Apply watermark if needed
  if (options.watermark) {
    applyWatermark(ctx, canvas.width, canvas.height);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Failed to create JPEG blob'));
      },
      'image/jpeg',
      Math.max(0.1, Math.min(1.0, options.quality))
    );
  });

  const filename =
    options.filename || generateFilename('smartcapture', 'jpg');
  await downloadBlob(blob, filename, 'image/jpeg');
}

// ===== PDF Export =====

async function exportAsPDF(
  source: string | Blob,
  options: ExportOptions,
  annotations?: Blob
): Promise<void> {
  // Get composited image
  const compositedBlob = annotations
    ? await compositeImages(source, annotations, { ...options, watermark: false })
    : source;

  // Load image to get dimensions
  const img = await loadImage(compositedBlob);

  // Determine orientation based on aspect ratio
  const isLandscape = img.width > img.height;
  const orientation = isLandscape ? 'landscape' : 'portrait';

  // A4 dimensions in mm
  const A4_WIDTH_MM = 210;
  const A4_HEIGHT_MM = 297;
  const MARGIN_MM = 15;

  // Available area on page
  const pageW = isLandscape ? A4_HEIGHT_MM : A4_WIDTH_MM;
  const pageH = isLandscape ? A4_WIDTH_MM : A4_HEIGHT_MM;
  const contentW = pageW - 2 * MARGIN_MM;
  const contentH = pageH - 2 * MARGIN_MM;

  // Scale image to fit within content area
  const imgAspect = img.width / img.height;
  const contentAspect = contentW / contentH;

  let drawW: number, drawH: number;
  if (imgAspect > contentAspect) {
    drawW = contentW;
    drawH = contentW / imgAspect;
  } else {
    drawH = contentH;
    drawW = contentH * imgAspect;
  }

  // Create jsPDF document
  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  });

  // Draw the image centered on the page
  const offsetX = MARGIN_MM + (contentW - drawW) / 2;
  const offsetY = MARGIN_MM + (contentH - drawH) / 2;

  // Convert image to data URL for jsPDF
  const dataUrl = await imageToDataURL(compositedBlob);
  const format = dataUrl.includes('image/png') ? 'PNG' : 'JPEG';
  pdf.addImage(dataUrl, format, offsetX, offsetY, drawW, drawH);

  // Add header metadata
  if (options.metadata) {
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);

    const headerY = 8;
    if (options.metadata.title) {
      pdf.text(options.metadata.title, MARGIN_MM, headerY);
    }
    if (options.metadata.url) {
      pdf.text(
        options.metadata.url,
        MARGIN_MM,
        headerY + 4
      );
    }
    if (options.metadata.date) {
      pdf.text(
        options.metadata.date,
        isLandscape ? A4_HEIGHT_MM - MARGIN_MM : A4_WIDTH_MM - MARGIN_MM,
        headerY,
        { align: 'right' }
      );
    }
  }

  // Add watermark
  if (options.watermark) {
    const watermarkText = 'SmartCapture Pro';
    pdf.setFontSize(40);
    pdf.setTextColor(200, 200, 200);
    pdf.setGState(new (jsPDF as any).GState({ opacity: 0.15 }));
    pdf.text(
      watermarkText,
      pageW / 2,
      pageH / 2,
      { angle: 45, align: 'center' }
    );
    pdf.setGState(new (jsPDF as any).GState({ opacity: 1 }));
  }

  // Save PDF
  const filename =
    options.filename || generateFilename('smartcapture', 'pdf');
  pdf.save(filename);
}

// ===== Image Compositing =====

async function compositeImages(
  baseImage: string | Blob,
  overlayImage: Blob | undefined,
  options: ExportOptions
): Promise<Blob> {
  // Load base image
  const img = await loadImage(baseImage);

  // If no overlay, check for watermark
  if (!overlayImage) {
    if (options.watermark && options.format !== 'pdf') {
      return applyWatermarkToBlob(img);
    }
    // If input is already a Blob, return it directly
    if (baseImage instanceof Blob) return baseImage;

    // Convert data URL to blob
    const response = await fetch(baseImage);
    return response.blob();
  }

  // Create offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;

  // Draw base image
  ctx.drawImage(img, 0, 0);

  // Draw overlay on top
  const overlayImg = await loadImage(overlayImage);
  ctx.drawImage(overlayImg, 0, 0, img.width, img.height);

  // Apply watermark
  if (options.watermark && options.format !== 'pdf') {
    applyWatermark(ctx, img.width, img.height);
  }

  // Return as PNG blob
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to composite images'));
      },
      'image/png'
    );
  });
}

// ===== Clipboard =====

export async function copyToClipboard(imageData: string | Blob): Promise<boolean> {
  try {
    let blob: Blob;

    if (typeof imageData === 'string') {
      // Data URL to Blob
      const response = await fetch(imageData);
      blob = await response.blob();
    } else {
      blob = imageData;
    }

    // Ensure the blob is a PNG for clipboard compatibility
    if (blob.type !== 'image/png') {
      const img = await loadImage(blob);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Failed to convert to PNG'))),
          'image/png'
        );
      });
    }

    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob }),
    ]);

    return true;
  } catch {
    // Clipboard API may not be available or may fail
    return false;
  }
}

// ===== Text Export =====

export function exportAsText(
  text: string,
  filename?: string
): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const name = filename || generateFilename('smartcapture-ocr', 'txt');
  triggerDownload(blob, name);
}

// ===== Internal Utilities =====

function loadImage(source: string | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    if (source instanceof Blob) {
      const url = URL.createObjectURL(source);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };
      img.src = url;
    } else {
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = source;
    }
  });
}

async function imageToDataURL(source: string | Blob): Promise<string> {
  if (typeof source === 'string') return source;

  const img = await loadImage(source);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  return canvas.toDataURL('image/png');
}

function applyWatermark(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#94A3B8';
  ctx.font = `bold ${Math.max(16, Math.round(width / 25))}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Draw rotated watermark text at center
  ctx.translate(width / 2, height / 2);
  ctx.rotate((-25 * Math.PI) / 180);
  ctx.fillText('SmartCapture Pro', 0, 0);
  ctx.restore();
}

async function applyWatermarkToBlob(img: HTMLImageElement): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  applyWatermark(ctx, img.width, img.height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to apply watermark'))),
      'image/png'
    );
  });
}

async function downloadBlob(
  blob: Blob,
  filename: string,
  mimeType: string
): Promise<void> {
  // Try File System Access API first (allows user to pick save location)
  if ('showSaveFilePicker' in window) {
    try {
      const extension = filename.split('.').pop() || 'png';
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: `${extension.toUpperCase()} files`,
            accept: { [mimeType]: [`.${extension}`] },
          },
        ],
      });

      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch {
      // User cancelled or API not available - fall back to anchor download
    }
  }

  // Fallback: anchor download
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Clean up
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

function generateFilename(prefix: string, format: string): string {
  const now = new Date();
  const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const time = now
    .toISOString()
    .split('T')[1]
    .split('.')[0]
    .replace(/:/g, '-'); // HH-MM-SS
  return `${prefix}_${date}_${time}.${format}`;
}

// ===== File Size Estimation =====

export function estimateFileSize(
  imageData: string | Blob,
  format: ExportFormat,
  quality: number
): string {
  let baseBytes: number;

  if (typeof imageData === 'string') {
    // Data URL
    const base64Length = imageData.split(',')[1]?.length ?? 0;
    baseBytes = Math.round((base64Length * 3) / 4);
  } else {
    baseBytes = imageData.size;
  }

  let estimatedBytes: number;

  switch (format) {
    case 'png':
      // PNG is typically similar size or slightly different
      estimatedBytes = Math.round(baseBytes * 1.1);
      break;
    case 'jpeg':
      // JPEG compression depends on quality (rough estimate)
      estimatedBytes = Math.round(baseBytes * (quality / 100) * 0.6);
      break;
    case 'pdf':
      // PDF adds overhead for document structure
      estimatedBytes = Math.round(baseBytes * 0.85 + 15000);
      break;
    default:
      estimatedBytes = baseBytes;
  }

  if (estimatedBytes < 1024) return `${estimatedBytes} B`;
  if (estimatedBytes < 1048576) return `${(estimatedBytes / 1024).toFixed(1)} KB`;
  return `${(estimatedBytes / 1048576).toFixed(1)} MB`;
}
