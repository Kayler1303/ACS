'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface UnitDiscrepancy {
  id: string;
  declaredUnitCount: number;
  actualUnitCount: number;
  paymentDifference: number;
  setupType: string;
  discoveredAt: string;
}

interface UnitDiscrepancyAlertProps {
  propertyId: string;
  propertyName: string;
  discrepancy: UnitDiscrepancy;
}

export default function UnitDiscrepancyAlert({ 
  propertyId, 
  propertyName, 
  discrepancy 
}: UnitDiscrepancyAlertProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handlePayDiscrepancy = () => {
    setIsLoading(true);
    router.push(`/property/${propertyId}/unit-discrepancy-payment`);
  };

  const unitDifference = discrepancy.actualUnitCount - discrepancy.declaredUnitCount;
  const setupTypeLabel = discrepancy.setupType === 'FULL_SERVICE' ? 'Full Service' : 'Self Service';

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-red-800">
            Unit Count Discrepancy Detected
          </h3>
          <div className="mt-2 text-sm text-red-700">
            <p className="mb-2">
              <strong>{propertyName}</strong> has more units than originally declared:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>Declared during setup: <strong>{discrepancy.declaredUnitCount} units</strong></li>
              <li>Found in rent roll: <strong>{discrepancy.actualUnitCount} units</strong></li>
              <li>Difference: <strong>{unitDifference} additional units</strong></li>
              <li>Setup type: <strong>{setupTypeLabel}</strong></li>
            </ul>
            <p className="mt-3 font-semibold">
              Additional payment required: <span className="text-lg">${discrepancy.paymentDifference.toFixed(2)}</span>
            </p>
            <p className="mt-2 text-xs text-red-600">
              Property access is restricted until this discrepancy is resolved.
            </p>
          </div>
          <div className="mt-4">
            <button
              onClick={handlePayDiscrepancy}
              disabled={isLoading}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </>
              ) : (
                'Pay Additional Amount'
              )}
            </button>
            <p className="mt-2 text-xs text-gray-600">
              You can also contact support for alternative payment methods.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
