import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';

interface LeaseData {
  unitId: string;
  unitNumber: string;
  leaseStartDate?: string;
  leaseEndDate?: string;
  leaseRent?: number;
  residents: Array<{
    name: string;
    annualizedIncome?: string;
  }>;
}

interface UnitGroup {
  [unitId: string]: LeaseData[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: propertyId } = await params;
    const body = await request.json();
    const { unitGroups, filename, rentRollDate } = body;

    console.log(`🚀 [COMPLIANCE UPDATE] ===== PHASE 1: CREATE SNAPSHOT & CHECK INHERITANCE =====`);
    console.log(`🚀 [COMPLIANCE UPDATE] Property: ${propertyId}`);
    console.log(`🚀 [COMPLIANCE UPDATE] Rent roll date: ${rentRollDate}`);

    const reportDate = rentRollDate ? new Date(rentRollDate) : new Date();

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // STEP 1: Get ALL existing future leases for snapshot preservation
      const existingFutureLeases = await tx.lease.findMany({
        where: {
          Unit: {
            propertyId: propertyId
          },
          Tenancy: null, // Future leases don't have Tenancy records
          NOT: {
            name: {
              startsWith: '[PROCESSED]' // Exclude already processed leases
            }
          }
          // NOTE: We preserve ALL future leases in snapshots, not just those with finalized verifications
          // The finalized verification check is only used later for inheritance matching
        },
        include: {
          Unit: true,
          Resident: {
            include: {
              IncomeDocument: true
            }
          },
          IncomeVerification: {
            where: {
              status: 'FINALIZED'
            }
          }
        }
      });

      console.log(`[COMPLIANCE UPDATE] 🔍 Found ${existingFutureLeases.length} existing future leases with finalized verifications`);

      // STEP 2: Create snapshot of current state (BEFORE processing new data)
      const snapshot = await tx.rentRollSnapshot.create({
        data: {
          id: randomUUID(),
          propertyId,
          filename: filename || `Upload ${reportDate.toLocaleDateString()}`,
          uploadDate: reportDate,
          isActive: true
        }
      });

      console.log(`[COMPLIANCE UPDATE] ✅ Created snapshot ${snapshot.id}`);

      // Deactivate previous snapshots
      await tx.rentRollSnapshot.updateMany({
        where: {
          propertyId,
          id: { not: snapshot.id }
        },
        data: { isActive: false }
      });

      // STEP 3: Preserve existing future leases in this snapshot (freeze current state)
      console.log(`[COMPLIANCE UPDATE] 🔄 Preserving ${existingFutureLeases.length} future leases in snapshot`);
      
      for (const futureLease of existingFutureLeases) {
        console.log(`[COMPLIANCE UPDATE] 📋 Preserving future lease: "${futureLease.name}" in unit ${futureLease.Unit.unitNumber}`);
        
        // Create a copy of the lease for this snapshot
        const newLeaseId = randomUUID();
        await tx.lease.create({
          data: {
            id: newLeaseId,
            name: futureLease.name,
            leaseStartDate: futureLease.leaseStartDate,
            leaseEndDate: futureLease.leaseEndDate,
            leaseRent: futureLease.leaseRent,
            unitId: futureLease.unitId,
            createdAt: futureLease.createdAt, // Preserve original creation date
            updatedAt: new Date()
          }
        });

        // Copy income verifications for this lease
        const verificationMap = new Map<string, string>();
        for (const verification of futureLease.IncomeVerification) {
          const newVerificationId = randomUUID();
          await tx.incomeVerification.create({
            data: {
              id: newVerificationId,
              status: verification.status,
              createdAt: verification.createdAt,
              updatedAt: new Date(),
              finalizedAt: verification.finalizedAt,
              calculatedVerifiedIncome: verification.calculatedVerifiedIncome,
              associatedLeaseEnd: verification.associatedLeaseEnd,
              associatedLeaseStart: verification.associatedLeaseStart,
              dueDate: verification.dueDate,
              leaseYear: verification.leaseYear,
              reason: verification.reason,
              reminderSentAt: verification.reminderSentAt,
              verificationPeriodEnd: verification.verificationPeriodEnd,
              verificationPeriodStart: verification.verificationPeriodStart,
              leaseId: newLeaseId
            }
          });
          verificationMap.set(verification.id, newVerificationId);
        }

        // Copy residents for this lease
        for (const resident of futureLease.Resident) {
          const newResidentId = randomUUID();
          
          // Check if this resident has a finalized income verification
          const hasFinalized = futureLease.IncomeVerification.some(verification => 
            verification.status === 'FINALIZED'
          );
          
          await tx.resident.create({
            data: {
              id: newResidentId,
              name: resident.name,
              verifiedIncome: resident.verifiedIncome,
              annualizedIncome: resident.annualizedIncome,
              calculatedAnnualizedIncome: resident.calculatedAnnualizedIncome,
              incomeFinalized: hasFinalized ? true : resident.incomeFinalized, // Fix: Set to true if verification is finalized
              hasNoIncome: resident.hasNoIncome,
              finalizedAt: hasFinalized && !resident.finalizedAt ? new Date() : resident.finalizedAt, // Set finalizedAt if missing
              leaseId: newLeaseId,
              createdAt: resident.createdAt,
              updatedAt: new Date()
            }
          });

          // Create document references (not copies) for this resident
          const existingDocuments = await tx.incomeDocument.findMany({
            where: { residentId: resident.id }
          });
          
          for (const doc of existingDocuments) {
            const newVerificationId = verificationMap.get(doc.verificationId || '');
            await tx.incomeDocument.create({
              data: {
                id: randomUUID(),
                documentType: doc.documentType,
                documentDate: doc.documentDate,
                uploadDate: doc.uploadDate,
                status: doc.status,
                filePath: doc.filePath, // Reference same file, don't copy
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
                verificationId: newVerificationId || doc.verificationId,
                residentId: newResidentId
              }
            });
          }
        }
      }

