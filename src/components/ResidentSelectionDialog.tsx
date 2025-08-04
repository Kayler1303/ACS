import { useState } from 'react';

interface Resident {
  id: string;
  name: string;
  annualizedIncome?: number | null;
}

interface ResidentSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (selectedResidents: Array<{ name: string; annualizedIncome: number | null }>) => void;
  currentResidents: Resident[];
  leaseName: string;
}

export default function ResidentSelectionDialog({
  isOpen,
  onClose,
  onSubmit,
  currentResidents,
  leaseName
}: ResidentSelectionDialogProps) {
  const [selectedResidents, setSelectedResidents] = useState<
    Array<{ id: string; name: string; annualizedIncome: number | null; selected: boolean }>
  >(
    currentResidents.map(resident => ({
      id: resident.id,
      name: resident.name,
      annualizedIncome: resident.annualizedIncome || null,
      selected: true // Default to selecting all residents
    }))
  );

  if (!isOpen) return null;

  const handleResidentToggle = (residentId: string) => {
    setSelectedResidents(prev =>
      prev.map(resident =>
        resident.id === residentId
          ? { ...resident, selected: !resident.selected }
          : resident
      )
    );
  };

  const handleIncomeChange = (residentId: string, income: string) => {
    const numericIncome = income === '' ? null : parseFloat(income);
    setSelectedResidents(prev =>
      prev.map(resident =>
        resident.id === residentId
          ? { ...resident, annualizedIncome: numericIncome }
          : resident
      )
    );
  };

  const handleSubmit = () => {
    const residentsToSubmit = selectedResidents
      .filter(resident => resident.selected)
      .map(resident => ({
        name: resident.name,
        annualizedIncome: resident.annualizedIncome
      }));

    onSubmit(residentsToSubmit);
  };

  const selectedCount = selectedResidents.filter(r => r.selected).length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-brand-blue">Select Residents for Renewal</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>
        
        <div className="mb-6">
          <p className="text-gray-700 mb-2">
            Renewal lease: <span className="font-semibold">{leaseName}</span>
          </p>
          <p className="text-gray-600 text-sm">
            Select which residents to copy to the new lease and set their expected annualized income.
          </p>
        </div>

        <div className="space-y-4">
          {selectedResidents.map((resident) => (
            <div key={resident.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  checked={resident.selected}
                  onChange={() => handleResidentToggle(resident.id)}
                  className="mt-1 h-4 w-4 text-brand-blue focus:ring-brand-blue border-gray-300 rounded"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{resident.name}</div>
                  <div className="mt-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Expected Annual Income (Optional)
                    </label>
                    <input
                      type="number"
                      value={resident.annualizedIncome || ''}
                      onChange={(e) => handleIncomeChange(resident.id, e.target.value)}
                      placeholder="e.g., 45000"
                      disabled={!resident.selected}
                      className={`mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm ${
                        !resident.selected ? 'bg-gray-100 text-gray-400' : ''
                      }`}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Leave blank if unknown - can be set during verification
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            {selectedCount} of {selectedResidents.length} residents selected
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={selectedCount === 0}
              className={`px-6 py-2 rounded-md text-white font-medium ${
                selectedCount === 0
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-brand-blue hover:bg-blue-700'
              }`}
            >
              Add {selectedCount} Resident{selectedCount !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 