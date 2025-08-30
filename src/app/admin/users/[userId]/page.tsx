'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface User {
  id: string;
  email: string;
  name?: string;
  company: string;
  role: 'USER' | 'ADMIN';
  createdAt: string;
  emailVerified?: string;
  stats?: {
    totalProperties: number;
    ownedProperties: number;
    sharedProperties: number;
    pendingRequests: number;
    totalRequests: number;
  };
}

interface Property {
  id: string;
  name: string;
  address: string;
  county: string;
  state: string;
  numberOfUnits: number | null;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  isOwned: boolean;
  ownership: 'owned' | 'shared';
  sharedBy?: {
    name?: string;
    company: string;
  };
  recentSnapshots: any[];
  _count: {
    Unit: number;
    RentRollSnapshot: number;
    OverrideRequest: number;
  };
}

interface Snapshot {
  id: string;
  filename?: string;
  uploadDate: string;
  isActive: boolean;
  _count: {
    rentRolls: number;
  };
}

interface PropertySnapshots {
  property: {
    id: string;
    name: string;
    address: string;
    county: string;
    state: string;
  };
  snapshots: Snapshot[];
  statistics: {
    totalSnapshots: number;
    activeSnapshot: any;
    recentUploads: number;
    fileTypes: Record<string, number>;
    snapshotsByMonth: any[];
  };
}

