'use client';

import { useState } from 'react';

interface DiscrepancyData {
  unitNumber: string;
  newIncome: number;
  verifiedIncome: number;
  discrepancy: number;
  leaseId: string;
  residentNames: string[];
}

interface RentRollDiscrepancyModalProps {
  discrepancies: DiscrepancyData[];
  propertyId: string;
  onClose: () => void;
  onResolved: () => void;
}

export default function RentRollDiscrepancyModal({
  discrepancies,
  propertyId,
  onClose,
  onResolved
}: RentRollDiscrepancyModalProps) {
  const [currentDiscrepancyIndex, setCurrentDiscrepancyIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [showOverrideForm, setShowOverrideForm] = useState(false);

  const currentDiscrepancy = discrepancies[currentDiscrepancyIndex];
  const isLastDiscrepancy = currentDiscrepancyIndex === discrepancies.length - 1;

  const handleAcceptVerifiedIncome = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch(`/api/leases/${currentDiscrepancy.leaseId}/accept-verified-income`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verifiedIncome: currentDiscrepancy.verifiedIncome
        })
      });

      if (!response.ok) {
        throw new Error('Failed to accept verified income');
      }

      moveToNextDiscrepancy();
    } catch (error) {
      console.error('Error accepting verified income:', error);
      alert('Failed to accept verified income. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleModifyDocuments = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch(`/api/leases/${currentDiscrepancy.leaseId}/unfinalize-residents`, {
        method: 'PATCH'
      });

      if (!response.ok) {
        throw new Error('Failed to unfinalize documents');
      }

      moveToNextDiscrepancy();
    } catch (error) {
      console.error('Error unfinalizing documents:', error);
      alert('Failed to unfinalize documents. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRequestOverride = async () => {
    if (!overrideReason.trim()) {
      alert('Please provide a reason for the override request.');
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch(`/api/override-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'INCOME_DISCREPANCY',
          leaseId: currentDiscrepancy.leaseId,
          userExplanation: overrideReason,
          propertyId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to submit override request');
      }

      setOverrideReason('');
      setShowOverrideForm(false);
      moveToNextDiscrepancy();
    } catch (error) {
      console.error('Error submitting override request:', error);
      alert('Failed to submit override request. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const moveToNextDiscrepancy = () => {
    if (isLastDiscrepancy) {
      onResolved();
    } else {
      setCurrentDiscrepancyIndex(currentDiscrepancyIndex + 1);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-2xl shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              Income Discrepancy Detected
            </h3>
            <div className="text-sm text-gray-500">
              {currentDiscrepancyIndex + 1} of {discrepancies.length}
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  Unit {currentDiscrepancy.unitNumber} Income Mismatch
                </h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p><strong>Residents:</strong> {currentDiscrepancy.residentNames.join(', ')}</p>
                  <p><strong>Rent Roll Income:</strong> {formatCurrency(currentDiscrepancy.newIncome)}</p>
                  <p><strong>Verified Income:</strong> {formatCurrency(currentDiscrepancy.verifiedIncome)}</p>
                  <p><strong>Discrepancy:</strong> {formatCurrency(currentDiscrepancy.discrepancy)}</p>
                </div>
              </div>
            </div>
          </div>

          {!showOverrideForm ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 mb-4">
                How would you like to resolve this discrepancy?
              </p>

              <div className="space-y-3">
                <button
                  onClick={handleAcceptVerifiedIncome}
                  disabled={isProcessing}
                  className="w-full px-4 py-3 text-left border border-green-300 bg-green-50 rounded-md hover:bg-green-100 disabled:opacity-50"
                >
                  <div className="font-medium text-green-800">Accept Verified Income</div>
                  <div className="text-sm text-green-600 mt-1">
                    Update the resident's income to match the verified amount ({formatCurrency(currentDiscrepancy.verifiedIncome)}).
                    <div className="font-medium text-amber-600 mt-1">
                      ⚠️ Remember to update the resident's income in your property management system to prevent future mismatches.
                    </div>
                  </div>
                </button>

                <button
                  onClick={handleModifyDocuments}
                  disabled={isProcessing}
                  className="w-full px-4 py-3 text-left border border-blue-300 bg-blue-50 rounded-md hover:bg-blue-100 disabled:opacity-50"
                >
                  <div className="font-medium text-blue-800">Modify Documents</div>
                  <div className="text-sm text-blue-600 mt-1">
                    Unfinalize the current income verification to allow document uploads, deletions, and re-finalization.
                  </div>
                </button>

                <button
                  onClick={() => setShowOverrideForm(true)}
                  disabled={isProcessing}
                  className="w-full px-4 py-3 text-left border border-orange-300 bg-orange-50 rounded-md hover:bg-orange-100 disabled:opacity-50"
                >
                  <div className="font-medium text-orange-800">Request Admin Override</div>
                  <div className="text-sm text-orange-600 mt-1">
                    Submit a request to the admin for manual review of this discrepancy.
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <h4 className="font-medium text-gray-900">Request Admin Override</h4>
              <p className="text-sm text-gray-600">
                Please explain why the verified income should be different from the system's calculation:
              </p>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue"
                placeholder="Explain the reason for this override request..."
              />
              <div className="flex space-x-3">
                <button
                  onClick={handleRequestOverride}
                  disabled={isProcessing || !overrideReason.trim()}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-orange-600 border border-transparent rounded-md shadow-sm hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:bg-gray-400"
                >
                  {isProcessing ? 'Submitting...' : 'Submit Override Request'}
                </button>
                <button
                  onClick={() => setShowOverrideForm(false)}
                  disabled={isProcessing}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue disabled:opacity-50"
                >
                  Back
                </button>
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-between">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue disabled:opacity-50"
            >
              Cancel Upload
            </button>

            {discrepancies.length > 1 && (
              <div className="text-sm text-gray-500">
                More discrepancies will follow...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 