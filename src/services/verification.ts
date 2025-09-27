import { Unit, Lease, Resident, IncomeDocument, DocumentType, Tenancy, IncomeVerification } from '@prisma/client';
import { getYear, isWithinInterval, subMonths } from 'date-fns';

// Extended Resident type with new income fields
type ExtendedResident = Resident & {
  calculatedAnnualizedIncome?: number | null;
  incomeFinalized?: boolean;
  finalizedAt?: Date | null;
  IncomeDocument: IncomeDocument[];
};

type ExtendedLease = Lease & {
  Resident: ExtendedResident[];
  Tenancy: Tenancy | null;
  IncomeVerification?: IncomeVerification[];
};

type FullUnit = Unit & {
  Lease: ExtendedLease[];
};

export type VerificationStatus = "Verified" | "Needs Investigation" | "Out of Date Income Documents" | "Vacant" | "In Progress - Finalize to Process" | "Waiting for Admin Review" | "Needs Income Documentation";

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
export function getLeaseVerificationStatus(lease: ExtendedLease): VerificationStatus {
  const allResidents = lease.Resident || [];
  
  console.log(`[LEASE VERIFICATION DEBUG] Lease ${lease.id}:`, {
    leaseName: lease.name,
    totalResidents: allResidents.length,
    leaseType: (lease as any).leaseType,
    isFutureLease: (lease as any).leaseType === 'FUTURE'
  });

  // 1. If no residents -> "Vacant"
  if (allResidents.length === 0) {
    console.log(`[LEASE VERIFICATION DEBUG] Lease ${lease.id}: No residents - returning Vacant`);
    return "Vacant";
  }

  const finalizedResidents = allResidents.filter((r: ExtendedResident) => r.incomeFinalized || r.hasNoIncome);
  const allFinalized = finalizedResidents.length === allResidents.length;
  const noneFinalized = finalizedResidents.length === 0;
  const someFinalized = finalizedResidents.length > 0 && finalizedResidents.length < allResidents.length;
  
  // Check if any resident has uploaded documents
  const hasAnyDocuments = allResidents.some((resident: ExtendedResident) => 
    (resident.IncomeDocument || []).length > 0
  );

  // Check if any resident has documents that need review
  const hasDocumentsNeedingReview = allResidents.some((resident: ExtendedResident) =>
    (resident.IncomeDocument || []).some((doc: IncomeDocument) => doc.status === 'NEEDS_REVIEW')
  );

  console.log(`[LEASE VERIFICATION DEBUG] Lease ${lease.id} analysis:`, {
    totalResidents: allResidents.length,
    finalizedResidents: finalizedResidents.length,
    allFinalized,
    noneFinalized,
    someFinalized,
    hasAnyDocuments,
    hasDocumentsNeedingReview,
    residents: allResidents.map(r => ({
      name: r.name,
      incomeFinalized: r.incomeFinalized,
      hasNoIncome: r.hasNoIncome,
      documentsCount: (r.IncomeDocument || []).length
    }))
  });

  // Handle documents needing admin review first
  if (hasDocumentsNeedingReview) {
    console.log(`[LEASE VERIFICATION DEBUG] Lease ${lease.id}: Has documents needing review - returning Waiting for Admin Review`);
    return "Waiting for Admin Review";
  }

  // 2. If residents and some have been finalized but not all have been finalized -> "In Progress - Finalize to Process"
  if (someFinalized) {
    console.log(`[LEASE VERIFICATION DEBUG] Lease ${lease.id}: Some residents finalized (${finalizedResidents.length}/${allResidents.length}) - returning In Progress - Finalize to Process`);
    return "In Progress - Finalize to Process";
  }

  // 3. If residents and none have been finalized but there has been one or more income document uploaded -> "In Progress - Finalize to Process"
  if (noneFinalized && hasAnyDocuments) {
    console.log(`[LEASE VERIFICATION DEBUG] Lease ${lease.id}: No residents finalized but has documents - returning In Progress - Finalize to Process`);
    return "In Progress - Finalize to Process";
  }

  // 6. If all finalized -> "Verified" (but check for special cases first)
  if (allFinalized) {
    // Special case: If ALL residents are marked as "No Income", this needs attention
    const allResidentsHaveNoIncome = allResidents.every((r: ExtendedResident) => r.hasNoIncome);
    
    if (allResidentsHaveNoIncome && allResidents.length > 0) {
      console.log(`[LEASE VERIFICATION DEBUG] Lease ${lease.id}: All residents marked as no income - returning Needs Income Documentation`);
      return "Needs Income Documentation";
    }

    // TODO: Add logic for #4 - check if income documents are out of date
    // For now, if all finalized, return Verified
    console.log(`[LEASE VERIFICATION DEBUG] Lease ${lease.id}: All residents finalized - returning Verified`);
    return "Verified";
  }

  // 5. If residents but none have been finalized and none of them have had any income documents -> "Out of Date Income Documents"
  if (noneFinalized && !hasAnyDocuments) {
    console.log(`[LEASE VERIFICATION DEBUG] Lease ${lease.id}: No residents finalized and no documents - returning Out of Date Income Documents`);
    return "Out of Date Income Documents";
  }

  // Fallback (should not reach here with current logic)
  console.log(`[LEASE VERIFICATION DEBUG] Lease ${lease.id}: Fallback case - returning Out of Date Income Documents`);
  return "Out of Date Income Documents";
}

