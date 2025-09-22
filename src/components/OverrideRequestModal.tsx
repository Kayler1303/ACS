'use client';

import { useState } from 'react';

interface OverrideRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (explanation: string) => Promise<void>;
  type: 'VALIDATION_EXCEPTION' | 'INCOME_DISCREPANCY' | 'DOCUMENT_REVIEW';
  context: {
    title: string;
    description: string;
    unitId?: string;
    residentId?: string;
    verificationId?: string;
    documentId?: string;
  };
}

export default function OverrideRequestModal({
  isOpen,
  onClose,
  onSubmit,
  type,
  context
}: OverrideRequestModalProps) {
  const [explanation, setExplanation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!explanation.trim()) return;
    
    setIsSubmitting(true);
    try {
      await onSubmit(explanation.trim());
      setExplanation('');
      onClose();
    } catch (error) {
      console.error('Error submitting override request:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTypeDescription = () => {
    switch (type) {
      case 'VALIDATION_EXCEPTION':
        return 'Request an exception to validation requirements';
      case 'INCOME_DISCREPANCY':
        return 'Request review of income calculation differences';
      case 'DOCUMENT_REVIEW':
        return 'Request manual review of document processing';
      default:
        return 'Request administrative override';
    }
  };

  const getPlaceholder = () => {
    switch (type) {
      case 'VALIDATION_EXCEPTION':
        return 'Explain why you believe the current validation requirements should be waived for this case. Include details about what documents are available and why they should be sufficient...';
      case 'INCOME_DISCREPANCY':
        return 'Explain the discrepancy between compliance income and verified income. Which amount do you believe is correct and why?...';
      case 'DOCUMENT_REVIEW':
        return 'Describe the issue with document processing and provide the correct income information that should be extracted...';
      default:
        return 'Please provide a detailed explanation for your override request...';
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
        <div className="mt-3">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-medium text-gray-900">
              Request Override
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

          {/* Context Information */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <h4 className="text-md font-semibold text-blue-900 mb-2">{context.title}</h4>
            <p className="text-sm text-blue-800">{context.description}</p>
            <p className="text-xs text-blue-600 mt-2">{getTypeDescription()}</p>
          </div>

          {/* Warning Message */}
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex">
              <svg className="w-5 h-5 text-yellow-400 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div>
                <h4 className="text-yellow-800 font-medium text-sm">Override Request Process</h4>
                <p className="text-yellow-700 text-sm mt-1">
                  Your request will be reviewed by an administrator. Please provide a detailed explanation 
                  to help them understand your situation. You will be notified when a decision is made.
                </p>
              </div>
            </div>
          </div>

          {/* Explanation Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Explanation <span className="text-red-500">*</span>
            </label>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              rows={6}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                explanation.trim().length < 20 && explanation.trim().length > 0
                  ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                  : explanation.trim().length >= 20
                  ? 'border-green-300 focus:ring-green-500 focus:border-green-500'
                  : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
              }`}
              placeholder={getPlaceholder()}
            />
            <div className="mt-2 flex justify-between items-center">
              <p className={`text-xs ${
                explanation.trim().length < 20 && explanation.trim().length > 0
                  ? 'text-red-600'
                  : explanation.trim().length >= 20
                  ? 'text-green-600'
                  : 'text-gray-500'
              }`}>
                {explanation.trim().length < 20 
                  ? explanation.trim().length === 0
                    ? 'Please provide a detailed explanation (minimum 20 characters)'
                    : `${20 - explanation.trim().length} more characters needed`
                  : '✓ Ready to submit'
                }
              </p>
              <p className="text-xs text-gray-400">
                {explanation.trim().length}/20
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || explanation.trim().length < 20}
              className={`px-4 py-2 text-sm font-medium text-white rounded-md ${
                !isSubmitting && explanation.trim().length >= 20
                  ? 'bg-orange-600 hover:bg-orange-700'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Override Request'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 