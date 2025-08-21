import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { 
  handleVerificationContinuity, 
  inheritVerification,
  LeaseData 
} from '@/services/verificationContinuity';


// Income discrepancy detection function
interface IncomeDiscrepancy {
  unitNumber: string | number;
  residentName: string;
  verifiedIncome: number;
  newRentRollIncome: number;
  discrepancy: number;
  existingLeaseId: string;
  newLeaseId: string;
  existingResidentId: string;
  newResidentId: string;
}

async function checkForIncomeDiscrepancies(propertyId: string, rentRollId: string): Promise<IncomeDiscrepancy[]> {
  const discrepancies: IncomeDiscrepancy[] = [];
  
  // Get the new rent roll data
  const rentRoll = await prisma.rentRoll.findUnique({
    where: { id: rentRollId },
    include: {
      Tenancy: {
        include: {
          Lease: {
            include: {
              Resident: true,
              Unit: true
            }
          }
        }
      }
    }
  });

  if (!rentRoll) return discrepancies;

  // For each new tenancy, check if there are existing leases with verified income
  for (const tenancy of rentRoll.Tenancy) {
    const unit = tenancy.Lease.Unit;
    const newResidents = tenancy.Lease.Resident;
    
    // Get existing leases for this unit that have verified income
    const existingLeases = await prisma.lease.findMany({
      where: {
        unitId: unit.id,
        id: { not: tenancy.Lease.id }, // Exclude the new lease
        Resident: {
          some: {
            AND: [
              { incomeFinalized: true },
              { calculatedAnnualizedIncome: { not: null } }
            ]
          }
        }
      },
      include: {
        Resident: {
          where: {
            AND: [
              { incomeFinalized: true },
              { calculatedAnnualizedIncome: { not: null } }
            ]
          }
        }
      }
    });

    // Check for income discrepancies between new and verified residents
    for (const existingLease of existingLeases) {
      for (const existingResident of existingLease.Resident) {
        // Find matching resident by name in new lease
        const matchingNewResident = newResidents.find(
          (newRes: any) => newRes.name.toLowerCase().trim() === existingResident.name.toLowerCase().trim()
        );

                 if (matchingNewResident) {
           const verifiedIncome = Number(existingResident.calculatedAnnualizedIncome || 0);
           const newRentRollIncome = Number(matchingNewResident.annualizedIncome || 0);
           const discrepancy = Math.abs(verifiedIncome - newRentRollIncome);
          
          // If discrepancy is greater than $1, flag it
          if (discrepancy > 1.00) {
            discrepancies.push({
              unitNumber: unit.unitNumber,
              residentName: existingResident.name,
              verifiedIncome: verifiedIncome,
              newRentRollIncome: newRentRollIncome,
              discrepancy: discrepancy,
              existingLeaseId: existingLease.id,
              newLeaseId: tenancy.Lease.id,
              existingResidentId: existingResident.id,
              newResidentId: matchingNewResident.id
            });

            console.log(`[COMPLIANCE DISCREPANCY] Unit ${unit.unitNumber}, ${existingResident.name}: Verified $${verifiedIncome} vs New Rent Roll $${newRentRollIncome} (diff: $${discrepancy})`);
          }
        }
      }
    }
  }

  return discrepancies;
}

