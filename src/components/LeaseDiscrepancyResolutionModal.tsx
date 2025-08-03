'use client';

import { useState } from 'react';

interface Resident {
  id: string;
  name: string;
  annualizedIncome: number;
  verifiedIncome: number | null;
  calculatedAnnualizedIncome?: number;
  incomeFinalized?: boolean;
  finalizedAt?: string;
}

interface IncomeVerification {
  id: string;
  status: string;
  leaseId?: string;
}

interface Lease {
  id: string;
  name: string;
  Resident: Resident[];
}

interface LeaseDiscrepancyResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  lease: Lease;
  verification: IncomeVerification;
  residentsWithDiscrepancies: Resident[];
  onResolved: () => void;
}

export default function LeaseDiscrepancyResolutionModal({
  isOpen,
  onClose,
  lease,
  verification,
  residentsWithDiscrepancies,
  onResolved
}: LeaseDiscrepancyResolutionModalProps) {
  const [currentResidentIndex, setCurrentResidentIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [showOverrideForm, setShowOverrideForm] = useState(false);

  if (!isOpen || residentsWithDiscrepancies.length === 0) return null;

  const currentResident = residentsWithDiscrepancies[currentResidentIndex];
  const isLastResident = currentResidentIndex === residentsWithDiscrepancies.length - 1;
  
  const rentRollIncome = currentResident.annualizedIncome || 0;
  const verifiedIncome = currentResident.calculatedAnnualizedIncome || 0;
  const discrepancy = Math.abs(rentRollIncome - verifiedIncome);
  const verifiedIsHigher = verifiedIncome > rentRollIncome;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const moveToNextResidentOrClose = () => {
    if (isLastResident) {
      // All discrepancies resolved - close modal and trigger refresh
      onClose();
      setTimeout(() => {
        onResolved();
      }, 100); // Small delay to ensure modal closes before refresh
    } else {
      setCurrentResidentIndex(currentResidentIndex + 1);
      setShowOverrideForm(false);
      setOverrideReason('');
    }
  };

  const handleAcceptVerifiedIncome = async () => {
    setIsProcessing(true);
    console.log(`[DISCREPANCY MODAL] Accepting verified income for ${currentResident.name}: $${verifiedIncome.toFixed(2)}`);
    
    try {
      const response = await fetch(`/api/leases/${lease.id}/residents/${currentResident.id}/accept-verified-income`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verifiedIncome: verifiedIncome
        })
      });

      if (!response.ok) {
        throw new Error('Failed to accept verified income');
      }

      const result = await response.json();
      console.log(`[DISCREPANCY MODAL] Successfully accepted verified income for ${currentResident.name}:`, result);
      
      moveToNextResidentOrClose();
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
      const response = await fetch(`/api/leases/${lease.id}/verifications/${verification.id}/residents/${currentResident.id}/unfinalize`, {
        method: 'PATCH'
      });

      if (!response.ok) {
        throw new Error('Failed to unfinalize resident');
      }

      moveToNextResidentOrClose();
    } catch (error) {
      console.error('Error unfinalizing resident:', error);
      alert('Failed to unfinalize resident. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRequestOverride = async () => {
    if (!overrideReason.trim()) {
      alert('Please provide an explanation for the override request.');
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch('/api/override-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'INCOME_DISCREPANCY',
          userExplanation: overrideReason,
          leaseId: lease.id,
          residentId: currentResident.id,
          verificationId: verification.id,
          contextualData: {
            rentRollIncome,
            verifiedIncome,
            discrepancy
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to submit override request');
      }

      moveToNextResidentOrClose();
    } catch (error) {
      console.error('Error submitting override request:', error);
      alert('Failed to submit override request. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-2xl shadow-lg rounded-md bg-white">
        <div className="mt-3">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-gray-900">
              Resolve Income Discrepancies
            </h3>
            <div className="text-sm text-gray-500">
              {currentResidentIndex + 1} of {residentsWithDiscrepancies.length}
            </div>
          </div>

          {/* Current Discrepancy Info */}
          <div className="mb-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="text-lg font-semibold text-gray-900 mb-2">
                Income Discrepancy: {currentResident.name}
              </h4>
              <p className="text-sm text-gray-600 mb-3">
                There's a ${discrepancy.toFixed(2)} difference between the rent roll income and verified income for this resident.
              </p>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-700">Rent Roll Income:</span>
                  <div className="text-lg font-semibold text-blue-600">{formatCurrency(rentRollIncome)}</div>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Verified Income:</span>
                  <div className="text-lg font-semibold text-green-600">{formatCurrency(verifiedIncome)}</div>
                </div>
              </div>
              
              <div className="mt-3 p-3 bg-white rounded border">
                <p className="text-xs text-gray-600">
                  <strong>Difference:</strong> {formatCurrency(discrepancy)} 
                  {verifiedIsHigher ? ' (Verified income is higher)' : ' (Rent roll income is higher)'}
                </p>
              </div>
            </div>
          </div>

          {!showOverrideForm ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 mb-4">
                How would you like to resolve this discrepancy for {currentResident.name}?
              </p>

              <div className="space-y-3">
                <button
                  onClick={handleAcceptVerifiedIncome}
                  disabled={isProcessing}
                  className="w-full px-4 py-3 text-left border border-green-300 bg-green-50 rounded-md hover:bg-green-100 disabled:opacity-50"
                >
                  <div className="font-medium text-green-800">Accept Verified Income</div>
                  <div className="text-sm text-green-600 mt-1">
                    Update {currentResident.name}'s income to match the verified amount ({formatCurrency(verifiedIncome)}).
                    <div className="font-medium text-amber-600 mt-1">
                      ⚠️ Remember to update this in your property management system to prevent future mismatches.
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
                    Unfinalize {currentResident.name}'s income verification to allow document changes.
                  </div>
                </button>

                <button
                  onClick={() => setShowOverrideForm(true)}
                  disabled={isProcessing}
                  className="w-full px-4 py-3 text-left border border-orange-300 bg-orange-50 rounded-md hover:bg-orange-100 disabled:opacity-50"
                >
                  <div className="font-medium text-orange-800">Request Administrative Override</div>
                  <div className="text-sm text-orange-600 mt-1">
                    Submit this discrepancy to an administrator for review and approval.
                  </div>
                </button>
              </div>

              <div className="mt-6 flex justify-between">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                {!isLastResident && (
                  <button
                    onClick={() => moveToNextResidentOrClose()}
                    className="px-4 py-2 text-blue-600 border border-blue-300 rounded-md hover:bg-blue-50"
                  >
                    Skip This Resident
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <h4 className="font-medium text-orange-800 mb-3">Request Administrative Override</h4>
                <p className="text-sm text-orange-600 mb-4">
                  Please explain why this income discrepancy should be overridden. An administrator will review your request.
                </p>
                
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Explanation for Override Request:
                </label>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  placeholder="Explain why this discrepancy exists and why it should be approved..."
                />
              </div>

              <div className="flex justify-between">
                <button
                  onClick={() => setShowOverrideForm(false)}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={handleRequestOverride}
                  disabled={isProcessing || !overrideReason.trim()}
                  className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50"
                >
                  {isProcessing ? 'Submitting...' : 'Submit Override Request'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 