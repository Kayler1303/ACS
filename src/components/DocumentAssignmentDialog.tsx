import { useState } from 'react';

interface DocumentAssignmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  newLeaseResidents: Array<{ id: string; name: string }>;
  onAssignDocuments: (selectedResidentId: string) => Promise<void>;
  pendingFiles?: Array<{ file: File; documentType: string }>;
}

export default function DocumentAssignmentDialog({
  isOpen,
  onClose,
  newLeaseResidents,
  onAssignDocuments,
  pendingFiles
}: DocumentAssignmentDialogProps) {
  const [selectedResidentId, setSelectedResidentId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!selectedResidentId) return;
    
    try {
      setIsSubmitting(true);
      await onAssignDocuments(selectedResidentId);
    } catch (error) {
      console.error('Error assigning documents:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-full p-4 text-center">
        <div className="fixed inset-0 bg-black bg-opacity-25" onClick={onClose} />
        
        <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
          <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10">
                <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-4.5A1.125 1.125 0 0110.5 9h-3.75a3.375 3.375 0 00-3.375 3.375v1.875c0 .621.504 1.125 1.125 1.125h.375M19.5 14.25v4.5a1.125 1.125 0 01-1.125 1.125h-9a1.125 1.125 0 01-1.125-1.125v-4.5M19.5 14.25H15.75a1.125 1.125 0 00-1.125 1.125v.75" />
                </svg>
              </div>
              <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                <h3 className="text-lg font-medium leading-6 text-gray-900">
                  Assign Documents to Resident
                </h3>
                <div className="mt-2">
                  <p className="text-sm text-gray-500 mb-4">
                    New lease created successfully! Now choose which resident these uploaded documents belong to:
                  </p>

                  {pendingFiles && pendingFiles.length > 0 && (
                    <div className="mb-4 p-3 bg-gray-50 rounded-md">
                      <p className="text-sm font-medium text-gray-700 mb-2">Documents to assign:</p>
                      <ul className="text-sm text-gray-600">
                        {pendingFiles.map((file, index) => (
                          <li key={index} className="flex justify-between">
                            <span>{file.file.name}</span>
                            <span className="text-xs text-gray-400">{file.documentType}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700">
                      Select Resident:
                    </label>
                    {newLeaseResidents.map((resident) => (
                      <div key={resident.id} className="flex items-center">
                        <input
                          id={`resident-${resident.id}`}
                          name="resident-selection"
                          type="radio"
                          value={resident.id}
                          checked={selectedResidentId === resident.id}
                          onChange={(e) => setSelectedResidentId(e.target.value)}
                          className="h-4 w-4 border-gray-300 text-brand-blue focus:ring-brand-blue"
                        />
                        <label htmlFor={`resident-${resident.id}`} className="ml-2 block text-sm text-gray-900">
                          {resident.name}
                        </label>
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
              onClick={handleSubmit}
              disabled={!selectedResidentId || isSubmitting}
              className={`inline-flex w-full justify-center rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm sm:ml-3 sm:w-auto ${
                !selectedResidentId || isSubmitting
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-brand-blue hover:bg-blue-700'
              }`}
            >
              {isSubmitting ? 'Uploading...' : 'Assign Documents'}
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