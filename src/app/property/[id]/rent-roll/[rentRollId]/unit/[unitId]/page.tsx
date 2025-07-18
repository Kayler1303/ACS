'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Resident {
  id: string;
  name: string;
  annualizedIncome: string;
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
  createdAt: string;
  updatedAt: string;
  propertyId: string;
}

interface TenancyData {
  id: string;
  leaseRent: string | null;
  residents: Resident[];
  unit: Unit;
  rentRoll: RentRoll;
}

export default function ResidentDetailPage() {
  const params = useParams();
  const { id: propertyId, rentRollId, unitId } = params;
  
  const [tenancyData, setTenancyData] = useState<TenancyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Helper function to remove leading zeros from unit numbers
  const formatUnitNumber = (unitNumber: string) => {
    return parseInt(unitNumber, 10).toString();
  };

  useEffect(() => {
    const fetchTenancyData = async () => {
      if (!propertyId || !rentRollId || !unitId) {
        setError('Missing required parameters');
        setLoading(false);
        return;
      }

      try {
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
        setLoading(false);
      }
    };

    fetchTenancyData();
  }, [propertyId, rentRollId, unitId]);

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

  const totalIncome = tenancyData.residents.reduce((sum, resident) => 
    sum + parseFloat(resident.annualizedIncome || '0'), 0
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href={`/property/${propertyId}`} className="text-brand-blue hover:underline mb-4 inline-block">
          ← Back to Property
        </Link>
        <h1 className="text-4xl font-bold text-brand-blue">Unit {formatUnitNumber(tenancyData.unit.unitNumber)} - Resident Details</h1>
      </div>

      {/* Unit Information Card */}
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

      {/* Residents Information */}
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
                      % of Total Income
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {tenancyData.residents.map((resident) => {
                    const residentIncome = parseFloat(resident.annualizedIncome || '0');
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
                          {incomePercentage.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
} 