import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { activityType, description, metadata } = await request.json();

    if (!activityType) {
      return NextResponse.json({ error: 'Activity type is required' }, { status: 400 });
    }

    // Get client IP and user agent
    const ipAddress = request.headers.get('x-forwarded-for') ||
                     request.headers.get('x-real-ip') ||
                     'unknown';

    const userAgent = request.headers.get('user-agent') || 'unknown';

    const activity = await prisma.userActivity.create({
      data: {
        userId: session.user.id,
        activityType,
        description,
        metadata,
        ipAddress,
        userAgent,
      },
    });

    return NextResponse.json({ success: true, activity });
  } catch (error: any) {
    console.error('Error logging activity:', error);
    return NextResponse.json(
      { error: 'Failed to log activity' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const activityType = url.searchParams.get('activityType');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const where: any = {};
    if (userId) where.userId = userId;
    if (activityType) where.activityType = activityType;

    const activities = await prisma.userActivity.findMany({
      where,
      include: {
        user: {
          select: {
            name: true,
            email: true,
            company: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await prisma.userActivity.count({ where });

    return NextResponse.json({
      activities,
      total,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error('Error fetching activities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activities' },
      { status: 500 }
    );
  }
}
