'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import Link from 'next/link';

interface OverrideRequest {
  id: string;
  type: string;
  status: string;
  userExplanation: string;
  adminNotes?: string;
  unitId?: string;
  residentId?: string;
  verificationId?: string;
  documentId?: string;
  createdAt: string;
  reviewedAt?: string;
  requester: {
    name?: string;
    email: string;
    company: string;
  };
  reviewer?: {
    name?: string;
    email: string;
  };
}

interface OverrideStats {
  pending: number;
  approved: number;
  denied: number;
  total: number;
}

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const [requests, setRequests] = useState<OverrideRequest[]>([]);
  const [stats, setStats] = useState<OverrideStats>({ pending: 0, approved: 0, denied: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');

  // Check if user is admin
  useEffect(() => {
    if (status === 'unauthenticated') {
      redirect('/auth/login');
    }
    if (status === 'authenticated' && session?.user?.role !== 'ADMIN') {
      redirect('/dashboard');
    }
  }, [session, status]);

  useEffect(() => {
    fetchOverrideRequests();
  }, []);

  const fetchOverrideRequests = async () => {
    try {
      const response = await fetch('/api/admin/override-requests');
      if (response.ok) {
        const data = await response.json();
        setRequests(data.requests || []);
        setStats(data.stats || { pending: 0, approved: 0, denied: 0, total: 0 });
      }
    } catch (error) {
      console.error('Error fetching override requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestAction = async (requestId: string, action: 'approve' | 'deny', adminNotes: string) => {
    try {
      const response = await fetch(`/api/admin/override-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, adminNotes }),
      });

      if (response.ok) {
        fetchOverrideRequests(); // Refresh the list
      }
    } catch (error) {
      console.error('Error updating override request:', error);
    }
  };

  const formatRequestType = (type: string) => {
    switch (type) {
      case 'VALIDATION_EXCEPTION':
        return 'Validation Exception';
      case 'INCOME_DISCREPANCY':
        return 'Income Discrepancy';
      case 'DOCUMENT_REVIEW':
        return 'Document Review';
      default:
        return type;
    }
  };

  const formatRequestContext = (request: OverrideRequest) => {
    const contexts = [];
    if (request.unitId) contexts.push(`Unit: ${request.unitId}`);
    if (request.residentId) contexts.push(`Resident: ${request.residentId}`);
    if (request.verificationId) contexts.push(`Verification: ${request.verificationId}`);
    if (request.documentId) contexts.push(`Document: ${request.documentId}`);
    return contexts.join(' • ') || 'General Request';
  };

  const filteredRequests = activeTab === 'pending' 
    ? requests.filter(r => r.status === 'PENDING')
    : requests;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="mt-1 text-sm text-gray-500">Manage override requests and system administration</p>
            </div>
            <Link
              href="/dashboard"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-sm">{stats.pending}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Pending Requests</dt>
                    <dd className="text-lg font-medium text-gray-900">{stats.pending}</dd>
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
                    <span className="text-white font-bold text-sm">{stats.approved}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Approved</dt>
                    <dd className="text-lg font-medium text-gray-900">{stats.approved}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-sm">{stats.denied}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Denied</dt>
                    <dd className="text-lg font-medium text-gray-900">{stats.denied}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-sm">{stats.total}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Requests</dt>
                    <dd className="text-lg font-medium text-gray-900">{stats.total}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('pending')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'pending'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Pending Requests ({stats.pending})
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'all'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              All Requests ({stats.total})
            </button>
          </nav>
        </div>

        {/* Override Requests */}
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          {filteredRequests.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-500">
                {activeTab === 'pending' ? 'No pending override requests' : 'No override requests found'}
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {filteredRequests.map((request) => (
                <OverrideRequestItem
                  key={request.id}
                  request={request}
                  onAction={handleRequestAction}
                  formatRequestType={formatRequestType}
                  formatRequestContext={formatRequestContext}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// Individual request item component
function OverrideRequestItem({
  request,
  onAction,
  formatRequestType,
  formatRequestContext,
}: {
  request: OverrideRequest;
  onAction: (requestId: string, action: 'approve' | 'deny', adminNotes: string) => void;
  formatRequestType: (type: string) => string;
  formatRequestContext: (request: OverrideRequest) => string;
}) {
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [actionType, setActionType] = useState<'approve' | 'deny'>('approve');

  const handleAction = (action: 'approve' | 'deny') => {
    setActionType(action);
    setShowReviewDialog(true);
  };

  const handleSubmitReview = () => {
    onAction(request.id, actionType, adminNotes);
    setShowReviewDialog(false);
    setAdminNotes('');
  };

  const getStatusBadge = (status: string) => {
    const statusClasses = {
      'PENDING': 'bg-yellow-100 text-yellow-800',
      'APPROVED': 'bg-green-100 text-green-800',
      'DENIED': 'bg-red-100 text-red-800',
      'APPLIED': 'bg-blue-100 text-blue-800',
    };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        statusClasses[status as keyof typeof statusClasses] || 'bg-gray-100 text-gray-800'
      }`}>
        {status}
      </span>
    );
  };

  return (
    <>
      <li className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <p className="text-sm font-medium text-gray-900">
                  {formatRequestType(request.type)}
                </p>
                {getStatusBadge(request.status)}
              </div>
              <div className="text-sm text-gray-500">
                {new Date(request.createdAt).toLocaleDateString()}
              </div>
            </div>
            
            <div className="mt-2">
              <p className="text-sm text-gray-600">{formatRequestContext(request)}</p>
              <p className="text-sm text-gray-500 mt-1">
                <strong>Requester:</strong> {request.requester.name || request.requester.email} 
                ({request.requester.company})
              </p>
            </div>

            <div className="mt-3 p-3 bg-gray-50 rounded-md">
              <p className="text-sm text-gray-700">
                <strong>User Explanation:</strong><br />
                {request.userExplanation}
              </p>
            </div>

            {request.adminNotes && (
              <div className="mt-3 p-3 bg-blue-50 rounded-md">
                <p className="text-sm text-blue-700">
                  <strong>Admin Notes:</strong><br />
                  {request.adminNotes}
                </p>
                {request.reviewer && (
                  <p className="text-xs text-blue-600 mt-1">
                    Reviewed by {request.reviewer.name || request.reviewer.email}
                  </p>
                )}
              </div>
            )}
          </div>

          {request.status === 'PENDING' && (
            <div className="ml-6 flex space-x-3">
              <button
                onClick={() => handleAction('approve')}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Approve
              </button>
              <button
                onClick={() => handleAction('deny')}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Deny
              </button>
            </div>
          )}
        </div>
      </li>

      {/* Review Dialog */}
      {showReviewDialog && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {actionType === 'approve' ? 'Approve' : 'Deny'} Override Request
              </h3>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Admin Notes (required)
                </label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={`Explain why you are ${actionType === 'approve' ? 'approving' : 'denying'} this request...`}
                />
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowReviewDialog(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitReview}
                  disabled={!adminNotes.trim()}
                  className={`px-4 py-2 text-sm font-medium text-white rounded-md ${
                    !adminNotes.trim()
                      ? 'bg-gray-400 cursor-not-allowed'
                      : actionType === 'approve'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {actionType === 'approve' ? 'Approve' : 'Deny'} Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 