'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface IncomeDiscrepancy {
  unitNumber: string | number;
  residentName: string;
  verifiedIncome: number;
  newRentRollIncome: number;
  discrepancy: number;
  existingLeaseId: string;
  newLeaseId: string;
  existingResidentId: string;
  newResidentId: string;
}

interface ProvisionalLease {
  id: string;
  name: string;
  leaseStartDate: string;
  unitId: string;
  unit: { unitNumber: string };
}

interface Tenancy {
  id: string;
  rentRollId: string;
  lease: {
    id: string;
    name: string;
    leaseStartDate: string;
    unit: { unitNumber: string };
  } | null;
}

export default function ReconciliationPage() {
  const params = useParams();
  const { id: propertyId } = params;
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const reason = searchParams.get('reason');
  const rentRollId = searchParams.get('rentRollId');
  
  const [incomeDiscrepancies, setIncomeDiscrepancies] = useState<IncomeDiscrepancy[]>([]);
  const [provisionalLeases, setProvisionalLeases] = useState<ProvisionalLease[]>([]);
  const [newTenancies, setNewTenancies] = useState<Tenancy[]>([]);
  const [selectedLeaseId, setSelectedLeaseId] = useState<string | null>(null);
  const [selectedTenancyId, setSelectedTenancyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isIncomeDiscrepancyMode = reason === 'income-discrepancies';

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        if (isIncomeDiscrepancyMode && rentRollId) {
          // Fetch income discrepancies for the specific rent roll
          const discrepancyRes = await fetch(`/api/properties/${propertyId}/income-discrepancies?rentRollId=${rentRollId}`);
          if (!discrepancyRes.ok) {
            throw new Error('Failed to fetch income discrepancies');
          }
          const discrepancyData = await discrepancyRes.json();
          setIncomeDiscrepancies(discrepancyData.discrepancies || []);
        } else {
          // Fetch lease reconciliation data (original functionality)
          const [provisionalRes, futureRes, tenanciesRes] = await Promise.all([
            fetch(`/api/properties/${propertyId}/provisional-leases`),
            fetch(`/api/properties/${propertyId}/future-leases`),
            fetch(`/api/properties/${propertyId}/new-tenancies`),
          ]);

          if (!provisionalRes.ok || !futureRes.ok || !tenanciesRes.ok) {
            throw new Error('Failed to fetch reconciliation data');
          }

          const provisionalData = await provisionalRes.json();
          const futureData = await futureRes.json();
          const tenanciesData = await tenanciesRes.json();

          // Combine provisional leases and future leases into one array
          const combinedLeases = [
            ...provisionalData,
            ...futureData.units.filter((unit: any) => unit.futureLease).map((unit: any) => ({
              id: unit.futureLease.id,
              name: unit.futureLease.leaseName,
              leaseStartDate: unit.futureLease.leaseStartDate,
              unitId: unit.unitId,
              unit: { unitNumber: unit.unitNumber }
            }))
          ];

          setProvisionalLeases(combinedLeases);
          setNewTenancies(tenanciesData);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [propertyId, isIncomeDiscrepancyMode, rentRollId]);

  const handleIncomeDiscrepancyResolution = async (discrepancy: IncomeDiscrepancy, resolution: 'accept-verified' | 'accept-rentroll') => {
    try {
      const response = await fetch(`/api/properties/${propertyId}/resolve-income-discrepancy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discrepancy,
          resolution,
          rentRollId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to resolve income discrepancy');
      }

      // Remove the resolved discrepancy from the list
      setIncomeDiscrepancies(prev => 
        prev.filter(d => d.existingResidentId !== discrepancy.existingResidentId || d.newResidentId !== discrepancy.newResidentId)
      );

      // If no more discrepancies, redirect to property page
      if (incomeDiscrepancies.length <= 1) {
        router.push(`/property/${propertyId}`);
        router.refresh();
      }
    } catch (err: unknown) {
      alert(`Error: ${err instanceof Error ? err.message : 'An unexpected error occurred'}`);
    }
  };

  const handleLeaseLink = async () => {
    if (!selectedLeaseId || !selectedTenancyId) {
      alert('Please select both a lease and a tenancy to link.');
      return;
    }

    try {
      const response = await fetch(`/api/properties/${propertyId}/link-lease-tenancy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaseId: selectedLeaseId,
          tenancyId: selectedTenancyId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to link lease and tenancy');
      }

      // Remove linked items from the lists
      setProvisionalLeases(prev => prev.filter(lease => lease.id !== selectedLeaseId));
      setNewTenancies(prev => prev.filter(tenancy => tenancy.id !== selectedTenancyId));

      setSelectedLeaseId(null);
      setSelectedTenancyId(null);
    } catch (err: unknown) {
      alert(`Error: ${err instanceof Error ? err.message : 'An unexpected error occurred'}`);
    }
  };

  const handleSkipReconciliation = () => {
    router.push(`/property/${propertyId}`);
    router.refresh();
  };

  if (isLoading) {
    return <div className="container mx-auto px-4 py-8 text-center">Loading...</div>;
  }

  if (error) {
    return <div className="container mx-auto px-4 py-8 text-center text-red-500">Error: {error}</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href={`/property/${propertyId}`} className="text-brand-blue hover:underline mb-4 inline-block">
          ← Back to Property
        </Link>
        
        {isIncomeDiscrepancyMode ? (
          <>
            <h1 className="text-4xl font-bold text-brand-blue">Income Discrepancy Reconciliation</h1>
            <p className="text-gray-600 mt-2">
              We detected income discrepancies between your newly uploaded rent roll and existing verified income documents. 
              Please review and resolve each discrepancy below.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-4xl font-bold text-brand-blue">Lease Reconciliation</h1>
            <p className="text-gray-600 mt-2">
              Link provisional and future leases with new tenancies from your recent rent roll upload.
            </p>
          </>
        )}
      </div>

      {/* Income Discrepancy Reconciliation */}
      {isIncomeDiscrepancyMode && (
        <div className="space-y-6">
          {incomeDiscrepancies.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
              <h3 className="text-lg font-semibold text-green-800 mb-2">All Discrepancies Resolved!</h3>
              <p className="text-green-600 mb-4">No income discrepancies found. You can proceed to the property dashboard.</p>
              <button
                onClick={handleSkipReconciliation}
                className="bg-brand-blue text-white px-6 py-2 rounded-md hover:bg-blue-700"
              >
                Continue to Property Dashboard
              </button>
            </div>
          ) : (
            <>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-yellow-800 mb-2">
                  {incomeDiscrepancies.length} Income Discrepanc{incomeDiscrepancies.length === 1 ? 'y' : 'ies'} Detected
                </h3>
                <p className="text-yellow-700">
                  For each discrepancy below, choose whether to keep the verified income from documents or accept the new rent roll income.
                </p>
              </div>

              {incomeDiscrepancies.map((discrepancy, index) => (
                <div key={`${discrepancy.existingResidentId}-${discrepancy.newResidentId}`} className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">
                        Unit {discrepancy.unitNumber} - {discrepancy.residentName}
                      </h3>
                      <p className="text-gray-600">Income discrepancy of ${discrepancy.discrepancy.toFixed(2)}</p>
                    </div>
                    <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-medium">
                      Discrepancy #{index + 1}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-semibold text-blue-800 mb-2">Verified Income (From Documents)</h4>
                      <p className="text-2xl font-bold text-blue-900">
                        ${discrepancy.verifiedIncome.toLocaleString('en-US')}
                      </p>
                      <p className="text-sm text-blue-600 mt-1">Based on uploaded and verified income documents</p>
                    </div>

                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                      <h4 className="font-semibold text-orange-800 mb-2">New Rent Roll Income</h4>
                      <p className="text-2xl font-bold text-orange-900">
                        ${discrepancy.newRentRollIncome.toLocaleString('en-US')}
                      </p>
                      <p className="text-sm text-orange-600 mt-1">From recently uploaded rent roll</p>
                    </div>
                  </div>

                  <div className="flex space-x-4">
                    <button
                      onClick={() => handleIncomeDiscrepancyResolution(discrepancy, 'accept-verified')}
                      className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-md hover:bg-blue-700 font-medium"
                    >
                      Keep Verified Income (${discrepancy.verifiedIncome.toLocaleString('en-US')})
                    </button>
                    <button
                      onClick={() => handleIncomeDiscrepancyResolution(discrepancy, 'accept-rentroll')}
                      className="flex-1 bg-orange-600 text-white px-4 py-3 rounded-md hover:bg-orange-700 font-medium"
                    >
                      Accept Rent Roll Income (${discrepancy.newRentRollIncome.toLocaleString('en-US')})
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Lease Reconciliation (Original Functionality) */}
      {!isIncomeDiscrepancyMode && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-2xl font-semibold text-brand-blue mb-4">Unmatched Leases (Provisional & Future)</h2>
            <div className="space-y-2">
              {provisionalLeases.map((lease) => (
                <div key={lease.id} className="flex items-center">
                  <input
                    type="radio"
                    id={`lease-${lease.id}`}
                    name="provisional-lease"
                    value={lease.id}
                    checked={selectedLeaseId === lease.id}
                    onChange={(e) => setSelectedLeaseId(e.target.value)}
                    className="h-4 w-4 text-brand-blue focus:ring-brand-blue border-gray-300"
                  />
                  <label htmlFor={`lease-${lease.id}`} className="ml-2 block text-sm font-medium text-gray-700">
                    {lease.name} (Unit {lease.unit.unitNumber})
                  </label>
                </div>
              ))}
            </div>
            {provisionalLeases.length === 0 && (
              <p className="text-gray-500">No unmatched leases found.</p>
            )}
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-2xl font-semibold text-brand-blue mb-4">New Tenancies (From Recent Rent Roll)</h2>
            <div className="space-y-2">
              {newTenancies.map((tenancy) => (
                <div key={tenancy.id} className="flex items-center">
                  <input
                    type="radio"
                    id={`tenancy-${tenancy.id}`}
                    name="new-tenancy"
                    value={tenancy.id}
                    checked={selectedTenancyId === tenancy.id}
                    onChange={(e) => setSelectedTenancyId(e.target.value)}
                    className="h-4 w-4 text-brand-blue focus:ring-brand-blue border-gray-300"
                  />
                  <label htmlFor={`tenancy-${tenancy.id}`} className="ml-2 block text-sm font-medium text-gray-700">
                    {tenancy.lease?.name || 'Unknown'} (Unit {tenancy.lease?.unit.unitNumber || 'Unknown'})
                  </label>
                </div>
              ))}
            </div>
            {newTenancies.length === 0 && (
              <p className="text-gray-500">No new tenancies found.</p>
            )}
          </div>

          <div className="md:col-span-2 flex justify-center">
            <button
              onClick={handleLeaseLink}
              disabled={!selectedLeaseId || !selectedTenancyId}
              className="bg-brand-blue text-white px-6 py-3 rounded-md disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-700"
            >
              Link Selected Lease and Tenancy
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 