      // STEP 4: Analyze new data for inheritance matches (without importing it yet)
      console.log(`[COMPLIANCE UPDATE] 🔍 Analyzing new data for inheritance matches`);
      console.log(`[COMPLIANCE UPDATE] 🔍 unitGroups keys:`, Object.keys(unitGroups || {}));
      
      // Check specifically for unit 0103
      const hasUnit0103 = Object.keys(unitGroups || {}).includes('0103');
      console.log(`[COMPLIANCE UPDATE] 🎯 Unit 0103 in unitGroups: ${hasUnit0103}`);
      
      if (hasUnit0103) {
        console.log(`[COMPLIANCE UPDATE] 🎯 Unit 0103 data:`, JSON.stringify((unitGroups as any)['0103'], null, 2));
      }
      
      // Check existing future leases for unit 0103
      const existingFutureLeaseFor0103 = existingFutureLeases.find(lease => 
        lease.Unit.unitNumber === '0103'
      );
      console.log(`[COMPLIANCE UPDATE] 🎯 Existing future lease for 0103:`, existingFutureLeaseFor0103 ? 'YES' : 'NO');
      
      if (existingFutureLeaseFor0103) {
        console.log(`[COMPLIANCE UPDATE] 🎯 Existing 0103 lease dates: ${existingFutureLeaseFor0103.leaseStartDate} to ${existingFutureLeaseFor0103.leaseEndDate}`);
      }
      
      const futureLeaseMatches: any[] = [];

