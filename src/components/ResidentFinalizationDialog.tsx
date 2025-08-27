'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import OverrideRequestModal from './OverrideRequestModal';
import IndividualIncomeDiscrepancyModal from './IndividualIncomeDiscrepancyModal';

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
  IncomeDocument: IncomeDocument[];
  verificationPeriodStart?: string;
  verificationPeriodEnd?: string;
  dueDate?: string;
  reason?: string;
  leaseId?: string; // Added leaseId to the interface
}

interface Resident {
  id: string;
  name: string;
  annualizedIncome: number;
  verifiedIncome: number | null;
  calculatedAnnualizedIncome?: number | null;
  incomeFinalized?: boolean; // Add this field to track finalization status
  finalizedAt?: string; // Add this field to store the date of finalization
}

interface ResidentFinalizationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (calculatedIncome: number) => Promise<void>;
  verification: IncomeVerification;
  resident: Resident;
  leaseName: string;
  onDataRefresh?: () => void; // Add callback to refresh parent data
}

export default function ResidentFinalizationDialog({
  isOpen,
  onClose,
  onConfirm,
  verification,
  resident,
  leaseName,
  onDataRefresh,
}: ResidentFinalizationDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showOverrideRequest, setShowOverrideRequest] = useState(false);
  const [overrideRequested, setOverrideRequested] = useState(false);
  // Document review modal state (for requesting admin review of a specific document)
  const [docReviewModal, setDocReviewModal] = useState<{
    isOpen: boolean;
    documentId: string | null;
    title: string;
    description: string;
  }>({ isOpen: false, documentId: null, title: '', description: '' });
  const [manualW2Income, setManualW2Income] = useState<string>('');
  const [showManualW2Entry, setShowManualW2Entry] = useState(false);
  const [showDiscrepancyModal, setShowDiscrepancyModal] = useState(false);
  const [discrepancyData, setDiscrepancyData] = useState<{
    rentRollIncome: number;
    calculatedIncome: number;
    difference: number;
  } | null>(null);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [notificationAmount, setNotificationAmount] = useState<number>(0);

  if (!isOpen) return null;

  // Filter documents for this specific resident - include both COMPLETED and NEEDS_REVIEW
  const residentDocuments = verification.IncomeDocument.filter(
    (doc: IncomeDocument) => doc.residentId === resident.id && (doc.status === 'COMPLETED' || doc.status === 'NEEDS_REVIEW')
  );

  // Check for W2s that need manual entry (NEEDS_REVIEW with no extracted data)
  const w2DocumentsNeedingManualEntry = residentDocuments.filter(
    (doc: IncomeDocument) => doc.documentType === 'W2' && doc.status === 'NEEDS_REVIEW' && !doc.box1_wages
  );

  // Use resident-level calculated income or manual W2 entry
  const manualW2Value = manualW2Income ? parseFloat(manualW2Income) : 0;
  
  // Calculate income from documents in real-time (FIXED: Don't rely on potentially-null resident.calculatedAnnualizedIncome)
  const calculateIncomeFromDocuments = () => {
    let totalIncome = 0;
    
    console.log(`[DEBUG] ${resident.name} - Starting income calculation`);
    console.log(`[DEBUG] Total documents for ${resident.name}:`, residentDocuments.length);
    console.log(`[DEBUG] Documents:`, residentDocuments.map(doc => ({
      id: doc.id,
      type: doc.documentType,
      status: doc.status,
      grossPayAmount: doc.grossPayAmount,
      grossPayAmountType: typeof doc.grossPayAmount,
      payFrequency: doc.payFrequency
    })));
    
    // Process W2 documents
    const w2Documents = residentDocuments.filter(doc => doc.documentType === 'W2' && doc.status === 'COMPLETED');
    console.log(`[DEBUG] W2 documents found:`, w2Documents.length);
    
    w2Documents.forEach(doc => {
      const amounts = [doc.box1_wages, doc.box3_ss_wages, doc.box5_med_wages]
        .map(amount => amount ? Number(amount) : 0)
        .filter((amount): amount is number => amount !== null && amount !== undefined && amount > 0);
      if (amounts.length > 0) {
        totalIncome += Math.max(...amounts);
      }
    });
    
    // Process paystub documents - average and annualize (include any status with extracted data)
    const paystubDocuments = residentDocuments.filter(doc => 
      doc.documentType === 'PAYSTUB' && doc.grossPayAmount && doc.grossPayAmount > 0
    );
    console.log(`[DEBUG] Paystub documents found:`, paystubDocuments.length);
    console.log(`[DEBUG] Paystub filter details:`, residentDocuments.map(doc => ({
      id: doc.id,
      type: doc.documentType,
      grossPayAmount: doc.grossPayAmount,
      passes: doc.documentType === 'PAYSTUB' && doc.grossPayAmount && doc.grossPayAmount > 0
    })));
    
    if (paystubDocuments.length > 0) {
      // Calculate total gross pay from all paystubs (with proper Number conversion)
      const totalGrossPay = paystubDocuments.reduce((sum, doc) => sum + (Number(doc.grossPayAmount) || 0), 0);
      const averageGrossPay = totalGrossPay / paystubDocuments.length;
      
      // Get pay frequency (should be consistent across paystubs)
      const payFrequency = paystubDocuments[0]?.payFrequency || 'BI-WEEKLY';
      const frequencyMultipliers: Record<string, number> = {
        'WEEKLY': 52,
        'BI-WEEKLY': 26,
        'SEMI-MONTHLY': 24,
        'MONTHLY': 12,
        'YEARLY': 1
      };
      
      const multiplier = frequencyMultipliers[payFrequency] || 26;
      const paystubIncome = averageGrossPay * multiplier;
      
      totalIncome += paystubIncome;
      
      console.log(`[REAL-TIME CALC] ${resident.name} paystub calculation:`, {
        paystubCount: paystubDocuments.length,
        totalGrossPay,
        averageGrossPay,
        payFrequency,
        multiplier,
        paystubIncome
      });
    }
    
    // Process Social Security documents
    const socialSecurityDocuments = residentDocuments.filter(doc => 
      doc.documentType === 'SOCIAL_SECURITY' && doc.status === 'COMPLETED'
    );
    console.log(`[DEBUG] Social Security documents found:`, socialSecurityDocuments.length);
    
    socialSecurityDocuments.forEach(doc => {
      // For Social Security, use calculatedAnnualizedIncome if available, otherwise annualize grossPayAmount
      const annualIncome = doc.calculatedAnnualizedIncome || (doc.grossPayAmount ? Number(doc.grossPayAmount) * 12 : 0);
      totalIncome += annualIncome;
      
      console.log(`[REAL-TIME CALC] ${resident.name} Social Security calculation:`, {
        documentId: doc.id,
        calculatedAnnualizedIncome: doc.calculatedAnnualizedIncome,
        grossPayAmount: doc.grossPayAmount,
        annualIncome
      });
    });
    
    console.log(`[REAL-TIME CALC] ${resident.name} total calculated income: $${totalIncome}`);
    return totalIncome;
  };
  
  // Calculate available income for finalization - prioritize real-time calculation when documents exist
  const calculatedIncomeFromDocs = calculateIncomeFromDocuments();
  const availableIncomeForFinalization = calculatedIncomeFromDocs || resident.calculatedAnnualizedIncome || manualW2Value || 0;
  
  // Calculate verified income display - show calculated income from stored value or real-time calculation
  const residentVerifiedIncome = resident.incomeFinalized 
    ? (resident.calculatedAnnualizedIncome || calculatedIncomeFromDocs || manualW2Value || 0)
    : (resident.calculatedAnnualizedIncome || calculatedIncomeFromDocs || manualW2Value || 0);

  // Calculate total number of documents uploaded
  const completedDocumentsCount = residentDocuments.filter((doc: IncomeDocument) => doc.status === 'COMPLETED').length;
  const hasDocuments = completedDocumentsCount > 0;
  
  // Validation logic for finalization
  let canFinalize = false;
  let validationMessage = '';
  
  if (resident.incomeFinalized) {
    // Already finalized - show unfinalize option
    canFinalize = false; // We'll show unfinalize button instead
    validationMessage = 'Income has been finalized';
  } else if (!hasDocuments && !w2DocumentsNeedingManualEntry.length) {
    canFinalize = false;
    validationMessage = 'No income documents uploaded yet';
  } else {
    // Check paystub count requirements (same logic as VerificationFinalizationDialog)
    const paystubs = residentDocuments.filter((doc: IncomeDocument) => 
      doc.documentType === 'PAYSTUB' && doc.status === 'COMPLETED'
    );
    
    if (paystubs.length > 0) {
      const payFrequency = paystubs[0]?.payFrequency;
      
      if (payFrequency) {
        // Calculate required paystubs based on pay frequency
        const requiredStubsMap: Record<string, number> = {
          'BI-WEEKLY': 2,   // Updated: reduced from 3 to 2
          'WEEKLY': 4,      // Updated: reduced from 5 to 4
          'SEMI-MONTHLY': 2, // Math.ceil(30 / 15) = 2
          'MONTHLY': 1,     // Math.ceil(30 / 30) = 1
          'UNKNOWN': 2      // Default to bi-weekly equivalent
        };
        const requiredStubs = requiredStubsMap[payFrequency] || 2;
        
        if (paystubs.length < requiredStubs) {
          canFinalize = false;
          validationMessage = `Need ${requiredStubs - paystubs.length} more paystub${requiredStubs - paystubs.length !== 1 ? 's' : ''} for ${payFrequency.toLowerCase().replace('_', '-')} pay (${paystubs.length}/${requiredStubs} uploaded)`;
        } else {
          canFinalize = true;
          validationMessage = 'Ready to finalize';
        }
      } else {
        canFinalize = false;
        validationMessage = 'Pay frequency could not be determined from paystubs';
      }
    } else {
      // No paystubs, might be W2 or other document type
      canFinalize = true;
      validationMessage = 'Ready to finalize';
    }
  }

  console.log(`[FINALIZATION DIALOG DEBUG] Resident ${resident.id} (${resident.name}):`, {
    incomeFinalized: resident.incomeFinalized,
    storedCalculatedAnnualizedIncome: resident.calculatedAnnualizedIncome,
    storedAnnualizedIncome: resident.annualizedIncome, // rent roll income
    realTimeCalculatedIncome: calculatedIncomeFromDocs,
    availableIncomeForFinalization: availableIncomeForFinalization,
    residentDocumentsCount: residentDocuments.length,
    shouldShowVerifiedIncome: resident.incomeFinalized,
    whatWillBeDisplayed: resident.incomeFinalized 
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(residentVerifiedIncome)
      : "Not Finalized"
  });

  const handleFinalize = async () => {
    if (!canFinalize) return;
    
    setIsSubmitting(true);
    
    // Add comprehensive debugging
    console.log(`[FINALIZATION DEBUG] Starting finalization for resident ${resident.id} (${resident.name})`);
    console.log(`[FINALIZATION DEBUG] Stored calculatedAnnualizedIncome: $${resident.calculatedAnnualizedIncome || 'NULL'}`);
    console.log(`[FINALIZATION DEBUG] Real-time calculated income: $${calculatedIncomeFromDocs}`);
    console.log(`[FINALIZATION DEBUG] Available income for finalization: $${availableIncomeForFinalization}`);
    console.log(`[FINALIZATION DEBUG] Manual W2 value: $${manualW2Value}`);
    console.log(`[FINALIZATION DEBUG] Documents count:`, residentDocuments.length);
    console.log(`[FINALIZATION DEBUG] Can finalize:`, canFinalize);
    console.log(`[FINALIZATION DEBUG] Validation message:`, validationMessage);
    
    try {
      // Determine the income we're going to use for finalization
      const incomeToUse = (w2DocumentsNeedingManualEntry.length > 0 && manualW2Income) 
        ? manualW2Value 
        : availableIncomeForFinalization;

      console.log(`[FINALIZATION DEBUG] Income to use: $${incomeToUse}`);

      // Check for discrepancy between calculated income and rent roll income
      const rentRollIncome = Number(resident.annualizedIncome || 0);
      const calculatedIncome = incomeToUse;
      const difference = Math.abs(rentRollIncome - calculatedIncome);
      const discrepancyThreshold = 5; // $5 threshold

      console.log(`[DISCREPANCY CHECK] Rent Roll: $${rentRollIncome}, Calculated: $${calculatedIncome}, Difference: $${difference}`);

      // Skip discrepancy check for future leases (no rent roll data)
      const isFutureLease = rentRollIncome === 0 && calculatedIncome > 0;
      
      if (isFutureLease) {
        console.log(`[DISCREPANCY CHECK] Future lease detected - skipping discrepancy check`);
      } else if (difference >= discrepancyThreshold) {
        // Show discrepancy modal instead of direct finalization
        console.log(`[DISCREPANCY CHECK] Discrepancy detected (>= $${discrepancyThreshold}), showing modal`);
        setDiscrepancyData({
          rentRollIncome,
          calculatedIncome,
          difference
        });
        setShowDiscrepancyModal(true);
        setIsSubmitting(false);
        return;
      }

      // No significant discrepancy - proceed with normal finalization
      console.log(`[DISCREPANCY CHECK] No significant discrepancy, proceeding with finalization`);
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

  const handleUnfinalize = async () => {
    setIsSubmitting(true);
    
    console.log(`[UNFINALIZATION DEBUG] Starting unfinalization for resident ${resident.id} (${resident.name})`);
    
    try {
      // Use the correct IDs from the verification object
      const leaseId = verification.leaseId; // This is the actual lease ID
      const verificationId = verification.id; // This is the verification ID
      
      if (!leaseId) {
        console.error(`[UNFINALIZATION DEBUG] Missing leaseId in verification object`);
        alert('Unable to unfinalize: missing lease information');
        return;
      }
      
      const response = await fetch(`/api/leases/${leaseId}/verifications/${verificationId}/residents/${resident.id}/unfinalize`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });

      console.log(`[UNFINALIZATION DEBUG] API response status:`, response.status);
      
      if (response.ok) {
        const result = await response.json();
        console.log(`[UNFINALIZATION DEBUG] API response result:`, result);
        
        // Close the dialog and refresh the parent component
        onClose();
        
        // Trigger a refresh by calling onConfirm with 0 (this will refresh the data)
        await onConfirm(0);
        
        console.log(`[UNFINALIZATION DEBUG] Unfinalization completed successfully`);
      } else {
        const errorData = await response.json();
        console.error(`[UNFINALIZATION DEBUG] API error:`, errorData);
        alert(`Failed to unfinalize income: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(`[UNFINALIZATION DEBUG] Network/other error:`, error);
      alert('Network error occurred while unfinalizing income');
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
          leaseId: verification.leaseId, // Include leaseId for better context
        }),
      });

      if (response.ok) {
        // Set the override requested state and close the modal
        setOverrideRequested(true);
        setShowOverrideRequest(false);
        alert('Override request submitted successfully. An administrator will review your request.');
        
        // Refresh parent data to include the new override request
        if (onDataRefresh) {
          onDataRefresh();
        }
      } else {
        throw new Error('Failed to submit override request');
      }
    } catch (error) {
      console.error('Error submitting override request:', error);
      alert('Error submitting override request. Please try again.');
    }
  };

  // Handler for accepting verified income (updates rent roll to match calculated)
  const handleAcceptVerifiedIncome = async () => {
    if (!discrepancyData) return;
    
    setIsSubmitting(true);
    try {
      console.log(`[ACCEPT VERIFIED] Updating rent roll income from $${discrepancyData.rentRollIncome} to $${discrepancyData.calculatedIncome}`);
      
      // Call API to update the resident's annualizedIncome to match calculatedAnnualizedIncome and finalize
      const response = await fetch(`/api/leases/${verification.leaseId}/residents/${resident.id}/accept-verified-income`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verifiedIncome: discrepancyData.calculatedIncome
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to accept verified income');
      }

      console.log(`[ACCEPT VERIFIED] Successfully updated and finalized ${resident.name}`);
      
      // Show notification modal with the verified income amount
      setNotificationAmount(discrepancyData.calculatedIncome);
      setShowNotificationModal(true);
      
      // Close discrepancy modal but keep main dialog open for notification
      setShowDiscrepancyModal(false);
      setDiscrepancyData(null);
      
      if (onDataRefresh) {
        onDataRefresh();
      }
    } catch (error) {
      console.error('Error accepting verified income:', error);
      alert(error instanceof Error ? error.message : 'Failed to accept verified income');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler for modifying documents
  const handleModifyDocuments = () => {
    console.log(`[MODIFY DOCS] User chose to modify documents for ${resident.name}`);
    setShowDiscrepancyModal(false);
    setDiscrepancyData(null);
    onClose(); // Close dialog so user can upload new documents
  };

  // Handler for requesting income discrepancy exception
  const handleRequestIncomeException = async (explanation: string) => {
    if (!discrepancyData) return;
    
    setIsSubmitting(true);
    try {
      console.log(`[INCOME EXCEPTION] Submitting income discrepancy exception for ${resident.name}`);
      
      const response = await fetch('/api/override-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'INCOME_DISCREPANCY',
          userExplanation: `Income discrepancy: Rent roll shows $${discrepancyData.rentRollIncome}, documents show $${discrepancyData.calculatedIncome}. Difference: $${discrepancyData.difference}. User explanation: ${explanation}`,
          residentId: resident.id,
          verificationId: verification.id,
          leaseId: verification.leaseId
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit income exception request');
      }

      console.log(`[INCOME EXCEPTION] Successfully submitted for ${resident.name}`);
      
      // Close all modals and refresh data
      setShowDiscrepancyModal(false);
      setDiscrepancyData(null);
      onClose();
      
      if (onDataRefresh) {
        onDataRefresh();
      }
    } catch (error) {
      console.error('Error submitting income exception:', error);
      alert(error instanceof Error ? error.message : 'Failed to submit income exception request');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open the document review modal for a specific document
  const openDocumentReviewModal = (doc: IncomeDocument) => {
    setDocReviewModal({
      isOpen: true,
      documentId: doc.id,
      title: 'Request Admin Review of Document',
      description: `If the automatic analysis for this ${doc.documentType} looks incorrect, you can request an admin review for ${resident.name}. Please describe what seems wrong so an admin can take a look.`,
    });
  };

  // Submit the document review request
  const submitDocumentReview = async (userExplanation: string) => {
    try {
      const res = await fetch('/api/override-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'DOCUMENT_REVIEW',
          userExplanation,
          documentId: docReviewModal.documentId,
          residentId: resident.id,
          verificationId: verification.id,
          leaseId: verification.leaseId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to request admin review');
      }
      setDocReviewModal({ isOpen: false, documentId: null, title: '', description: '' });
      alert('Requested admin review for this document. An administrator will take a look.');
      if (onDataRefresh) onDataRefresh();
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'Failed to request admin review');
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {resident.name} - Income Verification
          </h3>
          {/* Finalization Status Indicator */}
          <div className="mt-2">
            {resident.incomeFinalized ? (
              <div className="flex items-center space-x-2 text-green-700 bg-green-50 px-3 py-1 rounded-full text-sm">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">Income Finalized</span>
                {resident.finalizedAt && (
                  <span className="text-green-600">
                    ({new Date(resident.finalizedAt).toLocaleDateString()})
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center space-x-2 text-amber-700 bg-amber-50 px-3 py-1 rounded-full text-sm">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">Income Not Finalized</span>
              </div>
            )}
          </div>
        </div>
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
              {/* Only show Original Income for current leases with rent roll data */}
              {Number(resident.annualizedIncome || 0) > 0 && (
                <p><strong>Original Income:</strong> {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(resident.annualizedIncome)}</p>
              )}
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
                {residentDocuments.map((doc: IncomeDocument) => {
                  let verifiedAmount = 0;
                  let displayText = doc.documentType;
                  
                  if (doc.documentType === 'W2') {
                    // Use the highest of Box 1, 3, or 5 (same logic as calculation)
                    const box1 = Number(doc.box1_wages || 0);
                    const box3 = Number(doc.box3_ss_wages || 0);
                    const box5 = Number(doc.box5_med_wages || 0);
                    verifiedAmount = Math.max(box1, box3, box5);
                    displayText = `${doc.documentType} ${doc.taxYear ? `(${doc.taxYear})` : ''}`;
                  } else if (doc.documentType === 'PAYSTUB') {
                    verifiedAmount = doc.grossPayAmount || 0; // Show actual paystub amount, not annualized
                    if (doc.payPeriodStartDate && doc.payPeriodEndDate) {
                      const startDate = new Date(doc.payPeriodStartDate);
                      const endDate = new Date(doc.payPeriodEndDate);
                      displayText = `${doc.documentType} (${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
                    }
                  } else if (doc.documentType === 'SOCIAL_SECURITY') {
                    verifiedAmount = doc.grossPayAmount || 0; // Monthly benefit amount
                    if (doc.documentDate) {
                      const docDate = new Date(doc.documentDate);
                      displayText = `Social Security Letter (${docDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})`;
                    } else {
                      displayText = 'Social Security Letter';
                    }
                  } else {
                    verifiedAmount = doc.calculatedAnnualizedIncome || 0;
                  }

                  return (
                    <div key={doc.id} className="flex flex-col space-y-2 p-3 border rounded-lg bg-gray-50">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-700">
                          {displayText}
                          {doc.employerName && ` - ${doc.employerName}`}
                          {doc.employeeName && !doc.employerName && ` - ${doc.employeeName}`}
                        </span>
                        <span className="font-medium text-green-600">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(verifiedAmount)}
                          {doc.documentType === 'SOCIAL_SECURITY' && '/month'}
                        </span>
                      </div>
                      {/* Allow user to request admin review for completed docs */}
                      {doc.status === 'COMPLETED' && (
                        <div className="text-right">
                          <button
                            onClick={() => openDocumentReviewModal(doc)}
                            className="text-xs text-orange-600 hover:text-orange-700"
                          >
                            Request Admin Review
                          </button>
                        </div>
                      )}
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
              onClick={() => {
                setOverrideRequested(false); // Reset override requested state when dialog closes
                onClose();
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
            >
              Cancel
            </button>
            
            {/* Request Override button or pending message - only show when validation fails */}
            {!canFinalize && !overrideRequested && (
              <button
                onClick={() => setShowOverrideRequest(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-md"
              >
                Request Override
              </button>
            )}
            
            {/* Show pending message when override has been requested */}
            {!canFinalize && overrideRequested && (
              <div className="px-4 py-2 text-sm font-medium text-orange-700 bg-orange-100 border border-orange-300 rounded-md">
                Exception requested, awaiting admin review
              </div>
            )}
            
            {resident.incomeFinalized && (
              <button
                onClick={handleUnfinalize}
                disabled={isSubmitting}
                className={`px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md ${
                  isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                Unfinalize Income
              </button>
            )}

            <button
              onClick={handleFinalize}
              disabled={isSubmitting || !canFinalize || resident.incomeFinalized}
              className={`px-4 py-2 text-sm font-medium text-white rounded-md ${
                !isSubmitting && canFinalize && !resident.incomeFinalized
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
              title={!canFinalize ? 'Please resolve the issues above before finalizing' : ''}
            >
              {isSubmitting ? 'Processing...' : resident.incomeFinalized ? 'Already Finalized' : `Finalize ${resident.name}'s Income`}
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

      {/* Document Review Modal */}
      {docReviewModal.isOpen && (
        <OverrideRequestModal
          isOpen={docReviewModal.isOpen}
          onClose={() => setDocReviewModal({ isOpen: false, documentId: null, title: '', description: '' })}
          onSubmit={submitDocumentReview}
          type="DOCUMENT_REVIEW"
          context={{
            title: docReviewModal.title,
            description: docReviewModal.description,
            documentId: docReviewModal.documentId || undefined,
            residentId: resident.id,
            verificationId: verification.id,
          }}
        />
      )}

      {/* Individual Income Discrepancy Modal */}
      {showDiscrepancyModal && discrepancyData && (
        <IndividualIncomeDiscrepancyModal
          isOpen={showDiscrepancyModal}
          onClose={() => {
            setShowDiscrepancyModal(false);
            setDiscrepancyData(null);
          }}
          residentName={resident.name}
          rentRollIncome={discrepancyData.rentRollIncome}
          calculatedIncome={discrepancyData.calculatedIncome}
          difference={discrepancyData.difference}
          onAcceptVerified={handleAcceptVerifiedIncome}
          onModifyDocuments={handleModifyDocuments}
          onRequestException={handleRequestIncomeException}
          isProcessing={isSubmitting}
        />
      )}

      {/* Property Management System Update Notification Modal */}
      {showNotificationModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
          <div className="relative bg-white p-8 rounded-lg shadow-xl max-w-md mx-auto">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Income Updated Successfully
              </h3>
              
              <div className="mb-6">
                <p className="text-sm text-gray-600 mb-3">
                  {resident.name}'s income has been updated to:
                </p>
                <p className="text-2xl font-bold text-green-600">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(notificationAmount)}
                </p>
              </div>
              
              <div className="bg-amber-50 border border-amber-200 rounded-md p-4 mb-6">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h4 className="text-sm font-medium text-amber-800">
                      Don't Forget!
                    </h4>
                    <p className="text-sm text-amber-700 mt-1">
                      Please update {resident.name}'s income to <strong>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(notificationAmount)}</strong> in your property management system to prevent future discrepancies.
                    </p>
                  </div>
                </div>
              </div>
              
              <button
                onClick={() => {
                  setShowNotificationModal(false);
                  onClose(); // Close the main dialog after notification
                }}
                className="w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
              >
                Got it, thanks!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}