import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export interface LeaseIdentifier {
  unitId: string;
  unitNumber: string;
  leaseStartDate: Date;
  leaseEndDate: Date;
  residentNames: string[];
}

export interface ContinuityMatch {
  existingLeaseId: string;
  newLeaseData: LeaseIdentifier;
  matchType: 'EXACT' | 'PARTIAL_RESIDENTS' | 'NEW_RESIDENTS';
  continuingResidents: ResidentMatch[];
  newResidents: string[];
  removedResidents: string[];
}

export interface ResidentMatch {
  existingResidentId: string;
  existingResidentName: string;
  newResidentName: string;
  verifiedIncome?: number;
  hasVerification: boolean;
  hasDocuments: boolean;
}

export interface VerificationCarryoverResult {
  verificationId?: string;
  documentsCarriedOver: number;
  residentsCarriedOver: number;
  discrepanciesDetected: IncomeDiscrepancy[];
}

export interface IncomeDiscrepancy {
  residentName: string;
  existingVerifiedIncome: number;
  newRentRollIncome: number;
  discrepancy: number;
  existingResidentId: string;
  newResidentId: string;
}

/**
 * Finds existing leases that match the lease continuity criteria:
 * - Same unit
 * - Same lease start date
 * - Same lease end date
 * - At least one matching resident name
 */
export async function findContinuingLeases(
  newLeases: LeaseIdentifier[],
  propertyId: string
): Promise<ContinuityMatch[]> {
  const matches: ContinuityMatch[] = [];

  for (const newLease of newLeases) {
    // Find existing leases with matching unit, start date, and end date
    const existingLeases = await prisma.lease.findMany({
      where: {
        unitId: newLease.unitId,
        leaseStartDate: newLease.leaseStartDate,
        leaseEndDate: newLease.leaseEndDate,
        Unit: {
          propertyId: propertyId
        }
      },
      include: {
        Resident: {
          include: {
            IncomeDocument: true
          }
        },
        IncomeVerification: {
          include: {
            IncomeDocument: true
          }
        }
      }
    });

    for (const existingLease of existingLeases) {
      const existingResidentNames = existingLease.Resident.map((r: any) => r.name.toLowerCase().trim());
      const newResidentNames = newLease.residentNames.map(name => name.toLowerCase().trim());

      // Find matching residents
      const continuingResidents: ResidentMatch[] = [];
      const newResidents: string[] = [];
      const removedResidents: string[] = [];

      // Check for continuing residents
      for (const existingResident of existingLease.Resident) {
        const existingName = existingResident.name.toLowerCase().trim();
        const matchingNewName = newLease.residentNames.find(
          newName => newName.toLowerCase().trim() === existingName
        );

        if (matchingNewName) {
          continuingResidents.push({
            existingResidentId: existingResident.id,
            existingResidentName: existingResident.name,
            newResidentName: matchingNewName,
            verifiedIncome: existingResident.calculatedAnnualizedIncome ? 
              Number(existingResident.calculatedAnnualizedIncome) : undefined,
            hasVerification: existingResident.incomeFinalized,
            hasDocuments: existingResident.IncomeDocument.length > 0
          });
        } else {
          removedResidents.push(existingResident.name);
        }
      }

      // Check for new residents
      for (const newName of newLease.residentNames) {
        const newNameLower = newName.toLowerCase().trim();
        if (!existingResidentNames.includes(newNameLower)) {
          newResidents.push(newName);
        }
      }

      // Determine match type
      let matchType: 'EXACT' | 'PARTIAL_RESIDENTS' | 'NEW_RESIDENTS';
      if (continuingResidents.length === existingLease.Resident.length && 
          newResidents.length === 0 && removedResidents.length === 0) {
        matchType = 'EXACT';
      } else if (continuingResidents.length > 0) {
        matchType = 'PARTIAL_RESIDENTS';
      } else {
        matchType = 'NEW_RESIDENTS';
      }

      // Only consider it a match if there's at least one continuing resident
      // or if it's a complete replacement (NEW_RESIDENTS case should not carry over)
      if (continuingResidents.length > 0) {
        matches.push({
          existingLeaseId: existingLease.id,
          newLeaseData: newLease,
          matchType,
          continuingResidents,
          newResidents,
          removedResidents
        });
      }
    }
  }

  return matches;
}

/**
 * Carries over verification status and documents for continuing leases
 */
