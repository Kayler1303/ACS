'use client';

import { useState } from 'react';
import { format } from 'date-fns';

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
  box3_ss_wages?: number; // Added for W2
  box5_med_wages?: number; // Added for W2
  grossPayAmount?: number; // Added for PAYSTUB
  residentId?: string;
  calculatedAnnualizedIncome?: number; // Added for PAYSTUB
  payPeriodStartDate?: string; // Added for PAYSTUB
  payPeriodEndDate?: string; // Added for PAYSTUB
  payFrequency?: string; // Added for PAYSTUB
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
  calculatedAnnualizedIncome?: number; // Phase 2: Add resident-level calculated income
  incomeFinalized?: boolean;
  finalizedAt?: string | null;
}

interface VerificationFinalizationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (calculatedIncome: number) => Promise<void>;
  verification: IncomeVerification;
  residents: Resident[];
}

export default function VerificationFinalizationDialog({
  isOpen,
  onClose,
  onConfirm,
  verification,
  residents,
}: VerificationFinalizationDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  // Calculate total verified income from completed documents (Phase 2: Check status only)
  const completedDocuments = verification.incomeDocuments.filter(
    doc => doc.status === 'COMPLETED'
  );

  // Helper function to calculate verified income correctly for different document types
  const calculateVerifiedIncome = (documents: IncomeDocument[]) => {
    const w2Documents = documents.filter(doc => doc.documentType === 'W2');
    const paystubDocuments = documents.filter(doc => doc.documentType === 'PAYSTUB');
    const otherDocuments = documents.filter(doc => doc.documentType !== 'W2' && doc.documentType !== 'PAYSTUB');

    // Calculate W2 income - take highest of boxes 1, 3, 5
    const w2Income = w2Documents.reduce((sum, doc) => {
      const box1 = doc.box1_wages || 0;
      const box3 = doc.box3_ss_wages || 0;
      const box5 = doc.box5_med_wages || 0;
      const highestAmount = Math.max(box1, box3, box5);
      return sum + highestAmount;
    }, 0);
    
    // Calculate paystub income - average gross pay then annualize based on frequency
    let paystubIncome = 0;
    if (paystubDocuments.length > 0) {
      // Average the gross pay amounts
      const totalGrossPay = paystubDocuments.reduce((sum, doc) => sum + (doc.grossPayAmount || 0), 0);
      const averageGrossPay = totalGrossPay / paystubDocuments.length;
      
      // Get pay frequency from any paystub (should be the same for all from same resident)
      const payFrequency = paystubDocuments[0]?.payFrequency || 'BI-WEEKLY';
      
      // Convert to annual based on frequency
      const frequencyMultipliers: { [key: string]: number } = {
        'WEEKLY': 52,
        'BI-WEEKLY': 26,
        'SEMI-MONTHLY': 24, // Twice a month
        'MONTHLY': 12,
        'YEARLY': 1
      };
      
      const multiplier = frequencyMultipliers[payFrequency] || 26; // Default to bi-weekly
      paystubIncome = averageGrossPay * multiplier;
    }
    
    // Sum other document types (use existing calculatedAnnualizedIncome)
    const otherIncome = otherDocuments.reduce((sum, doc) => sum + (doc.calculatedAnnualizedIncome || 0), 0);

    return w2Income + paystubIncome + otherIncome;
  };

  // Calculate total verified income (Only include finalized residents)
  const totalVerifiedIncome = residents.reduce((sum, resident) => {
    if (resident.incomeFinalized) {
      return sum + (resident.calculatedAnnualizedIncome || 0);
    }
    return sum;
  }, 0);

  // Group documents by resident (Phase 2: Use resident-level calculated income)
  const documentsByResident = residents.map(resident => {
    const residentDocs = completedDocuments.filter(doc => doc.residentId === resident.id);
    
    // Only show verified income if the resident's income has been finalized
    const residentVerifiedIncome = resident.incomeFinalized 
      ? (resident.calculatedAnnualizedIncome || calculateVerifiedIncome(residentDocs))
      : 0;
    
    console.log(`[VERIFICATION DIALOG DEBUG] Resident ${resident.id} (${resident.name}):`, {
      incomeFinalized: resident.incomeFinalized,
      calculatedAnnualizedIncome: resident.calculatedAnnualizedIncome,
      annualizedIncome: resident.annualizedIncome,
      documentsCount: residentDocs.length,
      documentIds: residentDocs.map(d => d.id),
      calculatedVerifiedIncome: residentVerifiedIncome,
      shouldShowVerifiedIncome: resident.incomeFinalized,
      whatWillBeDisplayed: resident.incomeFinalized 
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(residentVerifiedIncome)
        : "Not Finalized"
    });
    
    return {
      resident,
      documents: residentDocs,
      verifiedIncome: residentVerifiedIncome
    };
  });

  // Enhanced validation logic for sufficient documents
  const validationResults = residents.map(resident => {
    const residentDocs = completedDocuments.filter(doc => doc.residentId === resident.id);
    
    if (residentDocs.length === 0) {
      return {
        resident,
        isValid: false,
        message: `${resident.name} has no completed income documents.`
      };
    }

    // Check if resident has only paystubs
    const paystubs = residentDocs.filter(doc => doc.documentType === 'PAYSTUB');
    const nonPaystubs = residentDocs.filter(doc => doc.documentType !== 'PAYSTUB');
    
    // If they have non-paystub documents (W2, etc.), they're good
    if (nonPaystubs.length > 0) {
      return {
        resident,
        isValid: true,
        message: null
      };
    }
    
    // If they only have paystubs, check if there are enough
    if (paystubs.length > 0) {
      const payFrequency = paystubs[0]?.payFrequency;
      
      if (!payFrequency) {
        return {
          resident,
          isValid: false,
          message: `${resident.name} has paystubs but pay frequency could not be determined.`
        };
      }
      
      // Calculate required paystubs based on pay frequency (same logic as status indicator)
      const requiredStubsMap: Record<string, number> = {
        'BI_WEEKLY': 2,   // Updated: reduced from 3 to 2
        'WEEKLY': 4,      // Updated: reduced from 5 to 4
        'SEMI_MONTHLY': 2, // Math.ceil(30 / 15) = 2
        'MONTHLY': 1,     // Math.ceil(30 / 30) = 1
        'UNKNOWN': 2      // Default to bi-weekly equivalent
      };
      const requiredStubs = requiredStubsMap[payFrequency] || 2;
      
      if (paystubs.length < requiredStubs) {
        return {
          resident,
          isValid: false,
          message: `${resident.name} needs ${requiredStubs - paystubs.length} more paystub${requiredStubs - paystubs.length !== 1 ? 's' : ''} for ${formatPayFrequency(payFrequency).toLowerCase()} pay (${paystubs.length}/${requiredStubs} uploaded).`
        };
      }
      
      // Phase 2: Remove document-level calculatedAnnualizedIncome check
      // If we have the required number of completed paystubs, we can proceed
      // (The resident-level income calculation is handled separately)
    }
    
    return {
      resident,
      isValid: true,
      message: null
    };
  });

  // Check if verification is ready to finalize
  const hasCompletedDocuments = completedDocuments.length > 0;
  const allResidentsValid = validationResults.every(result => result.isValid);
  const invalidResidents = validationResults.filter(result => !result.isValid);
  
  const canFinalize = hasCompletedDocuments && allResidentsValid;

  const handleFinalize = async () => {
    // Only allow finalization when all validation passes
    if (!canFinalize) return;
    
    setIsSubmitting(true);
    try {
      await onConfirm(totalVerifiedIncome);
    } catch (error) {
      console.error('Failed to finalize verification:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-full max-w-4xl shadow-lg rounded-md bg-white">
        <div className="mt-3">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-medium text-gray-900">
              Finalize Income Verification
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

          {/* Verification Summary */}
          <div className="mb-6">
            <h4 className="text-md font-semibold text-gray-800 mb-3">Verification Period Summary</h4>
            <div className="bg-gray-50 p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Period:</span>
                <span className="font-medium">
                  {verification.verificationPeriodStart && verification.verificationPeriodEnd ? 
                    `${format(new Date(verification.verificationPeriodStart), 'MMM d, yyyy')} - ${format(new Date(verification.verificationPeriodEnd), 'MMM d, yyyy')}` :
                    'N/A'
                  }
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Reason:</span>
                <span className="font-medium capitalize">
                  {verification.reason?.replace('_', ' ').toLowerCase() || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Started:</span>
                <span className="font-medium">
                  {format(new Date(verification.createdAt), 'MMM d, yyyy')}
                </span>
              </div>
              {verification.dueDate && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Due Date:</span>
                  <span className="font-medium text-red-600">
                    {format(new Date(verification.dueDate), 'MMM d, yyyy')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Document Summary by Resident */}
          <div className="mb-6">
            <h4 className="text-md font-semibold text-gray-800 mb-3">Verified Income by Resident</h4>
            <div className="space-y-4">
              {documentsByResident.map(({ resident, documents, verifiedIncome }) => {
                // Find validation result for this resident
                const validationResult = validationResults.find(result => result.resident.id === resident.id);
                
                return (
                <div key={resident.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center space-x-2">
                      <h5 className="font-medium text-gray-900">{resident.name}</h5>
                      {validationResult && (
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          validationResult.isValid 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {validationResult.isValid ? '✓ Ready' : '⚠ Insufficient'}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-500">Original Income</div>
                      <div className="font-medium">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(resident.annualizedIncome)}
                      </div>
                    </div>
                  </div>
                  
                  {/* Show validation message for invalid residents */}
                  {validationResult && !validationResult.isValid && (
                    <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                      {validationResult.message}
                    </div>
                  )}
                  
                  {documents.length > 0 ? (
                    <div className="space-y-2">
                      {documents.map(doc => {
                        // Calculate the verified income amount based on document type
                        let verifiedAmount = 0;
                        let displayText = doc.documentType;
                        
                        if (doc.documentType === 'W2') {
                          verifiedAmount = doc.box1_wages || 0;
                          displayText = `${doc.documentType} ${doc.taxYear ? `(${doc.taxYear})` : ''}`;
                        } else if (doc.documentType === 'PAYSTUB') {
                          verifiedAmount = doc.calculatedAnnualizedIncome || 0;
                          if (doc.payPeriodStartDate && doc.payPeriodEndDate) {
                            const startDate = new Date(doc.payPeriodStartDate);
                            const endDate = new Date(doc.payPeriodEndDate);
                            displayText = `${doc.documentType} (${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
                          }
                        }

                        return (
                          <div key={doc.id} className="flex justify-between items-center text-sm">
                            <span className="text-gray-600">
                              {displayText}
                              {doc.employerName && ` - ${doc.employerName}`}
                            </span>
                            <span className="font-medium text-green-600">
                              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(verifiedAmount)}
                            </span>
                          </div>
                        );
                      })}
                      <div className="border-t pt-2 flex justify-between items-center font-semibold">
                        <span>Verified Income:</span>
                        <span className={resident.incomeFinalized ? "text-green-600" : "text-gray-400"}>
                          {resident.incomeFinalized 
                            ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(verifiedIncome)
                            : "Not Finalized"
                          }
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-red-600 italic">
                      No completed documents for this resident
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          </div>

          {/* Total Summary */}
          <div className="mb-6 bg-blue-50 p-4 rounded-lg">
            <div className="flex justify-between items-center text-lg font-semibold">
              <span>Total Household Verified Income:</span>
              <span className="text-green-600">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalVerifiedIncome)}
              </span>
            </div>
          </div>

          {/* Warnings */}
          {!allResidentsValid && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex">
                <svg className="w-5 h-5 text-yellow-400 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <h4 className="text-yellow-800 font-medium">Insufficient Documentation</h4>
                  <div className="text-yellow-700 text-sm space-y-1 mt-1">
                    {invalidResidents.map(result => (
                      <p key={result.resident.id}>• {result.message}</p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!hasCompletedDocuments && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex">
                <svg className="w-5 h-5 text-red-400 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div>
                  <h4 className="text-red-800 font-medium">No Completed Documents</h4>
                  <p className="text-red-700 text-sm">
                    No completed income documents found. Cannot finalize verification without verified income data.
                  </p>
                </div>
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
              {isSubmitting ? 'Finalizing...' : 'Finalize Verification'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 