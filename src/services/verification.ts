import { Unit, Lease, Resident, IncomeDocument, DocumentType, Tenancy } from '@prisma/client';
import { getYear, isWithinInterval, subMonths } from 'date-fns';

// Extended Resident type with new income fields
type ExtendedResident = Resident & {
  calculatedAnnualizedIncome?: number | null;
  incomeFinalized?: boolean;
  finalizedAt?: Date | null;
};

type FullUnit = Unit & {
  leases: (Lease & {
    residents: (ExtendedResident & {
      incomeDocuments: IncomeDocument[];
    })[];
    tenancy: Tenancy | null;
  })[];
};

export type VerificationStatus = "Verified" | "Needs Investigation" | "Out of Date Income Documents" | "Vacant" | "In Progress - Finalize to Process";

/**
 * Determines the income verification status for a single unit based on its lease, residents, and documents.
 * This function implements the business rules for income verification compliance.
 *
 * @param unit - The unit to analyze, with its leases, residents, and income documents included.
 * @param latestRentRollDate - The date of the most recent rent roll.
 * @returns The verification status of the unit.
 */
export function getUnitVerificationStatus(unit: FullUnit, latestRentRollDate: Date): VerificationStatus {
  // Find the lease associated with the most recent rent roll for this unit.
  // IMPORTANT: Exclude provisional leases (leases without tenancy) as per user requirements
  const lease = unit.leases
    .filter(l => l.tenancy !== null) // Only include leases that are linked to a rent roll
    .sort((a, b) => new Date(b.tenancy!.createdAt).getTime() - new Date(a.tenancy!.createdAt).getTime())[0];
    
  if (!lease) {
    return "Vacant";
  }

  if (!lease.leaseStartDate) {
    return "Vacant"; // Changed from "Pending Lease Start" to "Vacant" to match user requirements
  }

  const leaseStartDate = new Date(lease.leaseStartDate);
  const allResidents = lease.residents;
  const allDocuments = allResidents.flatMap(r => r.incomeDocuments);
  const verifiedDocuments = allDocuments.filter(d => d.status === 'COMPLETED');

  if (verifiedDocuments.length === 0) {
    return "Out of Date Income Documents";
  }

  // Check timeliness of documents
  const areDocumentsTimely = verifiedDocuments.every(doc => {
    if (doc.documentType === DocumentType.W2) {
      if (!doc.taxYear) return false;
      const leaseStartYear = getYear(leaseStartDate);
      const leaseStartMonth = leaseStartDate.getMonth(); // 0-indexed (0=Jan, 1=Feb, 2=Mar)

      // W2 logic: For leases starting Jan-Mar, accept W2 from current year-1 or year-2
      // For leases starting Apr-Dec, only accept W2 from current year-1
      if (leaseStartMonth <= 2) { // Jan, Feb, Mar
        return doc.taxYear === leaseStartYear - 1 || doc.taxYear === leaseStartYear - 2;
      } else {
        return doc.taxYear === leaseStartYear - 1;
      }
    } else {
      // For non-W2 documents: must be within 6 months prior to lease start OR on/after lease start
      const documentDate = new Date(doc.documentDate);
      const sixMonthsBeforeLeaseStart = subMonths(leaseStartDate, 6);
      // Valid if within 6 months prior to lease start, or any time on or after lease start
      // Set reasonable future limit of 10 years for sanity check
      const tenYearsAfterLeaseStart = new Date(new Date(leaseStartDate).setFullYear(leaseStartDate.getFullYear() + 10));
      return isWithinInterval(documentDate, { start: sixMonthsBeforeLeaseStart, end: tenYearsAfterLeaseStart });
    }
  });

  if (!areDocumentsTimely) {
    return "Out of Date Income Documents";
  }

  // Check if names on documents match resident names
  const doNamesMatch = verifiedDocuments.every(doc => {
      const resident = allResidents.find(r => r.id === doc.residentId);
      if (!resident || !doc.employeeName) return false;
      
      const residentNameLower = resident.name.toLowerCase().trim();
      const employeeNameLower = doc.employeeName.toLowerCase().trim();
      
      // Skip validation for extremely short names (likely extraction errors)
      if (employeeNameLower.length <= 1) {
        console.log(`⚠️ Name validation skipped for very short employee name: "${doc.employeeName}"`);
        return true; // Allow very short names to pass (likely OCR errors)
      }
      
      // Enhanced name matching: handles middle initials and variations
      // Split names into words for flexible matching
      const residentWords = residentNameLower.split(/\s+/).filter(word => word.length > 0);
      const employeeWords = employeeNameLower.split(/\s+/).filter(word => word.length > 0);
      
      // Check if employee name contains resident's first and last name (allowing middle initials)
      // Example: "Blanca Soto" should match "Blanca I Soto"
      if (residentWords.length >= 2 && employeeWords.length >= 2) {
        const residentFirst = residentWords[0];
        const residentLast = residentWords[residentWords.length - 1];
        const employeeFirst = employeeWords[0];
        const employeeLast = employeeWords[employeeWords.length - 1];
        
        // Match if first and last names match (case-insensitive)
        if (residentFirst === employeeFirst && residentLast === employeeLast) {
          return true;
        }
      }
      
      // Fallback to original contains logic
      return residentNameLower.includes(employeeNameLower) || employeeNameLower.includes(residentNameLower);
  });

  if (!doNamesMatch) {
      return "Out of Date Income Documents";
  }

  // Check if total uploaded income matches total verified income
  const totalUploadedIncome = allResidents.reduce((acc, r) => acc + (Number(r.annualizedIncome) || 0), 0);
  
  // Calculate total verified income from resident-level calculated income
  // Only include finalized residents with valid calculatedAnnualizedIncome
  const totalVerifiedIncome = allResidents.reduce((acc, r) => {
    const amount = r.incomeFinalized 
      ? (Number(r.calculatedAnnualizedIncome) || 0)
      : 0;
    console.log(`[VERIFICATION SERVICE] Resident ${r.id}:`, {
      incomeFinalized: r.incomeFinalized,
      calculatedAnnualizedIncome: r.calculatedAnnualizedIncome,
      annualizedIncome: r.annualizedIncome,
      amountAdded: amount,
      runningTotal: acc + amount,
      finalizedOnly: true
    });
    return acc + amount;
  }, 0);
  
  // Compare with tolerance for floating point precision (allowing $1 difference)
  const incomeDifference = Math.abs(totalUploadedIncome - totalVerifiedIncome);
  console.log(`[VERIFICATION SERVICE] FINAL COMPARISON:`, {
    totalUploadedIncome,
    totalVerifiedIncome,
    incomeDifference,
    result: incomeDifference > 1.00 ? "Needs Investigation" : "Verified"
  });
  if (incomeDifference > 1.00) {
    return "Needs Investigation";
  }

  return "Verified";
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
    needsInvestigation: number;
    outOfDate: number;
    vacant: number;
    verificationInProgress: number;
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
  
  // Check if there's an income discrepancy (same logic as verification status)
  const incomeDifference = Math.abs(totalUploadedIncome - totalVerifiedIncome);
  
  if (incomeDifference > 1.00) {
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