export default function UserDetailPage() {
  const { data: session, status } = useSession();
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;

  const [user, setUser] = useState<User | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [propertySnapshots, setPropertySnapshots] = useState<PropertySnapshots | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if user is admin and redirect if not
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    } else if (status === 'authenticated' && session?.user?.role !== 'ADMIN') {
      router.push('/dashboard');
    }
  }, [status, session, router]);

  // Fetch user data and properties
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role === 'ADMIN' && userId) {
      fetchUserData();
    }
  }, [status, session, userId]);

  const fetchUserData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/admin/users/${userId}/properties`);
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setProperties(data.properties);
      } else {
        setError('Failed to load user data');
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      setError('Error loading user data');
    } finally {
      setLoading(false);
    }
  };

  const handlePropertyClick = async (property: Property) => {
    try {
      setSelectedProperty(property);
      const response = await fetch(`/api/admin/properties/${property.id}/all-snapshots`);
      if (response.ok) {
        const data = await response.json();
        setPropertySnapshots(data);
      } else {
        console.error('Failed to load property snapshots');
      }
    } catch (error) {
      console.error('Error loading property snapshots:', error);
    }
  };

  const handleDeleteUser = async () => {
    if (!user) return;

    if (!confirm(`Are you sure you want to delete ${user.name || user.email}? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        alert('User deleted successfully');
        router.push('/admin');
      } else {
        const error = await response.json();
        if (error.code === 'USER_HAS_PROPERTIES') {
          alert(`Cannot delete user: ${error.error}`);
        } else {
          alert(`Failed to delete user: ${error.error}`);
        }
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Error deleting user. Please try again.');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Error</h2>
          <p className="text-gray-600 mb-6">{error || 'User not found'}</p>
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
                    <span className="ml-4 text-sm font-medium text-gray-500">Users</span>
                  </div>
                </li>
                <li>
                  <div className="flex items-center">
                    <svg className="flex-shrink-0 h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="ml-4 text-sm font-medium text-gray-900">{user.name || user.email}</span>
                  </div>
                </li>
              </ol>
            </nav>
            <h1 className="mt-4 text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
              {user.name || user.email}
            </h1>
            <p className="text-gray-600">{user.company} • {user.role}</p>
          </div>
          <div className="mt-4 flex md:mt-0 md:ml-4 space-x-3">
            {userId === session?.user?.id && (
              <Link
                href="/auth/change-password"
                className="inline-flex items-center px-4 py-2 border border-blue-300 shadow-sm text-sm font-medium rounded-md text-blue-700 bg-white hover:bg-blue-50"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                Change Password
              </Link>
            )}
            <button
              onClick={handleDeleteUser}
              disabled={user.role === 'ADMIN'}
              className="inline-flex items-center px-4 py-2 border border-red-300 shadow-sm text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete User
            </button>
            <Link
              href="/admin"
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Back to Users
            </Link>
          </div>
        </div>

        {/* User Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-6">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-sm">{properties.length}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Properties</dt>
                    <dd className="text-lg font-medium text-gray-900">{properties.length}</dd>
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
                    <span className="text-white font-bold text-sm">
                      {properties.filter(p => p.ownership === 'owned').length}
                    </span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Owned Properties</dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {properties.filter(p => p.ownership === 'owned').length}
                    </dd>
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
                    <span className="text-white font-bold text-sm">
                      {properties.filter(p => p.ownership === 'shared').length}
                    </span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Shared Properties</dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {properties.filter(p => p.ownership === 'shared').length}
                    </dd>
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
                    <span className="text-white font-bold text-sm">
                      {properties.reduce((sum, p) => sum + (p._count?.RentRollSnapshot || 0), 0)}
                    </span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Snapshots</dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {properties.reduce((sum, p) => sum + (p._count?.RentRollSnapshot || 0), 0)}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Properties Section */}
        {!selectedProperty ? (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Properties</h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">
                All properties associated with this user
              </p>
            </div>
            <ul className="divide-y divide-gray-200">
              {properties.map((property) => (
                <li key={property.id} className="px-4 py-4 sm:px-6 hover:bg-gray-50 cursor-pointer" onClick={() => handlePropertyClick(property)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          property.ownership === 'owned' ? 'bg-green-100' : 'bg-blue-100'
                        }`}>
                          <span className={`text-sm font-medium ${
                            property.ownership === 'owned' ? 'text-green-600' : 'text-blue-600'
                          }`}>
                            {property.ownership === 'owned' ? 'O' : 'S'}
                          </span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="flex items-center">
                          <h4 className="text-sm font-medium text-gray-900">{property.name}</h4>
                          <span className={`ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            property.ownership === 'owned' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {property.ownership === 'owned' ? 'Owned' : 'Shared'}
                          </span>
                          {property.ownership === 'shared' && property.sharedBy && (
                            <span className="ml-2 text-xs text-gray-500">
                              via {property.sharedBy.name || property.sharedBy.company}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          {property.address}, {property.county}, {property.state}
                        </p>
                        <p className="text-sm text-gray-500">
                          {property._count?.Unit || 0} units • {property._count?.RentRollSnapshot || 0} snapshots • {property._count?.OverrideRequest || 0} requests
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-900">
                        {property._count?.RentRollSnapshot || 0} snapshots
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Updated {new Date(property.updatedAt).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-blue-600 mt-1 cursor-pointer hover:text-blue-800">
                        Click to view snapshots →
                      </div>
                    </div>
                  </div>
                </li>
              ))}
              {properties.length === 0 && (
                <li className="px-4 py-8 text-center">
                  <p className="text-gray-500">No properties found for this user.</p>
                </li>
              )}
            </ul>
          </div>
        ) : (
          /* Property Snapshots View */
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    Snapshots for {selectedProperty.name}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {selectedProperty.address}, {selectedProperty.county}, {selectedProperty.state}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedProperty(null);
                    setPropertySnapshots(null);
                  }}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  ← Back to Properties
                </button>
              </div>
            </div>

            {propertySnapshots && (
              <>
                {/* Snapshots Stats */}
                <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 p-4 rounded">
                      <div className="text-2xl font-bold text-blue-600">{propertySnapshots.statistics.totalSnapshots}</div>
                      <div className="text-sm text-blue-700">Total Snapshots</div>
                    </div>
                    <div className="bg-green-50 p-4 rounded">
                      <div className="text-2xl font-bold text-green-600">
                        {propertySnapshots.statistics.activeSnapshot ? 'Active' : 'None'}
                      </div>
                      <div className="text-sm text-green-700">Active Snapshot</div>
                    </div>
                    <div className="bg-purple-50 p-4 rounded">
                      <div className="text-2xl font-bold text-purple-600">{propertySnapshots.statistics.recentUploads}</div>
                      <div className="text-sm text-purple-700">Recent Uploads (30d)</div>
                    </div>
                    <div className="bg-orange-50 p-4 rounded">
                      <div className="text-2xl font-bold text-orange-600">
                        {Object.keys(propertySnapshots.statistics.fileTypes).length}
                      </div>
                      <div className="text-sm text-orange-700">File Types</div>
                    </div>
                  </div>
                </div>

                {/* Snapshots List */}
                <div className="divide-y divide-gray-200">
                  {propertySnapshots.statistics.snapshotsByMonth.map((monthData: any) => (
                    <div key={monthData.month} className="px-4 py-6">
                      <h4 className="text-md font-medium text-gray-900 mb-4">
                        {new Date(monthData.month + '-01').toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long'
                        })}
                        <span className="ml-2 text-sm text-gray-500">
                          ({monthData.count} snapshots)
                        </span>
                      </h4>

                      <div className="space-y-3">
                        {monthData.snapshots.map((snapshot: Snapshot) => (
                          <div
                            key={snapshot.id}
                            className={`flex items-center justify-between p-4 rounded-lg border ${
                              snapshot.isActive
                                ? 'border-green-200 bg-green-50'
                                : 'border-gray-200 bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center space-x-4">
                              <div className={`w-4 h-4 rounded-full ${
                                snapshot.isActive ? 'bg-green-500' : 'bg-gray-400'
                              }`} />
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {snapshot.filename || 'Unnamed File'}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {new Date(snapshot.uploadDate).toLocaleString()}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm text-gray-900">
                                {snapshot._count?.rentRolls || 0} rent rolls
                              </div>
                              {snapshot.isActive && (
                                <div className="text-xs text-green-600 font-medium">Active</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {propertySnapshots.snapshots.length === 0 && (
                    <div className="px-4 py-8 text-center">
                      <p className="text-gray-500">No snapshots found for this property.</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
