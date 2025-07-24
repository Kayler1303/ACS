'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import UpdateComplianceForm from '@/components/UpdateComplianceForm';
import Link from 'next/link';

type PropertyDetails = {
  id: string;
  name: string;
  address: string | null;
};

export default function UpdateCompliancePage() {
  const params = useParams();
  const id = params.id as string;

  const [property, setProperty] = useState<PropertyDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (id) {
      const fetchPropertyDetails = async () => {
        setIsLoading(true);
        try {
          const res = await fetch(`/api/properties/${id}/details`);
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to fetch property details.');
          }
          const data = await res.json();
          setProperty(data);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        } finally {
          setIsLoading(false);
        }
      };
      fetchPropertyDetails();
    }
  }, [id]);

  if (isLoading) {
    return <div className="container mx-auto px-4 py-8 text-center">Loading...</div>;
  }
  
  if (error) {
     return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-4xl font-bold mb-4 text-red-600">Error</h1>
        <p className="text-gray-600 mb-6">{error}</p>
        <Link href="/dashboard" className="text-indigo-600 hover:underline mt-4 inline-block">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-4xl font-bold mb-4">Property Not Found</h1>
        <Link href="/dashboard" className="text-indigo-600 hover:underline mt-4 inline-block">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-brand-blue">{property.name}</h1>
        <p className="text-lg text-gray-600 mt-2">{property.address}</p>
      </div>
      <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold mb-6 text-brand-blue">Update Compliance Data</h2>
        <UpdateComplianceForm propertyId={property.id} />
      </div>
    </div>
  );
} 