export async function carryOverVerifications(
  continuityMatches: ContinuityMatch[],
  newRentRollId: string,
  newResidentsData: any[],
  tx: Prisma.TransactionClient
): Promise<Map<string, VerificationCarryoverResult>> {
  const results = new Map<string, VerificationCarryoverResult>();

  for (const match of continuityMatches) {
    const result: VerificationCarryoverResult = {
      documentsCarriedOver: 0,
      residentsCarriedOver: 0,
      discrepanciesDetected: []
    };

    // Get the existing lease with full verification data
    const existingLease = await tx.lease.findUnique({
      where: { id: match.existingLeaseId },
      include: {
        IncomeVerification: {
          include: {
            IncomeDocument: true
          }
        },
        Resident: {
          include: {
            IncomeDocument: true
          }
        }
      }
    });

    if (!existingLease) continue;

    // Find the new lease ID (it should be created by now)
    const newLease = await tx.lease.findFirst({
      where: {
        unitId: match.newLeaseData.unitId,
        leaseStartDate: match.newLeaseData.leaseStartDate,
        leaseEndDate: match.newLeaseData.leaseEndDate,
        Tenancy: {
          rentRollId: newRentRollId
        }
      },
      include: {
        Resident: true
      }
    });

    if (!newLease) continue;

    // Create new verification record if the existing lease has one
    let newVerificationId: string | undefined;
    if (existingLease.IncomeVerification.length > 0) {
      const existingVerification = existingLease.IncomeVerification[0]; // Assume one verification per lease
      
      const newVerification = await tx.incomeVerification.create({
        data: {
          id: `verification_${Date.now()}_${newLease.id}`,
          leaseId: newLease.id,
          status: existingVerification.status,
          reason: 'LEASE_RENEWAL', // or keep existing reason
          associatedLeaseStart: existingVerification.associatedLeaseStart,
          associatedLeaseEnd: existingVerification.associatedLeaseEnd,
          calculatedVerifiedIncome: existingVerification.calculatedVerifiedIncome,
          finalizedAt: existingVerification.finalizedAt,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      newVerificationId = newVerification.id;
      result.verificationId = newVerificationId;
    }

    // Process continuing residents
    for (const residentMatch of match.continuingResidents) {
             const newResident = newLease.Resident.find(
         (r: any) => r.name.toLowerCase().trim() === residentMatch.newResidentName.toLowerCase().trim()
       );

      if (!newResident) continue;

      // Check for income discrepancy
      if (residentMatch.verifiedIncome !== undefined) {
        const newRentRollIncome = Number(newResident.annualizedIncome || 0);
        const discrepancy = Math.abs(residentMatch.verifiedIncome - newRentRollIncome);

        if (discrepancy > 1.00) {
          result.discrepanciesDetected.push({
            residentName: residentMatch.existingResidentName,
            existingVerifiedIncome: residentMatch.verifiedIncome,
            newRentRollIncome: newRentRollIncome,
            discrepancy: discrepancy,
            existingResidentId: residentMatch.existingResidentId,
            newResidentId: newResident.id
          });
        }
      }

      // Carry over resident verification status if they had finalized income
      if (residentMatch.hasVerification) {
        await tx.resident.update({
          where: { id: newResident.id },
          data: {
            incomeFinalized: true,
            calculatedAnnualizedIncome: residentMatch.verifiedIncome,
            finalizedAt: new Date()
          }
        });

        result.residentsCarriedOver++;
      }

      // Reference existing documents instead of copying them
      if (residentMatch.hasDocuments && newVerificationId) {
        const existingDocuments = await tx.incomeDocument.findMany({
          where: { residentId: residentMatch.existingResidentId }
        });

        for (const doc of existingDocuments) {
          // Create a reference to the existing document for the new verification
          await tx.incomeDocument.create({
            data: {
              id: `doc_ref_${Date.now()}_${doc.id}`,
              documentType: doc.documentType,
              documentDate: doc.documentDate,
              status: doc.status,
              filePath: doc.filePath, // Same file path - referencing not copying
              box1_wages: doc.box1_wages,
              box3_ss_wages: doc.box3_ss_wages,
              box5_med_wages: doc.box5_med_wages,
              employeeName: doc.employeeName,
              employerName: doc.employerName,
              taxYear: doc.taxYear,
              grossPayAmount: doc.grossPayAmount,
              payFrequency: doc.payFrequency,
              payPeriodEndDate: doc.payPeriodEndDate,
              payPeriodStartDate: doc.payPeriodStartDate,
              calculatedAnnualizedIncome: doc.calculatedAnnualizedIncome,
              verificationId: newVerificationId,
              residentId: newResident.id,
              uploadDate: new Date() // New upload date for the reference
            }
          });

          result.documentsCarriedOver++;
        }
      }
    }

    results.set(match.existingLeaseId, result);
  }

  return results;
}

/**
 * Main function to handle lease continuity during rent roll processing
 */
export async function processLeaseContinuity(
  newLeasesData: LeaseIdentifier[],
  propertyId: string,
  newRentRollId: string,
  newResidentsData: any[],
  tx: Prisma.TransactionClient
): Promise<{
  continuityMatches: ContinuityMatch[];
  carryoverResults: Map<string, VerificationCarryoverResult>;
  totalDiscrepancies: IncomeDiscrepancy[];
}> {
  console.log(`[LEASE CONTINUITY] Processing ${newLeasesData.length} new leases for continuity`);

  // Temporarily disable lease continuity to avoid transaction timeout
  // TODO: Optimize database queries and re-enable this feature
  console.log(`[LEASE CONTINUITY] Lease continuity temporarily disabled for performance optimization`);

  return {
    continuityMatches: [],
    carryoverResults: new Map(),
    totalDiscrepancies: []
  };
} 