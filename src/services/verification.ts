import { Unit, Lease, Resident, IncomeDocument, DocumentType, Tenancy } from '@prisma/client';
import { getYear, isWithinInterval, subMonths } from 'date-fns';

// Extended Resident type with new income fields
type ExtendedResident = Resident & {
  calculatedAnnualizedIncome?: number | null;
  incomeFinalized?: boolean;
  finalizedAt?: Date | null;
};

type FullUnit = Unit & {
  Lease: (Lease & {
    Resident: (ExtendedResident & {
      IncomeDocument: IncomeDocument[];
    })[];
    Tenancy: Tenancy | null;
    IncomeVerification?: any[];
  })[];
};

export type VerificationStatus = "Verified" | "Needs Investigation" | "Out of Date Income Documents" | "Vacant" | "In Progress - Finalize to Process" | "Waiting for Admin Review";

/**
 * Determines the income verification status for a single unit based on its lease, residents, and documents.
 * This function implements the business rules for income verification compliance.
 *
 * @param unit - The unit to analyze, with its leases, residents, and income documents included.
 * @param latestRentRollDate - The date of the most recent rent roll.
 * @returns The verification status of the unit.
 */
/**
 * Determines the verification status for a specific lease based on its residents and documents.
 */
export function getLeaseVerificationStatus(lease: any): VerificationStatus {
  const allResidents = lease.Resident || [];
  
  console.log(`[LEASE VERIFICATION DEBUG] Lease ${lease.id}:`, {
    leaseName: lease.name,
    totalResidents: allResidents.length,
    isFutureLease: !lease.Tenancy
  });

  if (allResidents.length === 0) {
    console.log(`[LEASE VERIFICATION DEBUG] Lease ${lease.id}: No residents - returning Vacant`);
    return "Vacant";
  }

  const finalizedResidents = allResidents.filter((r: any) => r.incomeFinalized);
  
  console.log(`[LEASE VERIFICATION DEBUG] Lease ${lease.id}: ${finalizedResidents.length}/${allResidents.length} residents finalized`);

  // If all residents are finalized, return Verified
  if (finalizedResidents.length === allResidents.length) {
    console.log(`[LEASE VERIFICATION DEBUG] Lease ${lease.id}: All residents finalized - returning Verified`);
    return "Verified";
  }

  // Check if any documents are waiting for admin review
  const hasDocumentsNeedingReview = allResidents.some((resident: any) => 
    (resident.IncomeDocument || []).some((doc: any) => doc.status === 'NEEDS_REVIEW')
  );
  
  if (hasDocumentsNeedingReview) {
    console.log(`[LEASE VERIFICATION DEBUG] Lease ${lease.id}: Documents need review - returning Waiting for Admin Review`);
    return "Waiting for Admin Review";
  }

  // Some residents not finalized
  console.log(`[LEASE VERIFICATION DEBUG] Lease ${lease.id}: Some residents not finalized - returning In Progress`);
  return "In Progress - Finalize to Process";
}

