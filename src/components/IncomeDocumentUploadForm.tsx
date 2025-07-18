'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

type IncomeDocumentUploadFormProps = {
  residentId: string;
};

export default function IncomeDocumentUploadForm({ residentId }: IncomeDocumentUploadFormProps) {
  const [files, setFiles] = useState<FileList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setError(null);
      setSuccessMessage(null);
      setFiles(e.target.files);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!files || files.length === 0) {
      setError('Please select at least one file to upload.');
      return;
    }
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    const formData = new FormData();
    if (files) {
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
    }

    try {
      const res = await fetch(`/api/residents/${residentId}/income`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      setSuccessMessage(
        `${data.message} Annualized Income: $${data.annualizedIncome.toFixed(2)}`
      );
      router.refresh();
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="income-doc-file" className="block text-sm font-medium text-gray-700">
          Income Documents
        </label>
        <p className="text-xs text-gray-500 mb-2">Upload W-2s, pay stubs, etc. (PDF, JPG, PNG)</p>
        <input
          id="income-doc-file"
          type="file"
          required
          multiple
          onChange={handleFileChange}
          accept="application/pdf,image/jpeg,image/png"
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100"
        />
      </div>
      {files && files.length > 0 && (
        <p className="text-sm text-gray-600">
          Selected {files.length} file(s).
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {successMessage && <p className="text-sm text-green-600">{successMessage}</p>}
      <div>
        <button
          type="submit"
          disabled={isLoading || !files}
          className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300"
        >
          {isLoading ? 'Analyzing...' : 'Analyze Documents'}
        </button>
      </div>
    </form>
  );
} 