      for (const [unitId, leases] of Object.entries(unitGroups as UnitGroup)) {
        for (const leaseData of leases) {
          const unitNumber = leaseData.unitNumber;
          console.log(`[COMPLIANCE UPDATE] 🔄 Processing unit ${unitNumber} for inheritance matching`);
          
          // Check if there's an existing future lease for this unit WITH finalized verifications
          // (only these should trigger inheritance modals)
          const existingFutureLeaseForUnit = existingFutureLeases.find(lease => 
            lease.Unit.unitNumber === unitNumber &&
            lease.IncomeVerification.some(verification => verification.status === 'FINALIZED')
          );

          if (existingFutureLeaseForUnit) {
            console.log(`[COMPLIANCE UPDATE] ✅ Found existing future lease for unit ${unitNumber}: "${existingFutureLeaseForUnit.name}"`);
            
            // Parse new lease dates
            let leaseStartDate: Date | null = null;
            let leaseEndDate: Date | null = null;

            if (leaseData.leaseStartDate) {
              leaseStartDate = new Date(leaseData.leaseStartDate);
            }
            if (leaseData.leaseEndDate) {
              leaseEndDate = new Date(leaseData.leaseEndDate);
            }

            console.log(`[COMPLIANCE UPDATE] 📅 New lease for unit ${unitNumber}:`);
            console.log(`[COMPLIANCE UPDATE] - Start: ${leaseStartDate?.toISOString() || 'null'}`);
            console.log(`[COMPLIANCE UPDATE] - End: ${leaseEndDate?.toISOString() || 'null'}`);

            // CRITICAL: We need to compare the new lease dates to the CURRENT lease dates
            // from the previous snapshot, NOT to the future lease dates (which are often null).
            // Find the current lease for this unit from the most recent rent roll before this upload.
            
            // Query the current lease from the most recent rent roll for this unit
            const currentLeaseForUnit = await tx.lease.findFirst({
              where: {
                Unit: {
                  unitNumber: unitNumber,
                  propertyId: propertyId
                },
                Tenancy: {
                  RentRoll: {
                    propertyId: propertyId
                  }
                }
              },
              include: {
                Tenancy: {
                  include: {
                    RentRoll: true
                  }
                }
              },
              orderBy: {
                createdAt: 'desc'
              }
            });

            let shouldTriggerModal = true; // Default to showing modal

            if (currentLeaseForUnit) {
              const currentStartTime = currentLeaseForUnit.leaseStartDate?.getTime();
              const currentEndTime = currentLeaseForUnit.leaseEndDate?.getTime();
              const newStartTime = leaseStartDate?.getTime();
              const newEndTime = leaseEndDate?.getTime();

              console.log(`[COMPLIANCE UPDATE] 🔍 Comparing new lease to CURRENT lease (not future lease):`);
              console.log(`[COMPLIANCE UPDATE] - Current lease: ${currentLeaseForUnit.leaseStartDate?.toISOString() || 'null'} to ${currentLeaseForUnit.leaseEndDate?.toISOString() || 'null'}`);
              console.log(`[COMPLIANCE UPDATE] - New lease: ${leaseStartDate?.toISOString() || 'null'} to ${leaseEndDate?.toISOString() || 'null'}`);

              const datesAreIdentical = currentStartTime === newStartTime && currentEndTime === newEndTime;
              shouldTriggerModal = !datesAreIdentical;

              if (datesAreIdentical) {
                console.log(`[COMPLIANCE UPDATE] ✅ New lease dates match current lease - same lease continuing. Future lease will carry forward automatically.`);
              } else {
                console.log(`[COMPLIANCE UPDATE] 🎯 New lease dates differ from current lease - inheritance decision needed.`);
              }
            } else {
              console.log(`[COMPLIANCE UPDATE] ⚠️ No current lease found for unit ${unitNumber} - will show inheritance modal by default.`);
            }

            if (!shouldTriggerModal) {
              console.log(`[COMPLIANCE UPDATE] ✅ Lease dates are identical - this is the same lease continuing. No inheritance modal needed for unit ${unitNumber}`);
              // Skip adding to futureLeaseMatches - the lease will automatically carry forward in snapshot preservation
            } else {
              console.log(`[COMPLIANCE UPDATE] 🎯 Lease dates have changed - inheritance decision needed for unit ${unitNumber}`);
              
              const residents = existingFutureLeaseForUnit.Resident.map(r => ({
                id: r.id,
                name: r.name,
                verifiedIncome: r.calculatedAnnualizedIncome ? parseFloat(r.calculatedAnnualizedIncome.toString()) : 0
              }));

              futureLeaseMatches.push({
                unitNumber,
                newLeaseStartDate: leaseData.leaseStartDate,
                newLeaseEndDate: leaseData.leaseEndDate,
                existingFutureLease: {
                  id: existingFutureLeaseForUnit.id,
                  name: existingFutureLeaseForUnit.name,
                  leaseStartDate: existingFutureLeaseForUnit.leaseStartDate,
                  leaseEndDate: existingFutureLeaseForUnit.leaseEndDate,
                  residents: residents
                }
              });

              console.log(`[COMPLIANCE UPDATE] ✅ Added inheritance match for unit ${unitNumber}`);
            }
          }
        }
      }

      // Add debug info to response so we can see it in browser network tab
      const debugInfo = {
        unit0103InUnitGroups: Object.keys(unitGroups || {}).includes('0103'),
        unit0103Data: (unitGroups as any)['0103'] || null,
        existingFutureLeaseFor0103: existingFutureLeases.find(lease => 
          lease.Unit.unitNumber === '0103'
        ) ? {
          leaseStartDate: existingFutureLeases.find(lease => lease.Unit.unitNumber === '0103')?.leaseStartDate,
          leaseEndDate: existingFutureLeases.find(lease => lease.Unit.unitNumber === '0103')?.leaseEndDate,
          name: existingFutureLeases.find(lease => lease.Unit.unitNumber === '0103')?.name
        } : null,
        totalExistingFutureLeases: existingFutureLeases.length,
        unitGroupsKeys: Object.keys(unitGroups || {})
      };

      return {
        success: true,
        snapshotId: snapshot.id,
        hasFutureLeaseMatches: futureLeaseMatches.length > 0,
        futureLeaseMatches: futureLeaseMatches,
        requiresInheritanceDecision: futureLeaseMatches.length > 0,
        message: futureLeaseMatches.length > 0 
          ? `Snapshot created. Found ${futureLeaseMatches.length} potential inheritance matches. Please make inheritance decisions before importing data.`
          : 'Snapshot created successfully. No inheritance matches found. Ready to import data.',
        debugInfo: debugInfo // Add debug info to response
      };
    });

    console.log(`[COMPLIANCE UPDATE] ✅ Phase 1 completed:`, result);
    return NextResponse.json(result);

  } catch (error) {
    console.error('❌ [COMPLIANCE UPDATE] Error in Phase 1:', error);
    return NextResponse.json(
      { error: 'Failed to create snapshot and check inheritance', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}