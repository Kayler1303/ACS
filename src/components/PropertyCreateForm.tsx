'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { states, counties } from '@/lib/geo';

export default function PropertyCreateForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [county, setCounty] = useState('');
  const [state, setState] = useState('');
  const [numberOfUnits, setNumberOfUnits] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setState(e.target.value);
    setCounty(''); // Reset county when state changes
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/properties', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          address,
          county,
          state,
          numberOfUnits,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Something went wrong');
      }

      const newProperty = await res.json();

      // On success, redirect to the new unit upload page
      router.push(`/property/${newProperty.id}/upload-units`);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          Property Name
        </label>
        <input
          id="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:ring-brand-accent focus:border-brand-accent"
        />
      </div>
      <div>
        <label htmlFor="address" className="block text-sm font-medium text-gray-700">
          Address (Optional)
        </label>
        <input
          id="address"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:ring-brand-accent focus:border-brand-accent"
        />
      </div>
      <div>
        <label htmlFor="state" className="block text-sm font-medium text-gray-700">
          State
        </label>
        <select
          id="state"
          required
          value={state}
          onChange={handleStateChange}
          className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:ring-brand-accent focus:border-brand-accent"
        >
          <option value="">Select a state</option>
          {states.map((s: { name: string; abbreviation: string }) => (
            <option key={s.abbreviation} value={s.abbreviation}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="county" className="block text-sm font-medium text-gray-700">
          County
        </label>
        <select
          id="county"
          required
          value={county}
          onChange={(e) => setCounty(e.target.value)}
          disabled={!state}
          className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:ring-brand-accent focus:border-brand-accent disabled:bg-gray-100"
        >
          <option value="">Select a county</option>
          {state &&
            counties[state]?.map((c: string) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
        </select>
      </div>
      <div>
        <label htmlFor="numberOfUnits" className="block text-sm font-medium text-gray-700">
          Number of Units
        </label>
        <input
          id="numberOfUnits"
          type="number"
          required
          value={numberOfUnits}
          onChange={(e) => setNumberOfUnits(e.target.value)}
          className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:ring-brand-accent focus:border-brand-accent"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div>
        <button
          type="submit"
          disabled={isLoading}
          className="w-full px-4 py-2 text-sm font-medium text-white bg-brand-blue border border-transparent rounded-md shadow-sm hover:bg-brand-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-accent disabled:bg-indigo-300"
        >
          {isLoading ? 'Creating Property...' : 'Create Property'}
        </button>
      </div>
    </form>
  );
} 