interface TenancyData {
  id: string;
  rentRollId: string;
  unitId: string;
  leaseRent: number;
  leaseStartDate: Date;
  leaseEndDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface ResidentData {
  id: string;
  tenancyId: string;
  name: string;
  annualizedIncome: number;
  createdAt: Date;
  updatedAt: Date;
}
import { IndividualResidentData } from '@/types/compliance';


interface Unit {
  id: string;
  unitNumber: string | number;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // Workaround for Next.js 15 params bug
  const propertyId = req.nextUrl.pathname.split('/')[3];
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  if (!propertyId) {
    return NextResponse.json({ error: 'Property ID is required' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { rentRollDate, data } = body;

    if (!rentRollDate || !data || !Array.isArray(data)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    
    const property = await prisma.property.findFirst({
        where: { id: propertyId, ownerId: session.user.id },
        include: { Unit: true }
    });

    if (!property) {
        return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }
    
    const unitMap = new Map(property.Unit.map((u: any) => [parseInt(String(u.unitNumber), 10), u.id]));

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const newRentRoll = await tx.rentRoll.create({
        data: {
          id: randomUUID(),
          propertyId: propertyId,
          date: new Date(rentRollDate + 'T12:00:00.000Z'), // Force noon UTC to avoid timezone issues
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Group data by unit to optimize database operations
      const unitGroups = new Map<string, IndividualResidentData[]>();
      const notFoundUnits: string[] = [];

      for (const row of data as IndividualResidentData[]) {
        const unitNumber = parseInt(String(row.unit), 10);
        const unitId = unitMap.get(unitNumber);

        if (!unitId) {
          notFoundUnits.push(String(row.unit));
          continue;
        }

        // TypeScript assertion: unitId is definitely defined here
        const definedUnitId = unitId as string;
        if (!unitGroups.has(definedUnitId)) {
          unitGroups.set(definedUnitId, []);
        }
        unitGroups.get(definedUnitId)!.push(row);
      }
      
      if (notFoundUnits.length > 0) {
        // Use a Set to get unique unit numbers
        const uniqueNotFound = [...new Set(notFoundUnits)];
        throw new Error(`The following units could not be found: ${uniqueNotFound.join(', ')}. Please correct the data or update the master unit list.`);
      }

      // Prepare bulk data for batch inserts
      const leasesData: any[] = [];
      const tenanciesData: any[] = [];
      const residentsData: any[] = [];
      
      for (const [unitId, rows] of unitGroups.entries()) {
        // Get rent amount from first row (all rows for same unit should have same rent)
        const rentValue = parseFloat(String(rows[0].rent || '0').replace(/[^0-9.-]+/g,""));
        const { leaseStartDate, leaseEndDate } = rows[0];

        if (!leaseStartDate || !leaseEndDate) {
          throw new Error(`Lease start and end dates are required for unit ${rows[0].unit}.`);
        }
        
        // Process each lease normally

        let leaseId: string;
        const tenancyId: string = `tenancy_${Date.now().toString()}_${unitId}`;
        
        // Check if a lease with the same dates already exists for this unit
        const existingLease = await tx.lease.findFirst({
          where: {
            unitId: unitId,
            leaseStartDate: new Date(leaseStartDate),
            leaseEndDate: new Date(leaseEndDate),
          }
        });
        
        if (existingLease) {
          // Use existing lease if dates match
          leaseId = existingLease.id;
          console.log(`[COMPLIANCE UPDATE] Using existing lease ${leaseId} for unit ${unitId} with dates ${leaseStartDate} to ${leaseEndDate}`);
          
          // Update rent if it has changed
          const existingRentValue = existingLease.leaseRent ? Number(existingLease.leaseRent) : 0;
          if (existingRentValue !== rentValue) {
            await tx.lease.update({
              where: { id: existingLease.id },
              data: { leaseRent: rentValue }
            });
            console.log(`[COMPLIANCE UPDATE] Updated rent for lease ${leaseId} from ${existingRentValue} to ${rentValue}`);
          }
        } else {
          // Create new lease only if dates are different
          const timestamp = Date.now().toString();
          leaseId = `lease_${timestamp}_${unitId}`;
          console.log(`[COMPLIANCE UPDATE] Creating new lease ${leaseId} for unit ${unitId} with dates ${leaseStartDate} to ${leaseEndDate}`);
          
          leasesData.push({
            id: leaseId,
            name: `Lease from ${new Date(leaseStartDate).toLocaleDateString()} to ${new Date(leaseEndDate).toLocaleDateString()}`,
            unitId: unitId,
            leaseRent: rentValue,
            leaseStartDate: new Date(leaseStartDate),
            leaseEndDate: new Date(leaseEndDate),
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
        
        // Tenancy ID already generated above
        
        // Create tenancy data (links lease to rent roll)
        // Only create tenancy if lease STARTED on or before rent roll date
        const rentRollDate = new Date(newRentRoll.date);
        const leaseStart = new Date(leaseStartDate);
        
        if (leaseStart <= rentRollDate) {
          // Check if tenancy already exists for this lease and rent roll
          const existingTenancy = await tx.tenancy.findFirst({
            where: {
              leaseId: leaseId,
              rentRollId: newRentRoll.id,
            }
          });
          
          if (!existingTenancy) {
            // Lease started on/before rent roll date - create tenancy
            // This includes active leases AND month-to-month (expired lease but still in rent roll)
            tenanciesData.push({
              id: tenancyId,
              rentRollId: newRentRoll.id,
              leaseId: leaseId,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            console.log(`[COMPLIANCE UPDATE] Creating new tenancy ${tenancyId} for lease ${leaseId} and rent roll ${newRentRoll.id}`);
          } else {
            console.log(`[COMPLIANCE UPDATE] Tenancy already exists for lease ${leaseId} and rent roll ${newRentRoll.id}`);
          }
        }
        // Note: Only leases with start dates AFTER rent roll date are "future leases"
        
        // Delete existing residents that were created for this rent roll upload session
        // We identify them by creation time - delete residents created in the last 5 minutes
        // This preserves historical residents from previous rent roll uploads
        const sessionStartTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
        const deletedResidents = await tx.resident.deleteMany({
          where: {
            leaseId: leaseId,
            createdAt: {
              gte: sessionStartTime
            }
          }
        });
        console.log(`[COMPLIANCE UPDATE] Deleted ${deletedResidents.count} recent residents from lease ${leaseId} for unit ${unitId}`);

        // Create residents data for this lease
        for (const row of rows) {
          const timestamp = Date.now().toString();
          const randomSuffix = Math.random().toString(36).substr(2, 9);
          
          // For future leases (start date after rent roll date), don't assign rent roll income
          // since these leases haven't started yet and the income is prospective
          const isFutureLease = leaseStart > rentRollDate;
          
          residentsData.push({
            id: `resident_${timestamp}_${randomSuffix}`,
            leaseId: leaseId, // Updated to reference lease instead of tenancy
            name: row.resident,
            annualizedIncome: isFutureLease ? 0 : (Number(row.totalIncome) || 0),
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }

      // Perform batch inserts (order is important due to foreign key relationships)
      if (leasesData.length > 0) {
        await tx.lease.createMany({
          data: leasesData
        });
      }
      
      if (tenanciesData.length > 0) {
        await tx.tenancy.createMany({
          data: tenanciesData
        });
      }
      
      if (residentsData.length > 0) {
        await tx.resident.createMany({
          data: residentsData
        });
      }
      
      // Process verification continuity for each lease
      console.log('[CONTINUITY] Processing verification continuity for all leases...');
      const continuityResults = [];
      
      for (const [unitId, rows] of unitGroups.entries()) {
        const rentValue = parseFloat(String(rows[0].rent || '0').replace(/[^0-9.-]+/g,""));
        const { leaseStartDate, leaseEndDate } = rows[0];
        
        // Find the lease ID for this unit (either existing or newly created)
        let leaseId: string;
        
        if (!leaseStartDate || !leaseEndDate) {
          console.log(`[CONTINUITY] Missing lease dates for unit ${unitId}, skipping continuity processing`);
          continue;
        }
        
        const existingLease = await tx.lease.findFirst({
          where: {
            unitId: unitId,
            leaseStartDate: new Date(leaseStartDate),
            leaseEndDate: new Date(leaseEndDate),
          }
        });
        
        if (existingLease) {
          leaseId = existingLease.id;
        } else {
          // Find in the newly created leases
          const newLease = leasesData.find(l => l.unitId === unitId);
          leaseId = newLease?.id;
        }
        
        if (!leaseId) {
          console.log(`[CONTINUITY] Could not find lease for unit ${unitId}, skipping continuity processing`);
          continue;
        }
        
        // Get residents for this lease
        const leaseResidents = residentsData.filter(r => r.leaseId === leaseId);
        
        // Prepare lease data for continuity processing
        const leaseData: LeaseData = {
          id: leaseId,
          leaseStartDate: new Date(leaseStartDate),
          leaseEndDate: new Date(leaseEndDate),
          leaseRent: rentValue,
          residents: leaseResidents.map(r => ({
            name: r.name,
            annualizedIncome: r.annualizedIncome
          }))
        };
        
        // Handle verification continuity
        const continuityResult = await handleVerificationContinuity(
          propertyId,
          unitId,
          leaseData,
          newRentRoll.id
        );
        
        // Handle verification inheritance or flag discrepancies
        if (continuityResult.shouldInheritVerification && continuityResult.masterVerificationId) {
          console.log(`[CONTINUITY] Inheriting verification for lease ${leaseId} from master ${continuityResult.masterVerificationId}`);
          await inheritVerification(
            continuityResult.masterVerificationId,
            leaseId,
            continuityResult.continuityId
          );
        } else if (continuityResult.hasIncomeDiscrepancies) {
          console.log(`[CONTINUITY] Income discrepancies detected for lease ${leaseId} - will require user reconciliation`);
          continuityResults.push({
            unitId,
            leaseId,
            hasDiscrepancies: true,
            discrepancies: continuityResult.incomeDiscrepancies,
            futureLeaseMatch: continuityResult.futureLeaseMatch
          });
        } else if (continuityResult.requiresManualReview) {
          console.log(`[CONTINUITY] Future lease match requires manual review for lease ${leaseId}`);
          continuityResults.push({
            unitId,
            leaseId,
            requiresManualReview: true,
            futureLeaseMatch: continuityResult.futureLeaseMatch
          });
        } else {
          console.log(`[CONTINUITY] No verification to inherit for lease ${leaseId}`);
        }
      }
      
      return { 
        rentRollId: newRentRoll.id,
        continuityResults
      };
    }, {
      timeout: 60000, // Increase timeout to 60 seconds
    });

    // After creating the rent roll, check for income discrepancies
    const regularDiscrepancies = await checkForIncomeDiscrepancies(propertyId, result.rentRollId);
    
    const hasIncomeDiscrepancies = result.continuityResults.some((r: any) => r.hasDiscrepancies);
    
    return NextResponse.json({
        message: 'Compliance data updated successfully.',
        rentRollId: result.rentRollId,
        hasDiscrepancies: regularDiscrepancies.length > 0,
        discrepancies: regularDiscrepancies.length > 0 ? regularDiscrepancies : undefined,
        requiresReconciliation: regularDiscrepancies.length > 0,
        hasIncomeDiscrepancies,
        incomeDiscrepancies: hasIncomeDiscrepancies ? result.continuityResults.filter((r: any) => r.hasDiscrepancies) : undefined,
        requiresIncomeReconciliation: hasIncomeDiscrepancies
    });

  } catch (error: unknown) {
    console.error('Finalize error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('The following units could not be found') || errorMessage.includes('Lease start and end dates are required')) {
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
} 