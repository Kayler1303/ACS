'use client';

import { useState } from 'react';
import { format } from 'date-fns';

interface FutureLeaseMatch {
  leaseId: string;
  leaseName: string;
  matchType: 'exact' | 'structural' | 'manual_review';
  matchConfidence: number;
  hasVerifiedIncome: boolean;
  masterVerificationId?: string;
}

interface IncomeDiscrepancy {
  residentName: string;
  uploadedIncome: number;
  verifiedIncome: number;
  discrepancy: number;
}

interface ReconciliationData {
  leaseId: string;
  unitNumber: string;
  continuityId: string;
  hasDiscrepancies?: boolean;
  discrepancies?: IncomeDiscrepancy[];
  requiresManualReview?: boolean;
  futureLeaseMatch?: FutureLeaseMatch;
}

interface FutureLeaseReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId: string;
  reconciliationData: ReconciliationData[];
  onReconciliationComplete: () => void;
}

export default function FutureLeaseReconciliationModal({
  isOpen,
  onClose,
  propertyId,
  reconciliationData,
  onReconciliationComplete
}: FutureLeaseReconciliationModalProps) {
  const [processing, setProcessing] = useState(false);
  const [processedLeases, setProcessedLeases] = useState<Set<string>>(new Set());

  if (!isOpen || reconciliationData.length === 0) return null;

  const handleReconciliation = async (
    data: ReconciliationData,
    action: 'accept_future_lease' | 'accept_verified_income' | 'reject_verified_income' | 'reject_future_lease'
  ) => {
    try {
      setProcessing(true);
      
      let endpoint = '';
      let body: any = {
        leaseId: data.leaseId,
        continuityId: data.continuityId,
        action
      };

      if (data.hasDiscrepancies) {
        // Handle income discrepancy reconciliation
        endpoint = `/api/properties/${propertyId}/income-reconciliation`;
        body.structuralContinuityId = data.futureLeaseMatch?.leaseId;
      } else if (data.requiresManualReview) {
        // Handle future lease manual review
        endpoint = `/api/properties/${propertyId}/future-lease-reconciliation`;
        body.futureLeaseId = data.futureLeaseMatch?.leaseId;
        body.masterVerificationId = data.futureLeaseMatch?.masterVerificationId;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error('Failed to process reconciliation');
      }

      const result = await response.json();
      
      // Mark this lease as processed
      setProcessedLeases(prev => new Set([...prev, data.leaseId]));
      
      // Show notification if accepting verified income
      if ((action === 'accept_verified_income' || action === 'accept_future_lease') && result.notification) {
        alert(result.notification);
      }
      
      // Check if all leases have been processed
      if (processedLeases.size + 1 >= reconciliationData.length) {
        onReconciliationComplete();
        onClose();
      }
    } catch (error) {
      console.error('Error processing reconciliation:', error);
      alert('Failed to process reconciliation. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getMatchTypeLabel = (matchType: string) => {
    switch (matchType) {
      case 'exact': return 'Exact Match';
      case 'structural': return 'Structural Match';
      case 'manual_review': return 'Potential Match';
      default: return 'Unknown';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'text-green-600';
    if (confidence >= 0.7) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
              Lease Reconciliation Required
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              disabled={processing}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mb-6">
            <p className="text-gray-700 mb-4">
              We found potential matches between your uploaded data and existing future leases or previously verified income. 
              Please review each unit and choose how to proceed:
            </p>
          </div>

          <div className="space-y-6">
            {reconciliationData.map((data) => (
              <div
                key={data.leaseId}
                className={`border rounded-lg p-6 ${
                  processedLeases.has(data.leaseId)
                    ? 'bg-green-50 border-green-200'
                    : 'bg-white border-gray-200'
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Unit {data.unitNumber}
                  </h3>
                  {processedLeases.has(data.leaseId) && (
                    <span className="bg-green-100 text-green-800 text-sm font-medium px-2.5 py-0.5 rounded">
                      Processed
                    </span>
                  )}
                </div>

                {/* Future Lease Match Info */}
                {data.futureLeaseMatch && (
                  <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
                    <h4 className="font-medium text-blue-900 mb-2">Future Lease Match Found</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-blue-700">Future Lease:</span>
                        <div className="font-medium">{data.futureLeaseMatch.leaseName}</div>
                      </div>
                      <div>
                        <span className="text-blue-700">Match Type:</span>
                        <div className="font-medium">{getMatchTypeLabel(data.futureLeaseMatch.matchType)}</div>
                      </div>
                      <div>
                        <span className="text-blue-700">Confidence:</span>
                        <div className={`font-medium ${getConfidenceColor(data.futureLeaseMatch.matchConfidence)}`}>
                          {Math.round(data.futureLeaseMatch.matchConfidence * 100)}%
                        </div>
                      </div>
                      <div>
                        <span className="text-blue-700">Has Verified Income:</span>
                        <div className="font-medium">
                          {data.futureLeaseMatch.hasVerifiedIncome ? 'Yes' : 'No'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Income Discrepancies */}
                {data.hasDiscrepancies && data.discrepancies && (
                  <div className="space-y-3 mb-6">
                    <h4 className="font-medium text-gray-900">Income Discrepancies:</h4>
                    {data.discrepancies.map((discrepancy, index) => (
                      <div key={index} className="bg-gray-50 p-4 rounded-md">
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-gray-900">
                            {discrepancy.residentName}
                          </span>
                          <span className="text-sm text-red-600 font-medium">
                            Discrepancy: {formatCurrency(discrepancy.discrepancy)}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">Uploaded Income:</span>
                            <div className="font-medium">{formatCurrency(discrepancy.uploadedIncome)}</div>
                          </div>
                          <div>
                            <span className="text-gray-600">Previously Verified:</span>
                            <div className="font-medium text-green-600">{formatCurrency(discrepancy.verifiedIncome)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Action Buttons */}
                {!processedLeases.has(data.leaseId) && (
                  <div className="space-y-3">
                    {data.hasDiscrepancies ? (
                      // Income discrepancy actions
                      <div className="flex space-x-4">
                        <button
                          onClick={() => handleReconciliation(data, 'accept_verified_income')}
                          disabled={processing}
                          className="flex-1 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Accept Previously Verified Income
                        </button>
                        <button
                          onClick={() => handleReconciliation(data, 'reject_verified_income')}
                          disabled={processing}
                          className="flex-1 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Reject & Start New Verification
                        </button>
                      </div>
                    ) : data.requiresManualReview ? (
                      // Manual review actions
                      <div className="flex space-x-4">
                        <button
                          onClick={() => handleReconciliation(data, 'accept_future_lease')}
                          disabled={processing}
                          className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Yes, This is the Same Lease
                        </button>
                        <button
                          onClick={() => handleReconciliation(data, 'reject_future_lease')}
                          disabled={processing}
                          className="flex-1 bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          No, This is Different
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">
                  How to Choose
                </h3>
                <div className="mt-2 text-sm text-blue-700">
                  <p>
                    <strong>Accept/Yes:</strong> If this current lease is the same as the future lease you previously verified, 
                    all income documents and verification status will be transferred automatically.
                  </p>
                  <p className="mt-1">
                    <strong>Reject/No:</strong> If this is a different lease or the income has changed, 
                    you'll need to start a new verification process.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 