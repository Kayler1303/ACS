'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import IncomeVerificationUploadDialog from '@/components/IncomeVerificationUploadDialog';
import VerificationFinalizationDialog from '@/components/VerificationFinalizationDialog';

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



  const handleStartIncomeVerification = async () => {
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

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start income verification');
      }

      handleRefresh();
    } catch (error) {
      console.error('Error starting income verification:', error);
      alert(`Error starting income verification: ${error instanceof Error ? error.message : 'An unexpected error occurred'}`);
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

      {/* Residents and Income Verification */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Resident Income Verification</h2>
          <button
            onClick={() => setCreateLeaseDialogOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Create New Lease
          </button>
        </div>

        {/* Residents List */}
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-3">Residents</h3>
          {leaseData.lease.Resident.length === 0 ? (
            <div className="text-center p-4 border-dashed border-2 border-gray-300 rounded-lg">
              <p className="text-gray-500">No residents found.</p>
              <button
                onClick={() => setInitialAddResidentDialogOpen(true)}
                className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Add Resident
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {leaseData.lease.Resident.map((resident) => (
                <div key={resident.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-md">
                  <div>
                    <p className="font-medium text-gray-900">{resident.name}</p>
                    {resident.hasNoIncome ? (
                      <p className="text-sm text-gray-500">No Income</p>
                    ) : resident.calculatedAnnualizedIncome ? (
                      <p className="text-sm text-gray-500">
                        Verified Income: ${resident.calculatedAnnualizedIncome.toLocaleString()}
                      </p>
                    ) : resident.annualizedIncome && resident.annualizedIncome > 0 ? (
                      <p className="text-sm text-gray-500">
                        Rent Roll Income: ${resident.annualizedIncome.toLocaleString()}
                      </p>
                    ) : (
                      <div className="flex space-x-2 mt-2">
                        <button
                          onClick={() => {
                            setSelectedResidentForUpload(resident);
                            setUploadDialogOpen(true);
                          }}
                          className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Upload Documents
                        </button>
                        <button
                          onClick={() => {
                            // Mark resident as no income
                            if (verification) {
                              markResidentNoIncome(resident.id, verification.id);
                            }
                          }}
                          className="text-xs px-2 py-1 bg-gray-600 text-white rounded hover:bg-gray-700"
                        >
                          No Income
                        </button>
                      </div>
                    )}
                  </div>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    resident.incomeFinalized ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {resident.incomeFinalized ? 'Finalized' : 'Not Finalized'}
                  </span>
                </div>
              ))}
              <div className="w-full p-3 border-2 border-dashed border-gray-300 rounded-md text-center text-gray-400 text-sm">
                Residents are populated from rent roll data
              </div>
            </div>
          )}
        </div>

        {/* Income Verification Section */}
        {verification ? (
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Income Verification</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Verification Status</p>
                  <p className="text-sm text-gray-500">
                    Created: {new Date(verification.createdAt).toLocaleDateString()}
                    {verification.finalizedAt && (
                      <span> • Finalized: {new Date(verification.finalizedAt).toLocaleDateString()}</span>
                    )}
                  </p>
                </div>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  verification.status === 'FINALIZED' ? 'bg-green-100 text-green-800' :
                  verification.status === 'IN_PROGRESS' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {verification.status.replace('_', ' ')}
                </span>
              </div>

              {verification.status === 'IN_PROGRESS' && (
                <div className="flex space-x-3">
                  <button
                    onClick={() => {
                      setSelectedResidentForUpload(null); // Upload for all residents
                      setUploadDialogOpen(true);
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Upload Documents
                  </button>
                  <button
                    onClick={() => setFinalizationDialog({ isOpen: true, verification })}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    Finalize Verification
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="border-t border-gray-200 pt-6">
            <div className="text-center p-4 border-dashed border-2 border-gray-300 rounded-lg">
              <p className="text-gray-500 mb-3">No income verification started yet.</p>
              <button
                onClick={handleStartIncomeVerification}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Start Income Verification
              </button>
            </div>
          </div>
        )}
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
            handleRefresh();
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
    </div>
  );
} 