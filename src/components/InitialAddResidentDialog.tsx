'use client';

interface InitialAddResidentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onRenewal: () => void;
  onNewApplicant: () => void;
  leaseName: string;
}

export default function InitialAddResidentDialog({
  isOpen,
  onClose,
  onRenewal,
  onNewApplicant,
  leaseName,
}: InitialAddResidentDialogProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-8 text-center">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Add a Resident</h2>
        <p className="text-sm text-gray-500 mb-8">
          For provisional lease: <span className="font-medium">{leaseName}</span>
        </p>
        <p className="text-gray-700 mb-6">Is this a renewal of a previous resident or a new applicant?</p>

        <div className="flex justify-center space-x-4">
          <button
            onClick={onRenewal}
            className="px-6 py-3 text-white bg-brand-blue rounded-md hover:bg-opacity-90 flex-1"
          >
            Renewal
          </button>
          <button
            onClick={onNewApplicant}
            className="px-6 py-3 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 flex-1"
          >
            New Applicant
          </button>
        </div>
        
        <div className="text-center mt-8">
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