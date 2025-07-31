'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import OverrideRequestModal from './OverrideRequestModal';

// Helper function to format pay frequency for display
const formatPayFrequency = (frequency: string): string => {
  switch (frequency) {
    case 'BI_WEEKLY':
      return 'Bi-Weekly';
    case 'WEEKLY':
      return 'Weekly';
    case 'SEMI_MONTHLY':
      return 'Semi-Monthly';
    case 'MONTHLY':
      return 'Monthly';
    case 'UNKNOWN':
      return 'Unknown';
    default:
      return frequency;
  }
};

interface IncomeDocument {
  id: string;
  documentType: string;
  documentDate: Date;
  uploadDate: Date;
  status: string;
  taxYear?: number;
  employeeName?: string;
  employerName?: string;
  box1_wages?: number;
  box3_ss_wages?: number;
  box5_med_wages?: number;
  residentId?: string;
  calculatedAnnualizedIncome?: number;
  payPeriodStartDate?: string;
  payPeriodEndDate?: string;
  payFrequency?: string;
  grossPayAmount?: number; // Added for PAYSTUB
}

interface IncomeVerification {
  id: string;
  status: string;
  createdAt: string;
  incomeDocuments: IncomeDocument[];
  verificationPeriodStart?: string;
  verificationPeriodEnd?: string;
  dueDate?: string;
  reason?: string;
}

interface Resident {
  id: string;
  name: string;
  annualizedIncome: number;
  verifiedIncome: number | null;
  calculatedAnnualizedIncome?: number | null;
  incomeFinalized?: boolean; // Add this field to track finalization status
}

interface ResidentFinalizationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (calculatedIncome: number) => Promise<void>;
  verification: IncomeVerification;
  resident: Resident;
  leaseName: string;
}