export function getUnitVerificationStatus(unit: FullUnit, latestRentRollDate: Date): VerificationStatus {
  // Find the lease associated with the most recent rent roll for this unit.
  // IMPORTANT: Exclude provisional leases (leases without tenancy) as per user requirements
  const lease = (unit.Lease || [])
    .filter((l: any) => l.Tenancy !== null) // Only include leases that are linked to a rent roll
    .sort((a: any, b: any) => new Date(b.Tenancy!.createdAt).getTime() - new Date(a.Tenancy!.createdAt).getTime())[0];
    
  console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber}:`, {
    totalLeases: (unit.Lease || []).length,
    leasesWithTenancy: (unit.Lease || []).filter((l: any) => l.Tenancy !== null).length,
    selectedLease: lease?.id,
    leaseStartDate: lease?.leaseStartDate
  });
    
  if (!lease) {
    console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber}: No lease found - returning Vacant`);
    return "Vacant";
  }

  if (!lease.leaseStartDate) {
    console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber}: No lease start date - returning Vacant`);
    return "Vacant"; // Changed from "Pending Lease Start" to "Vacant" to match user requirements
  }

  const leaseStartDate = new Date(lease.leaseStartDate!);
  const allResidents = (lease as any).Resident || [];
  const allDocuments = allResidents.flatMap((r: any) => (r as any).IncomeDocument || []);
  
  console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber}:`, {
    leaseStartDate: leaseStartDate.toISOString(),
    residentsCount: allResidents.length,
    totalDocuments: allDocuments.length
  });
  
  // Debug: Check what resident data we're receiving
  console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber} - Resident Details:`, 
    allResidents.map((r: any) => ({
      id: r.id,
      name: r.name,
      hasNoIncome: r.hasNoIncome,
      incomeFinalized: r.incomeFinalized,
      calculatedAnnualizedIncome: r.calculatedAnnualizedIncome
    }))
  );
  
  // Check if there's an active income verification in progress
  const activeVerifications = (lease as any).IncomeVerification || [];
  const latestVerification = activeVerifications
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  
  if (latestVerification && latestVerification.status === 'IN_PROGRESS') {
    // Check if any documents are waiting for admin review
    const hasDocumentsNeedingReview = allDocuments.some(doc => doc && doc.status === 'NEEDS_REVIEW');
    
    if (hasDocumentsNeedingReview) {
      console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber}: Found NEEDS_REVIEW documents - returning Waiting for Admin Review`);
      return "Waiting for Admin Review";
    } else {
      console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber}: IN_PROGRESS verification with no NEEDS_REVIEW docs - returning In Progress - Finalize to Process`);
      return "In Progress - Finalize to Process";
    }
  }
  
  // Check if income has been verified for all residents
  // This can happen through either:
  // 1. Residents with completed documents, OR
  // 2. Residents marked as "No Income" (hasNoIncome = true and incomeFinalized = true), OR
  // 3. Residents who have been finalized through the finalization process (incomeFinalized = true)
  
  const verifiedDocuments = allDocuments.filter(d => d && d.status === 'COMPLETED');
  const residentsWithNoIncomeFinalized = allResidents.filter(r => r.hasNoIncome && r.incomeFinalized);
  const residentsWithVerifiedDocuments = allResidents.filter(r => 
    verifiedDocuments.some(doc => doc.residentId === r.id)
  );
  const residentsWithFinalizedIncome = allResidents.filter(r => r.incomeFinalized && !r.hasNoIncome);
  
  const totalResidentsWithVerifiedIncome = new Set([
    ...residentsWithNoIncomeFinalized.map(r => r.id),
    ...residentsWithVerifiedDocuments.map(r => r.id),
    ...residentsWithFinalizedIncome.map(r => r.id)
  ]).size;

  console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber}:`, {
    verifiedDocuments: verifiedDocuments.length,
    residentsWithNoIncomeFinalized: residentsWithNoIncomeFinalized.length,
    residentsWithVerifiedDocuments: residentsWithVerifiedDocuments.length,
    residentsWithFinalizedIncome: residentsWithFinalizedIncome.length,
    totalResidentsWithVerifiedIncome,
    totalResidents: allResidents.length,
    documentStatuses: allDocuments.map(d => ({ id: d?.id, status: d?.status, type: d?.documentType }))
  });

  // If no residents have verified income (either through documents or "No Income"), return out of date
  if (totalResidentsWithVerifiedIncome === 0) {
    console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber}: No residents with verified income - returning Out of Date Income Documents`);
    return "Out of Date Income Documents";
  }
  
  // If not all residents have verified income, return out of date  
  if (totalResidentsWithVerifiedIncome < allResidents.length) {
    console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber}: Not all residents have verified income (${totalResidentsWithVerifiedIncome}/${allResidents.length}) - returning Out of Date Income Documents`);
    return "Out of Date Income Documents";
  }

  // NOTE: Timeliness and name validation now happens during document upload
  // Only COMPLETED documents should reach this point, having already passed validation
  console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber}: Skipping timeliness and name checks - these are now handled during upload`);

  // Check if total uploaded income matches total verified income
  const totalUploadedIncome = allResidents.reduce((acc, r) => acc + (Number(r.annualizedIncome) || 0), 0);
  
  // Calculate total verified income from resident-level calculated income
  // Include finalized residents with either:
  // 1. Valid calculatedAnnualizedIncome from documents, OR
  // 2. Zero income from "No Income" residents (hasNoIncome = true)
  const totalVerifiedIncome = allResidents.reduce((acc, r) => {
    const amount = r.incomeFinalized 
      ? (Number(r.calculatedAnnualizedIncome) || 0)
      : 0;
    console.log(`[VERIFICATION SERVICE] Resident ${r.id}:`, {
      incomeFinalized: r.incomeFinalized,
      hasNoIncome: r.hasNoIncome,
      calculatedAnnualizedIncome: r.calculatedAnnualizedIncome,
      annualizedIncome: r.annualizedIncome,
      amount: amount,
      runningTotal: acc + amount
    });
    return acc + amount;
  }, 0);

  // Skip income discrepancy check for future leases (no rent roll data)
  if (totalUploadedIncome === 0 && totalVerifiedIncome > 0) {
    console.log(`[VERIFICATION SERVICE] Unit ${unit.unitNumber}: Skipping income discrepancy check - future lease detected (no rent roll data)`);
    return "Verified";
  }

  const incomeDifference = Math.abs(totalUploadedIncome - totalVerifiedIncome);
  
  console.log(`[VERIFICATION SERVICE] FINAL COMPARISON:`, {
    totalUploadedIncome,
    totalVerifiedIncome,
    incomeDifference,
    result: incomeDifference > 1.00 ? "Needs Investigation" : "Verified"
  });

  return incomeDifference > 1.00 ? "Needs Investigation" : "Verified";
}

// Additional types for API responses
export interface UnitVerificationData {
  unitId: string;
  unitNumber: string;
  verificationStatus: VerificationStatus;
  totalUploadedIncome: number;
  totalVerifiedIncome: number;
  leaseStartDate: Date | null;
  documentCount: number;
  lastVerificationUpdate: Date | null;
}

export interface PropertyVerificationSummary {
  propertyId: string;
  units: UnitVerificationData[];
  summary: {
    verified: number;
    outOfDate: number;
    vacant: number;
    verificationInProgress: number;
    waitingForAdminReview: number;
  };
}

/**
 * Helper function to detect income discrepancies and create auto-override requests
 * Called during resident or verification finalization
 */
export async function checkAndCreateIncomeDiscrepancyOverride(params: {
  unitId: string;
  verificationId?: string;
  residentId?: string;
  totalUploadedIncome: number;
  totalVerifiedIncome: number;
  userId: string;
}) {
  const { unitId, verificationId, residentId, totalUploadedIncome, totalVerifiedIncome, userId } = params;
  
  // Skip discrepancy check if no rent roll income data (likely a future lease)
  if (totalUploadedIncome === 0) {
    console.log(`Skipping income discrepancy check - no rent roll income data (future lease or pre-rent-roll)`);
    return null;
  }
  
  // Check if there's an income discrepancy (same logic as verification status)
  const incomeDifference = Math.abs(totalUploadedIncome - totalVerifiedIncome);
  
  if (incomeDifference > 1.00) {
    // Before creating an override request, check if the user has already accepted the verified income
    // This happens when "Accept Verified Income" was used, which updates annualizedIncome to match verifiedIncome
    const { prisma } = await import('@/lib/prisma');
    
    // Get all residents for this unit to check if their incomes have been synchronized
    // Also include Tenancy to detect future leases
    const lease = await prisma.lease.findFirst({
      where: { unitId },
      include: {
        Resident: {
          select: {
            id: true,
            annualizedIncome: true,
            verifiedIncome: true,
            incomeFinalized: true
          }
        },
        Tenancy: true
      }
    });
    
    // Skip discrepancy check for future leases (no tenancy record)
    if (lease && !lease.Tenancy) {
      console.log(`Skipping income discrepancy check - future lease detected (no tenancy record)`);
      return null;
    }
    
    if (lease) {
      // Check if the user has already accepted verified income by seeing if annualized and verified incomes match
      const totalAnnualizedIncome = lease.Resident.reduce((sum, resident) => 
        sum + (Number(resident.annualizedIncome) || 0), 0);
      const totalVerifiedIncomeFromResidents = lease.Resident.reduce((sum, resident) => 
        sum + (Number(resident.verifiedIncome) || 0), 0);
      
      const incomesSynchronized = Math.abs(totalAnnualizedIncome - totalVerifiedIncomeFromResidents) <= 1.00;
      
      if (incomesSynchronized) {
        console.log(`Skipping income discrepancy override - user has already accepted verified income (${totalAnnualizedIncome} ≈ ${totalVerifiedIncomeFromResidents})`);
        return null;
      }
    }
    // Import the override service
    const { createAutoOverrideRequest } = await import('@/services/override');
    
    const systemExplanation = `Income discrepancy detected: Rent roll shows $${totalUploadedIncome.toLocaleString()} but verified documents total $${totalVerifiedIncome.toLocaleString()} (difference: $${incomeDifference.toFixed(2)})`;
    
    console.log(`Creating auto-override request for income discrepancy: ${systemExplanation}`);
    
    try {
      const overrideRequest = await createAutoOverrideRequest({
        type: 'INCOME_DISCREPANCY',
        unitId,
        verificationId,
        residentId,
        userId,
        systemExplanation
      });
      
      console.log(`Auto-override request created for income discrepancy: ${overrideRequest.id}`);
      return overrideRequest;
    } catch (error) {
      console.error('Failed to create auto-override request for income discrepancy:', error);
      throw error;
    }
  }
  
  return null;
} 