import { useState } from 'react';

interface FutureLeaseMatch {
  unitNumber: string;
  newLeaseStartDate: string;
  newLeaseEndDate: string;
  existingFutureLease: {
    id: string;
    name: string;
    residents: Array<{
      id: string;
      name: string;
      verifiedIncome: number;
    }>;
  };
}

interface FutureLeaseMatchingModalProps {
  isOpen: boolean;
  matches: FutureLeaseMatch[];
  onClose: () => void;
  onConfirm: (inheritanceChoices: Record<string, boolean>) => void;
}

export default function FutureLeaseMatchingModal({
  isOpen,
  matches,
  onClose,
  onConfirm
}: FutureLeaseMatchingModalProps) {
  const [inheritanceChoices, setInheritanceChoices] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || matches.length === 0) return null;

  const handleChoiceChange = (unitNumber: string, inherit: boolean) => {
    setInheritanceChoices(prev => ({
      ...prev,
      [unitNumber]: inherit
    }));
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm(inheritanceChoices);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-full p-4 text-center">
        <div className="fixed inset-0 bg-black bg-opacity-25" onClick={onClose} />
        
        <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-4xl">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10">
                <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3-6h3.75m-3.75 3h3.75m-3.75 3h3.75M5.25 6h13.5A2.25 2.25 0 0121 8.25v13.5A2.25 2.25 0 0118.75 24H5.25A2.25 2.25 0 013 21.75V8.25A2.25 2.25 0 015.25 6z" />
                </svg>
              </div>
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">
                  Future Lease Matches Found
                </h3>
                <div className="mt-2">
                  <p className="text-sm text-gray-600 mb-6">
                    We found existing future leases with verified income that might match the new leases from your compliance upload. 
                    For each match below, choose whether to inherit the verified income from the existing future lease.
                  </p>
                  
                  <div className="space-y-6">
                    {matches.map((match) => (
                      <div key={match.unitNumber} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h4 className="font-semibold text-gray-900">Unit {match.unitNumber}</h4>
                            <p className="text-sm text-gray-600">
                              New lease: {match.newLeaseStartDate} to {match.newLeaseEndDate}
                            </p>
                          </div>
                        </div>
                        
                        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
                          <h5 className="font-medium text-blue-900 mb-2">
                            Existing Future Lease: "{match.existingFutureLease.name}"
                          </h5>
                          <div className="text-sm text-blue-800">
                            <p className="mb-2">Verified Residents ({match.existingFutureLease.residents.length}):</p>
                            <ul className="list-disc list-inside space-y-1">
                              {match.existingFutureLease.residents.map((resident) => (
                                <li key={resident.id}>
                                  {resident.name}: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(resident.verifiedIncome)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-gray-700">What would you like to do?</p>
                          <div className="space-y-2">
                            <label className="flex items-center">
                              <input
                                type="radio"
                                name={`choice-${match.unitNumber}`}
                                value="inherit"
                                checked={inheritanceChoices[match.unitNumber] === true}
                                onChange={() => handleChoiceChange(match.unitNumber, true)}
                                className="mr-2"
                              />
                              <span className="text-sm text-gray-700">
                                <strong>Inherit verified income</strong> - Transfer the verified residents and income to the new lease
                              </span>
                            </label>
                            <label className="flex items-center">
                              <input
                                type="radio"
                                name={`choice-${match.unitNumber}`}
                                value="new"
                                checked={inheritanceChoices[match.unitNumber] === false}
                                onChange={() => handleChoiceChange(match.unitNumber, false)}
                                className="mr-2"
                              />
                              <span className="text-sm text-gray-700">
                                <strong>Start fresh</strong> - Create the new lease without inheriting any verification data
                              </span>
                            </label>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isSubmitting || Object.keys(inheritanceChoices).length !== matches.length}
              className={`inline-flex w-full justify-center rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm sm:ml-3 sm:w-auto ${
                isSubmitting || Object.keys(inheritanceChoices).length !== matches.length
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isSubmitting ? 'Processing...' : 'Confirm Choices'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