export default function ResidentFinalizationDialog({
  isOpen,
  onClose,
  onConfirm,
  verification,
  resident,
  leaseName,
}: ResidentFinalizationDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showOverrideRequest, setShowOverrideRequest] = useState(false);
  const [manualW2Income, setManualW2Income] = useState<string>('');
  const [showManualW2Entry, setShowManualW2Entry] = useState(false);

  if (!isOpen) return null;

  // Filter documents for this specific resident - include both COMPLETED and NEEDS_REVIEW
  const residentDocuments = verification.incomeDocuments.filter(
    doc => doc.residentId === resident.id && (doc.status === 'COMPLETED' || doc.status === 'NEEDS_REVIEW')
  );

  // Check for W2s that need manual entry (NEEDS_REVIEW with no extracted data)
  const w2DocumentsNeedingManualEntry = residentDocuments.filter(
    doc => doc.documentType === 'W2' && doc.status === 'NEEDS_REVIEW' && !doc.box1_wages
  );

  // Use resident-level calculated income or manual W2 entry
  const manualW2Value = manualW2Income ? parseFloat(manualW2Income) : 0;
  
  // Only show verified income if the resident's income has been finalized
  const residentVerifiedIncome = resident.incomeFinalized 
    ? (resident.calculatedAnnualizedIncome || manualW2Value || 0)
    : 0;
    
  // For validation purposes, check if there's income available to finalize
  // (regardless of whether it's been finalized yet)
  const availableIncomeForFinalization = resident.calculatedAnnualizedIncome || manualW2Value || 0;

  // Enhanced validation logic for this resident
  const paystubs = residentDocuments.filter(doc => doc.documentType === 'PAYSTUB');
  const nonPaystubs = residentDocuments.filter(doc => doc.documentType !== 'PAYSTUB');
  
  let canFinalize = true;
  let validationMessage = '';
  
  if (residentDocuments.length === 0) {
    canFinalize = false;
    validationMessage = `${resident.name} has no income documents.`;
  } else if (w2DocumentsNeedingManualEntry.length > 0 && !manualW2Income) {
    canFinalize = false;
    validationMessage = `W2 data extraction failed. Please enter the annual income manually.`;
  } else if (nonPaystubs.length === 0 && paystubs.length > 0) {
    // Only paystubs - check if sufficient
    const payFrequency = paystubs[0]?.payFrequency;
    
    if (!payFrequency) {
      canFinalize = false;
      validationMessage = `${resident.name} has paystubs but pay frequency could not be determined.`;
    } else {
      const payPeriodDays: Record<string, number> = {
        'BI_WEEKLY': 14,
        'WEEKLY': 7,
        'SEMI_MONTHLY': 15,
        'MONTHLY': 30,
        'UNKNOWN': 14
      };
      const days = payPeriodDays[payFrequency] || 14;
      const requiredStubs = Math.ceil(30 / days);
      
      if (paystubs.length < requiredStubs) {
        canFinalize = false;
        validationMessage = `${resident.name} needs ${requiredStubs - paystubs.length} more paystub${requiredStubs - paystubs.length !== 1 ? 's' : ''} for ${formatPayFrequency(payFrequency).toLowerCase()} pay (${paystubs.length}/${requiredStubs} uploaded).`;
      } else if (!availableIncomeForFinalization || availableIncomeForFinalization <= 0) {
        canFinalize = false;
        validationMessage = `${resident.name}'s income calculation is still being processed.`;
      }
    }
  }

  // Add debugging logs to trace the validation results
  console.log(`[RESIDENT FINALIZATION DIALOG DEBUG] Resident ${resident.id} (${resident.name}):`, {
    incomeFinalized: resident.incomeFinalized,
    calculatedAnnualizedIncome: resident.calculatedAnnualizedIncome,
    annualizedIncome: resident.annualizedIncome,
    manualW2Value: manualW2Value,
    residentVerifiedIncome: residentVerifiedIncome,
    availableIncomeForFinalization: availableIncomeForFinalization,
    documentsCount: residentDocuments.length,
    canFinalize: canFinalize,
    validationMessage: validationMessage,
    whatWillBeDisplayed: resident.incomeFinalized
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(residentVerifiedIncome)
      : "Not Finalized"
  });

  const handleFinalize = async () => {
    if (!canFinalize) return;
    
    setIsSubmitting(true);
    
    // Add comprehensive debugging
    console.log(`[FINALIZATION DEBUG] Starting finalization for resident ${resident.id} (${resident.name})`);
    console.log(`[FINALIZATION DEBUG] Available income for finalization: $${availableIncomeForFinalization}`);
    console.log(`[FINALIZATION DEBUG] Manual W2 value: $${manualW2Value}`);
    console.log(`[FINALIZATION DEBUG] Documents count:`, residentDocuments.length);
    console.log(`[FINALIZATION DEBUG] Can finalize:`, canFinalize);
    console.log(`[FINALIZATION DEBUG] Validation message:`, validationMessage);
    
    try {
      // If we have manual W2 entry, we need to handle it specially
      if (w2DocumentsNeedingManualEntry.length > 0 && manualW2Income) {
        console.log(`[FINALIZATION DEBUG] Using manual W2 income: $${manualW2Value}`);
        await onConfirm(manualW2Value);
      } else {
        console.log(`[FINALIZATION DEBUG] Using calculated income: $${availableIncomeForFinalization}`);
        await onConfirm(availableIncomeForFinalization);
      }
      console.log(`[FINALIZATION DEBUG] Finalization completed successfully`);
    } catch (error) {
      console.error(`[FINALIZATION DEBUG] Finalization failed:`, error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOverrideRequest = async (explanation: string) => {
    try {
      const response = await fetch('/api/override-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'VALIDATION_EXCEPTION',
          userExplanation: explanation,
          residentId: resident.id,
          verificationId: verification.id,
        }),
      });

      if (response.ok) {
        // Show success message or handle success
        alert('Override request submitted successfully. An administrator will review your request.');
      } else {
        throw new Error('Failed to submit override request');
      }
    } catch (error) {
      console.error('Error submitting override request:', error);
      alert('Error submitting override request. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
        <div className="mt-3">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-medium text-gray-900">
              Finalize Income for {resident.name}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Lease Context */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <h4 className="text-md font-semibold text-blue-900 mb-2">Lease: {leaseName}</h4>
            <div className="text-sm text-blue-800">
              <p><strong>Resident:</strong> {resident.name}</p>
              <p><strong>Original Income:</strong> {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(resident.annualizedIncome)}</p>
            </div>
          </div>

          {/* Validation Messages */}
          {!canFinalize && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex">
                <svg className="w-5 h-5 text-red-400 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div>
                  <h4 className="text-red-800 font-medium">Cannot Finalize</h4>
                  <p className="text-red-700 text-sm mt-1">{validationMessage}</p>
                </div>
              </div>
            </div>
          )}

          {/* Document Summary */}
          <div className="mb-6">
            <h4 className="text-md font-semibold text-gray-800 mb-3">Verified Documents</h4>
            {residentDocuments.length > 0 ? (
              <div className="space-y-2">
                {residentDocuments.map(doc => {
                  let verifiedAmount = 0;
                  let displayText = doc.documentType;
                  
                  if (doc.documentType === 'W2') {
                    verifiedAmount = doc.box1_wages || 0;
                    displayText = `${doc.documentType} ${doc.taxYear ? `(${doc.taxYear})` : ''}`;
                  } else if (doc.documentType === 'PAYSTUB') {
                    verifiedAmount = doc.grossPayAmount || 0; // Show actual paystub amount, not annualized
                    if (doc.payPeriodStartDate && doc.payPeriodEndDate) {
                      const startDate = new Date(doc.payPeriodStartDate);
                      const endDate = new Date(doc.payPeriodEndDate);
                      displayText = `${doc.documentType} (${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
                    }
                  } else {
                    verifiedAmount = doc.calculatedAnnualizedIncome || 0;
                  }

                  return (
                    <div key={doc.id} className="flex justify-between items-center p-3 border rounded-lg bg-gray-50">
                      <span className="text-gray-700">
                        {displayText}
                        {doc.employerName && ` - ${doc.employerName}`}
                      </span>
                      <span className="font-medium text-green-600">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(verifiedAmount)}
                      </span>
                    </div>
                  );
                })}
                <div className="border-t pt-3 flex justify-between items-center font-semibold text-lg">
                  <span>Total Annualized Verified Income:</span>
                  <span className={resident.incomeFinalized ? "text-green-600" : "text-blue-600"}>
                    {availableIncomeForFinalization > 0
                      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(availableIncomeForFinalization)
                      : <span className="text-gray-400">No income calculated</span>
                    }
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 italic">No completed documents found for this resident.</p>
            )}
          </div>

          {/* Manual W2 Entry */}
          {w2DocumentsNeedingManualEntry.length > 0 && (
            <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <h4 className="text-md font-semibold text-orange-800 mb-3">Manual W2 Entry Required</h4>
              <p className="text-sm text-orange-700 mb-3">
                The system couldn't automatically extract data from the W2 document. Please enter the annual income (Box 1) manually:
              </p>
              <div className="space-y-2">
                <label htmlFor="manualW2Income" className="block text-sm font-medium text-orange-800">
                  Annual Income (Box 1 Wages)
                </label>
                <input
                  id="manualW2Income"
                  type="number"
                  value={manualW2Income}
                  onChange={(e) => setManualW2Income(e.target.value)}
                  placeholder="Enter annual income amount"
                  className="w-full px-3 py-2 border border-orange-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
                <p className="text-xs text-orange-600">
                  Enter the amount from Box 1 of the W2 form (e.g., 25000 for $25,000)
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
            >
              Cancel
            </button>
            
            {/* Request Override button - only show when validation fails */}
            {!canFinalize && (
              <button
                onClick={() => setShowOverrideRequest(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-md"
              >
                Request Override
              </button>
            )}
            
            <button
              onClick={handleFinalize}
              disabled={isSubmitting || !canFinalize}
              className={`px-4 py-2 text-sm font-medium text-white rounded-md ${
                !isSubmitting && canFinalize
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
              title={!canFinalize ? 'Please resolve the issues above before finalizing' : ''}
            >
              {isSubmitting ? 'Finalizing...' : `Finalize ${resident.name}'s Income`}
            </button>
          </div>
        </div>
      </div>

      {/* Override Request Modal */}
      <OverrideRequestModal
        isOpen={showOverrideRequest}
        onClose={() => setShowOverrideRequest(false)}
        onSubmit={handleOverrideRequest}
        type="VALIDATION_EXCEPTION"
        context={{
          title: `Income Validation Exception for ${resident.name}`,
          description: `Request an exception to the current validation requirements. ${validationMessage}`,
          residentId: resident.id,
          verificationId: verification.id,
        }}
      />
    </div>
  );
} 