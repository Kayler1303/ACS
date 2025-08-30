'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface UserStats {
  totalProperties: number;
  ownedProperties: number;
  sharedProperties: number;
  totalDocuments: number;
  recentActivity: number;
}

export default function AccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Check if user is authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  // Fetch user statistics
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id) {
      fetchUserStats();
    }
  }, [status, session]);

  const fetchUserStats = async () => {
    try {
      setLoading(true);

      // Fetch user properties and stats
      const propertiesResponse = await fetch('/api/properties');
      let propertiesData = { properties: [] };

      if (propertiesResponse.ok) {
        propertiesData = await propertiesResponse.json();
      }

      // Calculate stats from properties
      const ownedProperties = propertiesData.properties.filter((p: any) => !p.isShared);
      const sharedProperties = propertiesData.properties.filter((p: any) => p.isShared);

      // Get total documents count (simplified - could be enhanced)
      const totalDocuments = propertiesData.properties.reduce((sum: number, p: any) =>
        sum + (p._count?.IncomeDocument || 0), 0
      );

      setUserStats({
        totalProperties: propertiesData.properties.length,
        ownedProperties: ownedProperties.length,
        sharedProperties: sharedProperties.length,
        totalDocuments,
        recentActivity: 0 // Could be enhanced with actual activity count
      });

    } catch (error) {
      console.error('Error fetching user stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!session?.user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="md:flex md:items-center md:justify-between mb-8">
          <div className="flex-1 min-w-0">
            <nav className="flex" aria-label="Breadcrumb">
              <ol className="flex items-center space-x-4">
                <li>
                  <div>
                    <Link href="/dashboard" className="text-gray-400 hover:text-gray-500">
                      Dashboard
                    </Link>
                  </div>
                </li>
                <li>
                  <div className="flex items-center">
                    <svg className="flex-shrink-0 h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="ml-4 text-sm font-medium text-gray-900">My Account</span>
                  </div>
                </li>
              </ol>
            </nav>
            <h1 className="mt-4 text-3xl font-bold leading-7 text-gray-900 sm:text-4xl sm:truncate">
              My Account
            </h1>
            <p className="text-gray-600 mt-2">Manage your account settings and view your profile information.</p>
          </div>
          <div className="mt-4 flex md:mt-0 md:ml-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Dashboard
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Profile Information */}
          <div className="lg:col-span-2">
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900">Profile Information</h2>
                <p className="mt-1 text-sm text-gray-600">Your account details and information.</p>
              </div>
              <div className="px-6 py-6">
                <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Full Name</dt>
                    <dd className="mt-1 text-sm text-gray-900">{session.user.name || 'Not provided'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Email Address</dt>
                    <dd className="mt-1 text-sm text-gray-900">{session.user.email}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Company</dt>
                    <dd className="mt-1 text-sm text-gray-900">{(session.user as any).company || 'Not provided'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Account Type</dt>
                    <dd className="mt-1 text-sm text-gray-900 capitalize">{(session.user as any).role || 'User'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Member Since</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {(session.user as any).createdAt ? new Date((session.user as any).createdAt).toLocaleDateString() : 'Unknown'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Last Login</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {(session.user as any).lastLogin ? new Date((session.user as any).lastLogin).toLocaleDateString() : 'Unknown'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Account Statistics */}
            <div className="bg-white shadow rounded-lg mt-6">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900">Account Statistics</h2>
                <p className="mt-1 text-sm text-gray-600">Your activity and usage statistics.</p>
              </div>
              <div className="px-6 py-6">
                {userStats ? (
                  <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{userStats.totalProperties}</div>
                      <div className="text-sm text-gray-500">Total Properties</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{userStats.ownedProperties}</div>
                      <div className="text-sm text-gray-500">Owned Properties</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">{userStats.sharedProperties}</div>
                      <div className="text-sm text-gray-500">Shared Properties</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-600">{userStats.totalDocuments}</div>
                      <div className="text-sm text-gray-500">Total Documents</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="text-sm text-gray-500 mt-2">Loading statistics...</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Account Actions */}
          <div>
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900">Account Actions</h2>
                <p className="mt-1 text-sm text-gray-600">Manage your account settings.</p>
              </div>
              <div className="px-6 py-6 space-y-4">
                <Link
                  href="/auth/change-password"
                  className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  Change Password
                </Link>

                <Link
                  href="/auth/forgot-password"
                  className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 7.89a2 2 0 002.83 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Reset Password via Email
                </Link>

                <div className="pt-4 border-t border-gray-200">
                  <p className="text-xs text-gray-500 text-center">
                    Need help? Contact our support team.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Links */}
            <div className="bg-white shadow rounded-lg mt-6">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900">Quick Links</h2>
              </div>
              <div className="px-6 py-4 space-y-2">
                <Link
                  href="/dashboard"
                  className="block text-sm text-blue-600 hover:text-blue-800"
                >
                  ← Back to Dashboard
                </Link>
                <Link
                  href="/property/new"
                  className="block text-sm text-blue-600 hover:text-blue-800"
                >
                  + Create New Property
                </Link>
                <Link
                  href="/contact"
                  className="block text-sm text-blue-600 hover:text-blue-800"
                >
                  📞 Contact Support
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
