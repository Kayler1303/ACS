'use client';

import { useState } from 'react';

interface CreateLeaseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (leaseData: { name: string; leaseStartDate: string; leaseEndDate: string; leaseRent: number | null }) => void;
  unitId: string;
}

export default function CreateLeaseDialog({ isOpen, onClose, onSubmit, unitId }: CreateLeaseDialogProps) {
  const [name, setName] = useState('');
  const [leaseStartDate, setLeaseStartDate] = useState('');
  const [leaseEndDate, setLeaseEndDate] = useState('');
  const [leaseRent, setLeaseRent] = useState<number | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, leaseStartDate, leaseEndDate, leaseRent });
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
        <h2 className="text-2xl font-bold text-brand-blue mb-4">Create New Lease</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Lease Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
              required
            />
          </div>
          <div className="mb-4">
            <label htmlFor="leaseStartDate" className="block text-sm font-medium text-gray-700">
              Lease Start Date (Optional)
            </label>
            <input
              type="date"
              id="leaseStartDate"
              value={leaseStartDate}
              onChange={(e) => setLeaseStartDate(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
            />
          </div>
          <div className="mb-4">
            <label htmlFor="leaseEndDate" className="block text-sm font-medium text-gray-700">
              Lease End Date (Optional)
            </label>
            <input
              type="date"
              id="leaseEndDate"
              value={leaseEndDate}
              onChange={(e) => setLeaseEndDate(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
            />
          </div>
          <div className="mb-4">
            <label htmlFor="leaseRent" className="block text-sm font-medium text-gray-700">
              Lease Rent (Optional)
            </label>
            <input
              type="number"
              id="leaseRent"
              value={leaseRent ?? ''}
              onChange={(e) => setLeaseRent(e.target.value ? parseFloat(e.target.value) : null)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
            />
          </div>
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-brand-blue text-white rounded-md hover:bg-blue-700"
            >
              Create Lease
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 