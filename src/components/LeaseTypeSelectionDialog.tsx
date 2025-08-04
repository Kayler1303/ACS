interface LeaseTypeSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRenewal: () => void;
  onSelectNewLease: () => void;
  leaseName: string;
}

export default function LeaseTypeSelectionDialog({
  isOpen,
  onClose,
  onSelectRenewal,
  onSelectNewLease,
  leaseName
}: LeaseTypeSelectionDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-brand-blue">Lease Type</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>
        
        <div className="mb-6">
          <p className="text-gray-700 mb-4">
            You're creating: <span className="font-semibold">{leaseName}</span>
          </p>
          <p className="text-gray-600 text-sm">
            Is this a lease renewal with existing residents, or a completely new lease with new residents?
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={onSelectRenewal}
            className="w-full p-4 border-2 border-blue-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors text-left"
          >
            <div className="flex items-center">
              <div className="mr-3 text-2xl">🔄</div>
              <div>
                <div className="font-semibold text-brand-blue">Lease Renewal</div>
                <div className="text-sm text-gray-600">Copy existing residents from current lease</div>
              </div>
            </div>
          </button>

          <button
            onClick={onSelectNewLease}
            className="w-full p-4 border-2 border-green-200 rounded-lg hover:border-green-400 hover:bg-green-50 transition-colors text-left"
          >
            <div className="flex items-center">
              <div className="mr-3 text-2xl">✨</div>
              <div>
                <div className="font-semibold text-green-700">New Lease</div>
                <div className="text-sm text-gray-600">Add completely new residents</div>
              </div>
            </div>
          </button>
        </div>

        <div className="mt-6 text-center">
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