import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address' },
        { status: 400 }
      );
    }

    const existing = await db.subscriber.findUnique({
      where: { email: trimmedEmail },
    });

    if (existing) {
      if (existing.active) {
        return NextResponse.json(
          { message: 'You are already subscribed!', email: trimmedEmail },
          { status: 200 }
        );
      }

      await db.subscriber.update({
        where: { email: trimmedEmail },
        data: { active: true },
      });

      return NextResponse.json(
        { message: 'Welcome back! Your subscription has been reactivated.', email: trimmedEmail },
        { status: 200 }
      );
    }

    await db.subscriber.create({
      data: { email: trimmedEmail },
    });

    return NextResponse.json(
      { message: 'Thanks for subscribing! You will hear from us soon.', email: trimmedEmail },
      { status: 201 }
    );
  } catch (error) {
    console.error('Subscribe error:', error);

    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json(
        { message: 'You are already subscribed!' },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { error: 'Something went wrong. Please try again later.' },
      { status: 500 }
    );
  }
}
