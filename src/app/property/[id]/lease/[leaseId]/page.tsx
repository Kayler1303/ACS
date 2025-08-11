'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import IncomeVerificationUploadDialog from '@/components/IncomeVerificationUploadDialog';
import VerificationFinalizationDialog from '@/components/VerificationFinalizationDialog';
import ResidentFinalizationDialog from '@/components/ResidentFinalizationDialog';

interface Resident {
  id: string;
  name: string;
  annualizedIncome: number;
  calculatedAnnualizedIncome?: number;
  incomeFinalized: boolean;
  finalizedAt?: string;
  hasNoIncome: boolean;
}

interface IncomeVerification {
  id: string;
  status: string;
  createdAt: string;
  finalizedAt?: string;
  IncomeDocument?: any[];
  incomeDocuments?: any[];
}

interface LeaseData {
  lease: {
    id: string;
    name: string;
    leaseStartDate?: string;
    leaseEndDate?: string;
    leaseRent?: number;
    Resident: Resident[];
    IncomeVerification: IncomeVerification[];
    Tenancy?: {
      id: string;
      rentRollId: string;
      RentRoll?: {
        id: string;
        date: string;
      };
    } | null;
  };
  unit: {
    id: string;
    unitNumber: string;
    bedroomCount: number;
    squareFootage?: number;
  };
  property: {
    id: string;
    name: string;
  };
}

