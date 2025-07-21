'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, Fragment, useCallback } from 'react';
import Link from 'next/link';
import TenancyIncomeDocumentUploadForm from '@/components/TenancyIncomeDocumentUploadForm';
import VerificationFinalizationDialog from '@/components/VerificationFinalizationDialog';
import { format } from 'date-fns';

// --- NEW Data Structures ---

interface IncomeDocument {
  id: string;
  documentType: string;
  documentDate: Date;
  uploadDate: Date;
  status: string;
  taxYear?: number;
  employeeName?: string;
  employerName?: string;
  box1_wages?: number;
  box3_ss_wages?: number;
  box5_med_wages?: number;
  residentId?: string; // Add residentId to the interface
}

interface IncomeVerification {
  id: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  finalizedAt?: string | null;
  calculatedVerifiedIncome: number | null;
  incomeDocuments: IncomeDocument[];
  // Add new lease-period fields
  reason?: string;
  verificationPeriodStart?: string;
  verificationPeriodEnd?: string;
  dueDate?: string;
  reminderSentAt?: string | null;
  leaseYear?: number;
  associatedLeaseStart?: string;
  associatedLeaseEnd?: string;
}

interface Resident {
  id: string;
  name: string;
  annualizedIncome: number;
  verifiedIncome: number | null;
  createdAt: string;
  updatedAt: string;
}

interface Unit {
  id: string;
  unitNumber: string;
  squareFootage: number | null;
  bedroomCount: number | null;
}

interface RentRoll {
  id: string;
  date: string;
}

interface TenancyData {
  id: string;
  leaseRent: string | null;
  residents: Resident[];
  unit: Unit;
  rentRoll: RentRoll;
  incomeVerifications: IncomeVerification[];
  leaseStartDate: string;
  leaseEndDate: string;
}

// --- NEW VerificationRow Component ---

