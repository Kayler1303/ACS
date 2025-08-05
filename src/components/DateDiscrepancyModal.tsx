'use client';
import { useState } from 'react';

interface DateDiscrepancyModalProps {
  isOpen: boolean;
  onClose: () => void;
  leaseStartDate: string;
  documentDate: string;
  onConfirmCurrentLease: () => void;
  onCreateNewLease: () => void;
  reason?: string; // New prop to distinguish between different scenarios
  message?: string; // Custom message from API
}

export default function DateDiscrepancyModal({
  isOpen,
  onClose,
  leaseStartDate,
  documentDate,
  onConfirmCurrentLease,
  onCreateNewLease,
  reason,
  message
}: DateDiscrepancyModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) {
    return null;
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    });
  };

  // Determine if this is a date discrepancy or inability to determine date
  const isDateDiscrepancy = !reason || reason === 'date_discrepancy';
  const isProcessingIssue = reason === 'azure_failed' || reason === 'validation_failed' || reason === 'no_date_found';

  const handleConfirmCurrentLease = async () => {
    setIsProcessing(true);
    onConfirmCurrentLease();
  };

  const handleCreateNewLease = async () => {
    setIsProcessing(true);
    onCreateNewLease();
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="mt-3">
          {/* Warning Icon */}
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100">
            <svg className="h-6 w-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 19.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          
          {/* Modal Content */}
          <div className="mt-2 px-7 py-3">
            <h3 className="text-lg font-medium text-center text-gray-900">
              {isDateDiscrepancy ? 'Document Date Discrepancy' : 'Choose Lease Instance'}
            </h3>
            <div className="mt-2 px-7 py-3">
              {isDateDiscrepancy ? (
                <>
                  <p className="text-sm text-gray-500 text-center">
                    The lease start date for this lease was <span className="font-semibold">{formatDate(leaseStartDate)}</span>, 
                    but you are uploading income documents for <span className="font-semibold">{formatDate(documentDate)}</span>.
                  </p>
                  <p className="text-sm text-gray-500 text-center mt-3">
                    Are you sure these documents are for this lease instance?
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-500 text-center">
                    {message || 'Could not automatically determine which lease these documents are for.'}
                  </p>
                  <p className="text-sm text-gray-500 text-center mt-3">
                    Please choose whether these documents are for the current lease or if you need to create a new lease instance.
                  </p>
                </>
              )}
              
              {/* New explanation about auto-finalization */}
              <div className="mt-4 p-3 bg-blue-50 rounded-md">
                <p className="text-xs text-blue-700 text-center">
                  💡 <strong>Note:</strong> If you choose to create a new lease instance, 
                  any current income verification in progress will be automatically finalized 
                  to make way for the new lease.
                </p>
              </div>
            </div>
          </div>
          
          {/* Buttons */}
          <div className="flex flex-col space-y-2 px-4 py-3">
            <button
              onClick={handleConfirmCurrentLease}
              disabled={isProcessing}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 sm:text-sm"
            >
              {isProcessing ? 'Processing...' : 'Yes, these income documents are for this lease instance'}
            </button>
            
            <button
              onClick={handleCreateNewLease}
              disabled={isProcessing}
              className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 sm:text-sm"
            >
              {isProcessing ? 'Processing...' : 'Create New Lease Instance (auto-finalize current verification)'}
            </button>
            
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-500 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 