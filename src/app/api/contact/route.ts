import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Push contact data to Google Sheets via Apps Script web app */
async function pushToGoogleSheet(data: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): Promise<{ success: boolean; error?: string }> {
  const appsScriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL;

  if (!appsScriptUrl) {
    console.warn('[Contact] GOOGLE_APPS_SCRIPT_URL not set — skipping Google Sheets push');
    return { success: false, error: 'Google Sheets integration not configured' };
  }

  try {
    // Send as JSON — Apps Script reads this via e.postData.contents → JSON.parse
    const response = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name,
        email: data.email,
        subject: data.subject,
        message: data.message,
      }),
      redirect: 'follow',
    });

    const text = await response.text();

    try {
      const result = JSON.parse(text);
      if (result.success) {
        console.log('[Contact] Successfully pushed to Google Sheets');
        return { success: true };
      } else {
        console.error('[Contact] Google Sheets push failed:', result.error);
        return { success: false, error: result.error };
      }
    } catch {
      // Apps Script often returns HTML redirect pages after POST
      // If we get a 200/201/302, the data was likely written
      console.log('[Contact] Google Sheets response (status:', response.status, '):', text.substring(0, 150));
      if (response.ok || response.status === 200 || response.status === 201) {
        return { success: true };
      }
      return { success: false, error: 'Unexpected response from Google Sheets' };
    }
  } catch (error) {
    console.error('[Contact] Google Sheets push error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, subject, message } = body;

    // Validate
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json(
        { error: 'Name is required (at least 2 characters)' },
        { status: 400 }
      );
    }

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return NextResponse.json(
        { error: 'Please enter a valid email address' },
        { status: 400 }
      );
    }

    if (!message || typeof message !== 'string' || message.trim().length < 10) {
      return NextResponse.json(
        { error: 'Message is required (at least 10 characters)' },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedSubject = subject?.trim() || '';
    const trimmedMessage = message.trim();

    // Save to local database (always)
    await db.contactMessage.create({
      data: {
        name: trimmedName,
        email: trimmedEmail,
        subject: trimmedSubject || null,
        message: trimmedMessage,
      },
    });

    // Push to Google Sheets (awaited — but don't fail the request if it fails)
    try {
      await pushToGoogleSheet({
        name: trimmedName,
        email: trimmedEmail,
        subject: trimmedSubject,
        message: trimmedMessage,
      });
    } catch (err) {
      // Log but don't fail — local DB save already succeeded
      console.error('[Contact] Google Sheets push failed (non-blocking):', err);
    }

    return NextResponse.json(
      { message: 'Your message is successfully sent!' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Contact form error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again later.' },
      { status: 500 }
    );
  }
}
