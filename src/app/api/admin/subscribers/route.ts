import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyAdmin } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const search = request.nextUrl.searchParams.get('search');
    const subscribers = await db.subscriber.findMany({
      where: search ? { email: { contains: search } } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const count = await db.subscriber.count();
    return NextResponse.json({ subscribers, count });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch subscribers' }, { status: 500 });
  }
}
