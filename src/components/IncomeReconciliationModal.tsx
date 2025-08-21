'use client';

import { useState } from 'react';
import { format } from 'date-fns';

interface IncomeDiscrepancy {
  residentName: string;
  uploadedIncome: number;
  verifiedIncome: number;
  discrepancy: number;
}

interface DiscrepancyData {
  leaseId: string;
  unitNumber: string;
  continuityId: string;
  structuralContinuityId: string;
  discrepancies: IncomeDiscrepancy[];
}

interface IncomeReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId: string;
  discrepancies: DiscrepancyData[];
  onReconciliationComplete: () => void;
}

export default function IncomeReconciliationModal({
  isOpen,
  onClose,
  propertyId,
  discrepancies,
  onReconciliationComplete
}: IncomeReconciliationModalProps) {
  const [processing, setProcessing] = useState(false);
  const [processedLeases, setProcessedLeases] = useState<Set<string>>(new Set());

  if (!isOpen || discrepancies.length === 0) return null;

  const handleReconciliation = async (
    discrepancyData: DiscrepancyData,
    action: 'accept_verified_income' | 'reject_verified_income'
  ) => {
    try {
      setProcessing(true);
      
      const response = await fetch(`/api/properties/${propertyId}/income-reconciliation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leaseId: discrepancyData.leaseId,
          continuityId: discrepancyData.continuityId,
          structuralContinuityId: discrepancyData.structuralContinuityId,
          action
        })
      });

      if (!response.ok) {
        throw new Error('Failed to process reconciliation');
      }

      const result = await response.json();
      
      // Mark this lease as processed
      setProcessedLeases(prev => new Set([...prev, discrepancyData.leaseId]));
      
      // Show notification if accepting verified income
      if (action === 'accept_verified_income' && result.notification) {
        alert(result.notification);
      }
      
      // Check if all leases have been processed
      if (processedLeases.size + 1 >= discrepancies.length) {
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
              Income Reconciliation Required
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
              We found income discrepancies between your uploaded data and previously verified income documents. 
              Please review each unit and choose how to proceed:
            </p>
          </div>

          <div className="space-y-6">
            {discrepancies.map((discrepancyData) => (
              <div
                key={discrepancyData.leaseId}
                className={`border rounded-lg p-6 ${
                  processedLeases.has(discrepancyData.leaseId)
                    ? 'bg-green-50 border-green-200'
                    : 'bg-white border-gray-200'
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Unit {discrepancyData.unitNumber}
                  </h3>
                  {processedLeases.has(discrepancyData.leaseId) && (
                    <span className="bg-green-100 text-green-800 text-sm font-medium px-2.5 py-0.5 rounded">
                      Processed
                    </span>
                  )}
                </div>

                <div className="space-y-3 mb-6">
                  {discrepancyData.discrepancies.map((discrepancy, index) => (
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

                {!processedLeases.has(discrepancyData.leaseId) && (
                  <div className="flex space-x-4">
                    <button
                      onClick={() => handleReconciliation(discrepancyData, 'accept_verified_income')}
                      disabled={processing}
                      className="flex-1 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Accept Previously Verified Income
                    </button>
                    <button
                      onClick={() => handleReconciliation(discrepancyData, 'reject_verified_income')}
                      disabled={processing}
                      className="flex-1 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Reject & Start New Verification
                    </button>
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
                  Recommendation
                </h3>
                <div className="mt-2 text-sm text-blue-700">
                  <p>
                    <strong>Accept Previously Verified Income</strong> if the discrepancy is due to rounding or data entry differences in your property management system.
                  </p>
                  <p className="mt-1">
                    <strong>Reject & Start New Verification</strong> if the resident's income has actually changed since the last verification.
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