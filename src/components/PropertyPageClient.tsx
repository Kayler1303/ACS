'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import type { FullProperty, FullRentRoll, FullTenancy, Unit } from '@/types/property';
import { format } from 'date-fns';

interface PropertyPageClientProps {
  initialProperty: FullProperty;
}

interface EditableCellProps {
  value: string | number | null;
  onSave: (value: string) => void;
  className?: string;
}

interface HudIncomeLimits {
  '50percent': { [key: string]: number };
  '60percent': { [key: string]: number };
  '80percent': { [key: string]: number };
}

interface ProcessedUnit {
  id: string;
  unitNumber: string;
  bedroomCount: number;
  squareFootage?: number;
  residentCount: number;
  totalIncome: number;
  actualBucket: string;
  complianceBucket: string;
}

// Helper function to format unit numbers (remove leading zeros)
const formatUnitNumber = (unitNumber: string | number | null): string => {
  if (!unitNumber) return '';
  const str = String(unitNumber);
  // If it's all digits, remove leading zeros
  if (/^\d+$/.test(str)) {
    return str.replace(/^0+/, '') || '0';
  }
  // Otherwise return as-is (for mixed alphanumeric unit numbers)
  return str;
};

const EditableCell: React.FC<EditableCellProps> = ({ value, onSave, className }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(String(value ?? ''));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
    }
  }, [isEditing]);
  
  const handleSave = () => {
    onSave(currentValue);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setCurrentValue(String(value ?? ''));
      setIsEditing(false);
    }
  };

  // Check if this is a unit number field by looking at className
  const isUnitNumber = className?.includes('font-medium');
  const displayValue = isUnitNumber ? formatUnitNumber(value) : (value ?? '');

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={currentValue}
        onChange={(e) => setCurrentValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`w-full border border-blue-300 rounded px-2 py-1 text-sm ${className}`}
      />
    );
  }

  return (
    <span
      onClick={() => setIsEditing(true)}
      className={`cursor-pointer hover:bg-blue-50 px-2 py-1 rounded ${className}`}
      title="Click to edit"
    >
      {displayValue}
    </span>
  );
};

