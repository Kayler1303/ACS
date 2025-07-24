'use client';

import { useState } from 'react';

interface NewResident {
  name: string;
}

interface AddResidentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (residents: NewResident[]) => Promise<void>;
  leaseName: string;
}

export default function AddResidentDialog({ isOpen, onClose, onSubmit, leaseName }: AddResidentDialogProps) {
  const [newResidents, setNewResidents] = useState<NewResident[]>([{ name: '' }]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) {
    return null;
  }

  const handleAddNewResident = () => {
    setNewResidents([...newResidents, { name: '' }]);
  };

  const handleNewResidentChange = (index: number, field: keyof NewResident, value: string) => {
    const updated = [...newResidents];
    updated[index][field] = value;
    setNewResidents(updated);
  };

  const handleRemoveNewResident = (index: number) => {
    if (newResidents.length > 1) {
      setNewResidents(newResidents.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate that all residents have names
    const validResidents = newResidents.filter(r => r.name.trim() !== '');
    if (validResidents.length === 0) {
      alert('Please add at least one resident with a name.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(validResidents);
      setNewResidents([{ name: '' }]); // Reset form
      onClose(); // Close the dialog on successful submission
    } catch (error) {
      // Error is handled by the parent component, but we stop submitting
      console.error('Submission failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
      <div className="relative mx-auto p-8 border w-full max-w-lg shadow-lg rounded-md bg-white max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          {/* Close Icon */}
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="text-center">
          <h3 className="text-xl font-bold text-gray-900">Add New Residents</h3>
          <p className="text-sm text-gray-500 mt-1">
            For lease: <span className="font-medium">{leaseName}</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Income will be set during the verification process
          </p>
        </div>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-700">New Residents</h4>
              <button
                type="button"
                onClick={handleAddNewResident}
                className="text-sm text-brand-blue hover:text-blue-700 font-medium"
              >
                + Add Another Resident
              </button>
            </div>
            
            {newResidents.map((resident, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600">Resident {index + 1}</span>
                  {newResidents.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveNewResident(index)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  )}
                </div>
                
                <div>
                  <label htmlFor={`resident-name-${index}`} className="block text-sm font-medium text-gray-700">
                    Resident Full Name
                  </label>
                  <input
                    id={`resident-name-${index}`}
                    type="text"
                    value={resident.name}
                    onChange={(e) => handleNewResidentChange(index, 'name', e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-brand-accent focus:border-brand-accent sm:text-sm"
                    placeholder="e.g., Jane Doe"
                  />
                </div>
              </div>
            ))}
          </div>
          
          <div className="pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-brand-blue hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-accent disabled:bg-gray-400"
            >
              {isSubmitting ? 'Adding...' : `Add ${newResidents.filter(r => r.name.trim()).length} Resident${newResidents.filter(r => r.name.trim()).length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 