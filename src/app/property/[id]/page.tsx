'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import PropertyPageClient from '@/components/PropertyPageClient';
import Link from 'next/link';
import type { FullProperty } from '@/types/property';
import { usePropertyScrollRestoration } from '@/hooks/useScrollRestoration';

// A new, dedicated API route will be needed to fetch the full property data
// Let's assume it will be at /api/properties/[id]/full-details

export default function PropertyPage() {
  const params = useParams();
  const id = params.id as string;

  const [property, setProperty] = useState<FullProperty | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Enable scroll restoration for this property page
  usePropertyScrollRestoration(id);

  useEffect(() => {
    if (id) {
      const fetchProperty = async () => {
        setIsLoading(true);
        try {
          const res = await fetch(`/api/properties/${id}`); // Assuming a new endpoint here
          if (!res.ok) {
            const data = await res.json();
            
            // Check if this is a payment access issue
            if (res.status === 403 && data.requiresPayment) {
              // Payment required or past due, redirect to appropriate page
              window.location.href = data.redirectTo || (data.isPastDue ? `/property/${id}/payment-recovery` : `/property/${id}/payment-setup`);
              return;
            }
            
            throw new Error(data.error || 'Failed to fetch property data.');
          }
          const data: FullProperty = await res.json();
          setProperty(data);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        } finally {
          setIsLoading(false);
        }
      };
      fetchProperty();
    }
  }, [id]);

  if (isLoading) {
    return <div className="container mx-auto px-4 py-8 text-center">Loading property data...</div>;
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

  return <PropertyPageClient initialProperty={property} />;
} 