'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface AnalyticsData {
  summary: {
    period: string;
    startDate: string;
    endDate: string;
  };
  engagement: {
    totalUsers: number;
    activeUsers: number;
    recentUsers: number;
    loginActivities: number;
    pageViews: number;
    averageActivitiesPerUser: number;
  };
  activityBreakdown: Array<{
    type: string;
    count: number;
  }>;
  topActiveUsers: Array<{
    id: string;
    name?: string;
    email: string;
    company: string;
    role: string;
    activityCount: number;
    lastLogin?: string;
  }>;
  recentActivity: Array<{
    id: string;
    activityType: string;
    description?: string;
    createdAt: string;
    user: {
      name?: string;
      email: string;
      company: string;
    };
  }>;
  dailyActivity: any[];
}

export default function AnalyticsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState(30);
  const [selectedActivityType, setSelectedActivityType] = useState<string>('all');

  // Check if user is admin and redirect if not
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    } else if (status === 'authenticated' && session?.user?.role !== 'ADMIN') {
      router.push('/dashboard');
    }
  }, [status, session, router]);

  // Fetch analytics data
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role === 'ADMIN') {
      fetchAnalyticsData();
    }
  }, [status, session, selectedPeriod]);

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/analytics/summary?days=${selectedPeriod}`);
      if (response.ok) {
        const data = await response.json();
        setAnalyticsData(data);
      } else {
        console.error('Failed to fetch analytics data');
      }
    } catch (error) {
      console.error('Error fetching analytics data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatActivityType = (type: string) => {
    const typeMap: Record<string, string> = {
      'LOGIN': 'Login',
      'LOGOUT': 'Logout',
      'PAGE_VIEW': 'Page View',
      'PROPERTY_VIEW': 'Property View',
      'SNAPSHOT_UPLOAD': 'Snapshot Upload',
      'DOCUMENT_UPLOAD': 'Document Upload',
      'USER_CREATED': 'User Created',
      'PROPERTY_CREATED': 'Property Created',
      'ADMIN_ACTION': 'Admin Action'
    };
    return typeMap[type] || type;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Error</h2>
          <p className="text-gray-600 mb-6">Failed to load analytics data</p>
          <Link
            href="/admin"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            Back to Admin Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="md:flex md:items-center md:justify-between mb-6">
          <div className="flex-1 min-w-0">
            <nav className="flex" aria-label="Breadcrumb">
              <ol className="flex items-center space-x-4">
                <li>
                  <div>
                    <Link href="/admin" className="text-gray-400 hover:text-gray-500">
                      Admin Dashboard
                    </Link>
                  </div>
                </li>
                <li>
                  <div className="flex items-center">
                    <svg className="flex-shrink-0 h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="ml-4 text-sm font-medium text-gray-900">Analytics</span>
                  </div>
                </li>
              </ol>
            </nav>
            <h1 className="mt-4 text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
              User Analytics Dashboard
            </h1>
            <p className="text-gray-600">Comprehensive insights into user activity and platform usage</p>
          </div>
          <div className="mt-4 flex md:mt-0 md:ml-4 space-x-3">
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(parseInt(e.target.value))}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <Link
              href="/admin"
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Back to Admin
            </Link>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-sm">{analyticsData.engagement.totalUsers}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Users</dt>
                    <dd className="text-lg font-medium text-gray-900">{analyticsData.engagement.totalUsers}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-sm">{analyticsData.engagement.activeUsers}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Active Users</dt>
                    <dd className="text-lg font-medium text-gray-900">{analyticsData.engagement.activeUsers}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-sm">{analyticsData.engagement.loginActivities}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Login Sessions</dt>
                    <dd className="text-lg font-medium text-gray-900">{analyticsData.engagement.loginActivities}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-sm">{analyticsData.engagement.pageViews}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Page Views</dt>
                    <dd className="text-lg font-medium text-gray-900">{analyticsData.engagement.pageViews}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Activity Breakdown */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Activity Breakdown</h3>
              <div className="space-y-3">
                {analyticsData.activityBreakdown.map((activity) => (
                  <div key={activity.type} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-blue-500 rounded-full mr-3"></div>
                      <span className="text-sm font-medium text-gray-900">
                        {formatActivityType(activity.type)}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">{activity.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top Active Users */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Most Active Users</h3>
              <div className="space-y-4">
                {analyticsData.topActiveUsers.slice(0, 8).map((user, index) => (
                  <div key={user.id} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          user.role === 'ADMIN' ? 'bg-red-100' : 'bg-blue-100'
                        }`}>
                          <span className={`text-sm font-medium ${
                            user.role === 'ADMIN' ? 'text-red-600' : 'text-blue-600'
                          }`}>
                            {index + 1}
                          </span>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {user.name || user.email}
                        </p>
                        <p className="text-sm text-gray-500">
                          {user.company}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-900">{user.activityCount} activities</p>
                      <p className="text-xs text-gray-500">
                        Last login: {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="mt-6 bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Recent Activity</h3>
            <div className="space-y-4">
              {analyticsData.recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      activity.activityType === 'LOGIN' ? 'bg-green-100' :
                      activity.activityType === 'LOGOUT' ? 'bg-red-100' :
                      activity.activityType === 'PAGE_VIEW' ? 'bg-blue-100' :
                      'bg-gray-100'
                    }`}>
                      <span className={`text-sm font-medium ${
                        activity.activityType === 'LOGIN' ? 'text-green-600' :
                        activity.activityType === 'LOGOUT' ? 'text-red-600' :
                        activity.activityType === 'PAGE_VIEW' ? 'text-blue-600' :
                        'text-gray-600'
                      }`}>
                        {activity.activityType === 'LOGIN' ? 'L' :
                         activity.activityType === 'LOGOUT' ? 'O' :
                         activity.activityType === 'PAGE_VIEW' ? 'P' : '?'}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">
                      <span className="font-medium">{activity.user.name || activity.user.email}</span>
                      {' '}
                      {activity.description || formatActivityType(activity.activityType)}
                    </p>
                    <p className="text-sm text-gray-500">
                      {activity.user.company} • {new Date(activity.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
