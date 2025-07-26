'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { FullProperty, FullRentRoll, FullTenancy, Unit } from '@/types/property';
import type { Resident } from '@prisma/client';
import { format } from 'date-fns';
import { PropertyVerificationSummary, VerificationStatus } from '@/services/verification';

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

interface ProvisionalLease {
  id: string;
  name: string;
  leaseStartDate?: string;
  leaseEndDate?: string;
  leaseRent?: number;
  unitId: string;
  isVerificationFinalized: boolean;
  residentCount: number;
  amiBucketInfo?: {
    actualBucket: string;
    complianceBucket: string;
    amiPercentage: number;
    householdIncome: number;
    householdSize: number;
  };
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
  verificationStatus?: VerificationStatus;
  provisionalLeases?: ProvisionalLease[];
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
  const [lihtcRentData, setLihtcRentData] = useState<Record<string, unknown> | null>(null);
  const [complianceOption, setComplianceOption] = useState<string>("20% at 50% AMI, 55% at 80% AMI");
  const [includeRentAnalysis, setIncludeRentAnalysis] = useState<boolean>(false);
  const [includeUtilityAllowances, setIncludeUtilityAllowances] = useState<boolean>(false);
  const [showUtilityModal, setShowUtilityModal] = useState<boolean>(false);
  const [utilityAllowances, setUtilityAllowances] = useState<{[bedroomCount: number]: number}>({});
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationData, setVerificationData] = useState<PropertyVerificationSummary | null>(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [provisionalLeases, setProvisionalLeases] = useState<ProvisionalLease[]>([]);
  const [selectedProvisionalLeases, setSelectedProvisionalLeases] = useState<Set<string>>(new Set());

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
      } catch (error: unknown) {
        if ((error as { name?: string })?.name === 'AbortError') {
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

  // Fetch verification status data
  useEffect(() => {
    const fetchVerificationData = async () => {
      if (!selectedRentRollId) return;
      
      setVerificationLoading(true);
      try {
        const res = await fetch(`/api/properties/${property.id}/verification-status`);
        if (res.ok) {
          const data = await res.json();
          setVerificationData(data);
        } else {
          console.error('Failed to fetch verification status:', res.status, res.statusText);
        }
      } catch (error) {
        console.error('Error fetching verification status:', error);
      } finally {
        setVerificationLoading(false);
      }
    };

    fetchVerificationData();
  }, [property.id, selectedRentRollId]);

  // Fetch provisional leases data
  useEffect(() => {
    const fetchProvisionalLeases = async () => {
      try {
        const res = await fetch(`/api/properties/${property.id}/provisional-leases`);
        if (res.ok) {
          const data = await res.json();
          setProvisionalLeases(data);
          
          // Fetch AMI bucket data for finalized provisional leases
          const finalizedLeases = data.filter((lease: ProvisionalLease) => lease.isVerificationFinalized);
          for (const lease of finalizedLeases) {
            fetchAmiBucketForProvisionalLease(lease.id);
          }
        } else {
          console.error('Failed to fetch provisional leases:', res.status, res.statusText);
        }
      } catch (error) {
        console.error('Error fetching provisional leases:', error);
      }
    };

    fetchProvisionalLeases();
  }, [property.id]);

  // Function to fetch AMI bucket data for a specific provisional lease
  const fetchAmiBucketForProvisionalLease = async (leaseId: string) => {
    try {
      const response = await fetch(`/api/leases/${leaseId}/ami-bucket`);
      if (response.ok) {
        const amiBucketData = await response.json();
        
        // Update the provisional lease with AMI bucket information
        setProvisionalLeases(prev => 
          prev.map(lease => 
            lease.id === leaseId 
              ? { ...lease, amiBucketInfo: amiBucketData }
              : lease
          )
        );
      }
    } catch (error) {
      console.error(`Error fetching AMI bucket data for lease ${leaseId}:`, error);
    }
  };

  const getActualBucket = useCallback((totalIncome: number, residentCount: number, hudIncomeLimits: HudIncomeLimits, complianceOption: string): string => {
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
  }, []);

  const getActualBucketWithRentAnalysis = useCallback((
    totalIncome: number, 
    residentCount: number, 
    hudIncomeLimits: HudIncomeLimits, 
    complianceOption: string,
    leaseRent: number,
    bedroomCount: number | null,
    lihtcRentData: Record<string, unknown> | null,
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
    const maxRents = lihtcRentData.lihtcMaxRents as Record<string, Record<string, number>>;
    const maxRent50 = (maxRents['50percent']?.[`${bedroomCount}br`] || 0) - utilityAllowance;
    const maxRent60 = (maxRents['60percent']?.[`${bedroomCount}br`] || 0) - utilityAllowance;
    const maxRent80 = (maxRents['80percent']?.[`${bedroomCount}br`] || 0) - utilityAllowance;

    // DEBUG: Log the rent limits
    console.log('💰 Rent Limits:', {
      bedroomCount,
      utilityAllowance,
      leaseRent,
      maxRent50Raw: maxRents['50percent']?.[`${bedroomCount}br`],
      maxRent60Raw: maxRents['60percent']?.[`${bedroomCount}br`],
      maxRent80Raw: maxRents['80percent']?.[`${bedroomCount}br`],
      adjustedMaxRent50: maxRent50,
      adjustedMaxRent60: maxRent60,
      adjustedMaxRent80: maxRent80,
      availableKeys: Object.keys(maxRents || {}),
      availableBedroomKeys50: maxRents['50percent'] ? Object.keys(maxRents['50percent']) : 'None'
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
  }, [getActualBucket, includeRentAnalysis]);

  const getComplianceBucket = useCallback((
    unit: ProcessedUnit, 
    tenancy: FullTenancy | undefined, 
    hudIncomeLimits: HudIncomeLimits | null, 
    complianceOption: string,
    includeRentAnalysis: boolean,
    lihtcRentData: Record<string, unknown> | null,
    utilityAllowances: {[bedroomCount: number]: number}
  ): string => {
    if (!tenancy || !hudIncomeLimits) return unit.actualBucket;
    
    // Get original bucket (what they qualified for at move-in using 140% rule)
    let originalBucket = 'Market';
    const residents = tenancy.lease.residents;
    if (residents.length > 0) {
      // Calculate what their bucket would have been at that time using current HUD limits
      const totalIncomeAtTime = residents.reduce((acc: number, res: Resident) => acc + Number(res.annualizedIncome || 0), 0);
      const residentCountAtTime = residents.length;
      
      originalBucket = includeRentAnalysis ? 
        getActualBucketWithRentAnalysis(
          totalIncomeAtTime, 
          residentCountAtTime, 
          hudIncomeLimits, 
          complianceOption,
          Number(tenancy?.lease.leaseRent || 0),
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
  }, [getActualBucket, getActualBucketWithRentAnalysis]);

  // Process tenancies whenever dependencies change
  useEffect(() => {
    if (!selectedRentRollId || !hudIncomeLimits) {
      return;
    }

    const selectedRentRoll = property.rentRolls.find((rr: FullRentRoll) => rr.id === selectedRentRollId);
    if (!selectedRentRoll) {
      return;
    }

    // Process each unit
    const processed = property.units.map((unit: any) => {
      const tenancy = selectedRentRoll.tenancies.find((t: FullTenancy) => t.lease.unitId === unit.id);
      const residents = tenancy?.lease.residents || [];
      const residentCount = residents.length;
      const totalIncome = residents.reduce((acc: number, resident: any) => acc + Number(resident.annualizedIncome || 0), 0);

      const actualBucket = includeRentAnalysis ?
        getActualBucketWithRentAnalysis(
          totalIncome,
          residentCount,
          hudIncomeLimits,
          complianceOption,
          Number(tenancy?.lease.leaseRent || 0),
          unit.bedroomCount,
          lihtcRentData,
          includeUtilityAllowances ? utilityAllowances : {}
        ) :
        getActualBucket(totalIncome, residentCount, hudIncomeLimits, complianceOption);

      // Get verification status for this unit
      const unitVerification = verificationData?.units.find(v => v.unitId === unit.id);
      
      // Get provisional leases for this unit
      const unitProvisionalLeases = provisionalLeases.filter(lease => lease.unitId === unit.id);
      
      return {
        id: unit.id,
        unitNumber: unit.unitNumber,
        bedroomCount: unit.bedroomCount,
        squareFootage: unit.squareFootage,
        residentCount,
        totalIncome,
        actualBucket,
        complianceBucket: actualBucket, // Will be updated below
        verificationStatus: unitVerification?.verificationStatus,
        provisionalLeases: unitProvisionalLeases,
      };
    });

    // Apply 140% rule for compliance buckets
    const processedWithCompliance = processed.map((unit: ProcessedUnit) => {
      const tenancy = selectedRentRoll.tenancies.find((t: FullTenancy) => t.lease.unitId === unit.id);
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
  }, [selectedRentRollId, property.rentRolls, property.units, hudIncomeLimits, complianceOption, includeRentAnalysis, lihtcRentData, includeUtilityAllowances, utilityAllowances, verificationData, provisionalLeases, getActualBucket, getActualBucketWithRentAnalysis, getComplianceBucket]);

  // Handle provisional lease checkbox changes
  const handleProvisionalLeaseToggle = (leaseId: string) => {
    // Find the lease to check if verification is finalized
    const lease = provisionalLeases.find(l => l.id === leaseId);
    if (!lease?.isVerificationFinalized) {
      return; // Don't allow toggle if verification isn't finalized
    }

    setSelectedProvisionalLeases(prev => {
      const newSet = new Set(prev);
      if (newSet.has(leaseId)) {
        newSet.delete(leaseId);
      } else {
        newSet.add(leaseId);
      }
      return newSet;
    });
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
        units: prev.units.map((unit: Unit) => 
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
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'An unexpected error occurred');
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

    // Calculate verified income units by bucket (excluding vacants)
    const verifiedIncomeByBucket: { [key: string]: { verified: number; total: number; percentage: number } } = {};
    
    Object.keys(bucketCounts).forEach(bucket => {
      if (bucket === 'Vacant') return; // Skip vacant units
      
      const unitsInBucket = processedTenancies.filter(unit => unit.complianceBucket === bucket);
      const verifiedInBucket = unitsInBucket.filter(unit => unit.verificationStatus === 'Verified');
      
      verifiedIncomeByBucket[bucket] = {
        verified: verifiedInBucket.length,
        total: unitsInBucket.length,
        percentage: unitsInBucket.length > 0 ? (verifiedInBucket.length / unitsInBucket.length * 100) : 0
      };
    });

    return { 
      totalUnits, 
      targetCounts, 
      targets, 
      bucketCounts, 
      bucketCountsWithVacants, 
      verifiedIncomeByBucket 
    };
  };

  // Calculate projected compliance with selected provisional leases
  const calculateProjectedSummaryStats = () => {
    const totalUnits = processedTenancies.length;
    const targetCounts = getTargetCounts(complianceOption, totalUnits);
    const targets = getTargetPercentages(complianceOption, totalUnits);
    
    // Create projected tenancies by replacing compliance buckets for selected provisional leases
    const projectedTenancies = processedTenancies.map(unit => {
      // Check if this unit has a selected provisional lease
      const selectedProvisionalLease = unit.provisionalLeases?.find(lease => 
        selectedProvisionalLeases.has(lease.id) && lease.amiBucketInfo
      );
      
      if (selectedProvisionalLease && selectedProvisionalLease.amiBucketInfo) {
        // Replace the compliance bucket with the provisional lease's AMI bucket
        return {
          ...unit,
          complianceBucket: selectedProvisionalLease.amiBucketInfo.actualBucket
        };
      }
      
      return unit;
    });
    
    const bucketCounts = projectedTenancies.reduce((acc, unit) => {
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

    // Calculate verified income units by bucket (excluding vacants) - using projected data
    const verifiedIncomeByBucket: { [key: string]: { verified: number; total: number; percentage: number } } = {};
    
    Object.keys(bucketCounts).forEach(bucket => {
      if (bucket === 'Vacant') return; // Skip vacant units
      
      const unitsInBucket = projectedTenancies.filter(unit => unit.complianceBucket === bucket);
      const verifiedInBucket = unitsInBucket.filter(unit => unit.verificationStatus === 'Verified');
      
      verifiedIncomeByBucket[bucket] = {
        verified: verifiedInBucket.length,
        total: unitsInBucket.length,
        percentage: unitsInBucket.length > 0 ? (verifiedInBucket.length / unitsInBucket.length * 100) : 0
      };
    });

    return { 
      totalUnits, 
      targetCounts, 
      targets, 
      bucketCounts, 
      bucketCountsWithVacants, 
      verifiedIncomeByBucket 
    };
  };

  const stats = calculateSummaryStats();
  const projectedStats = calculateProjectedSummaryStats();
  const hasSelectedProvisionalLeases = selectedProvisionalLeases.size > 0;

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
      
      {/* Actions Panel */}
      <div className="mb-6 bg-gray-50 border border-gray-200 rounded-lg">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <span className="text-base font-bold text-gray-700">Actions:</span>
              <a
                href={`/property/${property.id}/update-compliance`}
                className="inline-flex items-center px-4 py-2 text-base font-bold text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue transition-colors"
              >
                📁 Update Compliance Data
              </a>
            </div>
            <div className="text-sm text-gray-500">
              Upload new resident & rent roll data to refresh analysis
            </div>
          </div>
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
                                                  <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Verified Income Units</th>
                                                </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {Object.entries(stats.targets).map(([bucket, target], index) => {
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
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                            {stats.verifiedIncomeByBucket[bucket] ? `${stats.verifiedIncomeByBucket[bucket].percentage.toFixed(1)}%` : '-'}
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
                                                  <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Verified Income Units</th>
                                                </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {Object.entries(stats.targets).map(([bucket, targetPercent], index) => {
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
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                            {stats.verifiedIncomeByBucket[bucket] ? stats.verifiedIncomeByBucket[bucket].verified : '-'}
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

      {/* Projected Compliance Summary */}
      {processedTenancies.length > 0 && hasSelectedProvisionalLeases && (
        <div className="mb-8 bg-white rounded-lg shadow-md overflow-hidden">
          <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4">
            <h2 className="text-lg font-semibold text-white">Projected Compliance (With Selected Future Leases)</h2>
            <p className="text-green-100 text-sm mt-1">
              Compliance analysis including {selectedProvisionalLeases.size} selected provisional lease{selectedProvisionalLeases.size === 1 ? '' : 's'}
            </p>
          </div>
          
          <div className="p-6">
            {/* Percentages Section */}
            <div className="mb-8">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Percentages</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full table-fixed">
                  <thead>
                    <tr className="bg-gradient-to-r from-green-600 to-green-700">
                      <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Bucket</th>
                      <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Target</th>
                      <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Projected</th>
                      <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Compliance</th>
                      <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Compliance With Vacants</th>
                      <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Over/(Under)</th>
                      <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Verified Income Units</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {Object.entries(projectedStats.targets).map(([bucket, target], index) => {
                      const projected = ((projectedStats.bucketCounts[bucket] || 0) / projectedStats.totalUnits * 100);
                      const compliance = projected; // Compliance column shows percentage of total units in this bucket
                      const withVacants = ((projectedStats.bucketCountsWithVacants[bucket] || 0) / projectedStats.totalUnits * 100);
                      const overUnder = projected - target;
                      const current = ((stats.bucketCounts[bucket] || 0) / stats.totalUnits * 100);
                      const change = projected - current;
                      
                      return (
                        <tr key={bucket}>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm font-medium text-gray-900">{bucket}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-500">{target.toFixed(1)}%</td>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                            <div className="flex flex-col items-center">
                              <span>{projected.toFixed(1)}%</span>
                              {change !== 0 && (
                                <span className={`text-xs font-medium ${
                                  change > 0 ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {change > 0 ? '+' : ''}{change.toFixed(1)}%
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-500">{compliance.toFixed(1)}%</td>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-500">{withVacants.toFixed(1)}%</td>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                            {overUnder >= 0 ? '+' : ''}{overUnder.toFixed(1)}%
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                            {projectedStats.verifiedIncomeByBucket[bucket] ? `${projectedStats.verifiedIncomeByBucket[bucket].percentage.toFixed(1)}%` : '-'}
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
                    <tr className="bg-gradient-to-r from-green-600 to-green-700">
                      <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Bucket</th>
                      <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Target</th>
                      <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Projected</th>
                      <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Compliance</th>
                      <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Compliance With Vacants</th>
                      <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Over/(Under)</th>
                      <th className="w-1/6 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Verified Income Units</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {Object.entries(projectedStats.targets).map(([bucket, targetPercent], index) => {
                      const targetUnits = projectedStats.targetCounts[bucket] || 0;
                      const projectedUnits = projectedStats.bucketCounts[bucket] || 0;
                      const complianceUnits = projectedUnits;
                      const withVacantsUnits = projectedStats.bucketCountsWithVacants[bucket] || 0;
                      const overUnderUnits = projectedUnits - targetUnits;
                      const currentUnits = stats.bucketCounts[bucket] || 0;
                      const changeUnits = projectedUnits - currentUnits;
                      
                      return (
                        <tr key={bucket}>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm font-medium text-gray-900">{bucket}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-500">{targetUnits}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                            <div className="flex flex-col items-center">
                              <span>{projectedUnits}</span>
                              {changeUnits !== 0 && (
                                <span className={`text-xs font-medium ${
                                  changeUnits > 0 ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {changeUnits > 0 ? '+' : ''}{changeUnits}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-500">{complianceUnits}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-500">{withVacantsUnits}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                            {overUnderUnits >= 0 ? '+' : ''}{overUnderUnits}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                            {projectedStats.verifiedIncomeByBucket[bucket] ? projectedStats.verifiedIncomeByBucket[bucket].verified : '-'}
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
                                              <th className="px-6 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Verification Status</th>
                                              <th className="px-6 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Future Leases</th>
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
                                         <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                       {verificationLoading ? (
                         <div className="flex items-center justify-center">
                           <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand-blue"></div>
                         </div>
                       ) : unit.verificationStatus ? (
                         unit.verificationStatus === 'Out of Date Income Documents' ? (
                           <Link
                             href={`/property/${property.id}/rent-roll/${selectedRentRollId}/unit/${unit.id}`}
                             className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200 hover:bg-red-200 cursor-pointer transition-colors`}
                           >
                             <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                               <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                             </svg>
                             {unit.verificationStatus}
                           </Link>
                         ) : (
                           <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                             unit.verificationStatus === 'Verified' ? 'bg-green-100 text-green-800 border border-green-200' :
                             unit.verificationStatus === 'Needs Investigation' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' :
                             unit.verificationStatus === 'Vacant' ? 'bg-gray-100 text-gray-600 border border-gray-200' :
                             'bg-gray-100 text-gray-800 border border-gray-200'
                           }`}>
                             {unit.verificationStatus === 'Verified' && (
                               <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                 <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                               </svg>
                             )}
                             {unit.verificationStatus === 'Needs Investigation' && (
                               <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                 <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                               </svg>
                             )}
                             {unit.verificationStatus}
                           </span>
                         )
                                               ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                     </td>
                     <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                       {unit.provisionalLeases && unit.provisionalLeases.length > 0 ? (
                         <div className="space-y-2">
                           {unit.provisionalLeases.map((lease) => (
                             <div key={lease.id} className="flex items-center justify-center space-x-2">
                               <input
                                 type="checkbox"
                                 id={`lease-${lease.id}`}
                                 checked={selectedProvisionalLeases.has(lease.id)}
                                 onChange={() => handleProvisionalLeaseToggle(lease.id)}
                                 disabled={!lease.isVerificationFinalized}
                                 className={`h-4 w-4 text-brand-blue focus:ring-brand-blue border-gray-300 rounded ${
                                   !lease.isVerificationFinalized ? 'opacity-50 cursor-not-allowed' : ''
                                 }`}
                               />
                               <label
                                 htmlFor={`lease-${lease.id}`}
                                 className={`text-sm cursor-pointer ${
                                   lease.isVerificationFinalized 
                                     ? 'text-gray-700' 
                                     : 'text-gray-400 cursor-not-allowed'
                                 }`}
                                 title={!lease.isVerificationFinalized ? 'Income verification must be finalized first' : ''}
                               >
                                 <div className="flex flex-col">
                                   <Link
                                     href={`/property/${property.id}/rent-roll/${selectedRentRollId}/unit/${unit.id}`}
                                     className="text-sm text-gray-900 hover:text-brand-blue cursor-pointer"
                                   >
                                     {lease.name}
                                   </Link>
                                   {lease.isVerificationFinalized && lease.amiBucketInfo ? (
                                     <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                       lease.amiBucketInfo.actualBucket === '50% AMI' ? 'bg-green-100 text-green-800' :
                                       lease.amiBucketInfo.actualBucket === '60% AMI' ? 'bg-blue-100 text-blue-800' :
                                       lease.amiBucketInfo.actualBucket === '80% AMI' ? 'bg-purple-100 text-purple-800' :
                                       'bg-gray-100 text-gray-800'
                                     }`}>
                                       {lease.amiBucketInfo.actualBucket}
                                     </span>
                                   ) : lease.isVerificationFinalized ? (
                                     <span className="text-xs text-gray-400 italic">
                                       Calculating...
                                     </span>
                                   ) : (
                                     <Link
                                       href={`/property/${property.id}/rent-roll/${selectedRentRollId}/unit/${unit.id}`}
                                       className="text-xs text-red-600 hover:text-red-800 cursor-pointer text-center"
                                     >
                                       <div>Income Verification</div>
                                       <div>Not Finalized</div>
                                     </Link>
                                   )}
                                 </div>
                               </label>
                             </div>
                           ))}
                         </div>
                       ) : (
                         <span className="text-gray-400 text-xs">-</span>
                       )}
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
          <div className="p-8 text-center">
            <p className="text-red-600 font-medium mb-4">No compliance data available. Please upload a rent roll to see the analysis.</p>
            <a
              href={`/property/${property.id}/update-compliance`}
              className="inline-flex items-center px-4 py-2 text-base font-bold text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue transition-colors"
            >
              📁 Update Compliance Data
            </a>
          </div>
          
          {/* Floor Plan Summary */}
          {property.units && property.units.length > 0 && (
            <div className="border-t border-gray-200 bg-blue-50">
              <div className="px-6 py-4">
                <h3 className="text-lg font-medium text-gray-900 mb-3">Floor Plan Summary</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {Object.entries(
                    property.units.reduce((acc: { [key: string]: number }, unit: Unit) => {
                      const sqft = unit.squareFootage || 0;
                      const key = sqft > 0 ? sqft.toString() : 'Unknown';
                      acc[key] = (acc[key] || 0) + 1;
                      return acc;
                    }, {})
                  )
                    .sort(([a], [b]) => {
                      if (a === 'Unknown') return 1;
                      if (b === 'Unknown') return -1;
                      return parseInt(a) - parseInt(b);
                    })
                    .map(([sqft, count]) => (
                      <div key={sqft} className="bg-white rounded-lg p-3 text-center shadow-sm border">
                        <div className="text-lg font-semibold text-gray-900">
                          {sqft === 'Unknown' ? 'Unknown' : `${parseInt(sqft).toLocaleString()}`}
                        </div>
                        <div className="text-xs text-gray-500 mb-1">
                          {sqft === 'Unknown' ? 'sq ft' : 'sq ft'}
                        </div>
                        <div className="text-sm font-medium text-blue-600">
                          {count} unit{count === 1 ? '' : 's'}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
          
          {/* Show unit data even without compliance data */}
          {property.units && property.units.length > 0 && (
            <div className="border-t border-gray-200">
              <div className="bg-gray-50 px-6 py-4">
                <h3 className="text-lg font-medium text-gray-900">Unit Information</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {property.units.length} units configured for this property
                </p>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Unit Number
                      </th>
                      <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Bedrooms
                      </th>
                      <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Square Footage
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {property.units
                      .sort((a: Unit, b: Unit) => {
                        // Sort by unit number (handle both numeric and alphanumeric)
                        const aNum = parseInt(a.unitNumber) || 0;
                        const bNum = parseInt(b.unitNumber) || 0;
                        if (aNum !== bNum) return aNum - bNum;
                        return a.unitNumber.localeCompare(b.unitNumber);
                      })
                      .map((unit: Unit) => (
                        <tr key={unit.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className="text-sm font-medium text-gray-900">
                              {formatUnitNumber(unit.unitNumber)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <EditableCell
                              value={unit.bedroomCount}
                              onSave={(value) => handleUpdateUnit(unit.id, 'bedroomCount', value)}
                              className="text-sm text-gray-900 text-center"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <EditableCell
                              value={unit.squareFootage ?? null}
                              onSave={(value) => handleUpdateUnit(unit.id, 'squareFootage', value)}
                              className="text-sm text-gray-900 text-center"
                            />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
                {[...new Set(property.units.map((unit: Unit) => unit.bedroomCount))]
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