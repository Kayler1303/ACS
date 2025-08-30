import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '30');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get total users and recent registrations
    const [totalUsers, recentUsers] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: { createdAt: { gte: startDate } }
      })
    ]);

    // Get login activity
    let loginActivities = [];
    try {
      loginActivities = await prisma.userActivity.findMany({
        where: {
          activityType: 'LOGIN',
          createdAt: { gte: startDate }
        },
        include: {
          user: {
            select: { name: true, email: true, company: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    } catch (loginError) {
      console.warn('Failed to fetch login activities:', loginError);
      loginActivities = [];
    }

    // Get unique active users (users who logged in within the period)
    const activeUserIds = [...new Set(loginActivities.map(activity => activity.userId))];
    const activeUsers = activeUserIds.length;

    // Get activity breakdown by type
    let activityStats = [];
    try {
      activityStats = await prisma.userActivity.groupBy({
        by: ['activityType'],
        where: { createdAt: { gte: startDate } },
        _count: { activityType: true }
      });
    } catch (statsError) {
      console.warn('Failed to fetch activity stats:', statsError);
      activityStats = [];
    }

    // Get top active users
    let topActiveUsers = [];
    try {
      topActiveUsers = await prisma.userActivity.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: startDate } },
        _count: { userId: true },
        orderBy: { _count: { userId: 'desc' } },
        take: 10
      });
    } catch (topUsersError) {
      console.warn('Failed to fetch top active users:', topUsersError);
      topActiveUsers = [];
    }

    // Get user details for top active users
    let topUsersWithDetails = [];
    try {
      topUsersWithDetails = await Promise.all(
        topActiveUsers.map(async (userActivity) => {
          try {
            const user = await prisma.user.findUnique({
              where: { id: userActivity.userId },
              select: { id: true, name: true, email: true, company: true, role: true }
            });

            const lastLogin = await prisma.userActivity.findFirst({
              where: {
                userId: userActivity.userId,
                activityType: 'LOGIN'
              },
              orderBy: { createdAt: 'desc' },
              select: { createdAt: true }
            });

            return {
              ...user,
              activityCount: userActivity._count.userId,
              lastLogin: lastLogin?.createdAt
            };
          } catch (userError) {
            console.warn(`Failed to fetch details for user ${userActivity.userId}:`, userError);
            return null;
          }
        })
      );

      // Filter out null values from failed user lookups
      topUsersWithDetails = topUsersWithDetails.filter(user => user !== null);
    } catch (detailsError) {
      console.warn('Failed to fetch user details:', detailsError);
      topUsersWithDetails = [];
    }

    // Get daily activity breakdown
    let dailyActivity = [];
    try {
      dailyActivity = await prisma.$queryRaw`
        SELECT
          DATE(created_at) as date,
          activity_type,
          COUNT(*) as count
        FROM "UserActivity"
        WHERE created_at >= ${startDate}
        GROUP BY DATE(created_at), activity_type
        ORDER BY date DESC
      `;
    } catch (rawQueryError) {
      console.warn('Raw query failed, using fallback:', rawQueryError);
      dailyActivity = [];
    }

    // Get page view statistics
    let pageViews = 0;
    try {
      pageViews = await prisma.userActivity.count({
        where: {
          activityType: 'PAGE_VIEW',
          createdAt: { gte: startDate }
        }
      });
    } catch (pageViewError) {
      console.warn('Failed to fetch page view stats:', pageViewError);
      pageViews = 0;
    }

    // Get user engagement metrics
    const userEngagement = {
      totalUsers,
      activeUsers,
      recentUsers,
      loginActivities: loginActivities.length,
      pageViews,
      averageActivitiesPerUser: activeUsers > 0 ? Math.round(loginActivities.length / activeUsers) : 0
    };

    return NextResponse.json({
      summary: {
        period: `${days} days`,
        startDate,
        endDate: new Date()
      },
      engagement: userEngagement,
      activityBreakdown: activityStats.map(stat => ({
        type: stat.activityType,
        count: stat._count.activityType
      })),
      topActiveUsers: topUsersWithDetails,
      recentActivity: loginActivities.slice(0, 20),
      dailyActivity
    });
  } catch (error: any) {
    console.error('Error fetching analytics summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics data' },
      { status: 500 }
    );
  }
}
