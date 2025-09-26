/**
 * Lease Inheritance Service
 * 
 * Implements the comprehensive inheritance decision tree for compliance uploads:
 * 
 * 1. Current lease unchanged + no future lease → Auto-inherit status/docs
 * 2. Current lease unchanged + has future lease → Auto-inherit current + ask about future
 * 3. Current lease changed + had future lease → Ask if new current = old future
 * 4. New units → Create fresh leases
 */

import { PrismaClient, Lease, Resident, IncomeVerification, IncomeDocument } from '@prisma/client';

export interface LeaseWithDetails extends Lease {
  Resident: (Resident & {
    IncomeDocument: IncomeDocument[];
  })[];
  IncomeVerification: IncomeVerification[];
}

export interface InheritanceDecision {
  unitNumber: string;
  scenario: 'AUTO_INHERIT_CURRENT' | 'AUTO_INHERIT_CURRENT_ASK_FUTURE' | 'ASK_FUTURE_TO_CURRENT' | 'NEW_UNIT';
  previousCurrentLease?: LeaseWithDetails;
  previousFutureLease?: LeaseWithDetails;
  newLeaseData: any;
  requiresUserDecision: boolean;
  autoInheritFrom?: string; // lease ID to inherit from
  userPrompt?: string;
}

export interface InheritanceAnalysis {
  decisions: InheritanceDecision[];
  requiresUserInput: boolean;
  autoInheritCount: number;
  userDecisionCount: number;
}

/**
 * Analyzes inheritance scenarios for a compliance upload
 */
export async function analyzeInheritanceScenarios(
  prisma: PrismaClient,
  propertyId: string,
  previousRentRollId: string,
  newRentRollData: { [unitNumber: string]: any[] }
): Promise<InheritanceAnalysis> {
  
  console.log(`[INHERITANCE] Analyzing inheritance scenarios for property ${propertyId}`);
  console.log(`[INHERITANCE] Previous rent roll: ${previousRentRollId}`);
  console.log(`[INHERITANCE] New units: ${Object.keys(newRentRollData).length}`);

  // Get all leases from the previous snapshot
  const previousLeases = await prisma.lease.findMany({
    where: {
      Unit: { propertyId },
      Tenancy: { rentRollId: previousRentRollId }
    },
    include: {
      Unit: true,
      Resident: {
        include: {
          IncomeDocument: true
        }
      },
      IncomeVerification: true,
      Tenancy: {
        include: {
          RentRoll: true
        }
      }
    }
  });

  console.log(`[INHERITANCE] Found ${previousLeases.length} leases in previous snapshot`);

  // Group previous leases by unit and type
  const previousLeasesByUnit = new Map<string, {
    current?: LeaseWithDetails;
    future?: LeaseWithDetails;
  }>();

  for (const lease of previousLeases) {
    const unitNumber = lease.Unit.unitNumber;
    if (!previousLeasesByUnit.has(unitNumber)) {
      previousLeasesByUnit.set(unitNumber, {});
    }
    
    const unitLeases = previousLeasesByUnit.get(unitNumber)!;
    if (lease.leaseType === 'CURRENT') {
      unitLeases.current = lease as LeaseWithDetails;
    } else if (lease.leaseType === 'FUTURE') {
      unitLeases.future = lease as LeaseWithDetails;
    }
  }

  const decisions: InheritanceDecision[] = [];
  let requiresUserInput = false;
  let autoInheritCount = 0;
  let userDecisionCount = 0;

  // Analyze each unit in the new rent roll
  for (const [unitNumber, newLeases] of Object.entries(newRentRollData)) {
    const newLeaseData = newLeases[0]; // Assume one lease per unit for now
    const previousUnitLeases = previousLeasesByUnit.get(unitNumber);

    if (!previousUnitLeases) {
      // Scenario: New unit - no inheritance needed
      decisions.push({
        unitNumber,
        scenario: 'NEW_UNIT',
        newLeaseData,
        requiresUserDecision: false
      });
      continue;
    }

    const { current: prevCurrent, future: prevFuture } = previousUnitLeases;
    
    // Check if current lease is unchanged (same dates and residents)
    const currentLeaseUnchanged = prevCurrent && isLeaseUnchanged(prevCurrent, newLeaseData);

    if (currentLeaseUnchanged && !prevFuture) {
      // Scenario 1: Current lease unchanged + no future lease → Auto-inherit
      decisions.push({
        unitNumber,
        scenario: 'AUTO_INHERIT_CURRENT',
        previousCurrentLease: prevCurrent,
        newLeaseData,
        requiresUserDecision: false,
        autoInheritFrom: prevCurrent!.id
      });
      autoInheritCount++;
      
    } else if (currentLeaseUnchanged && prevFuture) {
      // Scenario 2: Current lease unchanged + has future lease → Auto-inherit current + ask about future
      decisions.push({
        unitNumber,
        scenario: 'AUTO_INHERIT_CURRENT_ASK_FUTURE',
        previousCurrentLease: prevCurrent,
        previousFutureLease: prevFuture,
        newLeaseData,
        requiresUserDecision: true,
        autoInheritFrom: prevCurrent!.id,
        userPrompt: `Unit ${unitNumber} has an unchanged current lease and a future lease "${prevFuture.name}". Would you like to carry the future lease forward to the new snapshot?`
      });
      requiresUserInput = true;
      userDecisionCount++;
      
    } else if (!currentLeaseUnchanged && prevFuture) {
      // Scenario 3: Current lease changed + had future lease → Ask if new current = old future
      decisions.push({
        unitNumber,
        scenario: 'ASK_FUTURE_TO_CURRENT',
        previousCurrentLease: prevCurrent,
        previousFutureLease: prevFuture,
        newLeaseData,
        requiresUserDecision: true,
        userPrompt: `Unit ${unitNumber} has a changed current lease and a previous future lease "${prevFuture.name}". Is the new current lease the same as the previous future lease?`
      });
      requiresUserInput = true;
      userDecisionCount++;
      
    } else {
      // Scenario 4: Current lease changed + no future lease → Create fresh
      decisions.push({
        unitNumber,
        scenario: 'NEW_UNIT',
        previousCurrentLease: prevCurrent,
        newLeaseData,
        requiresUserDecision: false
      });
    }
  }

  console.log(`[INHERITANCE] Analysis complete:`);
  console.log(`[INHERITANCE] - Auto-inherit: ${autoInheritCount}`);
  console.log(`[INHERITANCE] - User decisions: ${userDecisionCount}`);
  console.log(`[INHERITANCE] - Requires user input: ${requiresUserInput}`);

  return {
    decisions,
    requiresUserInput,
    autoInheritCount,
    userDecisionCount
  };
}

