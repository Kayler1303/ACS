'use client';

import { useState } from 'react';

interface Property {
  id: string;
  name: string;
  address?: string;
  numberOfUnits?: number;
  PropertySubscription?: {
    id?: string;
    setupFeePaid: boolean;
    subscriptionStatus: string;
    setupFeeAmount?: number;
    monthlyFeeAmount?: number;
    isManualPayment?: boolean;
    nextPaymentDue?: string;
    manualPayments?: Array<{
      id: string;
      amount: number;
      paymentMethod: string;
      paymentType: string;
      paidDate: string;
      referenceNumber?: string;
      notes?: string;
    }>;
    adminGrant?: {
      id: string;
      isActive: boolean;
      reason?: string;
      grantedAt: string;
      grantedBy: {
        name?: string;
        email: string;
      };
    } | null;
  } | null;
}

interface AdminManualPaymentProps {
  property: Property;
  onPaymentRecorded: () => void;
}

export default function AdminManualPayment({ property, onPaymentRecorded }: AdminManualPaymentProps) {
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [paymentMethod, setPaymentMethod] = useState<'ACH' | 'CHECK' | 'WIRE_TRANSFER' | 'CASH' | 'OTHER'>('CHECK');
  const [paymentType, setPaymentType] = useState<'SETUP_FEE' | 'MONTHLY_PAYMENT' | 'PARTIAL_PAYMENT' | 'LATE_FEE' | 'OTHER'>('MONTHLY_PAYMENT');
  const [amount, setAmount] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [paidDate, setPaidDate] = useState(new Date().toISOString().split('T')[0]);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  const subscription = property.PropertySubscription;
  const isManualPayment = subscription?.isManualPayment || false;
  const subscriptionId = subscription?.id;

  const handleRecordPayment = async () => {
    if (!amount || !paidDate) {
      setError('Amount and paid date are required');
      return;
    }

    if (!subscriptionId) {
      setError('No subscription found for this property');
      return;
    }

    setIsRecording(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/properties/${property.id}/manual-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentMethod,
          paymentType,
          amount: parseFloat(amount),
          referenceNumber: referenceNumber || null,
          notes: notes || null,
          paidDate,
          periodStart: periodStart || null,
          periodEnd: periodEnd || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to record payment');
      }

      setShowRecordModal(false);
      resetForm();
      onPaymentRecorded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setIsRecording(false);
    }
  };

  const handleConvertToManual = async () => {
    setIsRecording(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/properties/${property.id}/convert-to-manual`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notes: notes || 'Converted to manual payment by admin',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to convert to manual payment');
      }

      setShowConvertModal(false);
      resetForm();
      onPaymentRecorded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to convert to manual payment');
    } finally {
      setIsRecording(false);
    }
  };

  const resetForm = () => {
    setAmount('');
    setReferenceNumber('');
    setNotes('');
    setPaidDate(new Date().toISOString().split('T')[0]);
    setPeriodStart('');
    setPeriodEnd('');
    setError(null);
  };

  const getPaymentStatusColor = () => {
    if (!subscription) return 'bg-gray-50 text-gray-600';
    
    if (subscription.subscriptionStatus === 'ACTIVE') {
      return 'bg-green-50 text-green-600';
    } else if (subscription.subscriptionStatus === 'PAST_DUE') {
      return 'bg-red-50 text-red-600';
    } else {
      return 'bg-yellow-50 text-yellow-600';
    }
  };

  return (
    <div className="bg-white border rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{property.name}</h3>
          <p className="text-sm text-gray-600">{property.address}</p>
          {property.numberOfUnits && (
            <p className="text-sm text-gray-500">{property.numberOfUnits} units</p>
          )}
        </div>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${getPaymentStatusColor()}`}>
          {isManualPayment ? 'Manual Payment' : subscription?.subscriptionStatus || 'No Subscription'}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Payment Summary */}
      {subscription && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Setup Fee:</span> 
              <span className={subscription.setupFeePaid ? 'text-green-600 ml-2' : 'text-red-600 ml-2'}>
                ${subscription.setupFeeAmount?.toFixed(2) || '0.00'} 
                {subscription.setupFeePaid ? ' (Paid)' : ' (Pending)'}
              </span>
            </div>
            <div>
              <span className="font-medium">Monthly Fee:</span> 
              <span className="ml-2">${subscription.monthlyFeeAmount?.toFixed(2) || '0.00'}</span>
            </div>
            {subscription.nextPaymentDue && (
              <div className="col-span-2">
                <span className="font-medium">Next Payment Due:</span> 
                <span className="ml-2">{new Date(subscription.nextPaymentDue).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent Manual Payments */}
      {subscription?.manualPayments && subscription.manualPayments.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-900 mb-2">Recent Manual Payments</h4>
          <div className="space-y-2">
            {subscription.manualPayments.slice(0, 3).map((payment) => (
              <div key={payment.id} className="flex justify-between items-center p-2 bg-blue-50 rounded">
                <div>
                  <span className="text-sm font-medium">${payment.amount.toFixed(2)}</span>
                  <span className="text-xs text-gray-600 ml-2">
                    {payment.paymentMethod} - {new Date(payment.paidDate).toLocaleDateString()}
                  </span>
                  {payment.referenceNumber && (
                    <span className="text-xs text-gray-500 ml-2">#{payment.referenceNumber}</span>
                  )}
                </div>
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  {payment.paymentType.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => setShowRecordModal(true)}
          className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
        >
          Record Payment
        </button>
        
        {!isManualPayment && subscription && (
          <button
            onClick={() => setShowConvertModal(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Convert to Manual
          </button>
        )}
      </div>

      {/* Record Payment Modal */}
      {showRecordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Record Manual Payment</h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="CHECK">Check</option>
                    <option value="ACH">ACH Transfer</option>
                    <option value="WIRE_TRANSFER">Wire Transfer</option>
                    <option value="CASH">Cash</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Type
                  </label>
                  <select
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="SETUP_FEE">Setup Fee</option>
                    <option value="MONTHLY_PAYMENT">Monthly Payment</option>
                    <option value="PARTIAL_PAYMENT">Partial Payment</option>
                    <option value="LATE_FEE">Late Fee</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Amount *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Paid Date *
                  </label>
                  <input
                    type="date"
                    value={paidDate}
                    onChange={(e) => setPaidDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reference Number
                </label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Check #, ACH reference, etc."
                />
              </div>

              {paymentType === 'MONTHLY_PAYMENT' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Period Start
                    </label>
                    <input
                      type="date"
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Period End
                    </label>
                    <input
                      type="date"
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Additional notes about this payment..."
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowRecordModal(false);
                  resetForm();
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordPayment}
                disabled={isRecording}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {isRecording ? 'Recording...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert to Manual Modal */}
      {showConvertModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Convert to Manual Payment</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will disable automatic Stripe billing and allow you to manually track payments for this property.
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason for conversion
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Customer prefers ACH/check payments..."
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowConvertModal(false);
                  resetForm();
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConvertToManual}
                disabled={isRecording}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isRecording ? 'Converting...' : 'Convert'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
