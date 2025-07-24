'use client';

import { useState } from 'react';
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
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<string>('');
  const [selectedResident, setSelectedResident] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!file || !documentType || !selectedResident) {
      setError('Please fill in all fields.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', documentType);
    formData.append('residentId', selectedResident);

    try {
      const response = await fetch(`/api/verifications/${verificationId}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }
      
      const result = await response.json();

      setSuccess(`Successfully uploaded ${file.name}. Analysis has started.`);
      
      // Reset form
      setFile(null);
      setDocumentType('');
      setSelectedResident('');
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
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="resident" className="block text-sm font-medium text-gray-700 mb-1">
            For which resident?
          </label>
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
        </div>

        <div>
          <label htmlFor="document-type" className="block text-sm font-medium text-gray-700 mb-1">
            Document Type
          </label>
          <select
            id="document-type"
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm rounded-md"
            required
          >
            <option value="" disabled>Select a document type</option>
            <option value="W2">W-2</option>
            <option value="PAY_STUB">Pay Stub</option>
            <option value="BANK_STATEMENT">Bank Statement</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="income-document" className="block text-sm font-medium text-gray-700 mb-1">
          Income Document File
        </label>
        <p className="text-xs text-gray-500 mb-2">Upload a W-2, pay stub, etc. (PDF, JPG, PNG)</p>
        <input
          id="income-document"
          type="file"
          onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-blue file:text-white hover:file:bg-blue-700"
          accept=".pdf,.jpg,.jpeg,.png"
          required
        />
      </div>

      <div className="flex justify-end space-x-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-brand-blue hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue disabled:bg-gray-400"
        >
          {isSubmitting ? 'Uploading...' : hasExistingDocuments ? 'Upload Another Document' : 'Upload Document'}
        </button>
      </div>
    </form>
  );
} 