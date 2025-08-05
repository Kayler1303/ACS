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
  futureLease?: {
    id: string;
    leaseName: string;
    verificationStatus: string;
    totalIncome: number;
    complianceBucket: string;
    leaseStartDate: string;
    isToggled: boolean;
    residents: any[];
  };
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
    initialProperty.RentRoll[0]?.id || null
  );
  


  const [processedTenancies, setProcessedTenancies] = useState<ProcessedUnit[]>([]);
  const [hudIncomeLimits, setHudIncomeLimits] = useState<HudIncomeLimits | null>(null);
  const [lihtcRentData, setLihtcRentData] = useState<Record<string, unknown> | null>(null);
  const [complianceOption, setComplianceOption] = useState<string>(property.complianceOption || "20% at 50% AMI, 55% at 80% AMI");
  const [includeRentAnalysis, setIncludeRentAnalysis] = useState<boolean>(property.includeRentAnalysis || false);
  const [includeUtilityAllowances, setIncludeUtilityAllowances] = useState<boolean>(property.includeUtilityAllowances || false);
  const [showUtilityModal, setShowUtilityModal] = useState<boolean>(false);
  const [utilityAllowances, setUtilityAllowances] = useState<{[bedroomCount: number]: number}>(property.utilityAllowances as {[bedroomCount: number]: number} || {});
  const [isRequestingDeletion, setIsRequestingDeletion] = useState(false);
  const [showDeletionModal, setShowDeletionModal] = useState(false);
  const [deletionReason, setDeletionReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verificationData, setVerificationData] = useState<PropertyVerificationSummary | null>(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [provisionalLeases, setProvisionalLeases] = useState<ProvisionalLease[]>([]);
  const [selectedProvisionalLeases, setSelectedProvisionalLeases] = useState<Set<string>>(new Set());
  const [futureLeases, setFutureLeases] = useState<any[]>([]);
  const [selectedFutureLeases, setSelectedFutureLeases] = useState<Set<string>>(new Set());
  const [utilityCategory, setUtilityCategory] = useState<string>('');
  const [utilityAllowance, setUtilityAllowance] = useState<number>(0);

  // Function to save property settings to database
  const savePropertySettings = async (settings: {
    complianceOption?: string;
    includeRentAnalysis?: boolean;
    includeUtilityAllowances?: boolean;
    utilityAllowances?: {[bedroomCount: number]: number};
  }) => {
    try {
      const response = await fetch(`/api/properties/${property.id}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          complianceOption: settings.complianceOption ?? complianceOption,
          includeRentAnalysis: settings.includeRentAnalysis ?? includeRentAnalysis,
          includeUtilityAllowances: settings.includeUtilityAllowances ?? includeUtilityAllowances,
          utilityAllowances: settings.utilityAllowances ?? utilityAllowances,
        }),
      });

      if (!response.ok) {
        console.error('Failed to save property settings:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error saving property settings:', error);
    }
  };

  // Function to save future lease selections to localStorage
  const saveFutureLeaseSelections = (selections: Set<string>) => {
    try {
      localStorage.setItem(
        `futureLeaseSelections_${property.id}`,
        JSON.stringify(Array.from(selections))
      );
    } catch (error) {
      console.error('Error saving future lease selections to localStorage:', error);
    }
  };

  // Function to load future lease selections from localStorage
  const loadFutureLeaseSelections = (): Set<string> => {
    try {
      const saved = localStorage.getItem(`futureLeaseSelections_${property.id}`);
      if (saved) {
        const selections = JSON.parse(saved) as string[];
        return new Set(selections);
      }
    } catch (error) {
      console.error('Error loading future lease selections from localStorage:', error);
    }
    return new Set();
  };
  const [utilitySelection, setUtilitySelection] = useState<string>('NO');
  const [uploadingCompliance, setUploadingCompliance] = useState(false);
  const [verificationStatuses, setVerificationStatuses] = useState<VerificationStatus[]>([]);
  const [checkedProvisionalLeases, setCheckedProvisionalLeases] = useState<{ [unitId: string]: boolean }>({});
  const [projectedData, setProjectedData] = useState<any>(null);
  const [loadingProjected, setLoadingProjected] = useState(false);


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
            
            // 🎯 LOG 60% AMI RENT LIMITS FOR USER
            if (data.lihtcMaxRents && data.lihtcMaxRents['60percent']) {
              console.log('🏠 === 60% AMI RENT LIMITS ===');
              console.log('📍 1BR units:', data.lihtcMaxRents['60percent']['1br'] || 'N/A');
              console.log('📍 2BR units:', data.lihtcMaxRents['60percent']['2br'] || 'N/A');
              console.log('📍 3BR units:', data.lihtcMaxRents['60percent']['3br'] || 'N/A');
              console.log('📍 4BR units:', data.lihtcMaxRents['60percent']['4br'] || 'N/A');
              console.log('🏠 ===========================');
            }
            
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
      
      // Don't fetch verification data if we're on a unit detail page or other nested pages
      // This prevents expensive property-wide API calls when viewing individual units
      const isUnitDetailPage = window.location.pathname.includes('/unit/');
      const isUploadPage = window.location.pathname.includes('/upload-units');
      const isReconciliationPage = window.location.pathname.includes('/reconciliation');
      const isUpdateCompliancePage = window.location.pathname.includes('/update-compliance');
      
      if (isUnitDetailPage || isUploadPage || isReconciliationPage || isUpdateCompliancePage) {
        console.log('[PropertyPageClient] Skipping verification-status API call - on nested page');
        return;
      }
      
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

  // Fetch provisional leases data (for projected compliance)
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

  // Fetch future leases data (for Future Leases column)
  useEffect(() => {
    const fetchFutureLeases = async () => {
      try {
        const res = await fetch(`/api/properties/${property.id}/future-leases`, {
          credentials: 'include'
        });
        if (res.ok) {
          const data = await res.json();
          setFutureLeases(data.units);
        } else {
          console.error('Failed to fetch future leases:', res.status, res.statusText);
        }
      } catch (error) {
        console.error('Error fetching future leases:', error);
      }
    };

    fetchFutureLeases();
  }, [property.id]);

  // Load future lease selections from localStorage on mount
  useEffect(() => {
    const savedSelections = loadFutureLeaseSelections();
    setSelectedFutureLeases(savedSelections);
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

    // Check rent compliance for the specific income bucket they qualify for
    console.log(`🔍 Checking rent compliance for ${incomeBucket} with compliance option: ${complianceOption}`);
    console.log(`💰 Unit rent: $${leaseRent}, Max rents - 60%: $${maxRent60}, 80%: $${maxRent80}`);
    
    if (incomeBucket === '50% AMI' && leaseRent <= maxRent50) {
      console.log('✅ Qualifies for 50% AMI (income + rent compliant)');
      return '50% AMI';
    }
    if (incomeBucket === '50% AMI' && leaseRent > maxRent50) {
      console.log('❌ 50% AMI income but rent too high for 50% AMI limits', { leaseRent, maxRent50, difference: leaseRent - maxRent50 });
      // Check if this unit can qualify for 80% AMI by rent
      if (leaseRent <= maxRent80) {
        console.log('✅ 50% AMI income unit qualifies for 80% AMI by rent', { leaseRent, maxRent80 });
        return '80% AMI';
      } else {
        console.log('❌ 50% AMI income unit rent too high even for 80% AMI', { leaseRent, maxRent80, difference: leaseRent - maxRent80 });
      }
    }
    if (incomeBucket === '60% AMI' && leaseRent <= maxRent60) {
      console.log('✅ Qualifies for 60% AMI (income + rent compliant)', { leaseRent, maxRent60 });
      return '60% AMI';
    }
    if (incomeBucket === '60% AMI' && leaseRent > maxRent60) {
      console.log('❌ 60% AMI income but rent too high for 60% AMI limits', { leaseRent, maxRent60, difference: leaseRent - maxRent60 });
      // Check if this unit can qualify for 80% AMI by rent
      if (leaseRent <= maxRent80) {
        console.log('✅ 60% AMI income unit qualifies for 80% AMI by rent', { leaseRent, maxRent80 });
        return '80% AMI';
      } else {
        console.log('❌ 60% AMI income unit rent too high even for 80% AMI', { leaseRent, maxRent80, difference: leaseRent - maxRent80 });
      }
    }
    if (incomeBucket === '80% AMI' && leaseRent <= maxRent80) {
      console.log('✅ Qualifies for 80% AMI (income + rent compliant)', { leaseRent, maxRent80 });
      return '80% AMI';
    }
    if (incomeBucket === '80% AMI' && leaseRent > maxRent80) {
      console.log('❌ 80% AMI income but rent too high for 80% AMI limits', { leaseRent, maxRent80, difference: leaseRent - maxRent80 });
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
    const residents = tenancy.Lease.Resident;
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
          Number(tenancy?.Lease.leaseRent || 0),
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

    const selectedRentRoll = property.RentRoll.find((rr: FullRentRoll) => rr.id === selectedRentRollId);
    if (!selectedRentRoll) {
      return;
    }

    // Process each unit
    const processed = property.Unit.map((unit: any) => {
      const tenancy = selectedRentRoll.Tenancy.find((t: FullTenancy) => t.Lease?.unitId === unit.id);
      const residents = tenancy?.Lease?.Resident || [];
      const residentCount = residents.length;
      const totalIncome = residents.reduce((acc: number, resident: any) => acc + Number(resident.annualizedIncome || 0), 0);

      const actualBucket = includeRentAnalysis ?
        getActualBucketWithRentAnalysis(
          totalIncome,
          residentCount,
          hudIncomeLimits,
          complianceOption,
          Number(tenancy?.Lease.leaseRent || 0),
          unit.bedroomCount,
          lihtcRentData,
          includeUtilityAllowances ? utilityAllowances : {}
        ) :
        getActualBucket(totalIncome, residentCount, hudIncomeLimits, complianceOption);

      // Get verification status for this unit
      const unitVerification = verificationData?.units.find(v => v.unitId === unit.id);
      
      // Get provisional leases for this unit (for projected compliance)
      const unitProvisionalLeases = provisionalLeases.filter(lease => lease.unitId === unit.id);
      
      // Get future lease for this unit (for Future Leases column)
      const unitFutureLease = futureLeases.find(fl => fl.unitId === unit.id);

      
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
        futureLease: unitFutureLease?.futureLease,
      };
    });

    // Apply 140% rule for compliance buckets
    const processedWithCompliance = processed.map((unit: ProcessedUnit) => {
      const tenancy = selectedRentRoll.Tenancy.find((t: FullTenancy) => t.Lease.unitId === unit.id);
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
  }, [selectedRentRollId, property.RentRoll, property.Unit, hudIncomeLimits, complianceOption, includeRentAnalysis, lihtcRentData, includeUtilityAllowances, utilityAllowances, verificationData, provisionalLeases, getActualBucket, getActualBucketWithRentAnalysis, getComplianceBucket]);

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

  // Handle future lease checkbox changes
  const handleFutureLeaseToggle = (leaseId: string) => {
    setSelectedFutureLeases(prev => {
      const newSet = new Set(prev);
      if (newSet.has(leaseId)) {
        newSet.delete(leaseId);
      } else {
        newSet.add(leaseId);
      }
      // Save to localStorage
      saveFutureLeaseSelections(newSet);
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
        Unit: prev.Unit.map((unit: Unit) => 
          unit.id === unitId 
            ? { ...unit, [field]: field === 'unitNumber' ? value : Number(value) }
            : unit
        )
      }));
    } catch (error) {
      console.error('Error updating unit:', error);
    }
  };



  const handleRequestDeletion = () => {
    setShowDeletionModal(true);
  };

  const handleSubmitDeletionRequest = async () => {
    if (!deletionReason.trim()) {
      alert('Please provide a reason for requesting property deletion.');
      return;
    }

    setIsRequestingDeletion(true);
    try {
      const res = await fetch(`/api/properties/${property.id}/request-deletion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: deletionReason }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit deletion request');
      }

      alert(data.message);
      setShowDeletionModal(false);
      setDeletionReason('');
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'An unexpected error occurred');
    } finally {
      setIsRequestingDeletion(false);
    }
  };

  const handleCloseDeletionModal = () => {
    setShowDeletionModal(false);
    setDeletionReason('');
    setIsRequestingDeletion(false);
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
        const units80_2 = Math.ceil(totalUnits * 0.35); // Round UP for 80% AMI (minimum 35%)
        const marketUnits2 = totalUnits - units60 - units80_2; // Remaining units for Market
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

    // NEW: Cascade excess units from lower buckets to higher buckets
    // This ensures units over target in lower buckets count toward higher bucket targets
    // Get buckets that actually have targets for this compliance standard
    const targetBuckets = Object.keys(targetCounts).filter(bucket => targetCounts[bucket] > 0);
    const bucketPriority = ['50% AMI', '60% AMI', '80% AMI', 'Market'];
    const sortedTargetBuckets = targetBuckets.sort((a, b) => {
      const aIndex = bucketPriority.indexOf(a);
      const bIndex = bucketPriority.indexOf(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
    
    // CASCADING FOR COMPLIANCE ADJUSTMENT: 
    // For "Adjust compliance with vacants" column, excess units in lower buckets 
    // should count toward higher bucket targets for compliance calculation purposes
    // EXCLUDE Market from cascading - units should never cascade TO Market
    const amiTargetBuckets = sortedTargetBuckets.filter(bucket => bucket !== 'Market' && bucket !== 'Vacant' && bucket !== 'No Income Information');
    for (let i = 0; i < amiTargetBuckets.length - 1; i++) {
      const currentBucket = amiTargetBuckets[i];
      const nextBucket = amiTargetBuckets[i + 1];
      
      const targetCount = targetCounts[currentBucket] || 0;
      const currentCount = bucketCountsWithVacants[currentBucket] || 0;
      
      if (currentCount > targetCount && targetCount > 0) {
        // Move excess units to next bucket for compliance calculation
        const excess = currentCount - targetCount;
        bucketCountsWithVacants[currentBucket] = targetCount;
        bucketCountsWithVacants[nextBucket] = (bucketCountsWithVacants[nextBucket] || 0) + excess;
        console.log(`📊 Compliance adjustment: Moving ${excess} excess units from ${currentBucket} to ${nextBucket}`);
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

    // 🎯 SUMMARY BREAKDOWN FOR USER DEBUG
    if (includeRentAnalysis && selectedRentRollId) {
      const currentRentRoll = property.RentRoll.find((rr: FullRentRoll) => rr.id === selectedRentRollId);
      
      if (currentRentRoll) {
        const activeLeasesArray = processedTenancies.filter(unit => unit.actualBucket !== 'Vacant');
        
        const incomeOnly60 = activeLeasesArray.filter(unit => {
          const tenancy = currentRentRoll.Tenancy.find((t: FullTenancy) => t.Lease.unitId === unit.id);
          const residents = tenancy?.Lease?.Resident || [];
          const totalIncome = residents.reduce((acc: number, res: Resident) => acc + Number(res.annualizedIncome || 0), 0);
          return hudIncomeLimits && getActualBucket(totalIncome, residents.length, hudIncomeLimits, complianceOption) === '60% AMI';
        }).length;
        
        const rentOnly60 = activeLeasesArray.filter(unit => {
          const maxRent60 = (lihtcRentData?.lihtcMaxRents as any)?.['60percent']?.[`${unit.bedroomCount}br`] || 0;
          const tenancy = currentRentRoll.Tenancy.find((t: FullTenancy) => t.Lease.unitId === unit.id);
          const leaseRent = Number(tenancy?.Lease.leaseRent || 0);
          const utilityAllowance = includeUtilityAllowances ? (utilityAllowances[unit.bedroomCount] || 0) : 0;
          const adjustedMaxRent = maxRent60 + utilityAllowance;
          return leaseRent <= adjustedMaxRent;
        }).length;
        
        const both60 = bucketCounts['60% AMI'] || 0;
        
        console.log('📊 === 60% AMI BREAKDOWN ===');
        console.log(`📈 Units qualifying by INCOME only for 60% AMI: ${incomeOnly60}`);
        console.log(`🏠 Units qualifying by RENT only for 60% AMI: ${rentOnly60}`);
        console.log(`✅ Units qualifying by BOTH income AND rent: ${both60}`);
        console.log(`❌ Income-qualified but rent too high: ${incomeOnly60 - both60}`);
        console.log(`❌ Rent-qualified but income too high: ${rentOnly60 - both60}`);
        console.log('📊 ============================');
      }
    }

    return { 
      totalUnits, 
      targetCounts, 
      targets, 
      bucketCounts, 
      bucketCountsWithVacants, 
      verifiedIncomeByBucket 
    };
  };

  // Calculate projected compliance with selected provisional and future leases
  const calculateProjectedSummaryStats = () => {
    const totalUnits = processedTenancies.length;
    const targetCounts = getTargetCounts(complianceOption, totalUnits);
    const targets = getTargetPercentages(complianceOption, totalUnits);
    
    // Create projected tenancies by replacing compliance buckets for selected provisional or future leases
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
      
      // Check if this unit has a selected future lease
      if (unit.futureLease && selectedFutureLeases.has(unit.futureLease.id)) {
        // Replace the compliance bucket with the future lease's compliance bucket
        return {
          ...unit,
          complianceBucket: unit.futureLease.complianceBucket
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

    // NEW: Cascade excess units from lower buckets to higher buckets
    // This ensures units over target in lower buckets count toward higher bucket targets
    // Get buckets that actually have targets for this compliance standard
    const targetBuckets = Object.keys(targetCounts).filter(bucket => targetCounts[bucket] > 0);
    const bucketPriority = ['50% AMI', '60% AMI', '80% AMI', 'Market'];
    const sortedTargetBuckets = targetBuckets.sort((a, b) => {
      const aIndex = bucketPriority.indexOf(a);
      const bIndex = bucketPriority.indexOf(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
    
    // CASCADING FOR PROJECTED COMPLIANCE ADJUSTMENT: 
    // For projected "Adjust compliance with vacants" column, excess units in lower buckets 
    // should count toward higher bucket targets for compliance calculation purposes
    // EXCLUDE Market from cascading - units should never cascade TO Market
    const amiTargetBuckets = sortedTargetBuckets.filter(bucket => bucket !== 'Market' && bucket !== 'Vacant' && bucket !== 'No Income Information');
    for (let i = 0; i < amiTargetBuckets.length - 1; i++) {
      const currentBucket = amiTargetBuckets[i];
      const nextBucket = amiTargetBuckets[i + 1];
      
      const targetCount = targetCounts[currentBucket] || 0;
      const currentCount = bucketCountsWithVacants[currentBucket] || 0;
      
      if (currentCount > targetCount && targetCount > 0) {
        // Move excess units to next bucket for compliance calculation
        const excess = currentCount - targetCount;
        bucketCountsWithVacants[currentBucket] = targetCount;
        bucketCountsWithVacants[nextBucket] = (bucketCountsWithVacants[nextBucket] || 0) + excess;
        console.log(`📊 Projected compliance adjustment: Moving ${excess} excess units from ${currentBucket} to ${nextBucket}`);
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
    const hasSelectedFutureLeases = selectedFutureLeases.size > 0;
    const hasAnySelectedLeases = hasSelectedProvisionalLeases || hasSelectedFutureLeases;

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
                    onChange={(e) => {
                      const newValue = e.target.value;
                      setComplianceOption(newValue);
                      savePropertySettings({ complianceOption: newValue });
                    }}
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
                    {property.RentRoll.map((rentRoll: FullRentRoll) => (
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
                    onChange={(e) => {
                      const newValue = e.target.checked;
                      setIncludeRentAnalysis(newValue);
                      savePropertySettings({ includeRentAnalysis: newValue });
                    }}
                    className="h-4 w-4 text-brand-blue focus:ring-brand-blue border-gray-300 rounded"
                  />
                  <label htmlFor="include-rent-analysis" className="text-sm font-medium text-gray-700">
                    Include Rent Analysis
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
                        const newValue = e.target.checked;
                        setIncludeUtilityAllowances(newValue);
                        savePropertySettings({ includeUtilityAllowances: newValue });
                        if (newValue) {
                          setShowUtilityModal(true);
                        }
                      }
                    }}
                    disabled={!includeRentAnalysis}
                    className="h-4 w-4 text-brand-blue focus:ring-brand-blue border-gray-300 rounded disabled:opacity-50"
                                              />
                  <label htmlFor="include-utility-allowances" className={`text-sm font-medium ${includeRentAnalysis ? 'text-gray-700' : 'text-gray-400'}`}>
                                                Non-Discretionary Utilities and Charges
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
                  Subtract non-discretionary utilities and charges from max rents (requires rent analysis)
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Verification Status Summary */}
      {processedTenancies.length > 0 && (
        <div className="mb-6 bg-white rounded-lg shadow-md overflow-hidden">
          <div className="bg-gradient-to-r from-brand-blue to-brand-accent px-6 py-4">
            <h2 className="text-lg font-semibold text-white">Verification Status Summary</h2>
          </div>
          
          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed">
                <thead>
                  <tr className="bg-gradient-to-r from-brand-blue to-brand-accent">
                    <th className="w-1/4 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Status</th>
                    <th className="w-1/4 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Count</th>
                    <th className="w-1/4 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Percentage</th>
                    <th className="w-1/4 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Description</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {(() => {
                    const verificationCounts = {
                      'Verified': 0,
                      'In Progress - Finalize to Process': 0,
                      'Out of Date Income Documents': 0,
                      'Waiting for Admin Review': 0,
                      'Vacant': 0,
                      'Other': 0
                    };

                    processedTenancies.forEach(unit => {
                      const status = unit.verificationStatus || 'Other';
                      if (verificationCounts.hasOwnProperty(status)) {
                        verificationCounts[status as keyof typeof verificationCounts]++;
                      } else {
                        verificationCounts['Other']++;
                      }
                    });

                    const totalUnits = processedTenancies.length;
                    const statusOrder = [
                      'Verified',
                      'In Progress - Finalize to Process', 
                      'Out of Date Income Documents',
                      'Waiting for Admin Review',
                      'Vacant'
                    ];

                    return statusOrder.map((status, index) => {
                      const count = verificationCounts[status as keyof typeof verificationCounts];
                      const percentage = totalUnits > 0 ? (count / totalUnits * 100).toFixed(1) : '0.0';
                      
                      const descriptions = {
                        'Verified': 'Units with verified income documentation',
                        'In Progress - Finalize to Process': 'Units pending admin review/finalization',
                        'Out of Date Income Documents': 'Units requiring updated documentation',
                        'Waiting for Admin Review': 'Units waiting for admin to review documents',
                        'Vacant': 'Currently vacant units'
                      };

                      const statusColors = {
                        'Verified': 'bg-green-50 text-green-700',
                        'In Progress - Finalize to Process': 'bg-blue-50 text-blue-700',
                        'Out of Date Income Documents': 'bg-red-50 text-red-700',
                        'Waiting for Admin Review': 'bg-orange-50 text-orange-700',
                        'Vacant': 'bg-gray-50 text-gray-700'
                      };

                      return (
                        <tr key={status} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className={`px-4 py-3 text-sm font-medium text-center ${statusColors[status as keyof typeof statusColors] || 'text-gray-700'}`}>
                            {status}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-center font-medium">
                            {count}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-center font-medium">
                            {percentage}%
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 text-center">
                            {descriptions[status as keyof typeof descriptions]}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

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
                      <th className="w-1/5 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Bucket</th>
                      <th className="w-1/5 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Target</th>
                      <th className="w-1/5 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Occupied</th>
                      <th className="w-1/5 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Compliance</th>
                      <th className="w-1/5 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Over/(Under)</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {Object.entries(stats.targets).map(([bucket, target], index) => {
                      const actual = ((stats.bucketCounts[bucket] || 0) / stats.totalUnits * 100);
                      const compliance = actual; // Compliance column shows percentage of total units in this bucket
                      const withVacants = ((stats.bucketCountsWithVacants[bucket] || 0) / stats.totalUnits * 100);
                                                  const overUnder = withVacants - target;
                      
                      return (
                        <tr key={bucket}>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm font-medium text-gray-900">{bucket}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-500">{target.toFixed(1)}%</td>
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
                      <th className="w-1/5 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Bucket</th>
                      <th className="w-1/5 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Target</th>
                      <th className="w-1/5 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Occupied</th>
                      <th className="w-1/5 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Compliance</th>
                      <th className="w-1/5 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Over/(Under)</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {Object.entries(stats.targets).map(([bucket, targetPercent], index) => {
                      const targetUnits = stats.targetCounts[bucket] || 0;
                      const actualUnits = stats.bucketCounts[bucket] || 0;
                      const complianceUnits = actualUnits;
                      const withVacantsUnits = stats.bucketCountsWithVacants[bucket] || 0;
                      const overUnderUnits = withVacantsUnits - targetUnits;
                      
                      return (
                        <tr key={bucket}>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm font-medium text-gray-900">{bucket}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-500">{targetUnits}</td>
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

      {/* Projected Compliance Summary */}
      {processedTenancies.length > 0 && hasAnySelectedLeases && (
        <div className="mb-8 bg-white rounded-lg shadow-md overflow-hidden">
          <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4">
            <h2 className="text-lg font-semibold text-white">Projected Compliance (With Selected Future Leases)</h2>
            <p className="text-green-100 text-sm mt-1">
              Compliance analysis including {selectedProvisionalLeases.size + selectedFutureLeases.size} selected lease{(selectedProvisionalLeases.size + selectedFutureLeases.size) === 1 ? '' : 's'}
              {selectedProvisionalLeases.size > 0 && selectedFutureLeases.size > 0 && ` (${selectedProvisionalLeases.size} provisional, ${selectedFutureLeases.size} future)`}
              {selectedProvisionalLeases.size > 0 && selectedFutureLeases.size === 0 && ` (provisional)`}
              {selectedProvisionalLeases.size === 0 && selectedFutureLeases.size > 0 && ` (future)`}
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
                      <th className="w-1/5 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Bucket</th>
                      <th className="w-1/5 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Target</th>
                      <th className="w-1/5 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Projected Occupied</th>
                      <th className="w-1/5 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Projected Compliance</th>
                      <th className="w-1/5 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Over/(Under)</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {Object.entries(projectedStats.targets).map(([bucket, target], index) => {
                      const projected = ((projectedStats.bucketCounts[bucket] || 0) / projectedStats.totalUnits * 100);
                      const withVacants = ((projectedStats.bucketCountsWithVacants[bucket] || 0) / projectedStats.totalUnits * 100);
                      const overUnder = withVacants - target;
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
                    <tr className="bg-gradient-to-r from-green-600 to-green-700">
                      <th className="w-1/5 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Bucket</th>
                      <th className="w-1/5 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Target</th>
                      <th className="w-1/5 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Projected Occupied</th>
                      <th className="w-1/5 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Projected Compliance</th>
                      <th className="w-1/5 px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">Over/(Under)</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {Object.entries(projectedStats.targets).map(([bucket, targetPercent], index) => {
                      const targetUnits = projectedStats.targetCounts[bucket] || 0;
                      const projectedUnits = projectedStats.bucketCounts[bucket] || 0;
                      const withVacantsUnits = projectedStats.bucketCountsWithVacants[bucket] || 0;
                      const overUnderUnits = withVacantsUnits - targetUnits;
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
                         ) : unit.verificationStatus === 'In Progress - Finalize to Process' ? (
                           <Link
                             href={`/property/${property.id}/rent-roll/${selectedRentRollId}/unit/${unit.id}`}
                             className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200 hover:bg-blue-200 cursor-pointer transition-colors`}
                           >
                             <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                               <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                             </svg>
                             {unit.verificationStatus}
                           </Link>
                         ) : (
                           <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                             unit.verificationStatus === 'Verified' ? 'bg-green-100 text-green-800 border border-green-200' :
                             (unit.verificationStatus as string) === 'In Progress - Finalize to Process' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                             unit.verificationStatus === 'Waiting for Admin Review' ? 'bg-orange-100 text-orange-800 border border-orange-200' :
                             unit.verificationStatus === 'Vacant' ? 'bg-gray-100 text-gray-600 border border-gray-200' :
                             'bg-gray-100 text-gray-800 border border-gray-200'
                           }`}>
                             {unit.verificationStatus === 'Verified' && (
                               <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                 <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                               </svg>
                             )}

                             {(unit.verificationStatus as string) === 'In Progress - Finalize to Process' && (
                               <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                 <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                               </svg>
                             )}
                             {unit.verificationStatus === 'Waiting for Admin Review' && (
                               <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                 <path fillRule="evenodd" d="M9 12a1 1 0 01-1-1V7a1 1 0 112 0v4a1 1 0 01-1 1zM18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8 4a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
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
                       {unit.futureLease ? (
                         <div className="flex flex-col items-center space-y-1">
                           <Link
                             href={`/property/${property.id}/rent-roll/${selectedRentRollId}/unit/${unit.id}`}
                             className="text-sm text-gray-900 font-medium text-brand-blue hover:text-brand-accent underline cursor-pointer"
                           >
                             {unit.futureLease.leaseName}
                           </Link>
                           <div className="flex items-center space-x-1">
                             <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                               unit.futureLease.verificationStatus === 'Verified' ? 'bg-green-100 text-green-800' :
                               unit.futureLease.verificationStatus === 'In Progress' ? 'bg-yellow-100 text-yellow-800' :
                               'bg-gray-100 text-gray-800'
                             }`}>
                               {unit.futureLease.verificationStatus}
                             </span>
                             <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                               unit.futureLease.complianceBucket === '50% AMI' ? 'bg-green-100 text-green-800' :
                               unit.futureLease.complianceBucket === '60% AMI' ? 'bg-blue-100 text-blue-800' :
                               unit.futureLease.complianceBucket === '80% AMI' ? 'bg-purple-100 text-purple-800' :
                               'bg-gray-100 text-gray-800'
                             }`}>
                               {unit.futureLease.complianceBucket}
                             </span>
                           </div>
                           <input
                             type="checkbox"
                             checked={selectedFutureLeases.has(unit.futureLease?.id || '')}
                             onChange={() => unit.futureLease && handleFutureLeaseToggle(unit.futureLease.id)}
                             disabled={unit.futureLease?.verificationStatus !== 'Verified'}
                             className={`h-4 w-4 text-brand-blue focus:ring-brand-blue border-gray-300 rounded ${
                               unit.futureLease.verificationStatus !== 'Verified' ? 'opacity-50 cursor-not-allowed' : ''
                             }`}
                           />
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
          {property.Unit && property.Unit.length > 0 && (
            <div className="border-t border-gray-200 bg-blue-50">
              <div className="px-6 py-4">
                <h3 className="text-lg font-medium text-gray-900 mb-3">Floor Plan Summary</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {Object.entries(
                    property.Unit.reduce((acc: { [key: string]: number }, unit: Unit) => {
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
          {property.Unit && property.Unit.length > 0 && (
            <div className="border-t border-gray-200">
              <div className="bg-gray-50 px-6 py-4">
                <h3 className="text-lg font-medium text-gray-900">Unit Information</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {property.Unit.length} units configured for this property
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
                    {property.Unit
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
                            <h3 className="text-sm font-medium text-red-800">Request Property Deletion</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>Submit a request to delete this property. An administrator will review your request before any action is taken.</p>
              </div>
              <div className="mt-4">
                <button
                  onClick={handleRequestDeletion}
                  disabled={isRequestingDeletion}
                  className="bg-red-600 border border-transparent rounded-md py-2 px-4 inline-flex justify-center text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                >
                  {isRequestingDeletion ? 'Submitting...' : 'Request Property Deletion'}
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
                Enter the monthly utility allowances for each bedroom count.
              </p>

              <div className="space-y-3">
                {[...new Set(property.Unit.map((unit: Unit) => unit.bedroomCount))]
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
                    // Save utility allowances to database
                    savePropertySettings({ utilityAllowances });
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

      {/* Deletion Confirmation Modal */}
      {showDeletionModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
                             <h3 className="text-lg font-medium text-gray-900 mb-4">Request Property Deletion</h3>
               <p className="text-sm text-gray-600 mb-4">
                 Please provide a reason for requesting property deletion. An administrator will review your request.
               </p>

              <textarea
                value={deletionReason}
                onChange={(e) => setDeletionReason(e.target.value)}
                placeholder="Enter your reason here..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-brand-blue focus:border-brand-blue"
                                 rows={4}
              ></textarea>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={handleCloseDeletionModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                                            >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitDeletionRequest}
                  disabled={isRequestingDeletion}
                  className="bg-red-600 border border-transparent rounded-md py-2 px-4 inline-flex justify-center text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                                                                        >
                  {isRequestingDeletion ? 'Submitting...' : 'Submit Deletion Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
} 