function VerificationRow({ verification, tenancy, onActionComplete }: { verification: IncomeVerification, tenancy: TenancyData, onActionComplete: () => void }) {
  
  const getResidentName = (residentId: string) => {
    return tenancy.residents.find(r => r.id === residentId)?.name || 'Unknown Resident';
  }

  const handleDelete = async (documentId: string) => {
    if (!window.confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
      return;
    }
    try {
      // Note: This endpoint would also need to be created if it doesn't exist.
      // For now, assuming it will exist at /api/tenancies/:tenancyId/documents/:documentId
      const res = await fetch(`/api/tenancies/${tenancy.id}/documents/${documentId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete document');
      }
      onActionComplete();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h4 className="font-semibold text-gray-800">
            Verification Period ({verification.status})
          </h4>
          <p className="text-xs text-gray-500">
            Started: {format(new Date(verification.createdAt), 'MM/dd/yyyy')}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-gray-500">Calculated Income</p>
          <p className="font-semibold text-lg text-green-600">
            {verification.calculatedVerifiedIncome 
              ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(verification.calculatedVerifiedIncome)
              : <span className="text-gray-400">N/A</span>
            }
          </p>
        </div>
      </div>
      
      {verification.incomeDocuments.length > 0 ? (
        <ul className="space-y-3">
          {verification.incomeDocuments.map((doc) => (
            <li key={doc.id} className="p-3 border rounded-md bg-white shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold text-gray-800">{doc.documentType}</p>
                  <p className="text-sm text-gray-500">
                    For: <span className="font-medium">{getResidentName((doc as any).residentId)}</span>
                  </p>
                  <p className="text-sm text-gray-500">
                    Uploaded: {format(new Date(doc.uploadDate), 'MM/dd/yyyy')}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                   <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      doc.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                      doc.status === 'PROCESSING' ? 'bg-yellow-100 text-yellow-800' :
                      doc.status === 'NEEDS_REVIEW' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {doc.status}
                    </span>
                  <button 
                    onClick={() => handleDelete(doc.id)}
                    className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100"
                    aria-label="Delete document"
                  >
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                  </button>
                </div>
              </div>
              {doc.documentType === 'W2' && doc.status === 'COMPLETED' && (
                <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-600 space-y-1">
                  <p><strong>Tax Year:</strong> {doc.taxYear || 'N/A'}</p>
                  <p><strong>Employer:</strong> {doc.employerName || 'N/A'}</p>
                  <p><strong>Employee:</strong> {doc.employeeName || 'N/A'}</p>
                   <div className="grid grid-cols-3 gap-x-2 pt-1">
                    <p><strong>Box 1:</strong> {doc.box1_wages ? `$${doc.box1_wages.toLocaleString()}` : 'N/A'}</p>
                    <p><strong>Box 3:</strong> {doc.box3_ss_wages ? `$${doc.box3_ss_wages.toLocaleString()}` : 'N/A'}</p>
                    <p><strong>Box 5:</strong> {doc.box5_med_wages ? `$${doc.box5_med_wages.toLocaleString()}` : 'N/A'}</p>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500 text-center py-2">No documents in this period yet.</p>
      )}
    </div>
  );
}


// --- UPDATED ResidentRow Component ---

function ResidentRow({ resident, totalIncome }: { resident: Resident, totalIncome: number }) {
  const residentIncome = resident.annualizedIncome || 0;
  const incomePercentage = totalIncome > 0 ? (residentIncome / totalIncome) * 100 : 0;
  
  return (
    <tr key={resident.id}>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
          {resident.name}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(residentIncome)}
      </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {resident.verifiedIncome 
          ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(resident.verifiedIncome)
          : <span className="text-gray-400">N/A</span>
        }
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {incomePercentage.toFixed(1)}%
      </td>
    </tr>
  );
}

// --- UPDATED ResidentDetailPage Component & Polling Logic ---

export default function ResidentDetailPage() {
  const params = useParams();
  const { id: propertyId, rentRollId, unitId } = params;
  
  const [tenancyData, setTenancyData] = useState<TenancyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finalizationDialog, setFinalizationDialog] = useState<{
    isOpen: boolean;
    verification: IncomeVerification | null;
  }>({ isOpen: false, verification: null });

  const formatUnitNumber = (unitNumber: string) => parseInt(unitNumber, 10).toString();

  const handleCreateNewVerification = async () => {
    if (!tenancyData) return;
    
    // Only show confirmation if there's an existing in-progress verification
    const hasInProgressVerification = tenancyData.incomeVerifications?.some(v => v.status === 'IN_PROGRESS');
    if (hasInProgressVerification && !window.confirm('Are you sure you want to start a new verification period? This will finalize the current in-progress period.')) {
        return;
    }
    
    try {
        const res = await fetch(`/api/tenancies/${tenancyData.id}/verifications`, {
            method: 'POST',
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to start new verification');
        }

        fetchTenancyData(false); // This will refetch the data and update the UI
    } catch (err: any) {
        alert(`Error: ${err.message}`);
    }
  };

  const handleOpenFinalizationDialog = (verification: IncomeVerification) => {
    setFinalizationDialog({ isOpen: true, verification });
  };

  const handleCloseFinalizationDialog = () => {
    setFinalizationDialog({ isOpen: false, verification: null });
  };

  const handleFinalizeVerification = async (calculatedIncome: number) => {
    if (!finalizationDialog.verification || !tenancyData) return;

    try {
      const res = await fetch(`/api/tenancies/${tenancyData.id}/verifications`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'finalize',
          verificationId: finalizationDialog.verification.id,
          calculatedVerifiedIncome: calculatedIncome
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to finalize verification');
      }

      const result = await res.json();
      
      // Close dialog and refresh data
      handleCloseFinalizationDialog();
      fetchTenancyData(false);
      
      // Show success message
      alert('Verification finalized successfully!');
      
    } catch (err: any) {
      console.error('Finalization error:', err);
      alert(`Error: ${err.message}`);
      throw err; // Re-throw so dialog can handle error state
    }
  };

  const fetchTenancyData = useCallback(async (showLoadingSpinner = true) => {
    if (!propertyId || !rentRollId || !unitId) {
      setError('Missing required parameters');
      if (showLoadingSpinner) setLoading(false);
      return;
    }
    try {
      if (showLoadingSpinner) setLoading(true);
      const response = await fetch(`/api/properties/${propertyId}/rent-roll/${rentRollId}/unit/${unitId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch tenancy data');
      }
      const data = await response.json();
      setTenancyData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      if (showLoadingSpinner) setLoading(false);
    }
  }, [propertyId, rentRollId, unitId]);

  useEffect(() => {
    fetchTenancyData();
  }, [fetchTenancyData]);

  // Updated Effect for polling
  useEffect(() => {
    const isProcessing = tenancyData?.incomeVerifications.some(v =>
        v.incomeDocuments.some(d => d.status === 'PROCESSING' || d.status === 'UPLOADED')
    );

    if (isProcessing) {
      const interval = setInterval(() => {
        fetchTenancyData(false);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [tenancyData, fetchTenancyData]);

  // New function to create lease periods based on tenancy data
  const createLeasePeriods = () => {
    if (!tenancyData) return [];
    
    const periods = [];
    const leaseStart = new Date(tenancyData.leaseStartDate);
    const leaseEnd = new Date(tenancyData.leaseEndDate);
    const currentDate = new Date();
    
    // Calculate how many years the lease spans
    const totalLeaseYears = Math.ceil((leaseEnd.getTime() - leaseStart.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    
    for (let year = 1; year <= Math.max(totalLeaseYears, 1); year++) {
      const periodStart = new Date(leaseStart);
      periodStart.setFullYear(leaseStart.getFullYear() + (year - 1));
      
      const periodEnd = new Date(periodStart);
      periodEnd.setFullYear(periodStart.getFullYear() + 1);
      periodEnd.setDate(periodEnd.getDate() - 1);
      
      // Don't include future periods that are more than 6 months out
      const sixMonthsFromNow = new Date();
      sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
      if (periodStart > sixMonthsFromNow) continue;
      
      // Find verification for this period
      const verification = tenancyData.incomeVerifications.find(v => {
        // First check by lease year
        if (v.leaseYear === year) return true;
        
        // Then check by verification period dates
        if (v.verificationPeriodStart) {
          const verificationStart = new Date(v.verificationPeriodStart);
          return verificationStart.getFullYear() === periodStart.getFullYear();
        }
        
        // Fallback: check if verification was created recently for periods that don't have specific lease years yet
        if (!v.leaseYear && v.status === 'IN_PROGRESS') {
          const createdAt = new Date(v.createdAt);
          const now = new Date();
          const timeDiff = now.getTime() - createdAt.getTime();
          const hoursDiff = timeDiff / (1000 * 3600);
          return hoursDiff < 1; // Created within the last hour
        }
        
        return false;
      });
      
      // Calculate total annualized income for this period
      const totalAnnualizedIncome = tenancyData.residents.reduce((sum, resident) => 
        sum + (resident.annualizedIncome || 0), 0
      );
      
      periods.push({
        leaseYear: year,
        periodStart,
        periodEnd,
        totalAnnualizedIncome,
        verification,
        isCurrentPeriod: currentDate >= periodStart && currentDate <= periodEnd,
        status: getPeriodStatus({ verification })
      });
    }
    
    // Return newest periods first
    return periods.sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime());
  };

  const getPeriodStatus = (period: { verification?: IncomeVerification | null }) => {
    if (!period.verification) return 'needs_verification';
    if (period.verification.status === 'IN_PROGRESS') return 'in_progress';
    if (period.verification.status === 'FINALIZED') return 'completed';
    if (period.verification.dueDate && new Date(period.verification.dueDate) < new Date()) return 'overdue';
    return 'pending';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">✓ Verified</span>;
      case 'in_progress':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">📝 In Progress</span>;
      case 'overdue':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">⚠️ Overdue</span>;
      case 'needs_verification':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">📋 Needs Verification</span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Pending</span>;
    }
  };

  const handleStartVerification = async (leaseYear: number) => {
    if (!tenancyData) return;
    
    try {
      const res = await fetch(`/api/tenancies/${tenancyData.id}/verifications`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start verification');
      }

      fetchTenancyData(false);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const leasePeriods = createLeasePeriods();


  if (loading) {
     return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-brand-blue mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading resident details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
         <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Error Loading Data</h2>
          <p className="text-red-600">{error}</p>
          <Link href={`/property/${propertyId}`} className="inline-block mt-4 text-brand-blue hover:underline">
            ← Back to Property
          </Link>
        </div>
      </div>
    );
  }

  if (!tenancyData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">No Data Found</h2>
          <p className="text-gray-600 mb-4">No tenancy data found for this unit and rent roll.</p>
          <Link href={`/property/${propertyId}`} className="text-brand-blue hover:underline">
            ← Back to Property
          </Link>
        </div>
      </div>
    );
  }

  const totalIncome = tenancyData?.residents.reduce((sum, resident) => 
    sum + (resident.annualizedIncome || 0), 0
  ) || 0;

  const inProgressVerification = tenancyData?.incomeVerifications.find(v => v.status === 'IN_PROGRESS');
  const finalizedVerifications = tenancyData?.incomeVerifications.filter(v => v.status !== 'IN_PROGRESS');

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href={`/property/${propertyId}`} className="text-brand-blue hover:underline mb-4 inline-block">
          ← Back to Property
        </Link>
        <h1 className="text-4xl font-bold text-brand-blue">Unit {formatUnitNumber(tenancyData.unit.unitNumber)} - Resident Details</h1>
      </div>

       <div className="bg-white p-6 rounded-lg shadow-md mb-8">
        <h2 className="text-2xl font-semibold text-brand-blue mb-4">Unit Information</h2>
         <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm font-medium text-gray-500">Unit Number</p>
            <p className="text-lg font-semibold text-gray-900">{formatUnitNumber(tenancyData.unit.unitNumber)}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Square Footage</p>
            <p className="text-lg font-semibold text-gray-900">
              {tenancyData.unit.squareFootage ? tenancyData.unit.squareFootage.toLocaleString() : 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Bedrooms</p>
            <p className="text-lg font-semibold text-gray-900">
              {tenancyData.unit.bedroomCount ?? 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Lease Rent</p>
            <p className="text-lg font-semibold text-gray-900">
              {tenancyData.leaseRent 
                ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parseFloat(tenancyData.leaseRent))
                : 'N/A'
              }
            </p>
          </div>
        </div>
      </div>

       <div className="bg-white p-6 rounded-lg shadow-md mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold text-brand-blue">Lease Period Income Verification</h2>
          <div className="text-sm text-gray-500">
            <span className="font-medium">Current Lease:</span> {tenancyData ? `${format(new Date(tenancyData.leaseStartDate), 'MMM d, yyyy')} - ${format(new Date(tenancyData.leaseEndDate), 'MMM d, yyyy')}` : 'N/A'}
          </div>
        </div>

        {leasePeriods.length === 0 ? (
          <div className="text-center p-4 border-dashed border-2 border-gray-300 rounded-lg">
            <p className="text-gray-500">No lease periods found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Lease Period
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Verification Details
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {leasePeriods.map((period) => (
                  <tr key={period.leaseYear} className={period.isCurrentPeriod ? 'bg-blue-50' : ''}>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {format(period.periodStart, 'MMM d, yyyy')} - {format(period.periodEnd, 'MMM d, yyyy')}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Year {period.leaseYear}
                        {period.isCurrentPeriod && (
                          <span className="ml-2 text-blue-600 font-semibold">Current Period</span>
                        )}
                      </div>
                      {period.verification?.dueDate && (
                        <div className="text-xs text-red-600 mt-1 font-medium">
                          Due: {format(new Date(period.verification.dueDate), 'MMM d, yyyy')}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {period.verification ? (
                        <div className="space-y-2">
                          <div className="text-xs text-gray-500">
                            <div>Started: {format(new Date(period.verification.createdAt), 'MMM d, yyyy')}</div>
                            {period.verification.reason && (
                              <div className="capitalize">
                                Reason: {period.verification.reason.replace('_', ' ').toLowerCase()}
                              </div>
                            )}
                          </div>
                          {period.verification.incomeDocuments && period.verification.incomeDocuments.length > 0 ? (
                            <div className="space-y-2">
                              <div className="text-xs font-medium text-gray-700">Documents ({period.verification.incomeDocuments.length}):</div>
                              <div className="space-y-1 max-h-32 overflow-y-auto">
                                {period.verification.incomeDocuments.map((doc) => {
                                  // Find the resident for this document
                                  const resident = tenancyData?.residents.find(r => r.id === doc.residentId);
                                  return (
                                    <div key={doc.id} className="text-xs border rounded p-2 bg-gray-50">
                                      <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center space-x-2">
                                          <span className="font-medium text-gray-700">{doc.documentType}</span>
                                          {resident && (
                                            <span className="text-xs text-blue-600 font-medium">({resident.name})</span>
                                          )}
                                        </div>
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                          doc.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                                          doc.status === 'PROCESSING' ? 'bg-yellow-100 text-yellow-800' :
                                          'bg-red-100 text-red-800'
                                        }`}>
                                          {doc.status}
                                        </span>
                                      </div>
                                      {doc.documentType === 'W2' && doc.status === 'COMPLETED' && (
                                        <div className="mt-1 text-gray-600 space-y-1">
                                          {doc.taxYear && <div>Tax Year: {doc.taxYear}</div>}
                                          {doc.employerName && <div>Employer: {doc.employerName}</div>}
                                          {doc.box1_wages && (
                                            <div className="font-medium text-green-700">
                                              Wages: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(doc.box1_wages)}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      {doc.uploadDate && (
                                        <div className="text-gray-400 mt-1">
                                          Uploaded: {format(new Date(doc.uploadDate), 'MMM d, yyyy')}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-gray-500 italic">No documents uploaded yet</div>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-500 italic">No verification started</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(period.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {period.status === 'needs_verification' && (
                        <button 
                          onClick={() => handleStartVerification(period.leaseYear)}
                          className="text-brand-blue hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-md transition-colors"
                        >
                          Verify Income
                        </button>
                      )}
                      {period.status === 'in_progress' && period.verification && (
                        <div className="space-y-2">
                          <button 
                            onClick={() => {/* TODO: Open verification details modal */}}
                            className="text-blue-600 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-md transition-colors block w-full text-left"
                          >
                            Continue Verification
                          </button>
                          <button 
                            onClick={() => handleOpenFinalizationDialog(period.verification!)}
                            className="text-green-600 hover:text-green-900 bg-green-50 hover:bg-green-100 px-3 py-1 rounded-md transition-colors block w-full text-left"
                          >
                            Finalize Verification
                          </button>
                        </div>
                      )}
                      {period.status === 'completed' && period.verification && (
                        <button 
                          onClick={() => {/* TODO: View verification details */}}
                          className="text-green-600 hover:text-green-900 bg-green-50 hover:bg-green-100 px-3 py-1 rounded-md transition-colors"
                        >
                          View Details
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Show upload form for in-progress verification */}
        {(() => {
          const inProgressPeriod = leasePeriods.find(p => p.status === 'in_progress');
          return inProgressPeriod && (
            <div className="mt-6 p-4 border rounded-lg bg-blue-50">
              <h4 className="font-semibold text-gray-700 mb-3">Upload Documents for In-Progress Verification</h4>
              <TenancyIncomeDocumentUploadForm
                tenancyId={tenancyData?.id || ''}
                residents={tenancyData?.residents.map(r => ({ id: r.id, name: r.name })) || []}
                onUploadComplete={() => fetchTenancyData(false)}
                hasExistingDocuments={!!inProgressPeriod.verification?.incomeDocuments?.length}
              />
            </div>
          );
        })()}
      </div>

      <div className="bg-white p-6 rounded-lg shadow-md">
         <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold text-brand-blue">Resident Information</h2>
          <p className="text-sm text-gray-500">
            As of: <span className="font-medium">{new Date(tenancyData.rentRoll.date).toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}</span>
          </p>
        </div>
        
        {tenancyData.residents.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No residents found for this unit in the selected rent roll.</p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-lg font-medium text-gray-700">
                  Total Residents: <span className="font-semibold">{tenancyData.residents.length}</span>
                </p>
                <p className="text-lg font-medium text-gray-700">
                  Total Household Income: <span className="font-semibold text-green-600">
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalIncome)}
                  </span>
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                     <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Resident Name
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Annualized Income
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Verified Income
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      % of Total Income
                    </th>
                  </tr>
                </thead>
                 <tbody className="bg-white divide-y divide-gray-200">
                  {tenancyData.residents.map((resident) => (
                    <ResidentRow key={resident.id} resident={resident} totalIncome={totalIncome} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Finalization Dialog */}
      {finalizationDialog.verification && (
        <VerificationFinalizationDialog
          isOpen={finalizationDialog.isOpen}
          onClose={handleCloseFinalizationDialog}
          onConfirm={handleFinalizeVerification}
          verification={finalizationDialog.verification}
          residents={tenancyData?.residents || []}
          tenancyId={tenancyData?.id || ''}
        />
      )}
    </div>
  );
} 