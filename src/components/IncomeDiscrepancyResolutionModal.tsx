import React, { useState } from 'react';

interface IncomeDiscrepancyResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  rentRollIncome: number;
  verifiedIncome: number;
  unitNumber: string;
  residentName?: string;
  onAcceptVerifiedIncome: () => Promise<void>;
  onModifyDocuments: () => Promise<void>;
  onSubmitOverrideRequest: (explanation: string) => Promise<void>;
}

export default function IncomeDiscrepancyResolutionModal({
  isOpen,
  onClose,
  rentRollIncome,
  verifiedIncome,
  unitNumber,
  residentName,
  onAcceptVerifiedIncome,
  onModifyDocuments,
  onSubmitOverrideRequest
}: IncomeDiscrepancyResolutionModalProps) {
  const [selectedOption, setSelectedOption] = useState<'accept' | 'modify' | 'override' | null>(null);
  const [overrideExplanation, setOverrideExplanation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const discrepancy = Math.abs(verifiedIncome - rentRollIncome);
  const verifiedIsHigher = verifiedIncome > rentRollIncome;

  const handleAction = async () => {
    if (!selectedOption) return;

    setIsSubmitting(true);
    try {
      switch (selectedOption) {
        case 'accept':
          await onAcceptVerifiedIncome();
          break;
        case 'modify':
          await onModifyDocuments();
          break;
        case 'override':
          if (!overrideExplanation.trim()) {
            alert('Please provide an explanation for the override request.');
            return;
          }
          await onSubmitOverrideRequest(overrideExplanation);
          break;
      }
      onClose();
    } catch (error) {
      console.error('Error handling discrepancy resolution:', error);
      alert('An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canProceed = selectedOption && (selectedOption !== 'override' || overrideExplanation.trim());

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-2xl shadow-lg rounded-md bg-white">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-semibold text-gray-900">
            Income Discrepancy Detected
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
            disabled={isSubmitting}
          >
            ×
          </button>
        </div>

        {/* Discrepancy Information */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <div className="flex items-center mb-3">
            <svg className="w-6 h-6 text-amber-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <h4 className="text-lg font-semibold text-amber-800">
              Unit {unitNumber}{residentName && ` - ${residentName}`}
            </h4>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-amber-700 font-medium">Original Rent Roll Income:</p>
              <p className="text-xl font-bold text-amber-900">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(rentRollIncome)}
              </p>
            </div>
            <div>
              <p className="text-amber-700 font-medium">Verified Income:</p>
              <p className="text-xl font-bold text-amber-900">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(verifiedIncome)}
              </p>
            </div>
            <div>
              <p className="text-amber-700 font-medium">Discrepancy:</p>
              <p className={`text-xl font-bold ${verifiedIsHigher ? 'text-green-700' : 'text-red-700'}`}>
                {verifiedIsHigher ? '+' : '-'}{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(discrepancy)}
              </p>
            </div>
          </div>
        </div>

        {/* Resolution Options */}
        <div className="space-y-4 mb-6">
          <h4 className="text-lg font-semibold text-gray-900 mb-3">
            How would you like to resolve this discrepancy?
          </h4>

          {/* Option A: Accept Verified Income */}
          <div className="border rounded-lg p-4">
            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="radio"
                name="resolution"
                value="accept"
                checked={selectedOption === 'accept'}
                onChange={() => setSelectedOption('accept')}
                className="mt-1"
                disabled={isSubmitting}
              />
              <div className="flex-1">
                <h5 className="font-semibold text-green-700 mb-2">
                  ✅ Accept Verified Income ({new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(verifiedIncome)})
                </h5>
                <p className="text-sm text-gray-600 mb-2">
                  Use the calculated verified income from uploaded documents as the official income for this lease.
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded p-3">
                  <p className="text-sm text-blue-800">
                    <strong>⚠️ Important:</strong> Please also update this resident's income in your property management system to{' '}
                    <strong>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(verifiedIncome)}</strong>.
                    Otherwise, your next rent roll upload will create another discrepancy.
                  </p>
                </div>
              </div>
            </label>
          </div>

          {/* Option B: Modify Documents */}
          <div className="border rounded-lg p-4">
            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="radio"
                name="resolution"
                value="modify"
                checked={selectedOption === 'modify'}
                onChange={() => setSelectedOption('modify')}
                className="mt-1"
                disabled={isSubmitting}
              />
              <div className="flex-1">
                <h5 className="font-semibold text-blue-700 mb-2">
                  📝 Modify Documents
                </h5>
                <p className="text-sm text-gray-600">
                  Unfinalize the resident's income verification to allow uploading new documents or deleting existing ones.
                  You can then re-finalize with the correct documents.
                </p>
              </div>
            </label>
          </div>

          {/* Option C: Submit Override Request */}
          <div className="border rounded-lg p-4">
            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="radio"
                name="resolution"
                value="override"
                checked={selectedOption === 'override'}
                onChange={() => setSelectedOption('override')}
                className="mt-1"
                disabled={isSubmitting}
              />
              <div className="flex-1">
                <h5 className="font-semibold text-purple-700 mb-2">
                  📋 Submit Override Request to Admin
                </h5>
                <p className="text-sm text-gray-600 mb-3">
                  Request admin approval to use a different income amount than what the system calculated.
                </p>
                {selectedOption === 'override' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Explanation for Override Request:
                    </label>
                    <textarea
                      value={overrideExplanation}
                      onChange={(e) => setOverrideExplanation(e.target.value)}
                      placeholder="Please explain why the verified income should be different from what the system calculated..."
                      className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={4}
                      disabled={isSubmitting}
                    />
                  </div>
                )}
              </div>
            </label>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleAction}
            disabled={!canProceed || isSubmitting}
            className={`px-6 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed ${
              canProceed && !isSubmitting
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-gray-400'
            }`}
          >
            {isSubmitting ? 'Processing...' : 'Proceed'}
          </button>
        </div>
      </div>
    </div>
  );
} 