export function getUnitVerificationStatus(unit: FullUnit, latestRentRollDate: Date): VerificationStatus {
  console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber} - Raw lease data:`, {
    allLeases: (unit.Lease || []).map(l => ({
      id: l.id,
      hasTenancy: !!l.Tenancy,
      leaseType: (l as any).leaseType,
      tenancyType: typeof l.Tenancy,
      tenancyData: l.Tenancy
    }))
  });

  // First, try to find current leases using explicit leaseType
  const currentLeases = (unit.Lease || []).filter((l: ExtendedLease) => 
    (l as any).leaseType === 'CURRENT' && 
    !l.name?.startsWith('[PROCESSED]') // Exclude processed leases
  );
  
  console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber} - Current leases:`, {
    currentLeases: currentLeases.map(l => ({
      id: l.id,
      leaseType: (l as any).leaseType,
      tenancyCreatedAt: l.Tenancy?.createdAt,
      tenancyCreatedAtType: typeof l.Tenancy?.createdAt
    }))
  });

  const currentLease = currentLeases
    .sort((a: ExtendedLease, b: ExtendedLease) => new Date(b.Tenancy!.createdAt).getTime() - new Date(a.Tenancy!.createdAt).getTime())[0];

  console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber}:`, {
    totalLeases: (unit.Lease || []).length,
    currentLeases: currentLeases.length,
    selectedLease: currentLease?.id,
    leaseStartDate: currentLease?.leaseStartDate
  });

  // If no current lease, the unit is vacant for the current period
  if (!currentLease) {
    console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber}: No current lease - returning Vacant`);
    
    // Note: Future leases don't affect the main unit verification status
    // They are handled separately in the future lease column
    const futureLeases = (unit.Lease || []).filter((l: ExtendedLease) => 
      (l as any).leaseType === 'FUTURE' && 
      !l.name?.startsWith('[PROCESSED]') // Exclude processed leases
    );
    
    console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber}: Found ${futureLeases.length} future leases (handled separately)`);
    
    return "Vacant";
  }

  const allResidents = currentLease.Resident || [];
  console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber}:`, {
    leaseStartDate: currentLease.leaseStartDate?.toISOString(),
    residentsCount: allResidents.length,
    totalDocuments: allResidents.reduce((sum, r) => sum + (r.IncomeDocument?.length || 0), 0)
  });

  const allDocuments = allResidents.flatMap((r: ExtendedResident) => r.IncomeDocument || []);

  console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber} - Resident Details:`, 
    allResidents.map((r: ExtendedResident) => ({
      id: r.id,
      name: r.name,
      hasNoIncome: r.hasNoIncome,
      incomeFinalized: r.incomeFinalized,
      calculatedAnnualizedIncome: r.calculatedAnnualizedIncome
    }))
  );

  // Find the most recent document across all residents for this lease
  const mostRecentDocument = allDocuments.length > 0 ? allDocuments
    .sort((a: IncomeDocument, b: IncomeDocument) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime())[0]
    : null;

  // Check if there's an active income verification in progress
  const activeVerifications = currentLease.IncomeVerification || [];
  const latestVerification = activeVerifications
    .sort((a: IncomeVerification, b: IncomeVerification) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  
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
  
  // Handle FINALIZED verifications where some residents still need individual finalization
  if (latestVerification && latestVerification.status === 'FINALIZED') {
    // Check if any documents are waiting for admin review
    const hasDocumentsNeedingReview = allDocuments.some(doc => doc && doc.status === 'NEEDS_REVIEW');
    
    if (hasDocumentsNeedingReview) {
      console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber}: FINALIZED verification but has NEEDS_REVIEW documents - returning Waiting for Admin Review`);
      return "Waiting for Admin Review";
    }
    
    // Check if there are unfinalized residents with completed documents ready to finalize
    const unfinalizedResidents = allResidents.filter(r => !r.incomeFinalized && !r.hasNoIncome);
    if (unfinalizedResidents.length > 0) {
      const hasCompletedDocumentsReadyToFinalize = unfinalizedResidents.some(resident => {
        const residentDocs = (resident.IncomeDocument || []).filter(doc => doc.status === 'COMPLETED');
        return residentDocs.length > 0;
      });
      
      if (hasCompletedDocumentsReadyToFinalize) {
        console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber}: FINALIZED verification but has unfinalized residents with completed documents - returning In Progress - Finalize to Process`);
        return "In Progress - Finalize to Process";
      }
    }
  }
  
  // Check if income has been verified for all residents
  // A resident is considered verified if they have incomeFinalized = true
  // This can happen through either:
  // 1. Residents with completed documents that were auto-processed, OR
  // 2. Residents marked as "No Income" (hasNoIncome = true and incomeFinalized = true), OR
  // 3. Residents who have been manually finalized by an admin (incomeFinalized = true)
  
  const verifiedDocuments = allDocuments.filter(d => d && d.status === 'COMPLETED');
  const residentsWithFinalizedIncome = allResidents.filter(r => r.incomeFinalized || r.hasNoIncome);
  
  const totalResidentsWithVerifiedIncome = residentsWithFinalizedIncome.length;

  console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber}:`, {
    verifiedDocuments: verifiedDocuments.length,
    residentsWithFinalizedIncome: residentsWithFinalizedIncome.length,
    totalResidentsWithVerifiedIncome,
    totalResidents: allResidents.length,
    documentStatuses: allDocuments.map(d => ({ id: d?.id, status: d?.status, type: d?.documentType }))
  });

  // Add specific debugging for Unit 0208
  if (unit.unitNumber === '0208') {
    console.log(`[DEBUG Unit 0208 VERIFICATION SERVICE] All residents details:`, allResidents.map(r => ({
      id: r.id,
      name: r.name,
      incomeFinalized: r.incomeFinalized,
      hasNoIncome: r.hasNoIncome,
      calculatedAnnualizedIncome: r.calculatedAnnualizedIncome,
      annualizedIncome: r.annualizedIncome
    })));
    console.log(`[DEBUG Unit 0208 VERIFICATION SERVICE] Residents with finalized income:`, residentsWithFinalizedIncome.map(r => ({
      id: r.id,
      name: r.name,
      incomeFinalized: r.incomeFinalized,
      hasNoIncome: r.hasNoIncome
    })));
    console.log(`[DEBUG Unit 0208 VERIFICATION SERVICE] Documents:`, allDocuments.map(d => ({
      id: d?.id,
      type: d?.documentType,
      status: d?.status,
      residentId: d?.residentId
    })));
    console.log(`[DEBUG Unit 0208 VERIFICATION SERVICE] Final calculation:`, {
      totalResidentsWithVerifiedIncome,
      totalResidents: allResidents.length,
      shouldBeVerified: totalResidentsWithVerifiedIncome >= allResidents.length
    });
  }

  // If no residents have verified income (either through documents or "No Income"), return out of date
  if (totalResidentsWithVerifiedIncome === 0) {
    console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber}: No residents with verified income - returning Out of Date Income Documents`);
    return "Out of Date Income Documents";
  }
  
  // If not all residents have verified income, check if there are completed documents ready for finalization
  if (totalResidentsWithVerifiedIncome < allResidents.length) {
    // Check if unfinalized residents have completed documents that are ready to finalize
    const unfinalizedResidents = allResidents.filter(r => !r.incomeFinalized && !r.hasNoIncome);
    const hasCompletedDocumentsReadyToFinalize = unfinalizedResidents.some(resident => {
      const residentDocs = (resident.IncomeDocument || []).filter(doc => doc.status === 'COMPLETED');
      return residentDocs.length > 0;
    });
    
    if (hasCompletedDocumentsReadyToFinalize) {
      console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber}: Not all residents finalized (${totalResidentsWithVerifiedIncome}/${allResidents.length}) but has completed documents ready to finalize - returning In Progress - Finalize to Process`);
      return "In Progress - Finalize to Process";
    } else {
      console.log(`[VERIFICATION SERVICE DEBUG] Unit ${unit.unitNumber}: Not all residents have verified income (${totalResidentsWithVerifiedIncome}/${allResidents.length}) and no completed documents ready - returning Out of Date Income Documents`);
      return "Out of Date Income Documents";
    }
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

  // Before returning "Verified", check if all residents are marked as "No Income"
  if (incomeDifference <= 1.00) {
    const allResidentsHaveNoIncome = allResidents.every((r: ExtendedResident) => r.hasNoIncome);
    
    if (allResidentsHaveNoIncome && allResidents.length > 0) {
      console.log(`[VERIFICATION SERVICE] Unit ${unit.unitNumber}: All residents marked as no income - returning Needs Income Documentation`);
      return "Needs Income Documentation";
    }
  }

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
  // Handle NaN values properly - if either income is NaN, skip discrepancy check
  const cleanUploadedIncome = isNaN(totalUploadedIncome) ? 0 : totalUploadedIncome;
  const cleanVerifiedIncome = isNaN(totalVerifiedIncome) ? 0 : totalVerifiedIncome;
  const incomeDifference = Math.abs(cleanUploadedIncome - cleanVerifiedIncome);
  
  console.log(`[DISCREPANCY CHECK] Original values - Uploaded: ${totalUploadedIncome}, Verified: ${totalVerifiedIncome}`);
  console.log(`[DISCREPANCY CHECK] Clean values - Uploaded: ${cleanUploadedIncome}, Verified: ${cleanVerifiedIncome}, Difference: ${incomeDifference}`);
  
  // Skip if either income is 0 (likely indicates missing/invalid data)
  if (cleanUploadedIncome === 0 || cleanVerifiedIncome === 0) {
    console.log(`[DISCREPANCY CHECK] Skipping - one or both incomes are 0 (missing data)`);
    return null;
  }
  
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
    
    const systemExplanation = `Income discrepancy detected: Rent roll shows $${cleanUploadedIncome.toLocaleString()} but verified documents total $${cleanVerifiedIncome.toLocaleString()} (difference: $${incomeDifference.toFixed(2)})`;
    
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