/**
 * Checks if a lease is unchanged between snapshots
 */
function isLeaseUnchanged(previousLease: LeaseWithDetails, newLeaseData: any): boolean {
  // Compare lease dates
  const prevStart = previousLease.leaseStartDate?.getTime();
  const prevEnd = previousLease.leaseEndDate?.getTime();
  const newStart = newLeaseData.leaseStartDate ? new Date(newLeaseData.leaseStartDate).getTime() : null;
  const newEnd = newLeaseData.leaseEndDate ? new Date(newLeaseData.leaseEndDate).getTime() : null;

  const datesMatch = prevStart === newStart && prevEnd === newEnd;

  // Compare residents (simplified - could be enhanced with fuzzy matching)
  const prevResidents = previousLease.Resident.map(r => r.name.toLowerCase().trim()).sort();
  const newResidents = (newLeaseData.residents || []).map((r: any) => r.name.toLowerCase().trim()).sort();
  
  const residentsMatch = prevResidents.length === newResidents.length &&
    prevResidents.every((name, index) => name === newResidents[index]);

  return datesMatch && residentsMatch;
}

/**
 * Executes inheritance decisions after user input
 */
export async function executeInheritanceDecisions(
  prisma: PrismaClient,
  decisions: InheritanceDecision[],
  userChoices: { [unitNumber: string]: boolean },
  newRentRollId: string
): Promise<void> {
  
  console.log(`[INHERITANCE] Executing inheritance decisions for ${decisions.length} units`);

  for (const decision of decisions) {
    const { unitNumber, scenario, autoInheritFrom } = decision;

    switch (scenario) {
      case 'AUTO_INHERIT_CURRENT':
        if (autoInheritFrom) {
          await inheritLeaseData(prisma, autoInheritFrom, newRentRollId, unitNumber, 'CURRENT');
        }
        break;

      case 'AUTO_INHERIT_CURRENT_ASK_FUTURE':
        // Always inherit current
        if (autoInheritFrom) {
          await inheritLeaseData(prisma, autoInheritFrom, newRentRollId, unitNumber, 'CURRENT');
        }
        
        // Inherit future if user chose to
        const carryForwardFuture = userChoices[unitNumber];
        if (carryForwardFuture && decision.previousFutureLease) {
          await inheritLeaseData(prisma, decision.previousFutureLease.id, newRentRollId, unitNumber, 'FUTURE');
        }
        break;

      case 'ASK_FUTURE_TO_CURRENT':
        const futureBecomeCurrent = userChoices[unitNumber];
        if (futureBecomeCurrent && decision.previousFutureLease) {
          // Inherit from future lease but make it current
          await inheritLeaseData(prisma, decision.previousFutureLease.id, newRentRollId, unitNumber, 'CURRENT');
        }
        // If not, the new lease will be created fresh
        break;

      case 'NEW_UNIT':
        // No inheritance - fresh lease will be created
        break;
    }
  }

  console.log(`[INHERITANCE] Inheritance execution completed`);
}

/**
 * Inherits lease data from one lease to another
 */
async function inheritLeaseData(
  prisma: PrismaClient,
  sourceLeaseId: string,
  targetRentRollId: string,
  unitNumber: string,
  targetLeaseType: 'CURRENT' | 'FUTURE'
): Promise<void> {
  
  console.log(`[INHERITANCE] Inheriting data from lease ${sourceLeaseId} to new ${targetLeaseType} lease for unit ${unitNumber}`);

  // This would contain the logic to copy verification data, documents, etc.
  // Implementation would be similar to the existing inheritance logic but cleaner
  
  // TODO: Implement the actual data copying logic
  // This is a placeholder for the comprehensive inheritance implementation
}
