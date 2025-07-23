'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Unit {
  id: string;
  unitNumber: string;
}

interface Lease {
  id: string;
  name: string;
  unit: Unit;
}

interface Tenancy {
  id: string;
  lease: Lease | null;
}

type ProvisionalLease = Lease & { unit: Unit };
type NewTenancy = Tenancy & { lease: (Lease & { unit: Unit }) | null };

export default function ReconciliationPage() {
  const params = useParams();
  const { id: propertyId } = params;

  const [provisionalLeases, setProvisionalLeases] = useState<ProvisionalLease[]>([]);
  const [newTenancies, setNewTenancies] = useState<NewTenancy[]>([]);
  const [selectedLeaseId, setSelectedLeaseId] = useState<string | null>(null);
  const [selectedTenancyId, setSelectedTenancyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [leasesRes, tenanciesRes] = await Promise.all([
          fetch(`/api/properties/${propertyId}/provisional-leases`),
          fetch(`/api/properties/${propertyId}/new-tenancies`),
        ]);

        if (!leasesRes.ok) {
          throw new Error('Failed to fetch provisional leases');
        }
        if (!tenanciesRes.ok) {
          throw new Error('Failed to fetch new tenancies');
        }

        const leasesData = await leasesRes.json();
        const tenanciesData = await tenanciesRes.json();

        setProvisionalLeases(leasesData);
        setNewTenancies(tenanciesData);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    if (propertyId) {
      fetchData();
    }
  }, [propertyId]);

  const handleLink = async () => {
    if (!selectedLeaseId || !selectedTenancyId) {
      alert('Please select a provisional lease and a new tenancy to link.');
      return;
    }

    try {
      const res = await fetch('/api/reconciliation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leaseId: selectedLeaseId,
          tenancyId: selectedTenancyId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to link lease and tenancy');
      }

      // Refetch data to update the lists
      const [leasesRes, tenanciesRes] = await Promise.all([
        fetch(`/api/properties/${propertyId}/provisional-leases`),
        fetch(`/api/properties/${propertyId}/new-tenancies`),
      ]);
      const leasesData = await leasesRes.json();
      const tenanciesData = await tenanciesRes.json();
      setProvisionalLeases(leasesData);
      setNewTenancies(tenanciesData);
      setSelectedLeaseId(null);
      setSelectedTenancyId(null);

    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
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
        <h1 className="text-4xl font-bold text-brand-blue">Rent Roll Reconciliation</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-2xl font-semibold text-brand-blue mb-4">Unmatched Provisional Leases</h2>
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
            <p className="text-gray-500">No unmatched provisional leases found.</p>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-2xl font-semibold text-brand-blue mb-4">New Tenancies from Rent Roll</h2>
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
                  Tenancy in Unit {tenancy.lease?.unit?.unitNumber}
                </label>
              </div>
            ))}
          </div>
          {newTenancies.length === 0 && (
            <p className="text-gray-500">No new tenancies found in the latest rent roll.</p>
          )}
        </div>
      </div>

      <div className="mt-8 text-center">
        <button
          onClick={handleLink}
          disabled={!selectedLeaseId || !selectedTenancyId}
          className="px-6 py-3 bg-brand-blue text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
        >
          Link Selected Lease and Tenancy
        </button>
      </div>
    </div>
  );
} 