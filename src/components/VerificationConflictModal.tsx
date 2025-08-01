'use client';

import { useState } from 'react';

interface VerificationConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCancel: () => void;
  unitNumber: string;
}

export default function VerificationConflictModal({
  isOpen,
  onClose,
  onCancel,
  unitNumber
}: VerificationConflictModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleCancel = async () => {
    setIsProcessing(true);
    try {
      await onCancel();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="mt-3 text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100">
            <svg
              className="h-6 w-6 text-yellow-600"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          
          <h3 className="text-lg leading-6 font-medium text-gray-900 mt-3">
            Verification Already in Progress
          </h3>
          
          <div className="mt-4 px-4 py-3">
            <p className="text-sm text-gray-500 mb-4">
              Another income verification is already in progress for Unit {unitNumber}. 
              You have two options:
            </p>
            
            <div className="text-left space-y-3 mb-6">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 text-sm font-semibold">1</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Cancel the existing verification</p>
                  <p className="text-xs text-gray-500">
                    This will delete the in-progress verification so you can start a new one 
                    (only works if no documents have been uploaded yet)
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 text-sm font-semibold">2</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Go back and finalize the existing one first</p>
                  <p className="text-xs text-gray-500">
                    Complete the current verification before starting a new one
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex space-x-3 px-4 py-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-100 text-gray-800 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors"
              disabled={isProcessing}
            >
              Go Back
            </button>
            <button
              onClick={handleCancel}
              disabled={isProcessing}
              className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? 'Cancelling...' : 'Cancel Existing'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 