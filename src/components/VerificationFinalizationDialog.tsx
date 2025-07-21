'use client';

import { useState } from 'react';
import { format } from 'date-fns';

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
  residentId?: string;
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
}

interface VerificationFinalizationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (calculatedIncome: number) => Promise<void>;
  verification: IncomeVerification;
  residents: Resident[];
  tenancyId: string;
}

export default function VerificationFinalizationDialog({
  isOpen,
  onClose,
  onConfirm,
  verification,
  residents,
  tenancyId
}: VerificationFinalizationDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  // Calculate total verified income from completed documents
  const completedDocuments = verification.incomeDocuments.filter(
    doc => doc.status === 'COMPLETED' && doc.box1_wages
  );

  const totalVerifiedIncome = completedDocuments.reduce(
    (sum, doc) => sum + (doc.box1_wages || 0), 0
  );

  // Group documents by resident
  const documentsByResident = residents.map(resident => {
    const residentDocs = completedDocuments.filter(doc => doc.residentId === resident.id);
    const residentVerifiedIncome = residentDocs.reduce((sum, doc) => sum + (doc.box1_wages || 0), 0);
    
    return {
      resident,
      documents: residentDocs,
      verifiedIncome: residentVerifiedIncome
    };
  });

  // Check if verification is ready to finalize
  const hasCompletedDocuments = completedDocuments.length > 0;
  const allResidentsHaveDocuments = residents.every(resident => 
    verification.incomeDocuments.some(doc => 
      doc.residentId === resident.id && doc.status === 'COMPLETED'
    )
  );

  const handleFinalize = async () => {
    if (!hasCompletedDocuments) return;
    
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
              {documentsByResident.map(({ resident, documents, verifiedIncome }) => (
                <div key={resident.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-center mb-3">
                    <h5 className="font-medium text-gray-900">{resident.name}</h5>
                    <div className="text-right">
                      <div className="text-sm text-gray-500">Original Income</div>
                      <div className="font-medium">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(resident.annualizedIncome)}
                      </div>
                    </div>
                  </div>
                  
                  {documents.length > 0 ? (
                    <div className="space-y-2">
                      {documents.map(doc => (
                        <div key={doc.id} className="flex justify-between items-center text-sm">
                          <span className="text-gray-600">
                            {doc.documentType} {doc.taxYear ? `(${doc.taxYear})` : ''}
                            {doc.employerName && ` - ${doc.employerName}`}
                          </span>
                          <span className="font-medium text-green-600">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(doc.box1_wages || 0)}
                          </span>
                        </div>
                      ))}
                      <div className="border-t pt-2 flex justify-between items-center font-semibold">
                        <span>Verified Income:</span>
                        <span className="text-green-600">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(verifiedIncome)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-red-600 italic">
                      No completed documents for this resident
                    </div>
                  )}
                </div>
              ))}
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
          {!allResidentsHaveDocuments && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex">
                <svg className="w-5 h-5 text-yellow-400 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <h4 className="text-yellow-800 font-medium">Incomplete Verification</h4>
                  <p className="text-yellow-700 text-sm">
                    Not all residents have completed documents. You can still finalize, but this may affect compliance calculations.
                  </p>
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
              disabled={!hasCompletedDocuments || isSubmitting}
              className={`px-4 py-2 text-sm font-medium text-white rounded-md ${
                hasCompletedDocuments && !isSubmitting
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? 'Finalizing...' : 'Finalize Verification'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 