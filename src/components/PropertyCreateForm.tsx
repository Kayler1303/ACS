'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { states, counties } from '@/lib/geo';

// LIHTC Program Year ranges (exact historical effective dates)
const PROGRAM_YEARS = [
  { year: 2025, range: "On or after 4/1/2025", heraEligible: false },
  { year: 2024, range: "On or after 4/1/2024 but prior to 4/1/2025", heraEligible: false },
  { year: 2023, range: "On or after 5/15/2023 but prior to 4/1/2024", heraEligible: false },
  { year: 2022, range: "On or after 4/18/2022 but prior to 5/15/2023", heraEligible: false },
  { year: 2021, range: "On or after 4/1/2021 but prior to 4/18/2022", heraEligible: false },
  { year: 2020, range: "On or after 4/1/2020 but prior to 4/1/2021", heraEligible: false },
  { year: 2019, range: "On or after 4/24/2019 but prior to 4/1/2020", heraEligible: false },
  { year: 2018, range: "On or after 4/1/2018 but prior to 4/24/2019", heraEligible: false },
  { year: 2017, range: "On or after 4/14/2017 but prior to 4/1/2018", heraEligible: false },
  { year: 2016, range: "On or after 3/28/2016 but prior to 4/14/2017", heraEligible: false },
  { year: 2015, range: "On or after 3/6/2015 but prior to 3/28/2016", heraEligible: false },
  { year: 2014, range: "On or after 12/18/2013 but prior to 3/6/2015", heraEligible: false },
  { year: 2013, range: "On or after 12/11/2012 but prior to 12/18/2013", heraEligible: false },
  { year: 2012, range: "On or after 12/1/2011 but prior to 12/11/2012", heraEligible: false },
  { year: 2011, range: "On or after 6/1/2011 but prior to 12/1/2011", heraEligible: false },
  { year: 2010, range: "On or after 5/14/2010 but prior to 6/1/2011", heraEligible: false },
  { year: 2009, range: "On or after 1/1/2009 but prior to 5/14/2010", heraEligible: false },
  { year: 2008, range: "Prior to 1/1/2009", heraEligible: true }
];

export default function PropertyCreateForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [county, setCounty] = useState('');
  const [state, setState] = useState('');
  const [numberOfUnits, setNumberOfUnits] = useState('');
  const [placedInServiceYear, setPlacedInServiceYear] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setState(e.target.value);
    setCounty(''); // Reset county when state changes
  };

  const availableCounties = state ? counties[state.split(',')[0]] || [] : [];

  // Convert program year to date for API submission
  const convertYearToDate = (year: string): string | null => {
    if (!year) return null;
    
    // For HERA eligible years (2008 and earlier), use a date before 1/1/2009
    if (parseInt(year) <= 2008) {
      return '2008-12-31'; // Any date before 1/1/2009
    }
    
    // For other years, use the start date of that program year
    const programYear = PROGRAM_YEARS.find(py => py.year.toString() === year);
    if (!programYear) return null;
    
    // Extract start date from range text
    const ranges: { [key: string]: string } = {
      '2025': '2025-04-01',
      '2024': '2024-04-01', 
      '2023': '2023-05-15',
      '2022': '2022-04-18',
      '2021': '2021-04-01',
      '2020': '2020-04-01',
      '2019': '2019-04-24',
      '2018': '2018-04-01',
      '2017': '2017-04-14',
      '2016': '2016-03-28',
      '2015': '2015-03-06',
      '2014': '2013-12-18',
      '2013': '2012-12-11',
      '2012': '2011-12-01',
      '2011': '2011-06-01',
      '2010': '2010-05-14',
      '2009': '2009-01-01'
    };
    
    return ranges[year] || null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const placedInServiceDate = convertYearToDate(placedInServiceYear);
      
      const response = await fetch('/api/properties', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          name,
          address,
          county,
          state,
          numberOfUnits: numberOfUnits ? parseInt(numberOfUnits) : null,
          placedInServiceDate
        }),
      });

      if (response.ok) {
        const { property } = await response.json();
        router.push(`/property/${property.id}/payment-setup`);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to create property');
      }
    } catch (err) {
      setError('An error occurred while creating the property');
    } finally {
      setIsLoading(false);
    }
  };

  const selectedProgramYear = PROGRAM_YEARS.find(py => py.year.toString() === placedInServiceYear);

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Create New Property
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter your property details to get started
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Property Name *
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue"
                placeholder="Enter property name"
              />
            </div>

            <div>
              <label htmlFor="address" className="block text-sm font-medium text-gray-700">
                Address
              </label>
              <input
                id="address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue"
                placeholder="Enter property address (Optional)"
              />
            </div>

            <div>
              <label htmlFor="state" className="block text-sm font-medium text-gray-700">
                State *
              </label>
              <select
                id="state"
                required
                value={state}
                onChange={handleStateChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue"
              >
                <option value="">Select a state</option>
                {states.map((s) => (
                  <option key={s.abbreviation} value={s.abbreviation}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="county" className="block text-sm font-medium text-gray-700">
                County *
              </label>
              <select
                id="county"
                required
                value={county}
                onChange={(e) => setCounty(e.target.value)}
                disabled={!state}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue disabled:bg-gray-100"
              >
                <option value="">Select a county</option>
                {availableCounties.map((countyName) => (
                  <option key={countyName} value={countyName}>
                    {countyName}
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
                min="1"
                value={numberOfUnits}
                onChange={(e) => setNumberOfUnits(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-blue focus:border-brand-blue"
                placeholder="Enter number of units"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="placed-in-service-year" className="block text-sm font-medium text-gray-700">
                🏗️ Placed in Service Program Year <span className="text-gray-500 text-xs">(Optional)</span>
              </label>
              <select
                id="placed-in-service-year"
                value={placedInServiceYear}
                onChange={(e) => setPlacedInServiceYear(e.target.value)}
                className="w-full pl-3 pr-10 py-2.5 text-sm border-gray-300 focus:outline-none focus:ring-brand-blue focus:border-brand-blue rounded-md shadow-sm bg-white"
              >
                <option value="">Select program year (if applicable)</option>
                {PROGRAM_YEARS.map((programYear) => (
                  <option key={programYear.year} value={programYear.year.toString()}>
                    {programYear.year} ({programYear.range})
                  </option>
                ))}
              </select>
              {selectedProgramYear && (
                <p className="text-xs text-gray-500">
                  {selectedProgramYear.heraEligible ? (
                    <span className="text-green-600 font-medium">
                      ✅ Eligible for HERA Special income limits (higher limits available)
                    </span>
                  ) : (
                    <span className="text-gray-600">
                      Uses standard income limits
                    </span>
                  )}
                </p>
              )}
              <p className="text-xs text-gray-500">
                Only select if property qualifies for HERA Special limits (placed in service before 2009) or if you need to specify the exact program year for income limit calculations.
              </p>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-brand-blue hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue disabled:opacity-50"
            >
              {isLoading ? 'Creating...' : 'Create Property'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 