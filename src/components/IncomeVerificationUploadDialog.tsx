'use client';

import IncomeVerificationDocumentUploadForm from './IncomeVerificationDocumentUploadForm';

interface IncomeVerificationUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  verificationId: string;
  onUploadComplete: () => void;
  residents: Array<{ id: string; name: string }>;
  allCurrentLeaseResidents?: Array<{ id: string; name: string }>;
  hasExistingDocuments: boolean;
  leaseName: string;
  unitId: string;
  propertyId: string;
  rentRollId: string;
  currentLease?: {
    id: string;
    name: string;
    leaseStartDate?: string;
    leaseEndDate?: string;
  };
}

export default function IncomeVerificationUploadDialog({
  isOpen,
  onClose,
  verificationId,
  onUploadComplete,
  residents,
  allCurrentLeaseResidents,
  hasExistingDocuments,
  leaseName,
  unitId,
  propertyId,
  rentRollId,
  currentLease,
}: IncomeVerificationUploadDialogProps) {
  const handleUploadComplete = () => {
    onUploadComplete();
    // Keep dialog open so user can upload more documents if needed
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-2xl font-semibold leading-6 text-brand-blue">
              📋 Upload Income Documents
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              For lease: <span className="font-medium">{leaseName}</span>
            </p>
          </div>
          <button
            type="button"
            className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 p-1"
            onClick={onClose}
          >
            <span className="sr-only">Close</span>
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                Action Required: Upload Income Documents
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>
                  Please upload income verification documents for the residents in this lease. 
                  You can upload multiple documents and close this dialog at any time to continue later.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <IncomeVerificationDocumentUploadForm
            verificationId={verificationId}
            onUploadComplete={onUploadComplete}
            residents={residents}
            allCurrentLeaseResidents={allCurrentLeaseResidents}
            hasExistingDocuments={hasExistingDocuments}
            unitId={unitId}
            propertyId={propertyId}
            rentRollId={rentRollId}
            currentLease={currentLease}
          />
        </div>

        <div className="mt-6 flex justify-end space-x-3">
          <button
            type="button"
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2"
            onClick={onClose}
          >
            Continue Later
          </button>
          <button
            type="button"
            className="rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2"
            onClick={onClose}
          >
            Done for Now
          </button>
        </div>
      </div>
    </div>
  );
} 