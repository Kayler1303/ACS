'use client';

import { useState, useEffect } from 'react';

interface UnitDiscrepancy {
  id: string;
  propertyId: string;
  declaredUnitCount: number;
  actualUnitCount: number;
  paymentDifference: number;
  setupType: string;
  status: string;
  discoveredAt: string;
  resolvedAt?: string;
  resolutionNotes?: string;
  property: {
    name: string;
    numberOfUnits: number;
    PropertySubscription?: {
      setupType: string;
      setupFeePaid: boolean;
    };
  };
  rentRoll?: {
    filename: string;
    uploadDate: string;
  };
  resolvedBy?: {
    name: string;
    email: string;
  };
}

interface AdminUnitDiscrepanciesProps {
  onDataRefresh?: () => void;
}

export default function AdminUnitDiscrepancies({ onDataRefresh }: AdminUnitDiscrepanciesProps) {
  const [discrepancies, setDiscrepancies] = useState<UnitDiscrepancy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchDiscrepancies();
  }, []);

  const fetchDiscrepancies = async () => {
    try {
      const response = await fetch('/api/admin/unit-discrepancies');
      if (!response.ok) {
        throw new Error('Failed to fetch discrepancies');
      }
      const data = await response.json();
      setDiscrepancies(data.discrepancies || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load discrepancies');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolveDiscrepancy = async (discrepancyId: string, propertyId: string, action: 'resolve' | 'waive') => {
    setProcessingId(discrepancyId);
    setError(null);

    try {
      const response = await fetch(`/api/admin/properties/${propertyId}/unit-discrepancy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          discrepancyId,
          action,
          resolutionNotes: resolutionNotes[discrepancyId] || '',
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to ${action} discrepancy`);
      }

      await fetchDiscrepancies();
      if (onDataRefresh) {
        onDataRefresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} discrepancy`);
    } finally {
      setProcessingId(null);
    }
  };

  const updateResolutionNotes = (discrepancyId: string, notes: string) => {
    setResolutionNotes(prev => ({
      ...prev,
      [discrepancyId]: notes
    }));
  };

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-6 bg-gray-200 rounded mb-4"></div>
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 rounded"></div>
          <div className="h-4 bg-gray-200 rounded"></div>
          <div className="h-4 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">{error}</p>
        <button
          onClick={fetchDiscrepancies}
          className="mt-2 text-sm text-red-600 hover:text-red-700 underline"
        >
          Try Again
        </button>
      </div>
    );
  }

  const pendingDiscrepancies = discrepancies.filter(d => d.status === 'PENDING');
  const resolvedDiscrepancies = discrepancies.filter(d => d.status !== 'PENDING');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Unit Count Discrepancies
        </h2>
        
        {pendingDiscrepancies.length === 0 && resolvedDiscrepancies.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <p>No unit count discrepancies found.</p>
          </div>
        ) : (
          <>
            {/* Pending Discrepancies */}
            {pendingDiscrepancies.length > 0 && (
              <div className="mb-8">
                <h3 className="text-md font-medium text-red-800 mb-4 flex items-center">
                  <svg className="h-5 w-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  Pending Discrepancies ({pendingDiscrepancies.length})
                </h3>
                
                <div className="space-y-4">
                  {pendingDiscrepancies.map((discrepancy) => (
                    <div key={discrepancy.id} className="bg-red-50 border border-red-200 rounded-lg p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h4 className="text-lg font-semibold text-red-800">
                            {discrepancy.property.name}
                          </h4>
                          <p className="text-sm text-red-600">
                            Discovered: {new Date(discrepancy.discoveredAt).toLocaleDateString()}
                          </p>
                        </div>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          {discrepancy.setupType === 'FULL_SERVICE' ? 'Full Service' : 'Self Service'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div>
                          <span className="text-sm text-gray-600">Declared Units:</span>
                          <p className="font-semibold">{discrepancy.declaredUnitCount}</p>
                        </div>
                        <div>
                          <span className="text-sm text-gray-600">Actual Units:</span>
                          <p className="font-semibold">{discrepancy.actualUnitCount}</p>
                        </div>
                        <div>
                          <span className="text-sm text-gray-600">Difference:</span>
                          <p className="font-semibold text-red-600">
                            +{discrepancy.actualUnitCount - discrepancy.declaredUnitCount}
                          </p>
                        </div>
                        <div>
                          <span className="text-sm text-gray-600">Amount Due:</span>
                          <p className="font-semibold text-red-600">
                            ${discrepancy.paymentDifference.toFixed(2)}
                          </p>
                        </div>
                      </div>

                      {discrepancy.rentRoll && (
                        <div className="mb-4 text-sm text-gray-600">
                          <span className="font-medium">Rent Roll:</span> {discrepancy.rentRoll.filename} 
                          ({new Date(discrepancy.rentRoll.uploadDate).toLocaleDateString()})
                        </div>
                      )}

                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Resolution Notes (Optional)
                        </label>
                        <textarea
                          value={resolutionNotes[discrepancy.id] || ''}
                          onChange={(e) => updateResolutionNotes(discrepancy.id, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          rows={2}
                          placeholder="Add notes about the resolution..."
                        />
                      </div>

                      <div className="flex space-x-3">
                        <button
                          onClick={() => handleResolveDiscrepancy(discrepancy.id, discrepancy.propertyId, 'resolve')}
                          disabled={processingId === discrepancy.id}
                          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {processingId === discrepancy.id ? 'Processing...' : 'Mark as Paid'}
                        </button>
                        <button
                          onClick={() => handleResolveDiscrepancy(discrepancy.id, discrepancy.propertyId, 'waive')}
                          disabled={processingId === discrepancy.id}
                          className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {processingId === discrepancy.id ? 'Processing...' : 'Waive Discrepancy'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Resolved Discrepancies */}
            {resolvedDiscrepancies.length > 0 && (
              <div>
                <h3 className="text-md font-medium text-gray-800 mb-4 flex items-center">
                  <svg className="h-5 w-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Resolved Discrepancies ({resolvedDiscrepancies.length})
                </h3>
                
                <div className="space-y-3">
                  {resolvedDiscrepancies.map((discrepancy) => (
                    <div key={discrepancy.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold text-gray-800">
                            {discrepancy.property.name}
                          </h4>
                          <p className="text-sm text-gray-600">
                            {discrepancy.declaredUnitCount} → {discrepancy.actualUnitCount} units 
                            (${discrepancy.paymentDifference.toFixed(2)})
                          </p>
                          {discrepancy.resolutionNotes && (
                            <p className="text-sm text-gray-600 mt-1">
                              <span className="font-medium">Notes:</span> {discrepancy.resolutionNotes}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            discrepancy.status === 'RESOLVED' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {discrepancy.status === 'RESOLVED' ? 'Paid' : 'Waived'}
                          </span>
                          <p className="text-xs text-gray-500 mt-1">
                            {discrepancy.resolvedAt && new Date(discrepancy.resolvedAt).toLocaleDateString()}
                          </p>
                          {discrepancy.resolvedBy && (
                            <p className="text-xs text-gray-500">
                              by {discrepancy.resolvedBy.name}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
