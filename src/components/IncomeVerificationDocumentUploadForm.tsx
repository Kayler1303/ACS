'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Resident {
  id: string;
  name: string;
}

interface IncomeVerificationDocumentUploadFormProps {
  onUploadComplete: () => void;
  residents: Resident[];
  verificationId: string;
  hasExistingDocuments: boolean;
}

export default function IncomeVerificationDocumentUploadForm({
  onUploadComplete,
  residents,
  verificationId,
  hasExistingDocuments,
}: IncomeVerificationDocumentUploadFormProps) {
  const [selectedFiles, setSelectedFiles] = useState<Array<{
    file: File;
    documentType: string;
    id: string;
  }>>([]);
  const [selectedResident, setSelectedResident] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const router = useRouter();

  // Pre-populate resident if there's only one (resident-specific upload)
  useEffect(() => {
    if (residents.length === 1) {
      setSelectedResident(residents[0].id);
    }
  }, [residents]);

  // Generate unique ID for file tracking
  const generateFileId = () => Math.random().toString(36).substr(2, 9);

  // Handle multiple file selection
  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles = Array.from(files).map(file => ({
      file,
      documentType: '',
      id: generateFileId()
    }));

    setSelectedFiles(prev => [...prev, ...newFiles]);
    setError(null); // Clear any existing errors
  };

  // Update document type for a specific file
  const updateFileDocumentType = (fileId: string, documentType: string) => {
    setSelectedFiles(prev => 
      prev.map(f => f.id === fileId ? { ...f, documentType } : f)
    );
  };

  // Remove a file from the selection
  const removeFile = (fileId: string) => {
    setSelectedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (selectedFiles.length === 0 || !selectedResident) {
      setError('Please select at least one file and choose a resident.');
      return;
    }

    // Check if all files have document types selected
    const filesWithoutType = selectedFiles.filter(f => !f.documentType);
    if (filesWithoutType.length > 0) {
      setError('Please select a document type for all files.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      // Upload each file individually
      const uploadPromises = selectedFiles.map(async (fileData) => {
        const formData = new FormData();
        formData.append('file', fileData.file);
        formData.append('documentType', fileData.documentType);
        formData.append('residentId', selectedResident);

        const response = await fetch(`/api/verifications/${verificationId}/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Upload failed');
        }
        
        return await response.json();
      });

      await Promise.all(uploadPromises);

      setSuccess(`Successfully uploaded ${selectedFiles.length} document${selectedFiles.length > 1 ? 's' : ''}. Analysis has started.`);
      
      // Reset form (keep resident selected if uploading for specific resident)
      setSelectedFiles([]);
      if (residents.length > 1) {
        setSelectedResident('');
      }
      (e.target as HTMLFormElement).reset();


      // Notify parent component
      onUploadComplete();
      
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      {error && <div className="p-3 bg-red-100 text-red-700 rounded-md">{error}</div>}
      {success && <div className="p-3 bg-green-100 text-green-700 rounded-md">{success}</div>}
      
      <div className="mb-6">
        <label htmlFor="resident" className="block text-sm font-medium text-gray-700 mb-1">
          For which resident?
        </label>
        {residents.length === 1 ? (
          // Show resident name when uploading for specific resident
          <div className="mt-1 block w-full px-3 py-2 text-base bg-blue-50 border border-blue-200 rounded-md">
            <div className="flex items-center">
              <span className="text-blue-800 font-medium">👤 {residents[0].name}</span>
              <span className="ml-2 text-sm text-blue-600">(Selected)</span>
            </div>
          </div>
        ) : (
          // Show dropdown when multiple residents
          <select
            id="resident"
            value={selectedResident}
            onChange={(e) => setSelectedResident(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm rounded-md"
            required
          >
            <option value="" disabled>Select a resident</option>
            {residents.map((resident) => (
              <option key={resident.id} value={resident.id}>
                {resident.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div>
        <label htmlFor="income-documents" className="block text-sm font-medium text-gray-700 mb-1">
          Income Document Files
        </label>
        <p className="text-xs text-gray-500 mb-2">Upload one or more documents (W-2, pay stubs, etc.) - PDF, JPG, PNG</p>
        <input
          id="income-documents"
          type="file"
          multiple
          onChange={handleFileSelection}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-blue file:text-white hover:file:bg-blue-700"
          accept=".pdf,.jpg,.jpeg,.png"
          required
        />
      </div>

      {/* Selected Files List */}
      {selectedFiles.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Selected Files ({selectedFiles.length})</h4>
          <div className="space-y-3">
            {selectedFiles.map((fileData) => (
              <div key={fileData.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{fileData.file.name}</p>
                  <p className="text-xs text-gray-500">{(fileData.file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <div className="flex items-center space-x-3">
                  <select
                    value={fileData.documentType}
                    onChange={(e) => updateFileDocumentType(fileData.id, e.target.value)}
                    className={`text-sm rounded-md focus:ring-brand-blue focus:border-brand-blue ${
                      fileData.documentType === '' 
                        ? 'border-red-500 border-2 bg-red-50' 
                        : 'border-gray-300'
                    }`}
                    required
                  >
                    <option value="" disabled>Select type</option>
                    <option value="W2">W-2</option>
                    <option value="PAYSTUB">Pay Stub</option>
                    <option value="BANK_STATEMENT">Bank Statement</option>
                    <option value="OFFER_LETTER">Offer Letter</option>
                    <option value="SOCIAL_SECURITY">Social Security</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeFile(fileData.id)}
                    className="text-red-600 hover:text-red-800 p-1"
                    title="Remove file"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end space-x-4">
        <button
          type="submit"
          disabled={isSubmitting || selectedFiles.length === 0}
          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-brand-blue hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue disabled:bg-gray-400"
        >
          {isSubmitting 
            ? `Uploading ${selectedFiles.length} document${selectedFiles.length > 1 ? 's' : ''}...` 
            : selectedFiles.length === 0 
              ? 'Select Files to Upload'
              : `Upload ${selectedFiles.length} Document${selectedFiles.length > 1 ? 's' : ''}`
          }
        </button>
      </div>
    </form>
  );
} 