'use client';

import { useState, FormEvent } from 'react';

type ResidentOption = {
  id: string;
  name: string;
}

type TenancyIncomeDocumentUploadFormProps = {
  tenancyId: string;
  residents: ResidentOption[];
  onUploadComplete: () => void;
  hasExistingDocuments: boolean;
};

const documentTypes = [
  { value: 'W2', label: 'W2' },
  { value: 'PAYSTUB', label: 'Paystub' },
  { value: 'BANK_STATEMENT', label: 'Bank Statement' },
  { value: 'OFFER_LETTER', label: 'Offer Letter' },
  { value: 'SOCIAL_SECURITY', label: 'Social Security Letter' },
];

export default function TenancyIncomeDocumentUploadForm({ tenancyId, residents, onUploadComplete, hasExistingDocuments }: TenancyIncomeDocumentUploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<string>('');
  const [residentId, setResidentId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setError(null);
      setSuccessMessage(null);
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file || !documentType || !residentId) {
      setError('Please select a file, a document type, and a resident.');
      return;
    }
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', documentType);
    formData.append('residentId', residentId);

    try {
      const res = await fetch(`/api/tenancies/${tenancyId}/documents`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      setSuccessMessage(data.message);
      onUploadComplete(); // This will trigger the data refetch in the parent component
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
       <div>
        <label htmlFor="resident-select" className="block text-sm font-medium text-gray-700">
          For which resident?
        </label>
        <div className="relative mt-1">
          <select
            id="resident-select"
            value={residentId}
            onChange={(e) => setResidentId(e.target.value)}
            required
            className="block w-full appearance-none rounded-md border border-gray-300 bg-white py-2 pl-3 pr-10 text-base text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 sm:text-sm"
          >
            <option value="" disabled>Select a resident</option>
            {residents.map((resident) => (
              <option key={resident.id} value={resident.id}>
                {resident.name}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M10 3a.75.75 0 01.55.24l3.25 3.5a.75.75 0 11-1.1 1.02L10 4.852 7.3 7.76a.75.75 0 01-1.1-1.02l3.25-3.5A.75.75 0 0110 3zm-3.76 9.24a.75.75 0 011.06.02L10 15.148l2.7-2.888a.75.75 0 111.06 1.06l-3.25 3.5a.75.75 0 01-1.06 0l-3.25-3.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      </div>
      
      <div>
        <label htmlFor="income-doc-file" className="block text-sm font-medium text-gray-700">
          Income Document
        </label>
        <p className="text-xs text-gray-500 mb-2">Upload a W-2, pay stub, etc. (PDF, JPG, PNG)</p>
        <input
          id="income-doc-file"
          type="file"
          required
          onChange={handleFileChange}
          accept="application/pdf,image/jpeg,image/png"
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
        />
      </div>

       <div>
        <label htmlFor="document-type" className="block text-sm font-medium text-gray-700">
          Document Type
        </label>
        <div className="relative mt-1">
          <select
            id="document-type"
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            required
            className="block w-full appearance-none rounded-md border border-gray-300 bg-white py-2 pl-3 pr-10 text-base text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 sm:text-sm"
          >
            <option value="" disabled>Select a document type</option>
            {documentTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M10 3a.75.75 0 01.55.24l3.25 3.5a.75.75 0 11-1.1 1.02L10 4.852 7.3 7.76a.75.75 0 01-1.1-1.02l3.25-3.5A.75.75 0 0110 3zm-3.76 9.24a.75.75 0 011.06.02L10 15.148l2.7-2.888a.75.75 0 111.06 1.06l-3.25 3.5a.75.75 0 01-1.06 0l-3.25-3.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      </div>

      {file && (
        <p className="text-sm text-gray-600">
          Selected file: {file.name}
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {successMessage && <p className="text-sm text-green-600">{successMessage}</p>}
      <div>
        <button
          type="submit"
          disabled={isLoading || !file || !residentId || !documentType}
          className="w-full px-4 py-2 text-sm font-medium text-white bg-gray-600 border border-transparent rounded-md shadow-sm hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:bg-gray-400"
        >
          {isLoading ? 'Uploading...' : (hasExistingDocuments ? 'Upload Another Document' : 'Upload Document')}
        </button>
      </div>
    </form>
  );
} 