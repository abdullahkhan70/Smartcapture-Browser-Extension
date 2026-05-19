import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/ocr
 * 
 * Server-side OCR using VLM (Vision Language Model) for high-accuracy text extraction.
 * Accepts a base64-encoded image and returns extracted text with confidence.
 * 
 * Body: { imageData: string, language?: string }
 * Response: { text: string, confidence: number, paragraphs: Array, wordCount: number, processingTime: number, method: 'server' }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { imageData, language } = body;

    if (!imageData) {
      return NextResponse.json(
        { error: 'No image data provided' },
        { status: 400 }
      );
    }

    // Validate image data format
    let imageUrl: string;
    if (typeof imageData === 'string') {
      if (imageData.startsWith('data:')) {
        imageUrl = imageData;
      } else if (imageData.startsWith('http')) {
        imageUrl = imageData;
      } else {
        // Assume it's raw base64
        imageUrl = `data:image/png;base64,${imageData}`;
      }
    } else {
      return NextResponse.json(
        { error: 'Invalid image data format' },
        { status: 400 }
      );
    }

    // Use VLM SDK for OCR
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();

    const langInstruction = language && language !== 'eng'
      ? `The text may be in ${language} language. `
      : '';

    const response = await zai.chat.completions.createVision({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are an OCR engine. Extract ALL text from this image exactly as it appears. ${langInstruction}Preserve the original formatting, layout, and structure as much as possible. Output ONLY the extracted text, nothing else. If there are sections, lists, or paragraphs, maintain their structure with appropriate line breaks.`,
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
      thinking: { type: 'disabled' },
    });

    const extractedText = response.choices?.[0]?.message?.content || '';

    if (!extractedText.trim()) {
      return NextResponse.json(
        { error: 'No text could be extracted from the image' },
        { status: 422 }
      );
    }

    // Parse the extracted text into paragraphs
    const paragraphs = extractedText
      .split(/\n\s*\n/)
      .filter((p: string) => p.trim().length > 0)
      .map((text: string) => ({
        text: text.trim(),
        confidence: 95, // VLM is generally high accuracy
        bbox: { x: 0, y: 0, width: 0, height: 0 },
        words: text.trim().split(/\s+/).filter(Boolean).map((w: string) => ({
          text: w,
          confidence: 95,
          bbox: { x: 0, y: 0, width: 0, height: 0 },
        })),
      }));

    const wordCount = extractedText
      .split(/\s+/)
      .filter((w: string) => w.length > 0).length;

    const processingTime = Date.now() - startTime;

    return NextResponse.json({
      text: extractedText.trim(),
      confidence: 95,
      paragraphs,
      wordCount,
      processingTime,
      method: 'server',
    });
  } catch (error: unknown) {
    console.error('[OCR API] Error:', error);

    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'Unknown error occurred during OCR processing';

    return NextResponse.json(
      { error: `OCR processing failed: ${message}` },
      { status: 500 }
    );
  }
}
