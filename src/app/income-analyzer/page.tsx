import React from 'react';
import IncomeUploadForm from '@/components/IncomeUploadForm';

const IncomeAnalyzerPage = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold text-center mb-8">Income Analyzer</h1>
      <p className="text-center mb-8">
        Upload your income documents (e.g., W2s, pay stubs) to automatically
        calculate your annualized income.
      </p>
      <IncomeUploadForm />
    </div>
  );
};

export default IncomeAnalyzerPage; 