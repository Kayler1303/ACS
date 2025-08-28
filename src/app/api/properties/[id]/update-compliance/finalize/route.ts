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

    console.error(`🚀 [COMPLIANCE UPDATE] ===== STARTING FINALIZE FOR PROPERTY ${propertyId} =====`);
    console.error(`🚀 [COMPLIANCE UPDATE] Received rentRollDate:`, rentRollDate);
    const startTime = Date.now();

    // Calculate report date outside the transaction
    const reportDate = rentRollDate ? new Date(rentRollDate) : new Date();
    console.log(`[COMPLIANCE UPDATE] Using report date:`, reportDate.toISOString());

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Get existing finalized residents from the most recent snapshot to preserve their status
      // We need to get from the most recent snapshot, not just the active one, since we're about to make a new snapshot active
      const mostRecentSnapshot = await tx.rentRollSnapshot.findFirst({
        where: {
          propertyId: propertyId
        },
        orderBy: {
          uploadDate: 'desc'
        }
      });

      const existingFinalizedResidents = mostRecentSnapshot ? await tx.resident.findMany({
        where: {
          Lease: {
            Unit: {
              propertyId: propertyId
            },
            Tenancy: {
              RentRoll: {
                snapshot: {
                  id: mostRecentSnapshot.id // Get residents from the most recent snapshot
                }
              }
            }
          },
          incomeFinalized: true,
          calculatedAnnualizedIncome: { not: null }
        },
        include: {
          Lease: {
            include: {
              Unit: true,
              Tenancy: {
                include: {
                  RentRoll: {
                    include: {
                      snapshot: true
                    }
                  }
                }
              }
            }
          },
          IncomeDocument: true // Include documents to link them to new residents
        }
      }) : []; // If no snapshots exist yet (new property), return empty array

      console.log(`[COMPLIANCE UPDATE] Most recent snapshot: ${mostRecentSnapshot?.id} (uploaded: ${mostRecentSnapshot?.uploadDate})`);
      console.log(`[COMPLIANCE UPDATE] Found ${existingFinalizedResidents.length} existing finalized residents to preserve`);

      console.log(`[COMPLIANCE UPDATE] 🔍 Income discrepancies are calculated on-the-fly, not stored in database`);

      // Get existing future leases (without Tenancy) that might need to be matched
      const existingFutureLeases = await tx.lease.findMany({
        where: {
          Unit: {
            propertyId: propertyId
          },
          Tenancy: null, // Future leases don't have Tenancy records
          IncomeVerification: {
            some: {
              status: 'FINALIZED' // Only consider leases with finalized verifications
            }
          }
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
      existingFutureLeases.forEach(lease => {
        console.log(`[COMPLIANCE UPDATE] 📋 Future lease: "${lease.name}" in unit ${lease.Unit.unitNumber}, Start: ${lease.leaseStartDate}, End: ${lease.leaseEndDate}, Residents: ${lease.Resident.length}, Verifications: ${lease.IncomeVerification.length}`);
      });



      // Create snapshot
      const snapshot = await tx.rentRollSnapshot.create({
        data: {
          id: randomUUID(),
          propertyId,
          filename: filename || `Upload ${reportDate.toLocaleDateString()}`,
          uploadDate: reportDate, // Use the user-specified report date
          isActive: true
        }
      });

      console.log(`[COMPLIANCE UPDATE] Created snapshot ${snapshot.id}`);

      // Deactivate previous snapshots
      await tx.rentRollSnapshot.updateMany({
        where: {
          propertyId,
          id: { not: snapshot.id }
        },
        data: { isActive: false }
      });

      // Create rent roll
      const newRentRoll = await tx.rentRoll.create({
        data: {
          id: randomUUID(),
          propertyId,
          snapshotId: snapshot.id,
          filename: filename || `Rent Roll ${reportDate.toLocaleDateString()}`,
          uploadDate: reportDate, // Use the user-specified report date
        },
      });

      console.log(`[COMPLIANCE UPDATE] Created rent roll ${newRentRoll.id}`);

      // STEP 1: Preserve existing future leases in this snapshot
      console.log(`[COMPLIANCE UPDATE] 🔄 Preserving existing future leases in new snapshot`);
      
      const preservedLeaseMap = new Map<string, string>(); // originalLeaseId -> newLeaseId
      const preservedResidentMap = new Map<string, string>(); // originalResidentId -> newResidentId
      
      for (const futureLease of existingFutureLeases) {
        console.log(`[COMPLIANCE UPDATE] 📋 Preserving future lease: "${futureLease.name}" in unit ${futureLease.Unit.unitNumber}`);
        
        // Create a copy of the lease for this snapshot
        const newLeaseId = randomUUID();
        const preservedLease = await tx.lease.create({
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
        
        preservedLeaseMap.set(futureLease.id, newLeaseId);
        console.log(`[COMPLIANCE UPDATE] ✅ Created preserved lease copy: ${newLeaseId}`);
        
        // Copy income verifications for this lease first (so we have the IDs for documents)
        const verificationMap = new Map<string, string>(); // originalVerificationId -> newVerificationId
        for (const verification of futureLease.IncomeVerification) {
          const newVerificationId = randomUUID();
          await tx.incomeVerification.create({
            data: {
              id: newVerificationId,
              status: verification.status,
              createdAt: verification.createdAt, // Preserve original creation date
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
          console.log(`[COMPLIANCE UPDATE] ✅ Created preserved verification copy: ${newVerificationId}`);
        }
        
        // Copy residents for this lease
        for (const resident of futureLease.Resident) {
          const newResidentId = randomUUID();
          const preservedResident = await tx.resident.create({
            data: {
              id: newResidentId,
              name: resident.name,
              verifiedIncome: resident.verifiedIncome,
              annualizedIncome: resident.annualizedIncome,
              calculatedAnnualizedIncome: resident.calculatedAnnualizedIncome,
              incomeFinalized: resident.incomeFinalized,
              leaseId: newLeaseId,
              createdAt: resident.createdAt, // Preserve original creation date
              updatedAt: new Date()
            }
          });
          
          preservedResidentMap.set(resident.id, newResidentId);
          console.log(`[COMPLIANCE UPDATE] ✅ Created preserved resident copy: ${newResidentId} for ${resident.name}`);
          
          // Create new document records that reference the original files but point to the new resident
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
                verificationId: newVerificationId || doc.verificationId, // Link to new verification or keep original
                residentId: newResidentId // Point to new resident
              }
            });
          }
          console.log(`[COMPLIANCE UPDATE] 🔗 Created ${existingDocuments.length} document references for preserved resident`);
        }
      }
      
      console.log(`[COMPLIANCE UPDATE] 🎯 Preserved ${existingFutureLeases.length} future leases in snapshot ${snapshot.id}`);

      // STEP 2: Process new rent roll data
      const leasesData: any[] = [];
      const tenanciesData: any[] = [];
      const residentsData: any[] = [];
      const incomeDocumentsData: any[] = [];
      // Note: Income discrepancies are now calculated by the dedicated income-discrepancies API
      const futureLeaseMatches: any[] = [];
      const rentRollDate = new Date();

      // Process each unit group
      if (!unitGroups || typeof unitGroups !== 'object') {
        throw new Error(`Invalid unitGroups data: ${typeof unitGroups}. Expected object but received: ${JSON.stringify(unitGroups)}`);
      }

      // First, create or find all Unit records
      const unitMap = new Map<string, string>(); // unitNumber -> unitId
      
      for (const [unitNumber, leases] of Object.entries(unitGroups as UnitGroup)) {
        // Create or find unit record
        let unit = await tx.unit.findFirst({
          where: {
            propertyId,
            unitNumber: unitNumber
          }
        });
        
        if (!unit) {
          unit = await tx.unit.create({
            data: {
              id: randomUUID(),
              unitNumber: unitNumber,
              propertyId,
              createdAt: new Date(),
              updatedAt: new Date(),
            }
          });
          console.log(`[COMPLIANCE UPDATE] Created unit ${unitNumber} with ID ${unit.id}`);
        } else {
          console.log(`[COMPLIANCE UPDATE] Found existing unit ${unitNumber} with ID ${unit.id}`);
        }
        
        unitMap.set(unitNumber, unit.id);
      }
      
      for (const [unitNumber, leases] of Object.entries(unitGroups as UnitGroup)) {
        const unitId = unitMap.get(unitNumber)!;
        console.log(`[COMPLIANCE UPDATE] Processing unit ${unitNumber} (ID: ${unitId}) with ${leases.length} leases`);

        for (const leaseData of leases) {
          const leaseId = `lease_${Date.now()}_${unitId}`;
          const tenancyId = `tenancy_${Date.now()}_${unitId}`;

          // Check if lease should be current (started on or before rent roll date)
          const leaseStartDate = leaseData.leaseStartDate ? new Date(leaseData.leaseStartDate) : null;
          const leaseEndDate = leaseData.leaseEndDate ? new Date(leaseData.leaseEndDate) : null;

          console.log(`[COMPLIANCE UPDATE] Creating lease ${leaseId} for unit ${unitNumber} (ID: ${unitId}) with dates ${leaseData.leaseStartDate} to ${leaseData.leaseEndDate}`);
          console.log(`[COMPLIANCE UPDATE] 🔍 RAW LEASE DATA:`, JSON.stringify(leaseData, null, 2));
          console.log(`[COMPLIANCE UPDATE] 📅 PARSED DATES: Start=${leaseStartDate?.toISOString()}, End=${leaseEndDate?.toISOString()}`);

          // Check for existing future lease matches 
          // But first, check if this lease already exists with the same dates (to avoid unnecessary prompts)
          const isNewLeaseFuture = leaseStartDate && leaseStartDate > rentRollDate;
          
          // Check if there's already a lease in this unit with the exact same dates
          const existingLeaseWithSameDates = await tx.lease.findFirst({
            where: {
              Unit: {
                propertyId: propertyId,
                unitNumber: unitNumber
              },
              leaseStartDate: leaseStartDate,
              leaseEndDate: leaseEndDate
            }
          });
          
          console.log(`[COMPLIANCE UPDATE] 🔍 Checking for lease matches in unit ${unitNumber}:`);
          console.log(`[COMPLIANCE UPDATE] - New lease dates: ${leaseStartDate} to ${leaseEndDate}`);
          console.log(`[COMPLIANCE UPDATE] - New lease is future: ${isNewLeaseFuture}`);
          console.log(`[COMPLIANCE UPDATE] - Existing lease with same dates found: ${!!existingLeaseWithSameDates}`);
          
          // If there's already a lease with the same dates, automatically inherit verified income
          if (existingLeaseWithSameDates) {
            console.log(`[COMPLIANCE UPDATE] ⏭️ Found existing lease with same dates: "${existingLeaseWithSameDates.name}"`);
            
            // Check if the existing lease has verified income that should be inherited
            const existingLeaseWithVerification = await tx.lease.findFirst({
              where: {
                id: existingLeaseWithSameDates.id
              },
              include: {
                Resident: {
                  where: {
                    incomeFinalized: true,
                    calculatedAnnualizedIncome: { not: null }
                  },
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
            
            if (existingLeaseWithVerification && existingLeaseWithVerification.Resident.length > 0) {
              console.log(`[COMPLIANCE UPDATE] 🔄 Automatically inheriting verified income from existing lease with same dates`);
              // The inheritance will happen in the resident creation loop below using existingFinalizedResidents
            } else {
              console.log(`[COMPLIANCE UPDATE] ℹ️ Existing lease with same dates has no verified income to inherit`);
            }
          } else {
            // Only check for future lease matches if no existing lease has the same dates
            const existingFutureLeaseForUnit = existingFutureLeases.find(futLease => 
              futLease.Unit.unitNumber === unitNumber
            );
            
            console.log(`[COMPLIANCE UPDATE] - Existing future lease found: ${!!existingFutureLeaseForUnit}`);
            
            if (existingFutureLeaseForUnit) {
            console.log(`[COMPLIANCE UPDATE] ✅ Found existing future lease: "${existingFutureLeaseForUnit.name}" with ${existingFutureLeaseForUnit.Resident.length} residents`);
            
            // Always prompt for user confirmation when there's a potential match
            // The user needs to decide if the manually created lease and the new rent roll lease are the same
            if (isNewLeaseFuture) {
              console.log(`[COMPLIANCE UPDATE] 🔮 New lease is future - checking for inheritance opportunity`);
              
              // Check if dates match exactly (automatic inheritance)
              const existingStart = existingFutureLeaseForUnit.leaseStartDate?.getTime();
              const existingEnd = existingFutureLeaseForUnit.leaseEndDate?.getTime();
              const newStart = leaseStartDate!.getTime();
              const newEnd = leaseEndDate?.getTime();
              
              console.log(`[COMPLIANCE UPDATE] 📅 Date comparison:`);
              console.log(`[COMPLIANCE UPDATE] - Existing: ${existingFutureLeaseForUnit.leaseStartDate} to ${existingFutureLeaseForUnit.leaseEndDate}`);
              console.log(`[COMPLIANCE UPDATE] - New: ${leaseStartDate} to ${leaseEndDate}`);
              console.log(`[COMPLIANCE UPDATE] - Start match: ${existingStart === newStart}, End match: ${existingEnd === newEnd}`);
              
              const exactDateMatch = existingStart === newStart && existingEnd === newEnd;
              
              if (!exactDateMatch) {
                console.log(`[COMPLIANCE UPDATE] 🎯 Dates don't match exactly - will prompt user for inheritance decision`);
                
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
                    residents: residents
                  }
                });
                
                console.log(`[COMPLIANCE UPDATE] ✅ Added future lease match for unit ${unitNumber} to prompt user`);
              } else {
                console.log(`[COMPLIANCE UPDATE] 🎯 Dates match exactly - automatic inheritance will occur`);
              }
            } else {
              console.log(`[COMPLIANCE UPDATE] ⚠️ New lease is not future, but existing future lease found - this might be a current lease replacing a manually created future lease`);
              
              // Even if the new lease is not future, we should still prompt if there's an existing future lease
              // This handles the case where a manually created future lease becomes current due to rent roll date
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
                  residents: residents
                }
              });
              
              console.log(`[COMPLIANCE UPDATE] ✅ Added current lease vs future lease match for unit ${unitNumber} to prompt user`);
            }
          }
        }

          // Create lease
          leasesData.push({
            id: leaseId,
            name: `${leaseData.unitNumber} - ${leaseData.leaseStartDate || 'No Start Date'} to ${leaseData.leaseEndDate || 'No End Date'}`,
            leaseStartDate: leaseStartDate,
            leaseEndDate: leaseEndDate,
            leaseRent: leaseData.leaseRent ? parseFloat(leaseData.leaseRent.toString()) : null,
            unitId: unitId,
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          // Create tenancy if lease is current
          if (!leaseStartDate || leaseStartDate <= rentRollDate) {
            tenanciesData.push({
              id: tenancyId,
              rentRollId: newRentRoll.id,
              leaseId: leaseId,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            console.log(`[COMPLIANCE UPDATE] Creating tenancy for current lease ${leaseId}`);
          } else {
            console.log(`[COMPLIANCE UPDATE] Lease ${leaseId} is future lease - no tenancy created`);
          }

          // Create residents with preserved finalized status
          leaseData.residents.forEach((resident: any, index: number) => {
            const residentId = `resident_${Date.now()}_${randomUUID().slice(0, 8)}`;
            
            // Check if this resident exists in a previous snapshot with finalized income
            console.log(`[COMPLIANCE UPDATE] Checking for existing finalized resident: ${resident.name} in unit ${unitNumber}`);
            
            const matchingResidents = existingFinalizedResidents.filter(existing => 
              existing.name.toLowerCase().trim() === resident.name.toLowerCase().trim() &&
              existing.Lease.Unit.unitNumber === unitNumber
            );
            
            const existingResident = matchingResidents[0]; // Take the first match
            
            // Debug: Check for duplicates
            if (matchingResidents.length > 1) {
              console.log(`[COMPLIANCE UPDATE] WARNING: Found ${matchingResidents.length} matching residents for ${resident.name} in unit ${unitNumber}:`, 
                matchingResidents.map(r => ({ id: r.id, leaseId: r.Lease.id, calculatedIncome: r.calculatedAnnualizedIncome }))
              );
            }
            
            if (existingResident) {
              console.log(`[COMPLIANCE UPDATE] ✅ FOUND MATCH: ${existingResident.name} in unit ${existingResident.Lease.Unit.unitNumber}`);
            } else {
              console.log(`[COMPLIANCE UPDATE] ❌ NO MATCH FOUND for ${resident.name} in unit ${unitNumber}`);
              console.log(`[COMPLIANCE UPDATE] Available finalized residents:`, existingFinalizedResidents.map(r => `${r.name} (Unit ${r.Lease.Unit.unitNumber})`));
            }

            let incomeFinalized = false;
            let calculatedAnnualizedIncome = null;
            const hasDiscrepancy = false;
            
            if (existingResident) {
              console.log(`[COMPLIANCE UPDATE] Found existing finalized resident: ${resident.name} in unit ${unitNumber}`);
              console.log(`[COMPLIANCE UPDATE] Existing verified income: ${existingResident.calculatedAnnualizedIncome}, New income: ${resident.annualizedIncome}`);
              
              // Preserve finalized status
              incomeFinalized = true;
              calculatedAnnualizedIncome = existingResident.calculatedAnnualizedIncome;
              
              // Note: Discrepancy detection is now handled by the dedicated income-discrepancies API
              // This ensures consistent discrepancy calculation and avoids duplicates
              console.log(`[COMPLIANCE UPDATE] Preserved verified income for ${resident.name}: $${existingResident.calculatedAnnualizedIncome}`);
            }

            residentsData.push({
              id: residentId,
              name: resident.name,
              annualizedIncome: resident.annualizedIncome ? parseFloat(resident.annualizedIncome) : null,
              leaseId: leaseId,
              createdAt: new Date(),
              updatedAt: new Date(),
              hasNoIncome: false,
              incomeFinalized,
              calculatedAnnualizedIncome,
            });

            // If this resident has preserved verification status, link their existing documents
            if (existingResident && existingResident.IncomeDocument.length > 0) {
              console.log(`[COMPLIANCE UPDATE] Linking ${existingResident.IncomeDocument.length} existing documents to new resident ${residentId}`);
              
              existingResident.IncomeDocument.forEach(doc => {
                incomeDocumentsData.push({
                  id: randomUUID(),
                  documentType: doc.documentType,
                  documentDate: doc.documentDate,
                  uploadDate: doc.uploadDate,
                  status: doc.status,
                  filePath: doc.filePath,
                  box1_wages: doc.box1_wages,
                  box3_ss_wages: doc.box3_ss_wages,
                  box5_med_wages: doc.box5_med_wages,
                  employeeName: doc.employeeName,
                  employerName: doc.employerName,
                  taxYear: doc.taxYear,
                  verificationId: doc.verificationId,
                  residentId: residentId, // Link to the new resident
                  grossPayAmount: doc.grossPayAmount,
                  payFrequency: doc.payFrequency,
                  payPeriodEndDate: doc.payPeriodEndDate,
                  payPeriodStartDate: doc.payPeriodStartDate,
                  calculatedAnnualizedIncome: doc.calculatedAnnualizedIncome,
                });
              });
            }
          });
        }
      }

      // Bulk create all records
      console.log(`[COMPLIANCE UPDATE] Starting bulk operations: ${leasesData.length} leases, ${tenanciesData.length} tenancies, ${residentsData.length} residents`);
      
      if (leasesData.length > 0) {
        console.log(`[COMPLIANCE UPDATE] Creating ${leasesData.length} leases...`);
        await tx.lease.createMany({ data: leasesData });
        console.log(`[COMPLIANCE UPDATE] ✓ Created ${leasesData.length} leases`);
      }

      if (tenanciesData.length > 0) {
        console.log(`[COMPLIANCE UPDATE] Creating ${tenanciesData.length} tenancies...`);
        await tx.tenancy.createMany({ data: tenanciesData });
        console.log(`[COMPLIANCE UPDATE] ✓ Created ${tenanciesData.length} tenancies`);
      }

      if (residentsData.length > 0) {
        console.log(`[COMPLIANCE UPDATE] Creating ${residentsData.length} residents...`);
        await tx.resident.createMany({ data: residentsData });
        console.log(`[COMPLIANCE UPDATE] ✓ Created ${residentsData.length} residents`);
      }

      return {
        success: true,
        snapshotId: snapshot.id,
        rentRollId: newRentRoll.id,
        leasesCreated: leasesData.length,
        tenanciesCreated: tenanciesData.length,
        residentsCreated: residentsData.length,
        // Note: Discrepancy detection is now handled by the dedicated income-discrepancies API
        // The frontend will call that API separately to get accurate discrepancy information
        hasFutureLeaseMatches: futureLeaseMatches.length > 0,
        futureLeaseMatches: futureLeaseMatches,
      };
    }, {
      timeout: 30000, // 30 seconds timeout for large compliance uploads
    });

    const duration = Date.now() - startTime;
    console.log(`[COMPLIANCE UPDATE] Transaction completed successfully in ${duration}ms`);
    return NextResponse.json(result);

  } catch (error) {
    console.error('Finalize error:', error);
    return NextResponse.json(
      { error: 'Failed to finalize compliance update' },
      { status: 500 }
    );
  }
} 