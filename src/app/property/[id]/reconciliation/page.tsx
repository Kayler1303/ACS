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

interface FutureToCurrentTransition {
  unitId: string;
  unitNumber: string;
  futureLeaseId: string;
  futureLeaseName: string;
  currentLeaseId: string;
  currentLeaseName: string;
  hasVerifiedDocuments: boolean;
  documentCount: number;
  residentMatches: Array<{
    futureName: string;
    currentName: string;
    isMatch: boolean;
  }>;
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
  const [futureToCurrentTransitions, setFutureToCurrentTransitions] = useState<FutureToCurrentTransition[]>([]);
  const [selectedLeaseId, setSelectedLeaseId] = useState<string | null>(null);
  const [selectedTenancyId, setSelectedTenancyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [notificationAmount, setNotificationAmount] = useState<number>(0);
  const [isResolvingDiscrepancy, setIsResolvingDiscrepancy] = useState(false);

  const isIncomeDiscrepancyMode = reason === 'income-discrepancies';

  useEffect(() => {
    // Don't refetch data while resolving discrepancies
    if (isResolvingDiscrepancy) {
      console.log('[RECONCILIATION] Skipping data fetch - currently resolving discrepancy');
      return;
    }
    
    const fetchData = async () => {
      setIsLoading(true);
      try {
        if (isIncomeDiscrepancyMode && rentRollId) {
          // Fetch income discrepancies for the specific rent roll
          const [discrepancyRes, transitionsRes] = await Promise.all([
            fetch(`/api/properties/${propertyId}/income-discrepancies?rentRollId=${rentRollId}`),
            fetch(`/api/properties/${propertyId}/future-to-current-transitions?rentRollId=${rentRollId}`)
          ]);
          
          if (!discrepancyRes.ok) {
            throw new Error('Failed to fetch income discrepancies');
          }
          if (!transitionsRes.ok) {
            throw new Error('Failed to fetch future-to-current transitions');
          }
          
          const discrepancyData = await discrepancyRes.json();
          const transitionsData = await transitionsRes.json();
          
          setIncomeDiscrepancies(discrepancyData.discrepancies || []);
          setFutureToCurrentTransitions(transitionsData.transitions || []);
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
  }, [propertyId, isIncomeDiscrepancyMode, rentRollId, isResolvingDiscrepancy]);

  const handleFutureToCurrentTransition = async (transition: FutureToCurrentTransition, transferDocuments: boolean) => {
    try {
      const response = await fetch(`/api/properties/${propertyId}/future-to-current-transitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          futureLeaseId: transition.futureLeaseId,
          currentLeaseId: transition.currentLeaseId,
          transferDocuments
        })
      });

      if (!response.ok) {
        throw new Error('Failed to process future-to-current transition');
      }

      // Remove the processed transition from the list
      setFutureToCurrentTransitions(prev => 
        prev.filter(t => t.futureLeaseId !== transition.futureLeaseId || t.currentLeaseId !== transition.currentLeaseId)
      );

      // If no more transitions or discrepancies, redirect to property page
      if (futureToCurrentTransitions.length <= 1 && incomeDiscrepancies.length === 0) {
        router.push(`/property/${propertyId}`);
      }
    } catch (error) {
      console.error('Error processing transition:', error);
      setError('Failed to process transition. Please try again.');
    }
  };

  const handleIncomeDiscrepancyResolution = async (discrepancy: IncomeDiscrepancy, resolution: 'accept-verified' | 'accept-rentroll') => {
    setIsResolvingDiscrepancy(true);
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

      // Wait a moment for the database transaction to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Remove the resolved discrepancy from the list
      const updatedDiscrepancies = incomeDiscrepancies.filter(d => 
        d.existingResidentId !== discrepancy.existingResidentId || d.newResidentId !== discrepancy.newResidentId
      );
      setIncomeDiscrepancies(updatedDiscrepancies);
      
      console.log(`[RECONCILIATION] Resolved discrepancy for ${discrepancy.residentName}. Remaining discrepancies:`, updatedDiscrepancies.length);

      // Show notification modal if user chose to keep verified income
      if (resolution === 'accept-verified') {
        setNotificationAmount(discrepancy.verifiedIncome);
        setShowNotificationModal(true);
        // Don't redirect immediately - let user dismiss the notification first
      } else {
        // If user accepted rent roll income and no more discrepancies, redirect immediately
        if (updatedDiscrepancies.length === 0) {
          router.push(`/property/${propertyId}`);
          router.refresh();
        }
      }
    } catch (err: unknown) {
      alert(`Error: ${err instanceof Error ? err.message : 'An unexpected error occurred'}`);
    } finally {
      setIsResolvingDiscrepancy(false);
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
          {incomeDiscrepancies.length === 0 && futureToCurrentTransitions.length === 0 ? (
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
                  {futureToCurrentTransitions.length > 0 && (
                    <span> & {futureToCurrentTransitions.length} Future Lease Transition{futureToCurrentTransitions.length === 1 ? '' : 's'}</span>
                  )}
                </h3>
                <p className="text-yellow-700">
                  For each discrepancy below, choose whether to keep the verified income from documents or accept the new rent roll income.
                  {futureToCurrentTransitions.length > 0 && (
                    <span> Also review any future leases that have become current leases.</span>
                  )}
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
                    <div className="flex-1">
                      <button
                        onClick={() => handleIncomeDiscrepancyResolution(discrepancy, 'accept-rentroll')}
                        className="w-full bg-orange-600 text-white px-4 py-3 rounded-md hover:bg-orange-700 font-medium"
                      >
                        Accept Rent Roll Income (${discrepancy.newRentRollIncome.toLocaleString('en-US')})
                      </button>
                      <p className="text-sm text-orange-700 mt-2 text-center">
                        📄 Note: You'll need to upload new income documents to verify this amount
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Future-to-Current Lease Transitions */}
      {isIncomeDiscrepancyMode && futureToCurrentTransitions.length > 0 && (
        <div className="space-y-6 mt-8">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-blue-800 mb-2">
              Future Leases Now Current ({futureToCurrentTransitions.length})
            </h3>
            <p className="text-blue-700">
              We detected units where the current lease changed from your previous rent roll AND there were existing future leases. 
              Review each case and choose whether to transfer verified income documents from the future lease to the current lease.
            </p>
          </div>

          {futureToCurrentTransitions.map((transition, index) => (
            <div key={`${transition.futureLeaseId}-${transition.currentLeaseId}`} className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    Unit {transition.unitNumber}
                  </h3>
                  <p className="text-gray-600">Future lease transition detected</p>
                </div>
                <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                  Transition #{index + 1}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <h4 className="font-semibold text-purple-800 mb-2">Previous Future Lease</h4>
                  <p className="text-lg font-semibold text-purple-900 mb-2">
                    {transition.futureLeaseName}
                  </p>
                  {transition.hasVerifiedDocuments && (
                    <div className="text-sm text-purple-700">
                      <p>✅ {transition.documentCount} verified document{transition.documentCount !== 1 ? 's' : ''}</p>
                    </div>
                  )}
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="font-semibold text-green-800 mb-2">New Current Lease</h4>
                  <p className="text-lg font-semibold text-green-900 mb-2">
                    {transition.currentLeaseName}
                  </p>
                </div>
              </div>

              {/* Resident Matching */}
              {transition.residentMatches.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-semibold text-gray-800 mb-3">Resident Matching</h4>
                  <div className="space-y-2">
                    {transition.residentMatches.map((match, matchIndex) => (
                      <div key={matchIndex} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <span className="text-sm font-medium text-gray-700">
                            {match.futureName}
                          </span>
                          <span className="text-gray-400">→</span>
                          <span className="text-sm font-medium text-gray-700">
                            {match.currentName}
                          </span>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          match.isMatch 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {match.isMatch ? '✅ Match' : '❌ No Match'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                {transition.hasVerifiedDocuments ? (
                  <>
                    <button
                      onClick={() => handleFutureToCurrentTransition(transition, true)}
                      className="flex-1 bg-green-600 text-white px-6 py-3 rounded-md hover:bg-green-700 font-medium"
                    >
                      ✅ Confirm Transition & Transfer Documents
                    </button>
                    <button
                      onClick={() => handleFutureToCurrentTransition(transition, false)}
                      className="flex-1 bg-gray-600 text-white px-6 py-3 rounded-md hover:bg-gray-700 font-medium"
                    >
                      ✅ Confirm Transition (No Transfer)
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleFutureToCurrentTransition(transition, false)}
                    className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 font-medium"
                  >
                    ✅ Confirm Transition
                  </button>
                )}
              </div>
            </div>
          ))}
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

      {/* Property Management System Update Notification Modal */}
      {showNotificationModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
          <div className="relative bg-white p-8 rounded-lg shadow-xl max-w-md mx-auto">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Income Updated Successfully
              </h3>
              
              <div className="mb-6">
                <p className="text-sm text-gray-600 mb-3">
                  The resident's income has been updated to:
                </p>
                <p className="text-2xl font-bold text-green-600">
                  ${notificationAmount.toLocaleString('en-US')}
                </p>
              </div>
              
              <div className="bg-amber-50 border border-amber-200 rounded-md p-4 mb-6">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h4 className="text-sm font-medium text-amber-800">
                      Don't Forget!
                    </h4>
                    <p className="text-sm text-amber-700 mt-1">
                      Please update this resident's income to <strong>${notificationAmount.toLocaleString('en-US')}</strong> in your property management system to prevent future discrepancies.
                    </p>
                  </div>
                </div>
              </div>
              
              <button
                onClick={() => {
                  setShowNotificationModal(false);
                  // If no more discrepancies after dismissing notification, redirect to property page
                  if (incomeDiscrepancies.length === 0) {
                    router.push(`/property/${propertyId}`);
                    router.refresh();
                  }
                }}
                className="w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
              >
                Got it, thanks!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 