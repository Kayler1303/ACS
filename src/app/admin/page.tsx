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
  User_OverrideRequest_requesterIdToUser: {
    name?: string;
    email: string;
    company: string;
  };
  User_OverrideRequest_reviewerIdToUser?: {
    name?: string;
    email: string;
  };
  contextualData?: {
    unit?: any;
    resident?: any;
    verification?: any;
    document?: any;
    incomeAnalysis?: {
      complianceIncome: number;
      verifiedIncome: number;
      discrepancy: number;
      percentage: number;
    };
    property?: {
      name?: string;
      address?: string;
      numberOfUnits?: number;
      county?: string;
      state?: string;
    };
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
  const [overrideRequests, setOverrideRequests] = useState<OverrideRequest[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  
  // Message modal state
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<OverrideRequest | null>(null);
  const [messageSubject, setMessageSubject] = useState('');
  const [messageContent, setMessageContent] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  // Check if user is admin
  useEffect(() => {
    if (status === 'unauthenticated') {
      redirect('/auth/login');
    }
    if (status === 'authenticated' && session?.user?.role !== 'ADMIN') {
      redirect('/dashboard');
    }
  }, [status, session]);

  // Fetch override requests
  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const response = await fetch('/api/admin/override-requests');
        if (response.ok) {
          const data = await response.json();
          setOverrideRequests(data.requests);
          setStats(data.stats);
        } else {
          console.error('Failed to fetch override requests');
        }
      } catch (error) {
        console.error('Error fetching override requests:', error);
      } finally {
        setLoading(false);
      }
    };

    if (status === 'authenticated' && session?.user?.role === 'ADMIN') {
      fetchRequests();
    }
  }, [status, session]);

  const filteredRequests = overrideRequests.filter(request => 
    statusFilter === 'all' ? true : request.status === statusFilter
  );

  const handleRequestAction = async (requestId: string, action: 'approve' | 'deny', adminNotes: string) => {
    try {
      const response = await fetch(`/api/admin/override-requests/${requestId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          adminNotes,
        }),
      });

      if (response.ok) {
        // Refresh the requests
        const refreshResponse = await fetch('/api/admin/override-requests');
        if (refreshResponse.ok) {
          const data = await refreshResponse.json();
          setOverrideRequests(data.requests);
          setStats(data.stats);
        }
      } else {
        console.error('Failed to update override request');
      }
    } catch (error) {
      console.error('Error updating override request:', error);
    }
  };

  const handleOpenMessageModal = (request: OverrideRequest) => {
    setSelectedRequest(request);
    setMessageSubject('');
    setMessageContent('');
    setShowMessageModal(true);
  };

  const handleCloseMessageModal = () => {
    setShowMessageModal(false);
    setSelectedRequest(null);
    setMessageSubject('');
    setMessageContent('');
    setSendingMessage(false);
  };

  const handleSendMessage = async () => {
    if (!selectedRequest || !messageSubject.trim() || !messageContent.trim()) {
      return;
    }

    setSendingMessage(true);
    try {
      const response = await fetch(`/api/admin/override-requests/${selectedRequest.id}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: messageSubject,
          message: messageContent,
        }),
      });

      if (response.ok) {
        // Close modal and show success
        handleCloseMessageModal();
        alert('Message sent successfully!');
      } else {
        const error = await response.json();
        alert(`Failed to send message: ${error.error}`);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      setSendingMessage(false);
    }
  };

  const formatRequestType = (type: string) => {
    switch (type) {
      case 'INCOME_DISCREPANCY':
        return 'Income Discrepancy';
      case 'DOCUMENT_REVIEW':
        return 'Document Review';
      case 'VALIDATION_EXCEPTION':
        return 'Validation Exception';
      case 'PROPERTY_DELETION':
        return 'Property Deletion Request';
      default:
        return type;
    }
  };

  const formatRequestContext = (request: OverrideRequest) => {
    const { contextualData } = request;
    
    // Handle property deletion requests
    if (request.type === 'PROPERTY_DELETION') {
      if (contextualData?.property) {
        const propertyName = contextualData.property.name || 'Unknown Property';
        const address = contextualData.property.address || '';
        return `Property: ${propertyName}${address ? ` (${address})` : ''}`;
      }
      return 'Property Deletion Request';
    }
    
    if (!contextualData) {
      return `Unit: ${request.unitId || 'N/A'}`;
    }

    let context = '';
    
    // Property and unit info
    if (contextualData.unit) {
      const propertyName = contextualData.unit.Property?.name || 'Unknown Property';
      const unitNumber = contextualData.unit.unitNumber || 'Unknown Unit';
      context += `${propertyName} - Unit ${unitNumber}`;
    } else if (contextualData.resident?.Lease?.Unit) {
      const propertyName = contextualData.resident.Lease.Unit.Property?.name || 'Unknown Property';
      const unitNumber = contextualData.resident.Lease.Unit.unitNumber || 'Unknown Unit';
      context += `${propertyName} - Unit ${unitNumber}`;
    } else if (contextualData.verification?.Lease?.Unit) {
      const propertyName = contextualData.verification.Lease.Unit.Property?.name || 'Unknown Property';
      const unitNumber = contextualData.verification.Lease.Unit.unitNumber || 'Unknown Unit';
      context += `${propertyName} - Unit ${unitNumber}`;
    } else if (contextualData.document?.IncomeVerification?.Lease?.Unit) {
      const propertyName = contextualData.document.IncomeVerification.Lease.Unit.Property?.name || 'Unknown Property';
      const unitNumber = contextualData.document.IncomeVerification.Lease.Unit.unitNumber || 'Unknown Unit';
      context += `${propertyName} - Unit ${unitNumber}`;
    }

    return context || `Unit: ${request.unitId || 'N/A'}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="md:flex md:items-center md:justify-between mb-6">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
              Admin Dashboard
            </h2>
            <p className="text-gray-600">Manage override requests and system administration</p>
          </div>
          <div className="mt-4 flex md:mt-0 md:ml-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-6">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-sm">{stats?.pending || 0}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Pending Requests</dt>
                    <dd className="text-lg font-medium text-gray-900">{stats?.pending || 0}</dd>
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
                    <span className="text-white font-bold text-sm">{stats?.approved || 0}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Approved</dt>
                    <dd className="text-lg font-medium text-gray-900">{stats?.approved || 0}</dd>
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
                    <span className="text-white font-bold text-sm">{stats?.denied || 0}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Denied</dt>
                    <dd className="text-lg font-medium text-gray-900">{stats?.denied || 0}</dd>
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
                    <span className="text-white font-bold text-sm">{stats?.total || 0}</span>
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Requests</dt>
                    <dd className="text-lg font-medium text-gray-900">{stats?.total || 0}</dd>
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
              onClick={() => setStatusFilter('all')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                statusFilter === 'all'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              All Requests ({stats?.total || 0})
            </button>
            <button
              onClick={() => setStatusFilter('PENDING')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                statusFilter === 'PENDING'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Pending Requests ({stats?.pending || 0})
            </button>
            <button
              onClick={() => setStatusFilter('APPROVED')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                statusFilter === 'APPROVED'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Approved ({stats?.approved || 0})
            </button>
            <button
              onClick={() => setStatusFilter('DENIED')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                statusFilter === 'DENIED'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Denied ({stats?.denied || 0})
            </button>
          </nav>
        </div>

        {/* Override Requests */}
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          {filteredRequests.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-500">
                {statusFilter === 'PENDING' ? 'No pending override requests' : 'No override requests found'}
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {filteredRequests.map((request) => (
                <OverrideRequestItem
                  key={request.id}
                  request={request}
                  onAction={handleRequestAction}
                  onMessageClick={handleOpenMessageModal}
                  formatRequestType={formatRequestType}
                  formatRequestContext={formatRequestContext}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Message Modal */}
      {showMessageModal && selectedRequest && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Send Message to {selectedRequest.User_OverrideRequest_requesterIdToUser?.name || 'User'}
              </h3>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Subject
                </label>
                <input
                  type="text"
                  value={messageSubject}
                  onChange={(e) => setMessageSubject(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter message subject..."
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Message
                </label>
                <textarea
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  rows={6}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your message..."
                />
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  onClick={handleCloseMessageModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                  disabled={sendingMessage}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendMessage}
                  disabled={!messageSubject.trim() || !messageContent.trim() || sendingMessage}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sendingMessage ? 'Sending...' : 'Send Message'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Individual request item component with enhanced details
function OverrideRequestItem({
  request,
  onAction,
  onMessageClick,
  formatRequestType,
  formatRequestContext,
}: {
  request: OverrideRequest;
  onAction: (requestId: string, action: 'approve' | 'deny', adminNotes: string) => void;
  onMessageClick: (request: OverrideRequest) => void;
  formatRequestType: (type: string) => string;
  formatRequestContext: (request: OverrideRequest) => string;
}) {
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [actionType, setActionType] = useState<'approve' | 'deny'>('approve');
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  
  // Manual data entry state for document review
  const [correctedValues, setCorrectedValues] = useState<{
    employeeName?: string;
    employerName?: string;
    grossPayAmount?: number;
    payFrequency?: string;
    payPeriodStartDate?: string;
    payPeriodEndDate?: string;
  }>({});

  const handleAction = (action: 'approve' | 'deny') => {
    setActionType(action);
    setShowReviewDialog(true);
  };

  const handleSubmitReview = async () => {
    // For document review requests, use the admin documents API with corrected values
    if (request.type === 'DOCUMENT_REVIEW' && request.contextualData?.document) {
      try {
        console.log('Using admin documents API for document review:', {
          documentId: request.contextualData.document.id,
          action: actionType === 'deny' ? 'reject' : actionType,
          correctedValues
        });

        const response = await fetch(`/api/admin/documents/${request.contextualData.document.id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: actionType === 'deny' ? 'reject' : actionType, // Convert 'deny' to 'reject' for API
            adminNotes,
            correctedValues: actionType === 'approve' ? correctedValues : undefined,
          }),
        });

        if (response.ok) {
          console.log('Document review processed successfully');
          // For document reviews, we don't need to call onAction since the document API handles everything
          // Just close the dialog and the parent will refresh on its own
          setShowReviewDialog(false);
          setAdminNotes('');
          setCorrectedValues({});
          
          // Trigger a page refresh to update the admin dashboard
          window.location.reload();
          return; // Exit early to avoid calling onAction
        } else {
          const errorData = await response.text();
          console.error('Failed to process document review:', response.status, errorData);
          alert(`Failed to process document review: ${response.status} - ${errorData}`);
        }
      } catch (error) {
        console.error('Error processing document review:', error);
        alert(`Error processing document review: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      console.log('Using override-requests API for request type:', request.type);
      // For other request types, use the existing override-requests API
      onAction(request.id, actionType, adminNotes);
    }
    
    setShowReviewDialog(false);
    setAdminNotes('');
    setCorrectedValues({});
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const renderIncomeDiscrepancyDetails = () => {
    if (request.type !== 'INCOME_DISCREPANCY' || !request.contextualData?.incomeAnalysis) {
      return null;
    }

    const { incomeAnalysis, unit } = request.contextualData;
    const lease = unit?.leases?.[0];

    return (
      <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
        <h4 className="text-sm font-semibold text-red-800 mb-3">Income Discrepancy Analysis</h4>
        
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <div className="text-lg font-bold text-red-600">
              {formatCurrency(incomeAnalysis.complianceIncome || 0)}
            </div>
            <div className="text-xs text-gray-600">Compliance Income</div>
            <div className="text-xs text-gray-500">(From Rent Roll)</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-green-600">
              {formatCurrency(incomeAnalysis.verifiedIncome || 0)}
            </div>
            <div className="text-xs text-gray-600">Verified Income</div>
            <div className="text-xs text-gray-500">(From Documents)</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-orange-600">
              {formatCurrency(incomeAnalysis.discrepancy || 0)}
            </div>
            <div className="text-xs text-gray-600">Discrepancy</div>
            <div className="text-xs text-gray-500">({incomeAnalysis.percentage ? incomeAnalysis.percentage.toFixed(1) : '0.0'}%)</div>
          </div>
        </div>

        {lease?.residents && (
          <div className="mt-3">
            <h5 className="text-xs font-semibold text-gray-700 mb-2">Residents:</h5>
            <div className="space-y-1">
              {lease.residents.map((resident: any, index: number) => (
                <div key={index} className="flex justify-between text-xs">
                  <span>{resident.name}</span>
                  <div className="space-x-4">
                    <span className="text-red-600">
                      Compliance: {formatCurrency(resident.annualizedIncome || 0)}
                    </span>
                    <span className="text-green-600">
                      Verified: {formatCurrency(resident.verifiedIncome || 0)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Detailed Document Breakdown */}
        {lease?.incomeVerifications && lease.incomeVerifications.length > 0 && (
          <div className="mt-4">
            <h5 className="text-xs font-semibold text-gray-700 mb-3">Document-by-Document Analysis:</h5>
            <div className="space-y-3">
              {lease.incomeVerifications[0].incomeDocuments.map((doc: any, docIndex: number) => (
                <div key={docIndex} className="p-3 bg-white rounded border">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-medium">{doc.documentType}</span>
                      <span className={`text-xs px-2 py-1 rounded ${
                        doc.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                        doc.status === 'NEEDS_REVIEW' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {doc.status}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="text-xs text-gray-500">
                        {doc.resident?.name || 'Unknown Resident'}
                      </div>
                      <button
                        onClick={() => window.open(`/api/admin/documents/${doc.id}`, '_blank')}
                        className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-100 border border-blue-300 rounded hover:bg-blue-200"
                      >
                        View
                      </button>
                    </div>
                  </div>

                  {doc.documentType === 'PAYSTUB' && (
                    <div className="text-xs space-y-1">
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <span className="font-medium">Employee:</span>
                          <div className={doc.employeeName ? "text-green-600" : "text-red-500"}>
                            {doc.employeeName || 'Not detected'}
                          </div>
                        </div>
                        <div>
                          <span className="font-medium">Employer:</span>
                          <div className={doc.employerName ? "text-green-600" : "text-red-500"}>
                            {doc.employerName || 'Not detected'}
                          </div>
                        </div>
                        <div>
                          <span className="font-medium">Pay Frequency:</span>
                          <div className={doc.payFrequency ? "text-green-600" : "text-red-500"}>
                            {doc.payFrequency || 'Not detected'}
                          </div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mt-2">
                        <div>
                          <span className="font-medium">Pay Period:</span>
                          <div className={doc.payPeriodStartDate && doc.payPeriodEndDate ? "text-green-600" : "text-red-500"}>
                            {doc.payPeriodStartDate && doc.payPeriodEndDate 
                              ? `${new Date(doc.payPeriodStartDate).toLocaleDateString()} - ${new Date(doc.payPeriodEndDate).toLocaleDateString()}`
                              : 'Not detected'
                            }
                          </div>
                        </div>
                        <div>
                          <span className="font-medium">Period Length:</span>
                          <div className="text-gray-600">
                            {doc.payPeriodStartDate && doc.payPeriodEndDate 
                              ? `${Math.ceil((new Date(doc.payPeriodEndDate).getTime() - new Date(doc.payPeriodStartDate).getTime()) / (1000 * 60 * 60 * 24))} days`
                              : 'Unknown'
                            }
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 p-2 bg-gray-50 rounded">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">Gross Pay Amount:</span>
                          <span className={doc.grossPayAmount ? "text-green-600 font-bold" : "text-red-500"}>
                            {doc.grossPayAmount ? formatCurrency(doc.grossPayAmount) : 'Not detected'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center mt-1">
                          <span className="font-medium">Annualized Income:</span>
                          <span className={doc.calculatedAnnualizedIncome ? "text-blue-600 font-bold" : "text-red-500"}>
                            {doc.calculatedAnnualizedIncome ? formatCurrency(doc.calculatedAnnualizedIncome) : 'Not calculated'}
                          </span>
                        </div>
                        {doc.grossPayAmount && doc.payFrequency && doc.calculatedAnnualizedIncome && (
                          <div className="mt-1 text-xs text-gray-600">
                            Calculation: {formatCurrency(doc.grossPayAmount)} × {getPayFrequencyMultiplier(doc.payFrequency)} periods/year
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {doc.documentType === 'W2' && (
                    <div className="text-xs space-y-1">
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <span className="font-medium">Employee:</span>
                          <div className={doc.employeeName ? "text-green-600" : "text-red-500"}>
                            {doc.employeeName || 'Not detected'}
                          </div>
                        </div>
                        <div>
                          <span className="font-medium">Employer:</span>
                          <div className={doc.employerName ? "text-green-600" : "text-red-500"}>
                            {doc.employerName || 'Not detected'}
                          </div>
                        </div>
                        <div>
                          <span className="font-medium">Tax Year:</span>
                          <div className={doc.taxYear ? "text-green-600" : "text-red-500"}>
                            {doc.taxYear || 'Not detected'}
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 p-2 bg-gray-50 rounded">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">Box 1 Wages:</span>
                          <span className={doc.box1_wages ? "text-green-600 font-bold" : "text-red-500"}>
                            {doc.box1_wages ? formatCurrency(doc.box1_wages) : 'Not detected'}
                          </span>
                        </div>
                        {doc.box3_ss_wages && (
                          <div className="flex justify-between items-center mt-1">
                            <span className="font-medium">Box 3 (SS Wages):</span>
                            <span className="text-green-600">
                              {formatCurrency(doc.box3_ss_wages)}
                            </span>
                          </div>
                        )}
                        {doc.box5_med_wages && (
                          <div className="flex justify-between items-center mt-1">
                            <span className="font-medium">Box 5 (Medicare):</span>
                            <span className="text-green-600">
                              {formatCurrency(doc.box5_med_wages)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mt-2 text-xs text-gray-500">
                    Uploaded: {new Date(doc.uploadDate).toLocaleDateString()} at {new Date(doc.uploadDate).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>

            {/* Income Calculation Summary */}
            <div className="mt-4 p-3 bg-blue-50 rounded">
              <h6 className="text-xs font-semibold text-blue-700 mb-2">Income Calculation Summary:</h6>
              <div className="text-xs space-y-1">
                {lease.incomeVerifications[0].incomeDocuments.filter((doc: any) => doc.documentType === 'W2').length > 0 && (
                  <div className="flex justify-between">
                    <span>W2 Income Total:</span>
                    <span className="font-medium text-blue-600">
                      {formatCurrency(
                        lease.incomeVerifications[0].incomeDocuments
                          .filter((doc: any) => doc.documentType === 'W2')
                          .reduce((sum: number, doc: any) => sum + (doc.box1_wages || 0), 0)
                      )}
                    </span>
                  </div>
                )}
                {lease.incomeVerifications[0].incomeDocuments.filter((doc: any) => doc.documentType === 'PAYSTUB').length > 0 && (
                  <div className="flex justify-between">
                    <span>Paystub Income (Averaged):</span>
                    <span className="font-medium text-blue-600">
                      {(() => {
                        const paystubs = lease.incomeVerifications[0].incomeDocuments.filter((doc: any) => doc.documentType === 'PAYSTUB');
                        const total = paystubs.reduce((sum: number, doc: any) => sum + (doc.calculatedAnnualizedIncome || 0), 0);
                        return formatCurrency(paystubs.length > 0 ? total / paystubs.length : 0);
                      })()}
                    </span>
                  </div>
                )}
                <div className="border-t pt-1 mt-2 flex justify-between font-medium">
                  <span>Total Verified Income:</span>
                  <span className="text-blue-700">{formatCurrency(incomeAnalysis.verifiedIncome)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderDocumentReviewDetails = () => {
    if (request.type !== 'DOCUMENT_REVIEW' || !request.contextualData?.document) {
      return null;
    }

    const { document } = request.contextualData;

    return (
      <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-md">
        <h4 className="text-sm font-semibold text-orange-800 mb-3">Document Review Details</h4>
        
        <div className="grid grid-cols-2 gap-4 text-sm mb-4">
          <div>
            <span className="font-medium text-gray-700">Document Type:</span>
            <span className="ml-2">{document.documentType}</span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Status:</span>
            <span className="ml-2 text-orange-600">{document.status}</span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Resident:</span>
            <span className="ml-2">{document.Resident?.name || 'Unknown'}</span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Upload Date:</span>
            <span className="ml-2">{new Date(document.uploadDate).toLocaleDateString()}</span>
          </div>
        </div>

        {document.documentType === 'PAYSTUB' && (
          <div className="mt-3 p-3 bg-white rounded border">
            <h5 className="text-xs font-semibold text-gray-700 mb-3">Azure OCR Extraction Results:</h5>
            
            {/* Employee & Employer Info */}
            <div className="mb-4">
              <h6 className="text-xs font-medium text-gray-600 mb-2">Employee & Employer Information:</h6>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex justify-between">
                  <span className="font-medium">Employee Name:</span>
                  <span className={document.employeeName ? "text-green-600" : "text-red-500"}>
                    {document.employeeName || 'Not detected'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Employer Name:</span>
                  <span className={document.employerName ? "text-green-600" : "text-red-500"}>
                    {document.employerName || 'Not detected'}
                  </span>
                </div>
              </div>
            </div>

            {/* Pay Period Info */}
            <div className="mb-4">
              <h6 className="text-xs font-medium text-gray-600 mb-2">Pay Period Information:</h6>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex justify-between">
                  <span className="font-medium">Pay Period Start:</span>
                  <span className={document.payPeriodStartDate ? "text-green-600" : "text-red-500"}>
                    {document.payPeriodStartDate 
                      ? new Date(document.payPeriodStartDate).toLocaleDateString()
                      : 'Not detected'
                    }
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Pay Period End:</span>
                  <span className={document.payPeriodEndDate ? "text-green-600" : "text-red-500"}>
                    {document.payPeriodEndDate 
                      ? new Date(document.payPeriodEndDate).toLocaleDateString()
                      : 'Not detected'
                    }
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Pay Frequency:</span>
                  <span className={document.payFrequency ? "text-green-600" : "text-red-500"}>
                    {document.payFrequency || 'Not detected'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Period Length:</span>
                  <span className="text-gray-600">
                    {document.payPeriodStartDate && document.payPeriodEndDate 
                      ? `${Math.ceil((new Date(document.payPeriodEndDate).getTime() - new Date(document.payPeriodStartDate).getTime()) / (1000 * 60 * 60 * 24))} days`
                      : 'Unknown'
                    }
                  </span>
                </div>
              </div>
            </div>

            {/* Current Period Pay */}
            <div className="mb-4">
              <h6 className="text-xs font-medium text-gray-600 mb-2">Current Pay Period Amounts:</h6>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex justify-between">
                  <span className="font-medium">Gross Pay:</span>
                  <span className={document.grossPayAmount ? "text-green-600 font-semibold" : "text-red-500"}>
                    {document.grossPayAmount ? formatCurrency(document.grossPayAmount) : 'Not detected'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Net Pay:</span>
                  <span className="text-gray-600">
                    {/* We don't store current net pay, but could add it */}
                    Not captured
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Deductions:</span>
                  <span className="text-gray-600">
                    {/* We don't store current deductions, but could add it */}
                    Not captured
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Taxes:</span>
                  <span className="text-gray-600">
                    {/* We don't store current taxes, but could add it */}
                    Not captured
                  </span>
                </div>
              </div>
            </div>

            {/* Calculated Annual Income */}
            <div className="mb-4 p-2 bg-blue-50 rounded">
              <h6 className="text-xs font-medium text-blue-700 mb-2">Calculated Annual Income:</h6>
              <div className="text-sm">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Annualized Amount:</span>
                  <span className={document.calculatedAnnualizedIncome ? "text-blue-700 font-bold text-lg" : "text-red-500"}>
                    {document.calculatedAnnualizedIncome ? formatCurrency(document.calculatedAnnualizedIncome) : 'Not calculated'}
                  </span>
                </div>
                {document.grossPayAmount && document.payFrequency && document.calculatedAnnualizedIncome && (
                  <div className="mt-2 text-xs text-blue-600">
                    <div>Calculation: {formatCurrency(document.grossPayAmount)} × {getPayFrequencyMultiplier(document.payFrequency)} = {formatCurrency(document.calculatedAnnualizedIncome)}</div>
                    <div className="mt-1">
                      Method: {document.payFrequency === 'BI_WEEKLY' ? 'Bi-weekly (26 pay periods/year)' :
                              document.payFrequency === 'WEEKLY' ? 'Weekly (52 pay periods/year)' :
                              document.payFrequency === 'MONTHLY' ? 'Monthly (12 pay periods/year)' :
                              document.payFrequency === 'SEMI_MONTHLY' ? 'Semi-monthly (24 pay periods/year)' :
                              'Unknown frequency'}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Issues & Missing Data */}
            <div className="p-2 bg-red-50 rounded">
              <h6 className="text-xs font-medium text-red-700 mb-2">Issues Detected:</h6>
              <div className="text-xs space-y-1">
                {!document.grossPayAmount && (
                  <div className="flex items-center text-red-600">
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    Gross pay amount not detected
                  </div>
                )}
                {!document.payFrequency && (
                  <div className="flex items-center text-red-600">
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    Pay frequency not determined
                  </div>
                )}
                {!document.employeeName && (
                  <div className="flex items-center text-yellow-600">
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Employee name verification needed
                  </div>
                )}
                {(!document.payPeriodStartDate || !document.payPeriodEndDate) && (
                  <div className="flex items-center text-yellow-600">
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Pay period dates incomplete
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {document.documentType === 'W2' && (
          <div className="mt-3 p-3 bg-white rounded border">
            <h5 className="text-xs font-semibold text-gray-700 mb-3">Azure OCR Extraction Results:</h5>
            
            {/* Employee & Employer Info */}
            <div className="mb-4">
              <h6 className="text-xs font-medium text-gray-600 mb-2">Employee & Employer Information:</h6>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex justify-between">
                  <span className="font-medium">Employee Name:</span>
                  <span className={document.employeeName ? "text-green-600" : "text-red-500"}>
                    {document.employeeName || 'Not detected'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Employer Name:</span>
                  <span className={document.employerName ? "text-green-600" : "text-red-500"}>
                    {document.employerName || 'Not detected'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Tax Year:</span>
                  <span className={document.taxYear ? "text-green-600" : "text-red-500"}>
                    {document.taxYear || 'Not detected'}
                  </span>
                </div>
              </div>
            </div>

            {/* W2 Wage Information */}
            <div className="mb-4">
              <h6 className="text-xs font-medium text-gray-600 mb-2">Wage Information:</h6>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex justify-between">
                  <span className="font-medium">Box 1 (Wages):</span>
                  <span className={document.box1_wages ? "text-green-600 font-semibold" : "text-red-500"}>
                    {document.box1_wages ? formatCurrency(document.box1_wages) : 'Not detected'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Box 3 (SS Wages):</span>
                  <span className={document.box3_ss_wages ? "text-green-600" : "text-gray-500"}>
                    {document.box3_ss_wages ? formatCurrency(document.box3_ss_wages) : 'Not captured'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Box 5 (Medicare Wages):</span>
                  <span className={document.box5_med_wages ? "text-green-600" : "text-gray-500"}>
                    {document.box5_med_wages ? formatCurrency(document.box5_med_wages) : 'Not captured'}
                  </span>
                </div>
              </div>
            </div>

            {/* Issues & Missing Data */}
            <div className="p-2 bg-red-50 rounded">
              <h6 className="text-xs font-medium text-red-700 mb-2">Issues Detected:</h6>
              <div className="text-xs space-y-1">
                {!document.box1_wages && (
                  <div className="flex items-center text-red-600">
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    Box 1 wages (primary income) not detected
                  </div>
                )}
                {!document.employeeName && (
                  <div className="flex items-center text-yellow-600">
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Employee name verification needed
                  </div>
                )}
                {!document.taxYear && (
                  <div className="flex items-center text-yellow-600">
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Tax year verification needed
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-orange-700">
            <span className="font-medium">Action Required:</span> Manual review and data entry needed for failed OCR extraction.
          </div>
          <button
            onClick={() => window.open(`/api/documents/${document.id}/file`, '_blank')}
            className="px-3 py-1 text-xs font-medium text-orange-600 bg-orange-100 border border-orange-300 rounded hover:bg-orange-200"
          >
            View Document
          </button>
        </div>
      </div>
    );
  };

  const renderValidationExceptionDetails = () => {
    if (request.type !== 'VALIDATION_EXCEPTION' || !request.contextualData?.verification) {
      return null;
    }

    const { verification } = request.contextualData;
    const documents = verification.IncomeDocument || [];
    
    // Only show documents for the specific resident this override request is for
    const targetResidentDocuments = documents.filter((doc: any) => {
      const docResidentId = doc.Resident?.id || doc.residentId;
      return docResidentId === request.residentId;
    });
    
    if (targetResidentDocuments.length === 0) {
      return (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
          <h4 className="text-sm font-semibold text-blue-800 mb-3">Validation Exception Details</h4>
          <p className="text-sm text-gray-600">No documents found for the specific resident.</p>
        </div>
      );
    }
    
    const residentData = {
      resident: targetResidentDocuments[0]?.Resident,
      documents: targetResidentDocuments
    };

    return (
      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
        <h4 className="text-sm font-semibold text-blue-800 mb-3">Validation Exception Details</h4>
        
        <div className="space-y-4">
          {/* Only show the specific resident this override request is for */}
          {(() => {
            const paystubs = residentData.documents.filter((doc: any) => doc.documentType === 'PAYSTUB');
            const w2s = residentData.documents.filter((doc: any) => doc.documentType === 'W2');
            const completedDocs = residentData.documents.filter((doc: any) => doc.status === 'COMPLETED');
            
            return (
              <div className="p-3 bg-white rounded border">
                <h5 className="text-sm font-semibold text-gray-700 mb-3">
                  {residentData.resident?.name || 'Unknown Resident'}
                </h5>
                
                {/* Document Count Summary */}
                <div className="grid grid-cols-3 gap-4 mb-3 text-xs">
                  <div className="text-center p-2 bg-gray-50 rounded">
                    <div className="font-bold text-lg">{paystubs.length}</div>
                    <div className="text-gray-600">Paystubs</div>
                    {paystubs.length < 3 && (
                      <div className="text-red-600 text-xs mt-1">(Need 3 for biweekly)</div>
                    )}
                  </div>
                  <div className="text-center p-2 bg-gray-50 rounded">
                    <div className="font-bold text-lg">{w2s.length}</div>
                    <div className="text-gray-600">W2s</div>
                  </div>
                  <div className="text-center p-2 bg-gray-50 rounded">
                    <div className="font-bold text-lg">{completedDocs.length}</div>
                    <div className="text-gray-600">Completed</div>
                  </div>
                </div>

                {/* Individual Document Details */}
                <div className="space-y-2">
                  <h6 className="text-xs font-medium text-gray-600">Uploaded Documents:</h6>
                  {residentData.documents.map((doc: any, docIndex: number) => (
                    <div key={docIndex} className="p-2 bg-gray-50 rounded text-xs">
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">{doc.documentType}</span>
                          <span className={`px-2 py-1 rounded text-xs ${
                            doc.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                            doc.status === 'NEEDS_REVIEW' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {doc.status}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="text-gray-500">
                            {new Date(doc.uploadDate).toLocaleDateString()}
                          </div>
                          <button
                            onClick={() => window.open(`/api/admin/documents/${doc.id}`, '_blank')}
                            className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-100 border border-blue-300 rounded hover:bg-blue-200"
                          >
                            View
                          </button>
                        </div>
                      </div>

                      {doc.documentType === 'PAYSTUB' && (
                        <div className="grid grid-cols-2 gap-4 mt-2">
                          <div>
                            <span className="font-medium">Pay Period:</span>
                            <div className={doc.payPeriodStartDate && doc.payPeriodEndDate ? "text-green-600" : "text-red-500"}>
                              {doc.payPeriodStartDate && doc.payPeriodEndDate 
                                ? `${new Date(doc.payPeriodStartDate).toLocaleDateString()} - ${new Date(doc.payPeriodEndDate).toLocaleDateString()}`
                                : 'Not detected'
                              }
                            </div>
                          </div>
                          <div>
                            <span className="font-medium">Gross Pay:</span>
                            <div className={doc.grossPayAmount ? "text-green-600 font-medium" : "text-red-500"}>
                              {doc.grossPayAmount ? formatCurrency(doc.grossPayAmount) : 'Not detected'}
                            </div>
                          </div>
                          <div>
                            <span className="font-medium">Pay Frequency:</span>
                            <div className={doc.payFrequency ? "text-green-600" : "text-red-500"}>
                              {doc.payFrequency || 'Not detected'}
                            </div>
                          </div>
                          <div>
                            <span className="font-medium">Annualized:</span>
                            <div className={doc.calculatedAnnualizedIncome ? "text-blue-600 font-medium" : "text-red-500"}>
                              {doc.calculatedAnnualizedIncome ? formatCurrency(doc.calculatedAnnualizedIncome) : 'Not calculated'}
                            </div>
                          </div>
                          {doc.employeeName && (
                            <div className="col-span-2">
                              <span className="font-medium">Employee:</span>
                              <span className="ml-1 text-green-600">{doc.employeeName}</span>
                              {doc.employerName && (
                                <span className="ml-2 text-gray-600">({doc.employerName})</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {doc.documentType === 'W2' && (
                        <div className="grid grid-cols-2 gap-4 mt-2">
                          <div>
                            <span className="font-medium">Tax Year:</span>
                            <div className={doc.taxYear ? "text-green-600" : "text-red-500"}>
                              {doc.taxYear || 'Not detected'}
                            </div>
                          </div>
                          <div>
                            <span className="font-medium">Box 1 Wages:</span>
                            <div className={doc.box1_wages ? "text-green-600 font-medium" : "text-red-500"}>
                              {doc.box1_wages ? formatCurrency(doc.box1_wages) : 'Not detected'}
                            </div>
                          </div>
                          {doc.employeeName && (
                            <div className="col-span-2">
                              <span className="font-medium">Employee:</span>
                              <span className="ml-1 text-green-600">{doc.employeeName}</span>
                              {doc.employerName && (
                                <span className="ml-2 text-gray-600">({doc.employerName})</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Validation Issues */}
                <div className="mt-3 p-2 bg-yellow-50 rounded">
                  <h6 className="text-xs font-medium text-yellow-700 mb-2">Validation Issues:</h6>
                  <div className="text-xs space-y-1">
                    {(() => {
                      // Calculate required paystubs based on actual pay frequency
                      const payFrequency = paystubs[0]?.payFrequency;
                      if (paystubs.length > 0 && payFrequency) {
                        const requiredStubsMap: Record<string, number> = {
                          'BI_WEEKLY': 2,   // Updated: reduced from 3 to 2
                          'WEEKLY': 4,      // Updated: reduced from 5 to 4
                          'SEMI_MONTHLY': 2, // Math.ceil(30 / 15) = 2
                          'MONTHLY': 1,     // Math.ceil(30 / 30) = 1
                          'UNKNOWN': 2      // Default to bi-weekly equivalent
                        };
                        const requiredStubs = requiredStubsMap[payFrequency] || 2;
                        
                        if (paystubs.length < requiredStubs) {
                          const frequencyName = payFrequency.toLowerCase().replace('_', '-');
                          return (
                            <div className="flex items-center text-yellow-600">
                              <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                              Insufficient paystubs: {paystubs.length}/{requiredStubs} uploaded (need {requiredStubs} for accurate {frequencyName} calculation)
                            </div>
                          );
                        }
                      }
                      return null;
                    })()}
                    {paystubs.some((doc: any) => !doc.payFrequency) && (
                      <div className="flex items-center text-yellow-600">
                        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        Pay frequency could not be determined from some paystubs
                      </div>
                    )}
                    {paystubs.some((doc: any) => !doc.grossPayAmount) && (
                      <div className="flex items-center text-red-600">
                        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        Gross pay amount could not be detected from some paystubs
                      </div>
                    )}
                    {residentData.documents.length === 0 && (
                      <div className="flex items-center text-red-600">
                        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        No income documents uploaded
                      </div>
                    )}
                    
                    {/* Show default validation message if no specific issues are detected */}
                    {(() => {
                      // Check if any specific validation issues were shown
                      const payFrequency = paystubs[0]?.payFrequency;
                      const hasInsufficientPaystubs = paystubs.length > 0 && payFrequency && 
                        paystubs.length < Math.ceil(30 / (payFrequency === 'WEEKLY' ? 7 : payFrequency === 'BI_WEEKLY' ? 14 : payFrequency === 'SEMI_MONTHLY' ? 15 : 30));
                      const hasMissingPayFreq = paystubs.some((doc: any) => !doc.payFrequency);
                      const hasMissingGrossPay = paystubs.some((doc: any) => !doc.grossPayAmount);
                      const hasNoDocuments = residentData.documents.length === 0;
                      
                      // Only show default if no specific issues were detected
                      if (!hasInsufficientPaystubs && !hasMissingPayFreq && !hasMissingGrossPay && !hasNoDocuments && residentData.documents.length > 0) {
                        return (
                          <div className="flex items-center text-blue-600">
                            <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                            User is requesting validation exception to proceed with current documentation
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        <div className="mt-3 text-xs text-blue-700">
          <span className="font-medium">Exception Request:</span> User requests to proceed with current documentation despite validation warnings.
        </div>
      </div>
    );
  };

  const renderPropertyDeletionDetails = () => {
    if (request.type !== 'PROPERTY_DELETION' || !request.contextualData?.property) {
      return null;
    }

    const { property } = request.contextualData;

    return (
      <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-md">
        <h4 className="text-sm font-semibold text-orange-800 mb-3">Property Deletion Request</h4>
        
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs font-medium text-gray-600">Property Name:</span>
              <div className="font-medium text-gray-900">{property.name}</div>
            </div>
            <div>
              <span className="text-xs font-medium text-gray-600">Number of Units:</span>
              <div className="font-medium text-gray-900">{property.numberOfUnits || 'Unknown'}</div>
            </div>
          </div>
          
          {property.address && (
            <div>
              <span className="text-xs font-medium text-gray-600">Address:</span>
              <div className="font-medium text-gray-900">{property.address}</div>
            </div>
          )}
          
          {property.county && property.state && (
            <div>
              <span className="text-xs font-medium text-gray-600">Location:</span>
              <div className="font-medium text-gray-900">{property.county}, {property.state}</div>
            </div>
          )}
        </div>

        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
          <h5 className="text-xs font-semibold text-red-700 mb-2">⚠️ Warning: Permanent Action</h5>
          <p className="text-xs text-red-600">
            Approving this request will permanently delete the property and all associated data including:
            units, leases, residents, income verifications, and documents. This action cannot be undone.
          </p>
        </div>
      </div>
    );
  };

  const getPayFrequencyMultiplier = (frequency: string) => {
    switch (frequency) {
      case 'BI_WEEKLY': return 26;
      case 'WEEKLY': return 52;
      case 'MONTHLY': return 12;
      case 'SEMI_MONTHLY': return 24;
      default: return '?';
    }
  };

  // Helper function to check if Azure extraction failed for document review
  const hasAzureExtractionFailed = () => {
    if (request.type !== 'DOCUMENT_REVIEW' || !request.contextualData?.document) {
      return false;
    }
    
    const doc = request.contextualData.document;
    // Consider extraction failed if key fields are missing
    const hasKeyData = doc.employeeName || doc.employerName || doc.grossPayAmount || doc.payFrequency;
    return !hasKeyData;
  };

  return (
    <>
      <li className="px-6 py-6">
        <div className="flex items-start justify-between">
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
              <p className="text-sm text-gray-600 font-medium">{formatRequestContext(request)}</p>
              <p className="text-sm text-gray-500 mt-1">
                <strong>Requester:</strong> {request.User_OverrideRequest_requesterIdToUser.name || request.User_OverrideRequest_requesterIdToUser.email} 
                ({request.User_OverrideRequest_requesterIdToUser.company})
              </p>
            </div>

            <div className="mt-3 p-3 bg-gray-50 rounded-md">
              <p className="text-sm text-gray-700">
                <strong>User Explanation:</strong><br />
                {request.userExplanation}
              </p>
            </div>

            {/* Contextual Details Based on Request Type */}
            {request.type === 'INCOME_DISCREPANCY' && renderIncomeDiscrepancyDetails()}
            {request.type === 'DOCUMENT_REVIEW' && renderDocumentReviewDetails()}
            {request.type === 'VALIDATION_EXCEPTION' && renderValidationExceptionDetails()}
            {request.type === 'PROPERTY_DELETION' && renderPropertyDeletionDetails()}

            {request.adminNotes && (
              <div className="mt-3 p-3 bg-blue-50 rounded-md">
                <p className="text-sm text-blue-700">
                  <strong>Admin Notes:</strong><br />
                  {request.adminNotes}
                </p>
                {request.User_OverrideRequest_reviewerIdToUser && (
                  <p className="text-xs text-blue-600 mt-1">
                    Reviewed by {request.User_OverrideRequest_reviewerIdToUser.name || request.User_OverrideRequest_reviewerIdToUser.email}
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
                {request.type === 'DOCUMENT_REVIEW' && hasAzureExtractionFailed() 
                  ? 'Manually Enter Pay Information' 
                  : 'Approve'
                }
              </button>
              <button
                onClick={() => handleAction('deny')}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Deny
              </button>
              <button
                onClick={() => onMessageClick(request)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Send Message
              </button>
            </div>
          )}
          
          {request.status !== 'PENDING' && (
            <div className="ml-6">
              <button
                onClick={() => onMessageClick(request)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Send Message
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
                {actionType === 'approve' 
                  ? (request.type === 'DOCUMENT_REVIEW' && hasAzureExtractionFailed() 
                      ? 'Manually Enter Pay Information' 
                      : 'Approve Override Request')
                  : 'Deny Override Request'
                }
              </h3>
              
              {/* Manual Data Entry for Document Review (only when approving) */}
              {request.type === 'DOCUMENT_REVIEW' && actionType === 'approve' && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <h4 className="text-sm font-medium text-green-800 mb-3">Manual Data Entry</h4>
                  <p className="text-xs text-green-700 mb-4">
                    Enter the correct values from the document. Leave fields blank to keep Azure's extracted values.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Employee Name</label>
                      <input
                        type="text"
                        value={correctedValues.employeeName || ''}
                        onChange={(e) => setCorrectedValues(prev => ({ ...prev, employeeName: e.target.value }))}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-green-500"
                        placeholder="Enter employee name"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Employer Name</label>
                      <input
                        type="text"
                        value={correctedValues.employerName || ''}
                        onChange={(e) => setCorrectedValues(prev => ({ ...prev, employerName: e.target.value }))}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-green-500"
                        placeholder="Enter employer name"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Gross Pay Amount</label>
                      <input
                        type="number"
                        step="0.01"
                        value={correctedValues.grossPayAmount || ''}
                        onChange={(e) => setCorrectedValues(prev => ({ ...prev, grossPayAmount: parseFloat(e.target.value) || undefined }))}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-green-500"
                        placeholder="Enter gross pay amount"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Pay Frequency</label>
                      <select
                        value={correctedValues.payFrequency || ''}
                        onChange={(e) => setCorrectedValues(prev => ({ ...prev, payFrequency: e.target.value }))}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-green-500"
                      >
                        <option value="">Select frequency</option>
                        <option value="WEEKLY">Weekly</option>
                        <option value="BI-WEEKLY">Bi-Weekly</option>
                        <option value="SEMI-MONTHLY">Semi-Monthly</option>
                        <option value="MONTHLY">Monthly</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Pay Period Start</label>
                      <input
                        type="date"
                        value={correctedValues.payPeriodStartDate || ''}
                        onChange={(e) => setCorrectedValues(prev => ({ ...prev, payPeriodStartDate: e.target.value }))}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-green-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Pay Period End</label>
                      <input
                        type="date"
                        value={correctedValues.payPeriodEndDate || ''}
                        onChange={(e) => setCorrectedValues(prev => ({ ...prev, payPeriodEndDate: e.target.value }))}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-green-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Admin Notes (required)
                </label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={actionType === 'approve' 
                    ? (request.type === 'DOCUMENT_REVIEW' && hasAzureExtractionFailed() 
                        ? 'Describe the manually entered pay information and any observations from the document...'
                        : 'Explain why you are approving this request...')
                    : 'Explain why you are denying this request...'
                  }
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
                  {actionType === 'approve' 
                    ? (request.type === 'DOCUMENT_REVIEW' && hasAzureExtractionFailed() 
                        ? 'Save Pay Information' 
                        : 'Approve Request')
                    : 'Deny Request'
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 