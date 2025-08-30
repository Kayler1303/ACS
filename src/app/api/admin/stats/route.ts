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

    // Get comprehensive system statistics
    const [
      totalUsers,
      totalProperties,
      totalUnits,
      totalLeases,
      totalSnapshots,
      totalDocuments,
      totalOverrideRequests,
      pendingRequests,
      recentUsers,
      recentProperties,
      recentSnapshots
    ] = await Promise.all([
      // Total users
      prisma.user.count(),

      // Total properties
      prisma.property.count(),

      // Total units
      prisma.unit.count(),

      // Total leases
      prisma.lease.count(),

      // Total snapshots
      prisma.rentRollSnapshot.count(),

      // Total documents
      prisma.incomeDocument.count(),

      // Total override requests
      prisma.overrideRequest.count(),

      // Pending override requests
      prisma.overrideRequest.count({
        where: { status: 'PENDING' }
      }),

      // Recent users (last 30 days)
      prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        }
      }),

      // Recent properties (last 30 days)
      prisma.property.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        }
      }),

      // Recent snapshots (last 7 days)
      prisma.rentRollSnapshot.count({
        where: {
          uploadDate: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          }
        }
      })
    ]);

    // Get role distribution
    const userRoles = await prisma.user.groupBy({
      by: ['role'],
      _count: {
        role: true
      }
    });

    // Get document status distribution
    const documentStatuses = await prisma.incomeDocument.groupBy({
      by: ['status'],
      _count: {
        status: true
      }
    });

    // Get recent activity (last 7 days)
    const recentActivity = await prisma.rentRollSnapshot.findMany({
      take: 10,
      orderBy: { uploadDate: 'desc' },
      select: {
        id: true,
        uploadDate: true,
        filename: true,
        property: {
          select: {
            name: true,
            User: {
              select: {
                name: true,
                company: true
              }
            }
          }
        }
      }
    });

    // Get properties with most recent activity
    const activeProperties = await prisma.property.findMany({
      take: 5,
      select: {
        id: true,
        name: true,
        updatedAt: true,
        User: {
          select: {
            name: true,
            company: true
          }
        },
        _count: {
          select: {
            RentRollSnapshot: true,
            Unit: true,
            OverrideRequest: true
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    const stats = {
      overview: {
        totalUsers,
        totalProperties,
        totalUnits,
        totalLeases,
        totalSnapshots,
        totalDocuments,
        totalOverrideRequests,
        pendingRequests
      },
      recentActivity: {
        newUsers: recentUsers,
        newProperties: recentProperties,
        newSnapshots: recentSnapshots
      },
      distributions: {
        userRoles: userRoles.reduce((acc, role) => {
          acc[role.role] = role._count.role;
          return acc;
        }, {} as Record<string, number>),
        documentStatuses: documentStatuses.reduce((acc, status) => {
          acc[status.status] = status._count.status;
          return acc;
        }, {} as Record<string, number>)
      },
      activityFeed: recentActivity,
      activeProperties
    };

    return NextResponse.json(stats);
  } catch (error: any) {
    console.error('Error fetching admin stats:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
