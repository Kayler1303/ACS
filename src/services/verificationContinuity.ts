import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';

export interface LeaseData {
  id: string;
  leaseStartDate: Date | null;
  leaseEndDate: Date | null;
  leaseRent: number | null;
  residents: {
    name: string;
    annualizedIncome: number | null;
  }[];
}

export interface VerificationContinuityResult {
  continuityId: string;
  shouldInheritVerification: boolean;
  masterVerificationId?: string;
  hasIncomeDiscrepancies?: boolean;
  incomeDiscrepancies?: IncomeDiscrepancy[];
  requiresManualReview?: boolean;
  futureLeaseMatch?: FutureLeaseMatch;
}

export interface IncomeDiscrepancy {
  residentName: string;
  uploadedIncome: number;
  verifiedIncome: number;
  discrepancy: number;
}

export interface FutureLeaseMatch {
  leaseId: string;
  leaseName: string;
  matchType: 'exact' | 'structural' | 'manual_review';
  matchConfidence: number;
  hasVerifiedIncome: boolean;
  masterVerificationId?: string;
}

/**
 * Generates a structural signature for lease data (excludes income amounts)
 * This allows for income reconciliation while maintaining structural continuity
 */
export function generateStructuralLeaseSignature(lease: LeaseData): string {
  const normalizedData = {
    startDate: lease.leaseStartDate?.toISOString() || null,
    endDate: lease.leaseEndDate?.toISOString() || null,
    rent: lease.leaseRent || null,
    residents: lease.residents
      .map(r => ({ 
        name: r.name.trim().toLowerCase()
        // Note: Income is NOT included in structural signature
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  };
  
  return createHash('sha256')
    .update(JSON.stringify(normalizedData))
    .digest('hex');
}

/**
 * Generates a full signature including income amounts for exact matching
 */
export function generateFullLeaseSignature(lease: LeaseData): string {
  const normalizedData = {
    startDate: lease.leaseStartDate?.toISOString() || null,
    endDate: lease.leaseEndDate?.toISOString() || null,
    rent: lease.leaseRent || null,
    residents: lease.residents
      .map(r => ({ 
        name: r.name.trim().toLowerCase(), 
        income: r.annualizedIncome || 0 
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  };
  
  return createHash('sha256')
    .update(JSON.stringify(normalizedData))
    .digest('hex');
}

/**
 * Compares uploaded lease data with verified income data to detect discrepancies
 */
export async function detectIncomeDiscrepancies(
  uploadedLease: LeaseData,
  masterVerificationId: string
): Promise<IncomeDiscrepancy[]> {
  const discrepancies: IncomeDiscrepancy[] = [];
  
  // Get the master verification with residents and their verified incomes
  const masterVerification = await prisma.incomeVerification.findUnique({
    where: { id: masterVerificationId },
    include: {
      Lease: {
        include: {
          Resident: true
        }
      }
    }
  });
  
  if (!masterVerification) return discrepancies;
  
  // Compare each uploaded resident with their verified counterpart
  for (const uploadedResident of uploadedLease.residents) {
    const verifiedResident = masterVerification.Lease.Resident.find((r: any) => 
      r.name.trim().toLowerCase() === uploadedResident.name.trim().toLowerCase()
    );
    
    if (verifiedResident && verifiedResident.calculatedAnnualizedIncome) {
      const uploadedIncome = uploadedResident.annualizedIncome || 0;
      const verifiedIncome = Number(verifiedResident.calculatedAnnualizedIncome);
      const discrepancy = Math.abs(uploadedIncome - verifiedIncome);
      
      // Flag discrepancies greater than $1 (to account for rounding)
      if (discrepancy > 1.00) {
        discrepancies.push({
          residentName: uploadedResident.name,
          uploadedIncome,
          verifiedIncome,
          discrepancy
        });
      }
    }
  }
  
  return discrepancies;
}

/**
 * Enhanced verification continuity handler that includes future lease matching
 */
export async function handleVerificationContinuity(
  propertyId: string,
  unitId: string,
  leaseData: LeaseData,
  rentRollId: string
): Promise<VerificationContinuityResult> {
  const structuralSignature = generateStructuralLeaseSignature(leaseData);
  const fullSignature = generateFullLeaseSignature(leaseData);
  
  console.log(`[CONTINUITY] Processing lease ${leaseData.id}`);
  console.log(`[CONTINUITY] Structural signature: ${structuralSignature.substring(0, 8)}...`);
  console.log(`[CONTINUITY] Full signature: ${fullSignature.substring(0, 8)}...`);
  
  // 1. Check for exact match with current leases (full signature)
  let continuity = await prisma.verificationContinuity.findFirst({
    where: {
      propertyId,
      unitId,
      leaseSignature: fullSignature
    },
    include: {
      masterVerification: {
        include: {
          IncomeDocument: true
        }
      }
    }
  });
  
  if (continuity) {
    console.log(`[CONTINUITY] Found exact match with current lease - inheriting verification`);
    
    await prisma.verificationSnapshot.create({
      data: {
        id: randomUUID(),
        verificationContinuityId: continuity.id,
        rentRollId,
        leaseId: leaseData.id
      }
    });
    
    return {
      continuityId: continuity.id,
      shouldInheritVerification: !!continuity.masterVerificationId,
      masterVerificationId: continuity.masterVerificationId || undefined
    };
  }
  
  // 2. Check for structural match with current leases (income discrepancy)
  continuity = await prisma.verificationContinuity.findFirst({
    where: {
      propertyId,
      unitId,
      leaseSignature: structuralSignature
    },
    include: {
      masterVerification: {
        include: {
          IncomeDocument: true
        }
      }
    }
  });
  
  if (continuity && continuity.masterVerificationId) {
    console.log(`[CONTINUITY] Found structural match with current lease - checking for income discrepancies`);
    
    const discrepancies = await detectIncomeDiscrepancies(leaseData, continuity.masterVerificationId);
    
    if (discrepancies.length > 0) {
      console.log(`[CONTINUITY] Found ${discrepancies.length} income discrepancies with current lease - requires user reconciliation`);
      
      const newContinuity = await prisma.verificationContinuity.create({
        data: {
          id: randomUUID(),
          propertyId,
          unitId,
          leaseSignature: fullSignature,
          masterVerificationId: null
        }
      });
      
      await prisma.verificationSnapshot.create({
        data: {
          id: randomUUID(),
          verificationContinuityId: newContinuity.id,
          rentRollId,
          leaseId: leaseData.id
        }
      });
      
      return {
        continuityId: newContinuity.id,
        shouldInheritVerification: false,
        hasIncomeDiscrepancies: true,
        incomeDiscrepancies: discrepancies
      };
    } else {
      console.log(`[CONTINUITY] Structural match with current lease, no significant discrepancies - inheriting verification`);
      
      await prisma.verificationContinuity.update({
        where: { id: continuity.id },
        data: { leaseSignature: fullSignature }
      });
      
      await prisma.verificationSnapshot.create({
        data: {
          id: randomUUID(),
          verificationContinuityId: continuity.id,
          rentRollId,
          leaseId: leaseData.id
        }
      });
      
      return {
        continuityId: continuity.id,
        shouldInheritVerification: true,
        masterVerificationId: continuity.masterVerificationId
      };
    }
  }
  
  // 3. NEW: Check for future lease matches
  console.log(`[CONTINUITY] No current lease match found - checking future leases`);
  const futureLeaseResult = await checkFutureLeaseMatches(propertyId, unitId, leaseData, rentRollId);
  
  if (futureLeaseResult.shouldInheritVerification) {
    return futureLeaseResult;
  }
  
  // 4. No match found - create new continuity
  console.log(`[CONTINUITY] No match found - creating new continuity record`);
  
  const newContinuity = await prisma.verificationContinuity.create({
    data: {
      id: randomUUID(),
      propertyId,
      unitId,
      leaseSignature: fullSignature,
      masterVerificationId: null
    }
  });
  
  await prisma.verificationSnapshot.create({
    data: {
      id: randomUUID(),
      verificationContinuityId: newContinuity.id,
      rentRollId,
      leaseId: leaseData.id
    }
  });
  
  return {
    continuityId: newContinuity.id,
    shouldInheritVerification: false
  };
}

/**
 * Checks for matches with future leases (both rent roll future leases and user-created)
 */
async function checkFutureLeaseMatches(
  propertyId: string,
  unitId: string,
  newLeaseData: LeaseData,
  rentRollId: string
): Promise<VerificationContinuityResult> {
  
  // Get all future leases for this unit (leases without tenancy)
  const futureLeases = await prisma.lease.findMany({
    where: {
      unitId,
      Tenancy: null, // Future leases have no tenancy
      IncomeVerification: {
        some: {
          status: 'FINALIZED' // Only consider future leases with verified income
        }
      }
    },
    include: {
      Resident: true,
      IncomeVerification: {
        where: { status: 'FINALIZED' },
        include: {
          IncomeDocument: true
        },
        orderBy: { createdAt: 'desc' },
        take: 1
      }
    }
  });
  
  console.log(`[CONTINUITY] Found ${futureLeases.length} future leases with verified income for unit ${unitId}`);
  
  if (futureLeases.length === 0) {
    return {
      continuityId: '',
      shouldInheritVerification: false
    };
  }
  
  // Check each future lease for matches
  for (const futureLease of futureLeases) {
    const futureLeaseData: LeaseData = {
      id: futureLease.id,
      leaseStartDate: futureLease.leaseStartDate,
      leaseEndDate: futureLease.leaseEndDate,
      leaseRent: futureLease.leaseRent ? Number(futureLease.leaseRent) : null,
      residents: futureLease.Resident.map((r: any) => ({
        name: r.name,
        annualizedIncome: r.calculatedAnnualizedIncome ? Number(r.calculatedAnnualizedIncome) : null
      }))
    };
    
    // Check for exact match
    const futureFullSignature = generateFullLeaseSignature(futureLeaseData);
    const newFullSignature = generateFullLeaseSignature(newLeaseData);
    
    if (futureFullSignature === newFullSignature) {
      console.log(`[CONTINUITY] Found exact match with future lease ${futureLease.id} - inheriting verification`);
      
      return await inheritFromFutureLease(
        futureLease,
        newLeaseData.id,
        rentRollId,
        propertyId,
        unitId,
        'exact'
      );
    }
    
    // Check for structural match
    const futureStructuralSignature = generateStructuralLeaseSignature(futureLeaseData);
    const newStructuralSignature = generateStructuralLeaseSignature(newLeaseData);
    
    if (futureStructuralSignature === newStructuralSignature) {
      console.log(`[CONTINUITY] Found structural match with future lease ${futureLease.id} - checking income discrepancies`);
      
      const masterVerificationId = futureLease.IncomeVerification[0]?.id;
      if (masterVerificationId) {
        const discrepancies = await detectIncomeDiscrepancies(newLeaseData, masterVerificationId);
        
        if (discrepancies.length === 0) {
          console.log(`[CONTINUITY] No income discrepancies with future lease - inheriting verification`);
          
          return await inheritFromFutureLease(
            futureLease,
            newLeaseData.id,
            rentRollId,
            propertyId,
            unitId,
            'structural'
          );
        } else {
          console.log(`[CONTINUITY] Income discrepancies found with future lease - flagging for reconciliation`);
          
          // Create new continuity but flag for future lease reconciliation
          const newContinuity = await prisma.verificationContinuity.create({
            data: {
              id: randomUUID(),
              propertyId,
              unitId,
              leaseSignature: newFullSignature,
              masterVerificationId: null
            }
          });
          
          await prisma.verificationSnapshot.create({
            data: {
              id: randomUUID(),
              verificationContinuityId: newContinuity.id,
              rentRollId,
              leaseId: newLeaseData.id
            }
          });
          
          return {
            continuityId: newContinuity.id,
            shouldInheritVerification: false,
            hasIncomeDiscrepancies: true,
            incomeDiscrepancies: discrepancies,
            futureLeaseMatch: {
              leaseId: futureLease.id,
              leaseName: futureLease.name,
              matchType: 'structural',
              matchConfidence: 0.9,
              hasVerifiedIncome: true,
              masterVerificationId
            }
          };
        }
      }
    }
    
    // Check for potential manual match (user-created future leases with minimal data)
    const residentMatch = checkResidentSimilarity(futureLeaseData.residents, newLeaseData.residents);
    
    if (residentMatch.matchPercentage >= 0.8) { // 80% resident name match
      console.log(`[CONTINUITY] Found potential manual match with future lease ${futureLease.id} (${residentMatch.matchPercentage * 100}% resident match)`);
      
      // Create new continuity but flag for manual review
      const newContinuity = await prisma.verificationContinuity.create({
        data: {
          id: randomUUID(),
          propertyId,
          unitId,
          leaseSignature: newFullSignature,
          masterVerificationId: null
        }
      });
      
      await prisma.verificationSnapshot.create({
        data: {
          id: randomUUID(),
          verificationContinuityId: newContinuity.id,
          rentRollId,
          leaseId: newLeaseData.id
        }
      });
      
      return {
        continuityId: newContinuity.id,
        shouldInheritVerification: false,
        requiresManualReview: true,
        futureLeaseMatch: {
          leaseId: futureLease.id,
          leaseName: futureLease.name,
          matchType: 'manual_review',
          matchConfidence: residentMatch.matchPercentage,
          hasVerifiedIncome: true,
          masterVerificationId: futureLease.IncomeVerification[0]?.id
        }
      };
    }
  }
  
  return {
    continuityId: '',
    shouldInheritVerification: false
  };
}

/**
 * Inherits verification from a future lease to a current lease
 */
async function inheritFromFutureLease(
  futureLease: any,
  newLeaseId: string,
  rentRollId: string,
  propertyId: string,
  unitId: string,
  matchType: 'exact' | 'structural'
): Promise<VerificationContinuityResult> {
  
  const masterVerification = futureLease.IncomeVerification[0];
  if (!masterVerification) {
    throw new Error('No master verification found in future lease');
  }
  
  // Create or find continuity record
  const newLeaseData: LeaseData = {
    id: newLeaseId,
    leaseStartDate: null, // Will be set from new lease
    leaseEndDate: null,
    leaseRent: null,
    residents: futureLease.Resident.map((r: any) => ({
      name: r.name,
      annualizedIncome: r.calculatedAnnualizedIncome ? Number(r.calculatedAnnualizedIncome) : null
    }))
  };
  
  const fullSignature = generateFullLeaseSignature(newLeaseData);
  
  const continuity = await prisma.verificationContinuity.create({
    data: {
      id: randomUUID(),
      propertyId,
      unitId,
      leaseSignature: fullSignature,
      masterVerificationId: masterVerification.id
    }
  });
  
  await prisma.verificationSnapshot.create({
    data: {
      id: randomUUID(),
      verificationContinuityId: continuity.id,
      rentRollId,
      leaseId: newLeaseId
    }
  });
  
  // Inherit the verification
  const newVerificationId = await inheritVerification(
    masterVerification.id,
    newLeaseId,
    continuity.id
  );
  
  console.log(`[CONTINUITY] Successfully inherited verification from future lease ${futureLease.id} to current lease ${newLeaseId}`);
  
  return {
    continuityId: continuity.id,
    shouldInheritVerification: true,
    masterVerificationId: newVerificationId
  };
}

/**
 * Checks similarity between resident lists
 */
function checkResidentSimilarity(
  futureResidents: { name: string; annualizedIncome: number | null }[],
  currentResidents: { name: string; annualizedIncome: number | null }[]
): { matchPercentage: number; matches: any[] } {
  
  if (futureResidents.length === 0 || currentResidents.length === 0) {
    return { matchPercentage: 0, matches: [] };
  }
  
  const matches = [];
  let matchCount = 0;
  
  for (const futureResident of futureResidents) {
    const bestMatch = currentResidents.find(currentResident => {
      const futureName = futureResident.name.toLowerCase().trim();
      const currentName = currentResident.name.toLowerCase().trim();
      
      // Exact match
      if (futureName === currentName) return true;
      
      // Similarity check (simple Jaccard similarity)
      const similarity = calculateStringSimilarity(futureName, currentName);
      return similarity >= 0.8; // 80% similarity threshold
    });
    
    if (bestMatch) {
      matchCount++;
    }
    
    matches.push({
      futureName: futureResident.name,
      currentName: bestMatch?.name || 'No match',
      isMatch: !!bestMatch
    });
  }
  
  const matchPercentage = matchCount / Math.max(futureResidents.length, currentResidents.length);
  
  return { matchPercentage, matches };
}

/**
 * Simple string similarity calculation (Jaccard similarity)
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const set1 = new Set(str1.split(''));
  const set2 = new Set(str2.split(''));
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

/**
 * Inherits verification data from a master verification to a new lease
 */
export async function inheritVerification(
  masterVerificationId: string,
  newLeaseId: string,
  continuityId: string
): Promise<string> {
  const masterVerification = await prisma.incomeVerification.findUnique({
    where: { id: masterVerificationId },
    include: {
      IncomeDocument: true,
      Lease: {
        include: {
          Resident: true
        }
      }
    }
  });
  
  if (!masterVerification) {
    throw new Error(`Master verification ${masterVerificationId} not found`);
  }
  
  console.log(`[CONTINUITY] Inheriting verification from ${masterVerificationId} to lease ${newLeaseId}`);
  
  // Create new verification for the new lease
  const newVerification = await prisma.incomeVerification.create({
    data: {
      id: randomUUID(),
      status: masterVerification.status,
      leaseId: newLeaseId,
      verificationContinuityId: continuityId,
      calculatedVerifiedIncome: masterVerification.calculatedVerifiedIncome,
      finalizedAt: masterVerification.finalizedAt,
      associatedLeaseEnd: masterVerification.associatedLeaseEnd,
      associatedLeaseStart: masterVerification.associatedLeaseStart,
      dueDate: masterVerification.dueDate,
      leaseYear: masterVerification.leaseYear,
      reason: masterVerification.reason,
      verificationPeriodEnd: masterVerification.verificationPeriodEnd,
      verificationPeriodStart: masterVerification.verificationPeriodStart
    }
  });
  
  // Get residents from the new lease
  const newLeaseResidents = await prisma.resident.findMany({
    where: { leaseId: newLeaseId }
  });
  
  // Link existing documents to new verification (no file duplication)
  for (const doc of masterVerification.IncomeDocument) {
    // Find corresponding resident in new lease by name
    const masterResident = masterVerification.Lease.Resident.find((r: any) => r.id === doc.residentId);
    const newResident = newLeaseResidents.find((r: any) => 
      r.name.trim().toLowerCase() === masterResident?.name.trim().toLowerCase()
    );
    
    if (newResident && masterResident) {
      await prisma.incomeDocument.create({
        data: {
          id: randomUUID(),
          documentType: doc.documentType,
          documentDate: doc.documentDate,
          uploadDate: doc.uploadDate,
          status: doc.status,
          filePath: doc.filePath, // Same file path - no duplication!
          verificationId: newVerification.id,
          residentId: newResident.id,
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
          calculatedAnnualizedIncome: doc.calculatedAnnualizedIncome
        }
      });
      
      console.log(`[CONTINUITY] Inherited document ${doc.id} for resident ${newResident.name}`);
    }
  }
  
  // Update resident finalization status
  for (const newResident of newLeaseResidents) {
    const masterResident = masterVerification.Lease.Resident.find((r: any) => 
      r.name.trim().toLowerCase() === newResident.name.trim().toLowerCase()
    );
    
    if (masterResident) {
      await prisma.resident.update({
        where: { id: newResident.id },
        data: {
          incomeFinalized: masterResident.incomeFinalized,
          hasNoIncome: masterResident.hasNoIncome,
          calculatedAnnualizedIncome: masterResident.calculatedAnnualizedIncome,
          finalizedAt: masterResident.finalizedAt
        }
      });
      
      console.log(`[CONTINUITY] Updated resident ${newResident.name} finalization status`);
    }
  }
  
  return newVerification.id;
}

/**
 * Sets a verification as the master verification for its continuity
 */
export async function setMasterVerification(
  verificationId: string,
  continuityId: string
): Promise<void> {
  await prisma.verificationContinuity.update({
    where: { id: continuityId },
    data: { masterVerificationId: verificationId }
  });
  
  console.log(`[CONTINUITY] Set verification ${verificationId} as master for continuity ${continuityId}`);
}

/**
 * Gets all rent rolls (snapshots) for a property
 */
export async function getPropertySnapshots(propertyId: string) {
  return await prisma.rentRoll.findMany({
    where: { propertyId },
    orderBy: { date: 'desc' },
    select: {
      id: true,
      date: true,
      createdAt: true
    }
  });
} 

/**
 * Handles user's choice to accept previously verified income during reconciliation
 */
export async function acceptPreviouslyVerifiedIncome(
  continuityId: string,
  structuralContinuityId: string,
  newLeaseId: string
): Promise<string> {
  // Get the structural continuity (the one with verified income)
  const structuralContinuity = await prisma.verificationContinuity.findUnique({
    where: { id: structuralContinuityId },
    include: {
      masterVerification: true
    }
  });
  
  if (!structuralContinuity?.masterVerificationId) {
    throw new Error('No master verification found for structural continuity');
  }
  
  // Inherit the verification to the new lease
  const newVerificationId = await inheritVerification(
    structuralContinuity.masterVerificationId,
    newLeaseId,
    continuityId
  );
  
  // Set this as the master verification for the new continuity
  await setMasterVerification(newVerificationId, continuityId);
  
  // Update resident incomes to match verified amounts
  await updateResidentIncomesToVerified(newLeaseId, structuralContinuity.masterVerificationId);
  
  console.log(`[CONTINUITY] Accepted previously verified income for lease ${newLeaseId}`);
  
  return newVerificationId;
}

/**
 * Updates resident incomes in the new lease to match verified amounts
 */
async function updateResidentIncomesToVerified(
  newLeaseId: string,
  masterVerificationId: string
): Promise<void> {
  const masterVerification = await prisma.incomeVerification.findUnique({
    where: { id: masterVerificationId },
    include: {
      Lease: {
        include: {
          Resident: true
        }
      }
    }
  });
  
  if (!masterVerification) return;
  
  const newLeaseResidents = await prisma.resident.findMany({
    where: { leaseId: newLeaseId }
  });
  
  for (const newResident of newLeaseResidents) {
    const verifiedResident = masterVerification.Lease.Resident.find((r: any) => 
      r.name.trim().toLowerCase() === newResident.name.trim().toLowerCase()
    );
    
    if (verifiedResident && verifiedResident.calculatedAnnualizedIncome) {
      await prisma.resident.update({
        where: { id: newResident.id },
        data: {
          annualizedIncome: verifiedResident.calculatedAnnualizedIncome,
          calculatedAnnualizedIncome: verifiedResident.calculatedAnnualizedIncome,
          incomeFinalized: verifiedResident.incomeFinalized,
          hasNoIncome: verifiedResident.hasNoIncome,
          finalizedAt: verifiedResident.finalizedAt
        }
      });
      
      console.log(`[CONTINUITY] Updated ${newResident.name} income to verified amount: $${verifiedResident.calculatedAnnualizedIncome}`);
    }
  }
} 