'use client';
import { useState } from 'react';

interface IndividualIncomeDiscrepancyModalProps {
  isOpen: boolean;
  onClose: () => void;
  residentName: string;
  rentRollIncome: number;
  calculatedIncome: number;
  difference: number;
  onAcceptVerified: () => void;
  onModifyDocuments: () => void;
  onRequestException: (explanation: string) => void;
  isProcessing: boolean;
}

export default function IndividualIncomeDiscrepancyModal({
  isOpen,
  onClose,
  residentName,
  rentRollIncome,
  calculatedIncome,
  difference,
  onAcceptVerified,
  onModifyDocuments,
  onRequestException,
  isProcessing
}: IndividualIncomeDiscrepancyModalProps) {
  const [showExceptionForm, setShowExceptionForm] = useState(false);
  const [exceptionExplanation, setExceptionExplanation] = useState('');

  if (!isOpen) return null;

  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const handleRequestException = () => {
    if (exceptionExplanation.trim()) {
      onRequestException(exceptionExplanation);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-full max-w-lg shadow-lg rounded-md bg-white">
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
              Income Discrepancy Detected
            </h3>
            <div className="mt-2 px-7 py-3">
              <p className="text-sm text-gray-500 text-center">
                There's a significant difference between the rent roll income and the calculated income from documents for <span className="font-semibold">{residentName}</span>.
              </p>
              
              <div className="mt-4 bg-gray-50 p-4 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">Rent Roll Income:</span>
                  <span className="text-sm font-semibold text-blue-600">{formatCurrency(rentRollIncome)}</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">Calculated from Documents:</span>
                  <span className="text-sm font-semibold text-green-600">{formatCurrency(calculatedIncome)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700">Difference:</span>
                  <span className="text-sm font-semibold text-red-600">{formatCurrency(difference)}</span>
                </div>
              </div>
              
              <p className="text-sm text-gray-500 text-center mt-3">
                Please choose how you'd like to resolve this discrepancy:
              </p>
            </div>
          </div>
          
          {!showExceptionForm ? (
            // Main Options
            <div className="flex flex-col space-y-2 px-4 py-3">
              <button
                onClick={onAcceptVerified}
                disabled={isProcessing}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 sm:text-sm"
              >
                {isProcessing ? 'Processing...' : '✅ Accept Verified Income'}
              </button>
              <p className="text-xs text-gray-500 text-center -mt-1">
                Update rent roll to match {formatCurrency(calculatedIncome)} and finalize
              </p>
              
              <button
                onClick={onModifyDocuments}
                disabled={isProcessing}
                className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 sm:text-sm"
              >
                📄 Modify Documents
              </button>
              <p className="text-xs text-gray-500 text-center -mt-1">
                Upload new or corrected income documents
              </p>
              
              <button
                onClick={() => setShowExceptionForm(true)}
                disabled={isProcessing}
                className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-orange-700 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 sm:text-sm"
              >
                🔍 Request Administrative Review
              </button>
              <p className="text-xs text-gray-500 text-center -mt-1">
                Submit this discrepancy for admin review
              </p>
              
              <button
                onClick={onClose}
                disabled={isProcessing}
                className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-500 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 sm:text-sm"
              >
                Cancel
              </button>
            </div>
          ) : (
            // Exception Request Form
            <div className="px-4 py-3">
              <div className="mb-4">
                <label htmlFor="exception-explanation" className="block text-sm font-medium text-gray-700 mb-2">
                  Please explain why this discrepancy exists:
                </label>
                <textarea
                  id="exception-explanation"
                  value={exceptionExplanation}
                  onChange={(e) => setExceptionExplanation(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Explain the reason for the income discrepancy..."
                />
              </div>
              
              <div className="flex space-x-2">
                <button
                  onClick={handleRequestException}
                  disabled={isProcessing || !exceptionExplanation.trim()}
                  className="flex-1 inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-orange-600 text-base font-medium text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 sm:text-sm"
                >
                  {isProcessing ? 'Submitting...' : 'Submit Request'}
                </button>
                
                <button
                  onClick={() => setShowExceptionForm(false)}
                  disabled={isProcessing}
                  className="flex-1 inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 sm:text-sm"
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 