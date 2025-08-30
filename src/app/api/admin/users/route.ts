import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get all users with their properties and stats
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        company: true,
        role: true,
        createdAt: true,
        emailVerified: true,
        _count: {
          select: {
            Property: true,
            OverrideRequest_OverrideRequest_requesterIdToUser: true,
            PropertyShare_SharedWith: true
          }
        }
      },
      orderBy: [
        { role: 'asc' }, // ADMINS first
        { createdAt: 'desc' }
      ]
    });

    // Get additional stats for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        // Count total properties (owned + shared)
        const ownedProperties = user._count.Property;
        const sharedProperties = user._count.PropertyShare_SharedWith;

        // Count pending override requests
        const pendingRequests = await prisma.overrideRequest.count({
          where: {
            requesterId: user.id,
            status: 'PENDING'
          }
        });

        return {
          ...user,
          stats: {
            totalProperties: ownedProperties + sharedProperties,
            ownedProperties,
            sharedProperties,
            pendingRequests,
            totalRequests: user._count.OverrideRequest_OverrideRequest_requesterIdToUser
          }
        };
      })
    );

    return NextResponse.json({
      users: usersWithStats,
      totalUsers: usersWithStats.length,
      adminUsers: usersWithStats.filter(u => u.role === 'ADMIN').length,
      regularUsers: usersWithStats.filter(u => u.role === 'USER').length
    });
  } catch (error: any) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
