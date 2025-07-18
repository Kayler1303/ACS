'use client';

import React, { useState } from 'react';

const IncomeUploadForm = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string; annualizedIncome: number } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
      setError(null);
      setResult(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!file) {
      setError('Please select a file to upload.');
      return;
    }

    setIsUploading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/income/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Something went wrong with the upload.');
      }

      const data = await response.json();
      setResult(data);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto bg-white p-8 rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold mb-4">Upload Document</h2>
        <form onSubmit={handleSubmit}>
            <div className="mb-4">
                <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700">
                    Select Document (PDF, PNG, JPG)
                </label>
                <input
                    id="file-upload"
                    name="file-upload"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={handleFileChange}
                    className="mt-1 block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none"
                />
            </div>
            <div className="flex items-center justify-end">
                <button
                    type="submit"
                    disabled={!file || isUploading}
                    className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400"
                >
                    {isUploading ? 'Analyzing...' : 'Analyze Income'}
                </button>
            </div>
        </form>

        {error && (
            <div className="mt-4 text-red-600">
                <p>Error: {error}</p>
            </div>
        )}

        {result && (
            <div className="mt-6 p-4 bg-green-100 border border-green-200 rounded-lg">
                <h3 className="text-lg font-semibold text-green-800">Analysis Result</h3>
                <p className="text-green-700">{result.message}</p>
                <p className="text-green-700 font-bold">Annualized Income: ${result.annualizedIncome.toLocaleString()}</p>
            </div>
        )}
    </div>
  );
};

export default IncomeUploadForm; 