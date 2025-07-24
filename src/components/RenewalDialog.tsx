'use client';

import { useState } from 'react';

type Resident = {
  id: string;
  name: string;
};

type NewResident = {
  name: string;
  annualizedIncome: string;
};

interface RenewalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSelected: (selectedResidentIds: string[], newResidents: NewResident[]) => Promise<void>;
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
  const [newResidents, setNewResidents] = useState<NewResident[]>([]);
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

  const handleAddNewResident = () => {
    setNewResidents(prev => [...prev, { name: '', annualizedIncome: '' }]);
  };

  const handleNewResidentChange = (index: number, field: keyof NewResident, value: string) => {
    setNewResidents(prev => 
      prev.map((resident, i) => 
        i === index ? { ...resident, [field]: value } : resident
      )
    );
  };

  const handleRemoveNewResident = (index: number) => {
    setNewResidents(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddSelected = async () => {
    const validNewResidents = newResidents.filter(r => r.name.trim() && r.annualizedIncome.trim());
    
    if (selectedIds.length === 0 && validNewResidents.length === 0) {
      alert('Please select at least one existing resident or add a new resident.');
      return;
    }

    // Validate new residents have valid income amounts
    const invalidIncomes = validNewResidents.some(r => isNaN(parseFloat(r.annualizedIncome)) || parseFloat(r.annualizedIncome) <= 0);
    if (invalidIncomes) {
      alert('Please enter valid income amounts for all new residents.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onAddSelected(selectedIds, validNewResidents);
      onClose(); // Close dialog on success
    } catch (error) {
      console.error('Failed to add residents:', error);
      // Let the parent component handle showing an error toast
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalResidents = selectedIds.length + newResidents.filter(r => r.name.trim() && r.annualizedIncome.trim()).length;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-8 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">Select Residents for Renewal</h2>
        <p className="text-sm text-center text-gray-500 mb-6">
          For provisional lease: <span className="font-medium">{leaseName}</span>
        </p>

        {/* Existing Residents Section */}
        {currentResidents.length > 0 ? (
          <div className="mb-6">
            <h3 className="font-semibold text-gray-700 mb-3">Select renewing residents from the most recent active lease:</h3>
            <div className="max-h-40 overflow-y-auto border rounded-md p-4 space-y-3">
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
          <div className="mb-6">
            <p className="text-center text-gray-500 py-4 border rounded-md bg-gray-50">There are no residents in the previous lease to select for renewal.</p>
          </div>
        )}

        {/* New Residents Section */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-gray-700">Add new residents to this lease:</h3>
            <button
              type="button"
              onClick={handleAddNewResident}
              className="px-3 py-1 text-sm bg-green-50 text-green-700 border border-green-200 rounded-md hover:bg-green-100"
            >
              + Add New Resident
            </button>
          </div>
          
          {newResidents.length > 0 ? (
            <div className="space-y-3 max-h-40 overflow-y-auto border rounded-md p-4">
              {newResidents.map((resident, index) => (
                <div key={index} className="flex items-center space-x-3 p-3 bg-blue-50 rounded-md">
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder="Resident Name"
                      value={resident.name}
                      onChange={(e) => handleNewResidentChange(index, 'name', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue"
                    />
                  </div>
                  <div className="flex-1">
                    <input
                      type="number"
                      placeholder="Annual Income"
                      value={resident.annualizedIncome}
                      onChange={(e) => handleNewResidentChange(index, 'annualizedIncome', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveNewResident(index)}
                    className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md"
                    aria-label="Remove resident"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 border-2 border-dashed border-gray-300 rounded-md">
              <p className="text-gray-500 text-sm">No new residents added yet.</p>
              <p className="text-gray-400 text-xs mt-1">Click "Add New Resident" to add someone who wasn't on the previous lease.</p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col space-y-3">
          <button
            onClick={handleAddSelected}
            disabled={isSubmitting || totalResidents === 0}
            className="w-full px-4 py-2 text-white bg-brand-blue rounded-md hover:bg-opacity-90 disabled:bg-gray-400"
          >
            {isSubmitting ? 'Adding...' : `Add All Residents (${totalResidents})`}
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