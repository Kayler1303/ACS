'use client';

import { useState } from 'react';

type Resident = {
  id: string;
  name: string;
};

interface RenewalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSelected: (selectedResidentIds: string[]) => Promise<void>;
  currentResidents: Resident[];
  leaseName: string;
}

export default function RenewalDialog({
  isOpen,
  onClose,
  onAddSelected,
  currentResidents,
  leaseName,
}: RenewalDialogProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) {
    return null;
  }

  const handleCheckboxChange = (residentId: string) => {
    setSelectedIds(prev =>
      prev.includes(residentId)
        ? prev.filter(id => id !== residentId)
        : [...prev, residentId]
    );
  };

  const handleAddSelected = async () => {
    if (selectedIds.length === 0) {
      alert('Please select at least one resident to add.');
      return;
    }
    setIsSubmitting(true);
    try {
      await onAddSelected(selectedIds);
      onClose(); // Close dialog on success
    } catch (error) {
      console.error('Failed to add selected residents:', error);
      // Let the parent component handle showing an error toast
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-8">
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">Select Residents for Renewal</h2>
        <p className="text-sm text-center text-gray-500 mb-6">
          For provisional lease: <span className="font-medium">{leaseName}</span>
        </p>

        {currentResidents.length > 0 ? (
          <div className="mb-6">
            <h3 className="font-semibold text-gray-700 mb-3">Select renewing residents from the most recent active lease:</h3>
            <div className="max-h-60 overflow-y-auto border rounded-md p-4 space-y-3">
              {currentResidents.map(resident => (
                <label key={resident.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-md hover:bg-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(resident.id)}
                    onChange={() => handleCheckboxChange(resident.id)}
                    className="h-5 w-5 rounded border-gray-300 text-brand-blue focus:ring-brand-accent"
                  />
                  <span className="text-gray-800">{resident.name}</span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-center text-gray-500 my-8">There are no residents in the previous lease to select for renewal.</p>
        )}

        <div className="flex flex-col space-y-3">
          <button
            onClick={handleAddSelected}
            disabled={isSubmitting || selectedIds.length === 0}
            className="w-full px-4 py-2 text-white bg-brand-blue rounded-md hover:bg-opacity-90 disabled:bg-gray-400"
          >
            {isSubmitting ? 'Adding...' : `Add Selected (${selectedIds.length})`}
          </button>
        </div>
        
        <div className="text-center mt-6">
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
} 