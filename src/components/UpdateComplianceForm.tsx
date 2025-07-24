'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface UpdateComplianceFormProps {
  propertyId: string;
}

type ParsedRow = {
  [key: string]: any;
};

type FileState = {
  file: File | null;
  isUploaded: boolean;
  data: ParsedRow[];
};

export default function UpdateComplianceForm({ propertyId }: UpdateComplianceFormProps) {
  const [rentRollDate, setRentRollDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  const [residentFileState, setResidentFileState] = useState<FileState>({ file: null, isUploaded: false, data: [] });
  const [rentRollFileState, setRentRollFileState] = useState<FileState>({ file: null, isUploaded: false, data: [] });
  
  const [mergedData, setMergedData] = useState<ParsedRow[]>([]);
  const [step, setStep] = useState(1); // 1: Upload, 2: Review

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, fileType: 'resident' | 'rentRoll') => {
    const file = e.target.files ? e.target.files[0] : null;
    if (fileType === 'resident') {
      setResidentFileState({ file, isUploaded: false, data: [] });
    } else {
      setRentRollFileState({ file, isUploaded: false, data: [] });
    }
  };

  const handleFileUpload = async (fileType: 'resident' | 'rentRoll') => {
    const fileState = fileType === 'resident' ? residentFileState : rentRollFileState;
    if (!fileState.file) {
      setError(`Please select a ${fileType === 'resident' ? 'resident' : 'rent roll'} file.`);
      return;
    }

    setIsLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', fileState.file);
    formData.append('fileType', fileType);

    try {
        const res = await fetch(`/api/properties/${propertyId}/update-compliance/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          // Try to parse JSON error, but fall back to status text if not possible
          let errorMessage = `Error: ${res.status} ${res.statusText}`;
          try {
              const data = await res.json();
              errorMessage = data.error || errorMessage;
          } catch (e) {
              // Ignore if response is not JSON
          }
          throw new Error(errorMessage);
        }
        
        const data = await res.json();
        
        if (fileType === 'resident') {
            setResidentFileState(prev => ({ ...prev, isUploaded: true, data: data }));
        } else {
            setRentRollFileState(prev => ({ ...prev, isUploaded: true, data: data }));
        }

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleReview = () => {
    setError(null);
    if (!residentFileState.isUploaded || !rentRollFileState.isUploaded) {
        setError("Please upload both resident and rent roll files before reviewing.");
        return;
    }

    const rentRollDataMap = new Map(
        rentRollFileState.data.map(row => [parseInt(String(row.unit), 10), row])
    );

    const combinedData = residentFileState.data.map(resRow => {
        const unitNumber = parseInt(String(resRow.unit), 10);
        const rentData = rentRollDataMap.get(unitNumber);
        
        // Combine lease dates, giving precedence to the rent roll file
        const leaseStartDate = rentData?.leaseStartDate || resRow.leaseStartDate;
        const leaseEndDate = rentData?.leaseEndDate || resRow.leaseEndDate;
        
        return {
            unit: resRow.unit,
            resident: resRow.resident,
            totalIncome: resRow.totalIncome,
            rent: rentData ? rentData.rent : 'N/A', // Or some other default
            leaseStartDate,
            leaseEndDate,
        };
    });

    const sortedData = [...combinedData].sort((a, b) => {
      const unitA = String(a.unit);
      const unitB = String(b.unit);
      return unitA.localeCompare(unitB, undefined, { numeric: true });
    });

    setMergedData(sortedData);
    setStep(2);
  };
  
  const handleFinalSubmit = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/properties/${propertyId}/update-compliance/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rentRollDate,
          data: mergedData,
        }),
      });

      if (!res.ok) {
        let errorMessage = `Error: ${res.status} ${res.statusText}`;
        try {
            const data = await res.json();
            errorMessage = data.error || errorMessage;
        } catch (e) {
            // Ignore if response is not JSON
        }
        throw new Error(errorMessage);
      }

      const result = await res.json();

      router.push(`/property/${propertyId}`);
      router.refresh();

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const renderFileUpload = (fileType: 'resident' | 'rentRoll') => {
    const state = fileType === 'resident' ? residentFileState : rentRollFileState;
    const title = fileType === 'resident' ? 'Resident Information' : 'Rent Roll Data';
    const description = fileType === 'resident' 
      ? "Upload a file with resident names, unit numbers, and optionally, their incomes. Columns can be named 'Resident', 'Tenant', 'Unit', 'Income', etc."
      : "Upload a file with unit numbers and their corresponding lease rents. Columns can be named 'Unit', 'Rent', 'Lease Rent', etc.";

    return (
      <div className="mb-8 p-6 border border-gray-200 rounded-lg">
        <h3 className="text-xl font-semibold mb-2 text-gray-800">{title}</h3>
        <p className="text-gray-600 mb-4 text-sm">{description}</p>
        <div className="flex items-center space-x-4">
          <input
            id={`${fileType}-file-upload`}
            type="file"
            onChange={(e) => handleFileChange(e, fileType)}
            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-brand-blue file:text-white hover:file:bg-brand-accent"
            accept=".xlsx,.xls,.csv"
            disabled={isLoading}
          />
          <button
            onClick={() => handleFileUpload(fileType)}
            disabled={isLoading || !state.file || state.isUploaded}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-blue rounded-md shadow-sm hover:bg-brand-accent disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {state.isUploaded ? 'Uploaded' : 'Upload'}
          </button>
        </div>
        {state.isUploaded && <p className="text-green-600 text-sm mt-2">File uploaded successfully!</p>}
      </div>
    );
  };

  const renderStep1 = () => (
    <div>
      <h3 className="text-xl font-semibold mb-4 text-gray-800">Step 1: Upload Documents</h3>
      <div className="mb-6">
        <label htmlFor="rentRollDate" className="block text-sm font-medium text-gray-700 mb-2">
            Snapshot Date
        </label>
        <input
            type="date"
            id="rentRollDate"
            value={rentRollDate}
            onChange={(e) => setRentRollDate(e.target.value)}
            className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-accent focus:border-brand-accent"
            required
        />
      </div>

      {renderFileUpload('resident')}
      {renderFileUpload('rentRoll')}

      <button
        onClick={handleReview}
        disabled={isLoading || !residentFileState.isUploaded || !rentRollFileState.isUploaded}
        className="w-full px-6 py-3 text-lg font-medium text-white bg-green-600 border border-transparent rounded-md shadow-sm hover:bg-green-700 disabled:bg-gray-400"
      >
        Review Combined Data
      </button>
    </div>
  );

  const renderStep2 = () => {
    const headers = ['Unit', 'Resident', 'Total Income', 'Lease Rent', 'Lease Start', 'Lease End'];
    
    return (
        <div>
        <h3 className="text-xl font-semibold mb-4 text-gray-800">Step 2: Review Combined Data</h3>
        <p className="text-gray-600 mb-6">
            Review the combined data below. This is how the information will be saved for the snapshot on <strong>{new Date(rentRollDate).toLocaleDateString()}</strong>. If everything is correct, click "Finalize".
        </p>

        <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
                <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resident</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Income</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lease Rent</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lease Start</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lease End</th>
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {mergedData.slice(0, 10).map((row, rowIndex) => (
                <tr key={rowIndex}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{row.unit}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{row.resident}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(row.totalIncome)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {typeof row.rent === 'number' 
                            ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(row.rent)
                            : row.rent}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{row.leaseStartDate ? new Date(row.leaseStartDate).toLocaleDateString() : 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{row.leaseEndDate ? new Date(row.leaseEndDate).toLocaleDateString() : 'N/A'}</td>
                </tr>
                ))}
            </tbody>
            </table>
        </div>
        {mergedData.length > 10 && (
            <p className="text-sm text-gray-500 mt-2 text-center">...and {mergedData.length - 10} more rows.</p>
        )}

        <div className="flex justify-between mt-8">
            <button
                onClick={() => setStep(1)}
                className="px-6 py-2 font-medium text-gray-700 bg-gray-200 border border-transparent rounded-md hover:bg-gray-300"
                disabled={isLoading}
            >
                Back
            </button>
            <button
                onClick={handleFinalSubmit}
                disabled={isLoading}
                className="px-6 py-2 font-medium text-white bg-green-600 border border-transparent rounded-md shadow-sm hover:bg-green-700 disabled:bg-gray-400"
            >
                {isLoading ? 'Saving...' : 'Finalize and Save Snapshot'}
            </button>
        </div>
        </div>
    );
    };

  return (
    <div>
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md mb-6" role="alert">
          <span className="block sm:inline">{error}</span>
        </div>
      )}
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
    </div>
  );
} 