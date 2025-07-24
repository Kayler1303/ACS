'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface UnitListUploadFormProps {
  propertyId: string;
}

interface ParsedUnit {
  unitNumber: string;
  squareFootage: number | null;
}

export default function UnitListUploadForm({ propertyId }: UnitListUploadFormProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const [step, setStep] = useState(1);
  const [parsedUnits, setParsedUnits] = useState<ParsedUnit[]>([]);
  const [uniqueSquareFootages, setUniqueSquareFootages] = useState<number[]>([]);
  const [bedroomMap, setBedroomMap] = useState<Record<number, number | string>>({});

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
      setError(null);
      setStep(1);
    }
  };

  const handleParsingSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file to upload.');
      return;
    }

    setError(null);
    setIsLoading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`/api/properties/${propertyId}/upload-units`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong during file parsing');
      }
      
      setParsedUnits(data.parsedUnits);
      setUniqueSquareFootages(data.uniqueSquareFootages);
      // Initialize bedroomMap
      const initialMap: Record<number, string> = {};
      data.uniqueSquareFootages.forEach((sf: number) => {
        initialMap[sf] = '';
      });
      setBedroomMap(initialMap);
      
      setStep(2);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBedroomMapChange = (sqft: number, bedrooms: string) => {
    setBedroomMap(prev => ({ ...prev, [sqft]: bedrooms }));
  };

  const handleFinalizeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/properties/${propertyId}/finalize-units`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ parsedUnits, bedroomMap }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create units.');
      }

      router.push(`/property/${propertyId}`);
      // Refresh the page to ensure new data is loaded
      router.refresh();

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };


  if (step === 2) {
    return (
      <form onSubmit={handleFinalizeSubmit} className="space-y-6">
        <div>
          <h3 className="text-xl font-semibold text-brand-blue">Step 2: Assign Bedrooms</h3>
          <p className="text-gray-600 mt-1">
            We found {uniqueSquareFootages.length} unique unit size(s). Please specify the number of bedrooms for each size.
          </p>
        </div>
        
        <div className="space-y-4">
          {uniqueSquareFootages.map(sqft => (
            <div key={sqft} className="flex items-center justify-between">
              <label htmlFor={`bedrooms-for-${sqft}`} className="text-sm font-medium text-gray-700">
                Units with <span className="font-semibold">{sqft.toLocaleString()}</span> sq. ft. have:
              </label>
              <input
                id={`bedrooms-for-${sqft}`}
                type="number"
                value={bedroomMap[sqft] || ''}
                onChange={(e) => handleBedroomMapChange(sqft, e.target.value)}
                placeholder="e.g., 2"
                className="w-40 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-brand-accent focus:border-brand-accent sm:text-sm"
                required
              />
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end space-x-4">
           <button
            type="button"
            onClick={() => setStep(1)}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-2 text-sm font-medium text-white bg-brand-blue border border-transparent rounded-md shadow-sm hover:bg-brand-accent disabled:bg-indigo-300"
          >
            {isLoading ? 'Finalizing...' : 'Finish and Create Units'}
          </button>
        </div>
      </form>
    );
  }

  // Step 1: File Upload
  return (
    <form onSubmit={handleParsingSubmit} className="space-y-4">
      <div className="mb-6 p-4 border border-blue-200 rounded-lg bg-blue-50">
        <h4 className="font-semibold text-lg text-brand-blue mb-2">File Format Requirements</h4>
        <p className="text-sm text-gray-700">Please ensure your spreadsheet includes the following columns:</p>
        <ul className="list-disc list-inside mt-2 text-sm text-gray-600 space-y-1">
          <li>
            <strong>Unit Identifier:</strong> A column with the header 
            <code className="bg-gray-200 px-1 rounded">Unit</code>, 
            <code className="bg-gray-200 px-1 rounded">Units</code>, or 
            <code className="bg-gray-200 px-1 rounded">Bldg/Unit</code>.
          </li>
          <li>
            <strong>Square Footage:</strong> A column with the header 
            <code className="bg-gray-200 px-1 rounded">Square Footage</code>, 
            <code className="bg-gray-200 px-1 rounded">SQFT</code>, or 
            <code className="bg-gray-200 px-1 rounded">SF</code>.
          </li>
        </ul>
      </div>
      <div>
        <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700">
          Master Unit List File (CSV, XLSX, or XLS)
        </label>
        <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
          <div className="space-y-1 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
              <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="flex text-sm text-gray-600">
              <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-brand-blue hover:text-brand-accent focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-brand-accent">
                <span>Upload a file</span>
                <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={handleFileChange} accept=".csv,.xlsx,.xls" />
              </label>
              <p className="pl-1">or drag and drop</p>
            </div>
            <p className="text-xs text-gray-500">CSV, XLSX, or XLS up to 10MB</p>
            {file && <p className="text-sm text-gray-600 mt-2">{file.name}</p>}
          </div>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div>
        <button
          type="submit"
          disabled={isLoading || !file}
          className="w-full px-4 py-2 text-sm font-medium text-white bg-brand-blue border border-transparent rounded-md shadow-sm hover:bg-brand-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-accent disabled:bg-indigo-300"
        >
          {isLoading ? 'Processing...' : 'Next Step: Assign Bedrooms'}
        </button>
      </div>
    </form>
  );
} 