'use client';

import { useState } from 'react';

interface AddResidentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, annualizedIncome: string) => Promise<void>;
  leaseName: string;
}

export default function AddResidentDialog({ isOpen, onClose, onSubmit, leaseName }: AddResidentDialogProps) {
  const [name, setName] = useState('');
  const [annualizedIncome, setAnnualizedIncome] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !annualizedIncome) {
      alert('Please fill in all fields.');
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit(name, annualizedIncome);
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
      <div className="relative mx-auto p-8 border w-full max-w-md shadow-lg rounded-md bg-white">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          {/* Close Icon */}
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="text-center">
          <h3 className="text-xl font-bold text-gray-900">Add New Resident</h3>
          <p className="text-sm text-gray-500 mt-1">
            For lease: <span className="font-medium">{leaseName}</span>
          </p>
        </div>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="resident-name" className="block text-sm font-medium text-gray-700">
              Resident Full Name
            </label>
            <input
              id="resident-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-brand-accent focus:border-brand-accent sm:text-sm"
              placeholder="e.g., Jane Doe"
            />
          </div>
          <div>
            <label htmlFor="annualized-income" className="block text-sm font-medium text-gray-700">
              Annualized Income
            </label>
            <div className="relative mt-1">
              <div className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center">
                <span className="text-gray-500 sm:text-sm">$</span>
              </div>
              <input
                id="annualized-income"
                type="number"
                value={annualizedIncome}
                onChange={(e) => setAnnualizedIncome(e.target.value)}
                required
                className="block w-full pl-7 pr-12 border-gray-300 rounded-md focus:ring-brand-accent focus:border-brand-accent sm:text-sm"
                placeholder="e.g., 50000"
              />
            </div>
          </div>
          <div className="pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-brand-blue hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-accent disabled:bg-gray-400"
            >
              {isSubmitting ? 'Adding...' : 'Add Resident'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 