export default function LeaseDetailPage() {
  const params = useParams();
  const { id: propertyId, leaseId } = params;
  const router = useRouter();
  
  const [leaseData, setLeaseData] = useState<LeaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modal states
  const [isUploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [finalizationDialog, setFinalizationDialog] = useState<{
    isOpen: boolean;
    verification: IncomeVerification | null;
  }>({ isOpen: false, verification: null });
  const [selectedResidentForUpload, setSelectedResidentForUpload] = useState<Resident | null>(null);
  const [residentFinalizationDialog, setResidentFinalizationDialog] = useState<{
    isOpen: boolean;
    verification: IncomeVerification | null;
    resident: Resident | null;
    leaseName: string;
  }>({ isOpen: false, verification: null, resident: null, leaseName: '' });

  // Define handleRefresh first (before any conditional returns)
  const handleRefresh = useCallback(async () => {
    if (!leaseId || !propertyId) return;
    
    try {
      setLoading(true);
      const response = await fetch(`/api/leases/${leaseId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch lease data');
      }
      
      const data = await response.json();
      setLeaseData(data);

      // If this lease has a tenancy (is part of a rent roll), redirect to the unit page
      if (data.lease.Tenancy) {
        const rentRollId = data.lease.Tenancy.rentRollId;
        const unitId = data.unit.id;
        router.replace(`/property/${propertyId}/rent-roll/${rentRollId}/unit/${unitId}`);
        return;
      }

    } catch (err) {
      console.error('Error fetching lease data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load lease data');
    } finally {
      setLoading(false);
    }
  }, [leaseId, propertyId, router]);

  const markResidentNoIncome = async (residentId: string, verificationId: string) => {
    try {
      const response = await fetch(`/api/leases/${leaseId}/verifications/${verificationId}/residents/${residentId}/no-income`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Failed to mark resident as no income');
      }

      // Refresh the lease data to show updated status
      handleRefresh();
    } catch (error) {
      console.error('Error marking resident as no income:', error);
      // Could add toast notification here
    }
  };

  const handleFinalizeResidentVerification = async (calculatedIncome: number) => {
    if (!residentFinalizationDialog.verification || !residentFinalizationDialog.resident) return;
    
    const { verification, resident } = residentFinalizationDialog;
    const currentLeaseId = leaseId;
    const verificationId = verification.id;
    const residentId = resident.id;
    
    try {
      const res = await fetch(`/api/leases/${currentLeaseId}/verifications/${verificationId}/residents/${residentId}/finalize`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          calculatedVerifiedIncome: calculatedIncome,
        }),
      });

      if (!res.ok) {
        let errorMsg = 'Failed to finalize resident verification';
        try {
          const data = await res.json();
          errorMsg = data.error || errorMsg;
        } catch (e) {
          console.error("Could not parse error response as JSON", res.status, res.statusText);
        }
        throw new Error(errorMsg);
      }

      const result = await res.json();
      
      // Close dialog and refresh data
      setResidentFinalizationDialog({ isOpen: false, verification: null, resident: null, leaseName: '' });
      
      await handleRefresh();
      
      // Optional: Show success message
      console.log(`${resident.name}'s income finalized successfully!`);
    } catch (error: unknown) {
      console.error('Error finalizing resident verification:', error);
      alert((error instanceof Error ? error.message : 'An error occurred while finalizing the resident verification.'));
    }
  };



  // Automatically create income verification for future leases if one doesn't exist
  const ensureIncomeVerification = async () => {
    if (!leaseData) return;
    
    const { lease } = leaseData;
    const hasVerification = lease.IncomeVerification && lease.IncomeVerification.length > 0;
    
    if (!hasVerification) {
      try {
        const response = await fetch(`/api/leases/${leaseId}/verifications`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reason: 'FUTURE_LEASE_VERIFICATION'
          }),
        });

        if (response.ok) {
          handleRefresh();
        }
      } catch (error) {
        console.error('Error auto-creating income verification:', error);
      }
    }
  };

  useEffect(() => {
    const fetchLeaseData = async () => {
      if (!leaseId || !propertyId) return;
      
      try {
        setLoading(true);
        const response = await fetch(`/api/leases/${leaseId}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch lease data');
        }
        
        const data = await response.json();
        setLeaseData(data);

        // If this lease has a tenancy (is part of a rent roll), redirect to the unit page
        if (data.lease.Tenancy) {
          const rentRollId = data.lease.Tenancy.rentRollId;
          const unitId = data.unit.id;
          router.replace(`/property/${propertyId}/rent-roll/${rentRollId}/unit/${unitId}`);
          return;
        }

      } catch (err) {
        console.error('Error fetching lease data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load lease data');
      } finally {
        setLoading(false);
      }
    };

    fetchLeaseData();
  }, [leaseId, propertyId, router]);

  // Auto-create income verification when page loads
  useEffect(() => {
    if (leaseData) {
      ensureIncomeVerification();
    }
  }, [leaseData]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !leaseData) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <h1 className="text-lg font-semibold text-red-800 mb-2">Error Loading Lease</h1>
          <p className="text-red-600">{error || 'Lease not found'}</p>
          <div className="mt-4">
            <Link
              href={`/property/${propertyId}`}
              className="text-blue-600 hover:text-blue-700 underline"
            >
              ← Back to Property
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { lease, unit, property } = leaseData;
  const verification = lease.IncomeVerification?.[0];

  // If we get here, it's a future lease (no tenancy record)
  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <Link
          href={`/property/${propertyId}`}
          className="text-blue-600 hover:text-blue-700 underline mb-2 inline-block"
        >
          ← Back to {property.name}
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">
          Unit {unit.unitNumber} - {lease.name}
        </h1>
        <div className="flex items-center space-x-4 mt-2">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
            Future Lease
          </span>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Lease Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <p className="text-sm font-medium text-gray-500">Unit Number</p>
            <p className="text-lg text-gray-900">{unit.unitNumber}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Bedrooms</p>
            <p className="text-lg text-gray-900">{unit.bedroomCount}</p>
          </div>
          {unit.squareFootage && (
            <div>
              <p className="text-sm font-medium text-gray-500">Square Footage</p>
              <p className="text-lg text-gray-900">{unit.squareFootage.toLocaleString()} sq ft</p>
            </div>
          )}
          {lease.leaseRent && (
            <div>
              <p className="text-sm font-medium text-gray-500">Lease Rent</p>
              <p className="text-lg text-gray-900">${lease.leaseRent.toLocaleString()}</p>
            </div>
          )}
        </div>
        
        {(lease.leaseStartDate || lease.leaseEndDate) && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {lease.leaseStartDate && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Lease Start Date</p>
                  <p className="text-lg text-gray-900">
                    {new Date(lease.leaseStartDate).toLocaleDateString()}
                  </p>
                </div>
              )}
              {lease.leaseEndDate && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Lease End Date</p>
                  <p className="text-lg text-gray-900">
                    {new Date(lease.leaseEndDate).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Resident Income Verification by Lease */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Resident Income Verification by Lease</h2>
          <button
            onClick={() => setCreateLeaseDialogOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Create New Lease
          </button>
        </div>

        {/* Lease Section */}
        <div className="border-b border-gray-200 pb-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900">{lease.name}</h3>
              <p className="text-sm text-gray-500">Lease Term Not Defined</p>
              <p className="text-xs text-gray-400">
                {lease.Resident.length} resident{lease.Resident.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                verification?.status === 'FINALIZED' ? 'bg-green-100 text-green-800' :
                verification?.status === 'IN_PROGRESS' ? 'bg-yellow-100 text-yellow-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {verification?.status === 'FINALIZED' ? 'Verified' :
                 verification?.status === 'IN_PROGRESS' ? 'In Progress - Finalize to Process' :
                 'Not Started'}
              </span>
              <div className="text-right text-sm text-gray-500">
                <div>Lease Verified Income</div>
                <div className="font-medium text-gray-400">Not Finalized</div>
              </div>
              <div className="text-right text-sm">
                <button className="text-blue-600 hover:text-blue-700 underline">Add Resident</button>
                <div className="text-red-600 hover:text-red-700 underline cursor-pointer mt-1">Delete Lease</div>
              </div>
            </div>
          </div>

          {/* Residents under this lease */}
          <div className="space-y-2 pl-4">
            {lease.Resident.map((resident) => {
              // Filter documents for this resident
              const residentDocuments = verification?.IncomeDocument?.filter(
                (doc) => doc.residentId === resident.id && (doc.status === 'COMPLETED' || doc.status === 'NEEDS_REVIEW')
              ) || [];
              
              const hasDocuments = residentDocuments.length > 0;
              const isResidentFinalized = resident.incomeFinalized;
              
              return (
                <div key={resident.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <span className="text-sm font-medium text-gray-900">{resident.name}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        isResidentFinalized ? 'bg-green-100 text-green-800' : 
                        hasDocuments ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {isResidentFinalized ? 'Finalized' : hasDocuments ? 'Ready to Finalize' : 'Not Started'}
                      </span>
                    </div>
                    {resident.annualizedIncome && resident.annualizedIncome > 0 ? (
                      <p className="text-xs text-gray-500 mt-1">
                        Original Income: ${resident.annualizedIncome.toLocaleString()}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-500 mt-1">Original Income: $0.00</p>
                    )}
                    {resident.calculatedAnnualizedIncome ? (
                      <p className="text-xs text-gray-600 mt-1">
                        Verified Income: ${resident.calculatedAnnualizedIncome.toLocaleString()}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 mt-1">Verified Income: Not Finalized</p>
                    )}

                    {/* Show uploaded documents with detailed pills */}
                    {hasDocuments && (
                      <div className="mt-3">
                        <div className="text-xs font-medium text-gray-500 mb-2">Documents ({residentDocuments.length}):</div>
                        <div className="space-y-2">
                          {residentDocuments.map(doc => {
                            // Determine UI styling based on document status
                            let containerClasses, badgeClasses, statusText, statusIcon;
                            
                            if (doc.status === 'COMPLETED') {
                              containerClasses = "p-3 bg-green-50 border border-green-200 rounded-md";
                              badgeClasses = "inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-800";
                              statusText = "Approved";
                              statusIcon = "✅";
                            } else if (doc.status === 'NEEDS_REVIEW') {
                              containerClasses = "p-3 bg-yellow-50 border border-yellow-200 rounded-md";
                              badgeClasses = "inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-yellow-100 text-yellow-800";
                              statusText = "Waiting for Admin Review";
                              statusIcon = "⚠️";
                            } else {
                              containerClasses = "p-3 bg-gray-50 border border-gray-200 rounded-md";
                              badgeClasses = "inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800";
                              statusText = "Processing";
                              statusIcon = "⏳";
                            }
                            
                            return (
                              <div key={doc.id} className={containerClasses}>
                                <div className={`mb-2 text-xs font-medium flex items-center ${
                                  doc.status === 'COMPLETED' ? 'text-green-700' : 
                                  doc.status === 'NEEDS_REVIEW' ? 'text-yellow-700' : 'text-gray-700'
                                }`}>
                                  <span className="mr-1">{statusIcon}</span>
                                  {statusText}
                                </div>
                                
                                <div className="flex justify-between items-start mb-2">
                                  <div className="flex items-center space-x-2">
                                    <span className={badgeClasses}>
                                      {doc.documentType}
                                    </span>
                                    {doc.employeeName && (
                                      <span className="text-xs text-gray-600">
                                        {doc.employeeName}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <span className="text-xs text-gray-500">
                                      {new Date(doc.uploadDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                  </div>
                                </div>
                                
                                {/* Document-specific details */}
                                {doc.documentType === 'PAYSTUB' && doc.status === 'COMPLETED' && (
                                  <div className="grid grid-cols-2 gap-3 text-xs">
                                    {doc.payPeriodStartDate && doc.payPeriodEndDate && (
                                      <div>
                                        <span className="font-medium text-gray-700">Pay Period:</span>
                                        <div className="text-gray-600">
                                          {new Date(doc.payPeriodStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - {new Date(doc.payPeriodEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </div>
                                      </div>
                                    )}
                                    {doc.grossPayAmount && (
                                      <div>
                                        <span className="font-medium text-gray-700">Gross Pay:</span>
                                        <div className="text-green-700 font-semibold">
                                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(doc.grossPayAmount)}
                                        </div>
                                      </div>
                                    )}
                                    {doc.payFrequency && (
                                      <div>
                                        <span className="font-medium text-gray-700">Frequency:</span>
                                        <div className="text-gray-600">
                                          {doc.payFrequency.replace('_', '-')}
                                        </div>
                                      </div>
                                    )}
                                    {doc.employerName && (
                                      <div className="col-span-2">
                                        <span className="font-medium text-gray-700">Employer:</span>
                                        <div className="text-gray-600">
                                          {doc.employerName}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {doc.documentType === 'W2' && doc.status === 'COMPLETED' && doc.box1_wages && (
                                  <div className="space-y-2">
                                    {/* Successfully extracted W2 data */}
                                    <div className="grid grid-cols-2 gap-3 text-xs">
                                      {doc.taxYear && (
                                        <div>
                                          <span className="font-medium text-gray-700">Tax Year:</span>
                                          <div className="text-gray-600">{doc.taxYear}</div>
                                        </div>
                                      )}
                                      <div>
                                        <span className="font-medium text-gray-700">Box 1 Wages:</span>
                                        <div className="text-green-700 font-semibold">
                                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(doc.box1_wages)}
                                        </div>
                                      </div>
                                      {doc.box3_ss_wages && (
                                        <div>
                                          <span className="font-medium text-gray-700">Box 3 SS Wages:</span>
                                          <div className="text-green-700 font-semibold">
                                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(doc.box3_ss_wages)}
                                          </div>
                                        </div>
                                      )}
                                      {doc.box5_med_wages && (
                                        <div>
                                          <span className="font-medium text-gray-700">Box 5 Medicare:</span>
                                          <div className="text-green-700 font-semibold">
                                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(doc.box5_med_wages)}
                                          </div>
                                        </div>
                                      )}
                                      {doc.employeeName && (
                                        <div className="col-span-2">
                                          <span className="font-medium text-gray-700">Employee:</span>
                                          <div className="text-gray-600">
                                            {doc.employeeName}
                                          </div>
                                        </div>
                                      )}
                                      {doc.employerName && (
                                        <div className="col-span-2">
                                          <span className="font-medium text-gray-700">Employer:</span>
                                          <div className="text-gray-600">
                                            {doc.employerName}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                                
                                {doc.documentType === 'SOCIAL_SECURITY' && doc.status === 'COMPLETED' && (
                                  <div className="grid grid-cols-2 gap-3 text-xs">
                                    {doc.documentDate && (
                                      <div>
                                        <span className="font-medium text-gray-700">Letter Date:</span>
                                        <div className="text-gray-600">
                                          {new Date(doc.documentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </div>
                                      </div>
                                    )}
                                    {doc.grossPayAmount && (
                                      <div>
                                        <span className="font-medium text-gray-700">Monthly Benefit:</span>
                                        <div className="text-green-700 font-semibold">
                                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(doc.grossPayAmount)}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {doc.documentType === 'SSA_1099' && doc.status === 'COMPLETED' && (
                                  <div className="grid grid-cols-2 gap-3 text-xs">
                                    {(doc as any).beneficiaryName && (
                                      <div>
                                        <span className="font-medium text-gray-700">Beneficiary:</span>
                                        <div className="text-gray-600">
                                          {(doc as any).beneficiaryName}
                                        </div>
                                      </div>
                                    )}
                                    {(doc as any).annualBenefits && (
                                      <div>
                                        <span className="font-medium text-gray-700">Annual Benefits:</span>
                                        <div className="text-green-700 font-semibold">
                                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((doc as any).annualBenefits)}
                                        </div>
                                      </div>
                                    )}
                                    {doc.taxYear && (
                                      <div>
                                        <span className="font-medium text-gray-700">Tax Year:</span>
                                        <div className="text-gray-600">
                                          {doc.taxYear}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Request Admin Review for completed documents */}
                                {doc.status === 'COMPLETED' && (
                                  <div className="mt-2 pt-2 border-t border-gray-100">
                                    <button
                                      onClick={() => {
                                        // TODO: Implement admin review request modal
                                        console.log('Request admin review for doc:', doc.id);
                                      }}
                                      className="text-xs text-orange-600 hover:text-orange-700 hover:underline"
                                    >
                                      🔍 Request Admin Review
                                    </button>
                                    <div className="text-xs text-gray-500 mt-1">
                                      Think the extraction is incorrect? Request manual review.
                                    </div>
                                  </div>
                                )}

                                {/* Admin review message for NEEDS_REVIEW documents */}
                                {doc.status === 'NEEDS_REVIEW' && (
                                  <div className="mt-2 p-2 bg-yellow-100 border border-yellow-200 rounded text-xs">
                                    <div className="font-medium text-yellow-800 mb-1">⏳ Waiting for Admin Review</div>
                                    <div className="text-yellow-700">Needs Admin Review for Verification</div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col space-y-1">
                    {!isResidentFinalized && (
                      <>
                        <button
                          onClick={() => {
                            setSelectedResidentForUpload(resident);
                            setUploadDialogOpen(true);
                          }}
                          className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                        >
                          📄 Upload Documents
                        </button>
                        
                        {/* Only show No Income button if resident has no documents */}
                        {!hasDocuments && (
                          <button
                            onClick={() => {
                              if (verification) {
                                markResidentNoIncome(resident.id, verification.id);
                              }
                            }}
                            className="px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700"
                          >
                            ❌ No Income
                          </button>
                        )}

                        {/* Finalize Income button - show when resident has documents but isn't finalized */}
                        {hasDocuments && (
                          <button
                            onClick={() => {
                              setResidentFinalizationDialog({
                                isOpen: true,
                                verification: verification,
                                resident: resident,
                                leaseName: lease.name
                              });
                            }}
                            className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                          >
                            ✓ Finalize Income
                          </button>
                        )}
                      </>
                    )}

                    {isResidentFinalized && (
                      <div className="flex flex-col space-y-1">
                        <div className="flex items-center justify-center px-3 py-1 text-xs bg-green-100 text-green-800 rounded border border-green-200">
                          <span className="font-medium">Finalized ✓</span>
                          {resident.finalizedAt && (
                            <span className="ml-2 text-xs text-green-600">
                              {new Date(resident.finalizedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setResidentFinalizationDialog({
                              isOpen: true,
                              verification: verification,
                              resident: resident,
                              leaseName: lease.name
                            });
                          }}
                          className="px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-300 hover:border-blue-400 rounded hover:bg-blue-50"
                          title={`Modify income verification for ${resident.name}`}
                        >
                          Modify
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Finalize Verification Button - Show when verification is ready to be finalized */}
        {verification && verification.status === 'IN_PROGRESS' && (() => {
          const allResidents = lease.Resident;
          const finalizedResidents = allResidents.filter(r => r.incomeFinalized);
          const allResidentsFinalized = allResidents.length > 0 && finalizedResidents.length === allResidents.length;
          
          return allResidentsFinalized && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-green-800">Ready to Finalize</h3>
                  <p className="text-sm text-green-700">All residents have been finalized. You can now finalize the verification.</p>
                </div>
                <button
                  onClick={() => setFinalizationDialog({ isOpen: true, verification })}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Finalize Verification
                </button>
              </div>
            </div>
          );
        })()}

      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mt-6">
        <h3 className="text-lg font-semibold text-blue-800 mb-2">Future Lease</h3>
        <p className="text-blue-700 mb-3">
          This is a future lease that can be managed independently. You can add residents and verify their income now, and add it to a rent roll later when ready.
        </p>
        <Link
          href={`/property/${propertyId}`}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Back to Property Overview
        </Link>
      </div>

      {/* Upload Dialog */}
      {verification && isUploadDialogOpen && (
        <IncomeVerificationUploadDialog
          isOpen={isUploadDialogOpen}
          onClose={() => {
            setUploadDialogOpen(false);
            setSelectedResidentForUpload(null);
          }}
          verificationId={verification.id}
          onUploadComplete={() => {
            // Delay refresh to allow success message to be seen - no immediate action
            setTimeout(() => {
              handleRefresh();
            }, 1000); // 1 second delay - success message handled by upload form
            // Keep dialog open for additional uploads
          }}
          residents={selectedResidentForUpload ? [selectedResidentForUpload] : lease.Resident}
          allCurrentLeaseResidents={lease.Resident}
          hasExistingDocuments={false}
          leaseName={lease.name}
          unitId={unit.id}
          propertyId={propertyId as string}
          rentRollId="future-lease" // Use placeholder for future leases
          currentLease={{
            id: lease.id,
            name: lease.name,
            leaseStartDate: lease.leaseStartDate,
            leaseEndDate: lease.leaseEndDate,
          }}
        />
      )}



      {/* Finalization Dialog */}
      {verification && finalizationDialog.verification && (
        <VerificationFinalizationDialog
          isOpen={finalizationDialog.isOpen}
          onClose={() => setFinalizationDialog({ isOpen: false, verification: null })}
          onConfirm={async () => {
            try {
              const response = await fetch(`/api/leases/${leaseId}/verifications/${verification.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'finalize' }),
              });

              if (!response.ok) {
                throw new Error('Failed to finalize verification');
              }

              setFinalizationDialog({ isOpen: false, verification: null });
              handleRefresh();
            } catch (error) {
              console.error('Error finalizing verification:', error);
              alert('Error finalizing verification');
            }
          }}
          verification={finalizationDialog.verification}
          residents={lease.Resident.map(r => ({
            id: r.id,
            name: r.name,
            verifiedIncome: r.calculatedAnnualizedIncome || r.annualizedIncome || 0,
            annualizedIncome: r.annualizedIncome || 0,
            calculatedAnnualizedIncome: r.calculatedAnnualizedIncome || null,
            incomeFinalized: r.incomeFinalized,
            finalizedAt: r.finalizedAt,
            hasNoIncome: r.hasNoIncome
          }))}
        />
      )}

      {/* Resident Finalization Dialog */}
      {residentFinalizationDialog.isOpen && residentFinalizationDialog.verification && residentFinalizationDialog.resident && (
        <ResidentFinalizationDialog
          isOpen={residentFinalizationDialog.isOpen}
          onClose={() => setResidentFinalizationDialog({ isOpen: false, verification: null, resident: null, leaseName: '' })}
          onConfirm={handleFinalizeResidentVerification}
          verification={residentFinalizationDialog.verification}
          resident={residentFinalizationDialog.resident}
          leaseName={residentFinalizationDialog.leaseName}
          onDataRefresh={handleRefresh}
        />
      )}
    </div>
  );
} 