'use client';

import { useState, ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface RentRollUploadFormProps {
  propertyId: string;
}

export default function RentRollUploadForm({ propertyId }: RentRollUploadFormProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]); // Default to today
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type !== 'text/csv') {
        setError('Invalid file type. Please upload a CSV file.');
        setFile(null);
      } else {
        setError(null);
        setFile(selectedFile);
      }
    }
  };

  const handleDateChange = (e: ChangeEvent<HTMLInputElement>) => {
    setDate(e.target.value);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file || !date) {
      setError('Please select a file and a date.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('date', date);

    try {
      const response = await fetch(`/api/properties/${propertyId}/rent-roll`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Something went wrong');
      }

      router.push(`/property/${propertyId}/reconciliation`);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="date-input" className="block text-sm font-medium text-gray-700">
          Snapshot Date
        </label>
        <input
          type="date"
          id="date-input"
          value={date}
          onChange={handleDateChange}
          required
          className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue sm:text-sm"
        />
      </div>
      <div>
        <label htmlFor="file-upload" className="sr-only">
          Choose file
        </label>
        <input
          id="file-upload"
          name="file-upload"
          type="file"
          onChange={handleFileChange}
          accept=".csv"
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-blue file:text-white hover:file:bg-brand-accent"
        />
      </div>
      {file && (
        <p className="text-sm text-gray-600">
          Selected file: <strong>{file.name}</strong>
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div>
        <button
          type="submit"
          disabled={isLoading || !file}
          className="w-full px-4 py-2 text-sm font-medium text-white bg-brand-blue border border-transparent rounded-md shadow-sm hover:bg-brand-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue disabled:bg-gray-400"
        >
          {isLoading ? 'Processing...' : 'Upload Rent Roll'}
        </button>
      </div>
    </form>
  );
} 