'use client';

import { useState } from 'react';
import AdminManualPayment from './AdminManualPayment';

interface Property {
  id: string;
  name: string;
  address?: string;
  numberOfUnits?: number;
  PropertySubscription?: {
    setupFeePaid: boolean;
    subscriptionStatus: string;
    adminGrant?: Array<{
      id: string;
      isActive: boolean;
      reason?: string;
      grantedAt: string;
      grantedBy: {
        name?: string;
        email: string;
      };
    }>;
  } | null;
}

interface AdminPaymentGrantProps {
  property: Property;
  onGrantUpdated: () => void;
}

export default function AdminPaymentGrant({ property, onGrantUpdated }: AdminPaymentGrantProps) {
  const [isGranting, setIsGranting] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [grantReason, setGrantReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const hasActiveGrant = property.PropertySubscription?.adminGrant?.some(grant => grant.isActive);
  const activeGrant = property.PropertySubscription?.adminGrant?.find(grant => grant.isActive);

  const handleGrantAccess = async () => {
    setIsGranting(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/properties/${property.id}/grant-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: grantReason || 'Admin granted free access',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to grant access');
      }

      setShowGrantModal(false);
      setGrantReason('');
      onGrantUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to grant access');
    } finally {
      setIsGranting(false);
    }
  };

  const handleRevokeAccess = async () => {
    if (!confirm('Are you sure you want to revoke admin access for this property?')) {
      return;
    }

    setIsRevoking(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/properties/${property.id}/grant-access`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to revoke access');
      }

      onGrantUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke access');
    } finally {
      setIsRevoking(false);
    }
  };

  const getPaymentStatus = () => {
    const subscription = property.PropertySubscription;
    
    if (hasActiveGrant) {
      return { status: 'Admin Granted', color: 'text-blue-600', bgColor: 'bg-blue-50' };
    }
    
    if (!subscription) {
      return { status: 'No Payment Setup', color: 'text-red-600', bgColor: 'bg-red-50' };
    }
    
    if (!subscription.setupFeePaid) {
      return { status: 'Setup Fee Pending', color: 'text-yellow-600', bgColor: 'bg-yellow-50' };
    }
    
    switch (subscription.subscriptionStatus) {
      case 'ACTIVE':
        return { status: 'Active', color: 'text-green-600', bgColor: 'bg-green-50' };
      case 'PAST_DUE':
        return { status: 'Past Due', color: 'text-red-600', bgColor: 'bg-red-50' };
      case 'CANCELED':
        return { status: 'Canceled', color: 'text-gray-600', bgColor: 'bg-gray-50' };
      default:
        return { status: 'Inactive', color: 'text-gray-600', bgColor: 'bg-gray-50' };
    }
  };

  const paymentStatus = getPaymentStatus();

  return (
    <div className="space-y-4">
      {/* Free Access Grant Section */}
      <div className="bg-white border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{property.name}</h3>
            <p className="text-sm text-gray-600">{property.address}</p>
            {property.numberOfUnits && (
              <p className="text-sm text-gray-500">{property.numberOfUnits} units</p>
            )}
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${paymentStatus.color} ${paymentStatus.bgColor}`}>
            {paymentStatus.status}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {hasActiveGrant && activeGrant ? (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-800">Free Access Granted</p>
                <p className="text-xs text-blue-600">
                  By {activeGrant.grantedBy.name || activeGrant.grantedBy.email} on{' '}
                  {new Date(activeGrant.grantedAt).toLocaleDateString()}
                </p>
                {activeGrant.reason && (
                  <p className="text-xs text-blue-600 mt-1">Reason: {activeGrant.reason}</p>
                )}
              </div>
              <button
                onClick={handleRevokeAccess}
                disabled={isRevoking}
                className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
              >
                {isRevoking ? 'Revoking...' : 'Revoke'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setShowGrantModal(true)}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
            >
              Grant Free Access
            </button>
          </div>
        )}

        {/* Grant Access Modal */}
        {showGrantModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">Grant Free Access</h3>
              <p className="text-sm text-gray-600 mb-4">
                This will grant free access to <strong>{property.name}</strong> without requiring payment.
              </p>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason (optional)
                </label>
                <textarea
                  value={grantReason}
                  onChange={(e) => setGrantReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Enter reason for granting free access..."
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowGrantModal(false);
                    setGrantReason('');
                    setError(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGrantAccess}
                  disabled={isGranting}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isGranting ? 'Granting...' : 'Grant Access'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Manual Payment Management Section */}
      <AdminManualPayment property={property} onPaymentRecorded={onGrantUpdated} />
    </div>
  );
}
