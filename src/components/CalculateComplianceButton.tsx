'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type CalculateComplianceButtonProps = {
  propertyId: string;
};

export default function CalculateComplianceButton({
  propertyId,
}: CalculateComplianceButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleClick = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/properties/${propertyId}/calculate-compliance`,
        {
          method: 'POST',
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
      }
      setMessage(data.message);
      router.refresh();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={isLoading}
        className="px-8 py-3 text-lg font-semibold text-white bg-brand-blue border border-transparent rounded-md shadow-sm hover:bg-brand-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue disabled:bg-gray-400"
      >
        {isLoading ? 'Calculating...' : 'Calculate Compliance Data'}
      </button>
      {message && <p className="text-sm text-center mt-4">{message}</p>}
    </div>
  );
} 