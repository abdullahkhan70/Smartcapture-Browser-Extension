import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyAdmin } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const unreadOnly = request.nextUrl.searchParams.get('unread') === 'true';
    const messages = await db.contactMessage.findMany({
      where: unreadOnly ? { read: false } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const count = await db.contactMessage.count();
    const unreadCount = await db.contactMessage.count({ where: { read: false } });
    return NextResponse.json({ messages, count, unreadCount });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}