export default function PropertyPageClient({ initialProperty }: PropertyPageClientProps) {
  const [property, setProperty] = useState(initialProperty);
  const [selectedRentRollId, setSelectedRentRollId] = useState<string | null>(
    initialProperty.rentRolls[0]?.id || null
  );
  


  const [processedTenancies, setProcessedTenancies] = useState<ProcessedUnit[]>([]);
  const [hudIncomeLimits, setHudIncomeLimits] = useState<HudIncomeLimits | null>(null);
  const [lihtcRentData, setLihtcRentData] = useState<any | null>(null);
  const [complianceOption, setComplianceOption] = useState<string>("20% at 50% AMI, 55% at 80% AMI");
  const [includeRentAnalysis, setIncludeRentAnalysis] = useState<boolean>(false);
  const [includeUtilityAllowances, setIncludeUtilityAllowances] = useState<boolean>(false);
  const [showUtilityModal, setShowUtilityModal] = useState<boolean>(false);
  const [utilityAllowances, setUtilityAllowances] = useState<{[bedroomCount: number]: number}>({});
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch HUD income limits
  useEffect(() => {
    const fetchIncomeLimits = async () => {
      try {
        console.log('Fetching income limits for property:', property.id, '(auto-detecting current year)');
        
        // Add timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        const res = await fetch(`/api/properties/${property.id}/income-limits`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        console.log('API response status:', res.status, res.statusText);
        
        if (res.ok) {
          const data = await res.json();
          console.log('Income limits response:', data);
          
          // Extract the income limits (everything except _metadata)
          const { _metadata, ...incomeLimits } = data;
          console.log('Parsed income limits:', incomeLimits);
          console.log('📅 Year used for income limits:', _metadata?.actualYear, _metadata?.usedFallback ? '(fallback)' : '(current)');
          console.log('Setting hudIncomeLimits to:', incomeLimits);
          setHudIncomeLimits(incomeLimits);
        } else {
          const errorText = await res.text();
          console.error('Failed to fetch income limits:', res.status, res.statusText, errorText);
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.error('Income limits fetch timed out after 30 seconds');
        } else {
          console.error('Error fetching income limits:', error);
        }
      }
    };

    fetchIncomeLimits();
  }, [property.id]);

  // Debug current state
  useEffect(() => {
    console.log('Current hudIncomeLimits state:', hudIncomeLimits);
  }, [hudIncomeLimits]);

  // Fetch LIHTC rent data when rent analysis is enabled
  useEffect(() => {
    if (includeRentAnalysis && !lihtcRentData) {
      const fetchLihtcRents = async () => {
        try {
          console.log('📡 Fetching LIHTC rent data for property:', property.id, '(auto-detecting current year)');
          const res = await fetch(`/api/properties/${property.id}/lihtc-rents`);
          if (res.ok) {
            const data = await res.json();
            console.log('📊 LIHTC rent data received:', data);
            console.log('📊 LIHTC max rents structure:', data.lihtcMaxRents);
            console.log('📊 Year used for LIHTC data:', data._metadata?.actualYear, data._metadata?.usedFallback ? '(fallback)' : '(current)');
            setLihtcRentData(data);
          } else {
            console.error('❌ Failed to fetch LIHTC rents:', res.status, res.statusText);
          }
        } catch (error) {
          console.error('❌ Error fetching LIHTC rents:', error);
        }
      };

      fetchLihtcRents();
    }
  }, [includeRentAnalysis, property.id, lihtcRentData]);

  // Process tenancies whenever dependencies change
  useEffect(() => {
    if (!selectedRentRollId || !hudIncomeLimits) {
      return;
    }

    const selectedRentRoll = property.rentRolls.find((rr: FullRentRoll) => rr.id === selectedRentRollId);
    if (!selectedRentRoll) {
      return;
    }

    // Create a map for quick lookup of tenancies by unit
    const tenancyMap = new Map<string, FullTenancy>();
    selectedRentRoll.tenancies.forEach((tenancy: FullTenancy) => {
      tenancyMap.set(tenancy.unitId, tenancy);
    });

    // DEBUG: Log processing state
    console.log('🏗️ Processing tenancies with rent analysis:', {
      includeRentAnalysis,
      hasLihtcData: !!lihtcRentData,
      totalUnits: property.units.length,
      includeUtilityAllowances,
      utilityAllowances
    });

    // Process each unit
    const processed = property.units.map((unit: any) => {
      const tenancy = tenancyMap.get(unit.id);
      const residentCount = tenancy?.residents?.length || 0;
      const totalIncome = tenancy?.residents?.reduce((acc: number, resident: any) => 
        acc + Number(resident.annualizedIncome || 0), 0) || 0;

      const actualBucket = includeRentAnalysis ? 
        getActualBucketWithRentAnalysis(
          totalIncome, 
          residentCount, 
          hudIncomeLimits, 
          complianceOption,
          Number(tenancy?.leaseRent || 0),
          unit.bedroomCount,
          lihtcRentData,
          includeUtilityAllowances ? utilityAllowances : {}
        ) : 
        getActualBucket(totalIncome, residentCount, hudIncomeLimits, complianceOption);

      return {
        id: unit.id,
        unitNumber: unit.unitNumber,
        bedroomCount: unit.bedroomCount,
        squareFootage: unit.squareFootage,
        residentCount,
        totalIncome,
        actualBucket,
        complianceBucket: actualBucket, // Will be updated below
      };
    });

    console.log('Processed units:', processed.length);

    // Apply 140% rule for compliance buckets
    const processedWithCompliance = processed.map((unit: ProcessedUnit) => {
      const tenancy = tenancyMap.get(unit.id);
      const complianceBucket = getComplianceBucket(
        unit, 
        tenancy, 
        hudIncomeLimits, 
        complianceOption,
        includeRentAnalysis,
        lihtcRentData,
        includeUtilityAllowances ? utilityAllowances : {}
      );
      return { ...unit, complianceBucket };
    });

    console.log('Final processed tenancies:', processedWithCompliance.length);
    setProcessedTenancies(processedWithCompliance);
  }, [selectedRentRollId, property.rentRolls, property.units, hudIncomeLimits, complianceOption, includeRentAnalysis, lihtcRentData, includeUtilityAllowances, utilityAllowances]);
                            
  const getActualBucket = (totalIncome: number, residentCount: number, hudIncomeLimits: HudIncomeLimits, complianceOption: string): string => {
                                if (residentCount === 0) return 'Vacant';
    if (residentCount > 0 && (!totalIncome || totalIncome === 0)) return 'No Income Information';
    
    const familySize = Math.min(residentCount, 8); // Cap at 8 per HUD guidelines

    switch (complianceOption) {
      case '20% at 50% AMI, 55% at 80% AMI':
        const limit50 = hudIncomeLimits['50percent']?.[`il50_p${familySize}`];
        const limit80 = hudIncomeLimits['80percent']?.[`il80_p${familySize}`];
        
        if (limit50 && totalIncome <= limit50) return '50% AMI';
        if (limit80 && totalIncome <= limit80) return '80% AMI';
        return 'Market';
        
      case '40% at 60% AMI, 35% at 80% AMI':
        const limit60 = hudIncomeLimits['60percent']?.[`il60_p${familySize}`];
        const limit80_2 = hudIncomeLimits['80percent']?.[`il80_p${familySize}`];
        
        if (limit60 && totalIncome <= limit60) return '60% AMI';
        if (limit80_2 && totalIncome <= limit80_2) return '80% AMI';
        return 'Market';
        
      case '100% at 80% AMI':
        const limit80_3 = hudIncomeLimits['80percent']?.[`il80_p${familySize}`];
        
        if (limit80_3 && totalIncome <= limit80_3) return '80% AMI';
        return 'Market';
        
      default:
        return 'Market';
    }
  };

  const getActualBucketWithRentAnalysis = (
    totalIncome: number, 
    residentCount: number, 
    hudIncomeLimits: HudIncomeLimits, 
    complianceOption: string,
    leaseRent: number,
    bedroomCount: number | null,
    lihtcRentData: any,
    utilityAllowances: {[bedroomCount: number]: number}
  ): string => {
    // First check income qualification
    const incomeBucket = getActualBucket(totalIncome, residentCount, hudIncomeLimits, complianceOption);
    
    // DEBUG: Log the inputs
    console.log('🔍 Rent Analysis Debug:', {
      totalIncome,
      residentCount,
      leaseRent,
      bedroomCount,
      incomeBucket,
      includeRentAnalysis,
      hasLihtcData: !!lihtcRentData?.lihtcMaxRents,
      lihtcDataStructure: lihtcRentData ? Object.keys(lihtcRentData) : 'No data'
    });
    
    // If no rent analysis data or no lease rent, fall back to income-only
    if (!includeRentAnalysis || !lihtcRentData?.lihtcMaxRents || !bedroomCount || !leaseRent) {
      console.log('❌ Rent Analysis BYPASSED:', {
        includeRentAnalysis,
        hasLihtcData: !!lihtcRentData?.lihtcMaxRents,
        bedroomCount,
        leaseRent,
        reason: !includeRentAnalysis ? 'Rent analysis disabled' :
                !lihtcRentData?.lihtcMaxRents ? 'No LIHTC data' :
                !bedroomCount ? 'No bedroom count' :
                !leaseRent ? 'No lease rent' : 'Unknown'
      });
      return incomeBucket;
    }

    // Get utility allowance for this bedroom count
    const utilityAllowance = utilityAllowances[bedroomCount] || 0;
    
    // Check rent compliance for each AMI level, factoring in utility allowances
    const maxRent50 = (lihtcRentData.lihtcMaxRents['50percent']?.[`${bedroomCount}br`] || 0) - utilityAllowance;
    const maxRent60 = (lihtcRentData.lihtcMaxRents['60percent']?.[`${bedroomCount}br`] || 0) - utilityAllowance;
    const maxRent80 = (lihtcRentData.lihtcMaxRents['80percent']?.[`${bedroomCount}br`] || 0) - utilityAllowance;

    // DEBUG: Log the rent limits
    console.log('💰 Rent Limits:', {
      bedroomCount,
      utilityAllowance,
      leaseRent,
      maxRent50Raw: lihtcRentData.lihtcMaxRents['50percent']?.[`${bedroomCount}br`],
      maxRent60Raw: lihtcRentData.lihtcMaxRents['60percent']?.[`${bedroomCount}br`],
      maxRent80Raw: lihtcRentData.lihtcMaxRents['80percent']?.[`${bedroomCount}br`],
      adjustedMaxRent50: maxRent50,
      adjustedMaxRent60: maxRent60,
      adjustedMaxRent80: maxRent80,
      availableKeys: Object.keys(lihtcRentData.lihtcMaxRents || {}),
      availableBedroomKeys50: lihtcRentData.lihtcMaxRents['50percent'] ? Object.keys(lihtcRentData.lihtcMaxRents['50percent']) : 'None'
    });

    // Check from lowest to highest AMI
    if (incomeBucket === '50% AMI' && leaseRent <= maxRent50) {
      console.log('✅ Qualifies for 50% AMI (rent compliant)');
      return '50% AMI';
    }
    if ((incomeBucket === '50% AMI' || incomeBucket === '60% AMI') && leaseRent <= maxRent60) {
      console.log('✅ Qualifies for 60% AMI (rent compliant)');
      return '60% AMI';
    }
    if ((['50% AMI', '60% AMI', '80% AMI'].includes(incomeBucket)) && leaseRent <= maxRent80) {
      console.log('✅ Qualifies for 80% AMI (rent compliant)');
      return '80% AMI';
    }
                                
    // If rent exceeds all limits, it's market rate
    console.log('❌ Rent exceeds all limits → Market rate', {
      incomeBucket,
      leaseRent,
      maxRent50,
      maxRent60,
      maxRent80
    });
    return 'Market';
  };

  const getComplianceBucket = (
    unit: ProcessedUnit, 
    tenancy: FullTenancy | undefined, 
    hudIncomeLimits: HudIncomeLimits | null, 
    complianceOption: string,
    includeRentAnalysis: boolean,
    lihtcRentData: any,
    utilityAllowances: {[bedroomCount: number]: number}
  ): string => {
    if (!tenancy || !hudIncomeLimits) return unit.actualBucket;
    
    // Get original bucket (what they qualified for at move-in using 140% rule)
    let originalBucket = 'Market';
    if (tenancy.residents.length > 0) {
      // Calculate what their bucket would have been at that time using current HUD limits
      const totalIncomeAtTime = tenancy.residents.reduce((acc: number, res: any) => acc + Number(res.annualizedIncome || 0), 0);
                                  const residentCountAtTime = tenancy.residents.length;
      
      originalBucket = includeRentAnalysis ? 
        getActualBucketWithRentAnalysis(
          totalIncomeAtTime, 
          residentCountAtTime, 
          hudIncomeLimits, 
          complianceOption,
          Number(tenancy?.leaseRent || 0),
          unit.bedroomCount,
          lihtcRentData,
          utilityAllowances
        ) : 
        getActualBucket(totalIncomeAtTime, residentCountAtTime, hudIncomeLimits, complianceOption);
    }

    // Apply 140% rule: if original was Market, show actual. Otherwise show better of original vs actual
    if (originalBucket === 'Market') {
      return unit.actualBucket;
    }

    // Return the better bucket (lower AMI is better)
    const bucketPriority = ['50% AMI', '60% AMI', '80% AMI', 'Market', 'Vacant', 'No Income Information'];
    const originalIndex = bucketPriority.indexOf(originalBucket);
    const actualIndex = bucketPriority.indexOf(unit.actualBucket);
    
    return actualIndex <= originalIndex ? unit.actualBucket : originalBucket;
  };

  const handleUpdateUnit = async (unitId: string, field: string, value: string) => {
    try {
      const res = await fetch(`/api/units/${unitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });

      if (!res.ok) {
        throw new Error('Failed to update unit');
      }

      // Update local state
      setProperty((prev: FullProperty) => ({
        ...prev,
        units: prev.units.map((unit: any) => 
          unit.id === unitId 
            ? { ...unit, [field]: field === 'unitNumber' ? value : Number(value) }
            : unit
        )
      }));
    } catch (error) {
      console.error('Error updating unit:', error);
    }
  };

  const handleDeleteProperty = async () => {
    if (!confirm('Are you sure you want to delete this property? This action cannot be undone.')) {
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/properties/${property.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete property');
      }

      window.location.href = '/dashboard';
    } catch (error: any) {
      setError(error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // Calculate target unit counts with proper rounding
  const getTargetCounts = (complianceOption: string, totalUnits: number): { [key: string]: number } => {
    switch (complianceOption) {
      case '20% at 50% AMI, 55% at 80% AMI':
        const units50 = Math.ceil(totalUnits * 0.20); // Round UP for 50% AMI (minimum 20%)
        const marketUnits = Math.floor(totalUnits * 0.25); // Round DOWN for Market (maximum 25%)
        const units80 = totalUnits - units50 - marketUnits; // Remaining units for 80% AMI
        return { 
          '50% AMI': units50, 
          '80% AMI': units80, 
          'Market': marketUnits, 
          'Vacant': 0, 
          'No Income Information': 0 
        };
      case '40% at 60% AMI, 35% at 80% AMI':
        const units60 = Math.ceil(totalUnits * 0.40); // Round UP for 60% AMI (minimum 40%)
        const marketUnits2 = Math.floor(totalUnits * 0.25); // Round DOWN for Market (maximum 25%)
        const units80_2 = totalUnits - units60 - marketUnits2; // Remaining units for 80% AMI
        return { 
          '60% AMI': units60, 
          '80% AMI': units80_2, 
          'Market': marketUnits2, 
          'Vacant': 0, 
          'No Income Information': 0 
        };
      case '100% at 80% AMI':
        return { 
          '80% AMI': totalUnits, 
          'Market': 0, 
          'Vacant': 0, 
          'No Income Information': 0 
        };
      default:
        return {};
    }
  };

  // Calculate target percentages for display
  const getTargetPercentages = (complianceOption: string, totalUnits: number): { [key: string]: number } => {
    const targetCounts = getTargetCounts(complianceOption, totalUnits);
    const percentages: { [key: string]: number } = {};
    
    Object.keys(targetCounts).forEach(bucket => {
      percentages[bucket] = totalUnits > 0 ? (targetCounts[bucket] / totalUnits * 100) : 0;
    });
    
    return percentages;
  };

  const calculateSummaryStats = () => {
    const totalUnits = processedTenancies.length;
    const targetCounts = getTargetCounts(complianceOption, totalUnits);
    const targets = getTargetPercentages(complianceOption, totalUnits);
    
    const bucketCounts = processedTenancies.reduce((acc, unit) => {
      const bucket = unit.complianceBucket;
      acc[bucket] = (acc[bucket] || 0) + 1;
      return acc;
    }, {} as {[key: string]: number});

    // Calculate compliance with vacants - proper vacant unit distribution
    const bucketCountsWithVacants = { ...bucketCounts };
    const vacantUnits = bucketCounts['Vacant'] || 0;
    
    if (vacantUnits > 0) {
      // Remove vacant units from the vacant bucket for the "with vacants" calculation
      bucketCountsWithVacants['Vacant'] = 0;
      
      // Get all target buckets in priority order (lowest AMI first)
      const targetBuckets = Object.keys(targetCounts).filter(bucket => targetCounts[bucket] > 0);
      const bucketPriority = ['50% AMI', '60% AMI', '80% AMI'];
      const sortedTargetBuckets = targetBuckets.sort((a, b) => {
        const aIndex = bucketPriority.indexOf(a);
        const bIndex = bucketPriority.indexOf(b);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
      
      let remainingVacantUnits = vacantUnits;
      
      // Distribute vacant units to buckets that need them (starting with lowest AMI)
      for (const bucket of sortedTargetBuckets) {
        if (remainingVacantUnits <= 0) break;
        
        const targetCount = targetCounts[bucket];
        const currentCount = bucketCounts[bucket] || 0;
        const shortage = Math.max(0, targetCount - currentCount);
        
        const unitsToAdd = Math.min(shortage, remainingVacantUnits);
        if (unitsToAdd > 0) {
          bucketCountsWithVacants[bucket] = currentCount + unitsToAdd;
          remainingVacantUnits -= unitsToAdd;
        }
      }
      
      // Put any remaining vacant units in the market bucket
      if (remainingVacantUnits > 0) {
        bucketCountsWithVacants['Market'] = (bucketCountsWithVacants['Market'] || 0) + remainingVacantUnits;
      }
    }

    return { totalUnits, targetCounts, targets, bucketCounts, bucketCountsWithVacants };
  };

  const stats = calculateSummaryStats();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-brand-blue">{property.name}</h1>
        <p className="text-lg text-gray-600 mt-2">{property.address}</p>
      </div>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}
      
      {/* Update Compliance Data Section */}
      <div className="mb-8 bg-white rounded-lg shadow-md overflow-hidden">
        <div className="bg-gradient-to-r from-green-600 to-green-500 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">📊 Update Compliance Data</h2>
          <p className="text-green-100 text-sm mt-1">Upload new resident & rent roll data to refresh your compliance analysis</p>
        </div>
        <div className="p-6">
          <a
            href={`/property/${property.id}/update-compliance`}
            className="inline-flex items-center px-6 py-3 text-lg font-medium text-white bg-green-600 border border-transparent rounded-md shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
          >
            📊 Update Compliance Data
          </a>
        </div>
      </div>
      
      {/* Compliance Analysis & Controls */}
      <div className="mb-8 bg-white rounded-lg shadow-md overflow-hidden">
        <div className="bg-gradient-to-r from-brand-blue to-brand-accent px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Compliance Analysis & Controls</h2>
          <p className="text-blue-100 text-sm mt-1">Configure your analysis parameters and take action</p>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Analysis Parameters Section */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Analysis Parameters</h3>
                                          
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="compliance-option" className="block text-sm font-medium text-gray-700">
                    🏢 Compliance Test Standard
                  </label>
                  <select
                    id="compliance-option"
                    name="compliance-option"
                    className="w-full pl-3 pr-10 py-2.5 text-sm border-gray-300 focus:outline-none focus:ring-brand-blue focus:border-brand-blue rounded-md shadow-sm bg-white"
                                                value={complianceOption}
                    onChange={(e) => setComplianceOption(e.target.value)}
                  >
                    <option value="20% at 50% AMI, 55% at 80% AMI">20% at 50% AMI, 55% at 80% AMI</option>
                    <option value="40% at 60% AMI, 35% at 80% AMI">40% at 60% AMI, 35% at 80% AMI</option>
                    <option value="100% at 80% AMI">100% at 80% AMI</option>
                  </select>
                  <p className="text-xs text-gray-500">Select the affordable housing requirements</p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="rent-roll-select" className="block text-sm font-medium text-gray-700">
                    📅 Data Snapshot Date
                  </label>
                  <select
                    id="rent-roll-select"
                    value={selectedRentRollId || ''}
                    onChange={(e) => setSelectedRentRollId(e.target.value)}
                    className="w-full pl-3 pr-10 py-2.5 text-sm border-gray-300 focus:outline-none focus:ring-brand-blue focus:border-brand-blue rounded-md shadow-sm bg-white"
                                              >
                    {property.rentRolls.map((rentRoll: FullRentRoll) => (
                      <option key={rentRoll.id} value={rentRoll.id}>
                        {new Date(rentRoll.date).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500">Choose which rent roll snapshot to analyze</p>
                </div>
              </div>
            </div>
            
            {/* Actions Section */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Analysis Options</h3>
              
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <input
                    id="include-rent-analysis"
                    type="checkbox"
                    checked={includeRentAnalysis}
                    onChange={(e) => setIncludeRentAnalysis(e.target.checked)}
                    className="h-4 w-4 text-brand-blue focus:ring-brand-blue border-gray-300 rounded"
                  />
                  <label htmlFor="include-rent-analysis" className="text-sm font-medium text-gray-700">
                    💰 Include Rent Analysis
                  </label>
                </div>
                <p className="text-xs text-gray-500 ml-7">
                  When enabled, max rents are taken into account for the compliance calculation
                </p>
                
                <div className="flex items-center space-x-3">
                  <input
                    id="include-utility-allowances"
                    type="checkbox"
                    checked={includeUtilityAllowances && includeRentAnalysis}
                    onChange={(e) => {
                      if (includeRentAnalysis) {
                        setIncludeUtilityAllowances(e.target.checked);
                        if (e.target.checked) {
                          setShowUtilityModal(true);
                        }
                      }
                    }}
                    disabled={!includeRentAnalysis}
                    className="h-4 w-4 text-brand-blue focus:ring-brand-blue border-gray-300 rounded disabled:opacity-50"
                                              />
                  <label htmlFor="include-utility-allowances" className={`text-sm font-medium ${includeRentAnalysis ? 'text-gray-700' : 'text-gray-400'}`}>
                                                ⚡ Include Utility Allowances
                  </label>
                  {includeUtilityAllowances && includeRentAnalysis && (
                    <button
                      onClick={() => setShowUtilityModal(true)}
                      className="ml-2 px-2 py-1 text-xs bg-brand-blue text-white rounded hover:bg-blue-600"
                    >
                      Configure
                    </button>
                  )}
                </div>
                <p className={`text-xs ml-7 ${includeRentAnalysis ? 'text-gray-500' : 'text-gray-400'}`}>
                  Subtract utility allowances from max rents (requires rent analysis)
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Compliance Summary */}
      {processedTenancies.length > 0 && (
        <div className="mb-8 bg-white rounded-lg shadow-md overflow-hidden">
          <div className="bg-gradient-to-r from-brand-blue to-brand-accent px-6 py-4">
            <h2 className="text-lg font-semibold text-white">Compliance Summary</h2>
          </div>
          
          <div className="p-6">
            {/* Percentages Section */}
            <div className="mb-8">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Percentages</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full table-fixed">
                  <thead>
                    <tr className="bg-gradient-to-r from-brand-blue to-brand-accent">
                      <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Bucket</th>
                                                  <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Target</th>
                                                  <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Actual</th>
                                                  <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Compliance</th>
                                                  <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Compliance With Vacants</th>
                                                  <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Over/(Under)</th>
                                                </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {Object.entries(stats.targets).map(([bucket, target]) => {
                      const actual = ((stats.bucketCounts[bucket] || 0) / stats.totalUnits * 100);
                      const compliance = actual; // Compliance column shows percentage of total units in this bucket
                      const withVacants = ((stats.bucketCountsWithVacants[bucket] || 0) / stats.totalUnits * 100);
                                                  const overUnder = actual - target;
                      
                      return (
                        <tr key={bucket}>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm font-medium text-gray-900">{bucket}</td>
                                                      <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-500">{target.toFixed(1)}%</td>
                                                      <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-500">{actual.toFixed(1)}%</td>
                                                      <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-500">{compliance.toFixed(1)}%</td>
                                                      <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-500">{withVacants.toFixed(1)}%</td>
                                                      <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                            {overUnder >= 0 ? '+' : ''}{overUnder.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Unit Counts Section */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Unit Counts</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full table-fixed">
                  <thead>
                    <tr className="bg-gradient-to-r from-brand-blue to-brand-accent">
                      <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Bucket</th>
                                                  <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Target</th>
                                                  <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Actual</th>
                                                  <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Compliance</th>
                                                  <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Compliance With Vacants</th>
                                                  <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Over/(Under)</th>
                                                </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {Object.entries(stats.targets).map(([bucket, targetPercent]) => {
                      const targetUnits = stats.targetCounts[bucket] || 0;
                      const actualUnits = stats.bucketCounts[bucket] || 0;
                      const complianceUnits = actualUnits;
                      const withVacantsUnits = stats.bucketCountsWithVacants[bucket] || 0;
                      const overUnderUnits = actualUnits - targetUnits;
                      
                      return (
                        <tr key={bucket}>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm font-medium text-gray-900">{bucket}</td>
                                                      <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-500">{targetUnits}</td>
                                                      <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-500">{actualUnits}</td>
                                                      <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-500">{complianceUnits}</td>
                                                      <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-500">{withVacantsUnits}</td>
                                                      <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                            {overUnderUnits >= 0 ? '+' : ''}{overUnderUnits}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Property Data */}
      {processedTenancies.length > 0 && (
        <div className="mb-8 bg-white rounded-lg shadow-md overflow-hidden">
          <div className="bg-gradient-to-r from-brand-blue to-brand-accent px-6 py-4">
            <h2 className="text-lg font-semibold text-white">Property Data</h2>
            <p className="text-blue-100 text-sm mt-1">Unit-by-unit compliance analysis</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-300">
              <thead className="bg-gradient-to-r from-brand-blue to-brand-accent">
                <tr>
                  <th className="px-6 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Unit #</th>
                                              <th className="px-6 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Bedrooms</th>
                                              <th className="px-6 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Sq Ft</th>
                                              <th className="px-6 py-3 text-center text-xs font-medium text-white uppercase tracking-wider"># of Residents</th>
                                              <th className="px-6 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Total Income</th>
                                              <th className="px-6 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Actual Bucket</th>
                                              <th className="px-6 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Compliance Bucket</th>
                                            </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {processedTenancies.map((unit) => (
                  <tr key={unit.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <EditableCell
                        value={unit.unitNumber}
                        onSave={(value) => handleUpdateUnit(unit.id, 'unitNumber', value)}
                        className="text-sm font-medium text-gray-900 text-center"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <EditableCell
                        value={unit.bedroomCount}
                        onSave={(value) => handleUpdateUnit(unit.id, 'bedroomCount', value)}
                        className="text-sm text-gray-500 text-center"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <EditableCell
                        value={unit.squareFootage ?? null}
                        onSave={(value) => handleUpdateUnit(unit.id, 'squareFootage', value)}
                        className="text-sm text-gray-500 text-center"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <Link 
                        href={`/property/${property.id}/rent-roll/${selectedRentRollId}/unit/${unit.id}`}
                        className="text-sm text-brand-blue hover:text-brand-accent underline cursor-pointer"
                      >
                        {unit.residentCount}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                      {unit.totalIncome ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(unit.totalIncome) : '-'}
                                                </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                      {unit.actualBucket}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                      {unit.complianceBucket}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Show message if no data */}
      {processedTenancies.length === 0 && hudIncomeLimits && (
        <div className="mb-8 bg-white rounded-lg shadow-md overflow-hidden">
          <div className="p-8 text-center text-gray-500">
            <p>No compliance data available. Please upload a rent roll to see the analysis.</p>
          </div>
        </div>
      )}

      {/* Delete Property Section */}
      <div className="mt-12 pt-8 border-t border-gray-200">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />                                                              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-red-800">Danger Zone</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>Once you delete a property, there is no going back. Please be certain.</p>
              </div>
              <div className="mt-4">
                <button
                  onClick={handleDeleteProperty}
                  disabled={isDeleting}
                  className="bg-red-600 border border-transparent rounded-md py-2 px-4 inline-flex justify-center text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                                                                        >
                  {isDeleting ? 'Deleting...' : 'Delete Property'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Utility Allowances Modal */}
      {showUtilityModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Configure Utility Allowances</h3>
              <p className="text-sm text-gray-600 mb-4">
                Enter monthly utility allowances that will be subtracted from LIHTC maximum rents.
              </p>

              <div className="space-y-3">
                {[...new Set(property.units.map((unit: any) => unit.bedroomCount))]
                  .filter((count): count is number => count !== null && count !== undefined && typeof count === 'number')
                                              .sort((a: number, b: number) => a - b)
                  .map((bedroomCount: number) => (
                    <div key={bedroomCount} className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">
                        {bedroomCount === 0 ? 'Studio' : `${bedroomCount} Bedroom`}
                      </label>
                      <div className="flex items-center">
                        <span className="text-sm text-gray-500 mr-2">$</span>
                        <input
                          type="number"
                          value={utilityAllowances[bedroomCount] || ''}
                          onChange={(e) => setUtilityAllowances(prev => ({
                            ...prev,
                            [bedroomCount]: parseFloat(e.target.value) || 0
                          }))}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-brand-blue focus:border-brand-blue"
                                                      placeholder="0"
                          min="0"
                          step="1"
                        />
                        <span className="text-sm text-gray-500 ml-1">/month</span>
                      </div>
                    </div>
                  ))}
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => setShowUtilityModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                                            >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowUtilityModal(false);
                    // Keep the toggle enabled and data saved
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-brand-blue border border-transparent rounded-md hover:bg-blue-600"
                                            >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 