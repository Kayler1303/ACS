import { Unit, Lease, Resident, IncomeDocument, DocumentType, Tenancy } from '@prisma/client';
import { getYear, isWithinInterval, subMonths } from 'date-fns';

type FullUnit = Unit & {
  leases: (Lease & {
    residents: (Resident & {
      incomeDocuments: IncomeDocument[];
    })[];
    tenancy: Tenancy | null;
  })[];
};

export type VerificationStatus = "Verified" | "Needs Investigation" | "Out of Date Income Documents" | "Vacant";

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
      
      // Enhanced name matching: check if employee name is contained in resident name (case-insensitive)
      // This handles cases where resident name might be "John Smith" and employee name is "John A Smith"
      const residentNameLower = resident.name.toLowerCase().trim();
      const employeeNameLower = doc.employeeName.toLowerCase().trim();
      return residentNameLower.includes(employeeNameLower) || employeeNameLower.includes(residentNameLower);
  });

  if (!doNamesMatch) {
      return "Out of Date Income Documents";
  }

  // Check if total uploaded income matches total verified income
  const totalUploadedIncome = allResidents.reduce((acc, r) => acc + (r.annualizedIncome || 0), 0);
  
  // Calculate total verified income from all document types
  let totalVerifiedIncome = 0;
  
  // Sum W2 income (use box1_wages)
  const w2Income = verifiedDocuments
    .filter(d => d.documentType === DocumentType.W2)
    .reduce((acc, d) => acc + (d.box1_wages || 0), 0);
  
  // Sum paystub income (use calculatedAnnualizedIncome when available)
  const paystubIncome = verifiedDocuments
    .filter(d => d.documentType === DocumentType.PAYSTUB && d.calculatedAnnualizedIncome)
    .reduce((acc, d) => acc + d.calculatedAnnualizedIncome!, 0);
    
  // Sum other document types if they have calculatedAnnualizedIncome
  const otherIncome = verifiedDocuments
    .filter(d => d.documentType !== DocumentType.W2 && d.documentType !== DocumentType.PAYSTUB && d.calculatedAnnualizedIncome)
    .reduce((acc, d) => acc + d.calculatedAnnualizedIncome!, 0);

  totalVerifiedIncome = w2Income + paystubIncome + otherIncome;
  
  // Compare with tolerance for floating point precision (allowing $1 difference)
  const incomeDifference = Math.abs(totalUploadedIncome - totalVerifiedIncome);
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
  };
} 