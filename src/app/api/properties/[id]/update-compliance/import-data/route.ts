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
    const { unitGroups, filename, rentRollDate, snapshotId, inheritanceChoices } = body;

    console.log(`🚀 [DATA IMPORT] ===== STARTING DATA IMPORT FOR PROPERTY ${propertyId} =====`);
    console.log(`🚀 [DATA IMPORT] Snapshot ID:`, snapshotId);
    console.log(`🚀 [DATA IMPORT] Inheritance choices:`, inheritanceChoices);

    const reportDate = rentRollDate ? new Date(rentRollDate) : new Date();

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // First, process inheritance decisions if provided
      if (inheritanceChoices && Object.keys(inheritanceChoices).length > 0) {
        console.log(`[DATA IMPORT] 🔄 Processing inheritance decisions first`);
        
        for (const [unitNumber, shouldInherit] of Object.entries(inheritanceChoices)) {
          console.log(`[DATA IMPORT] Processing unit ${unitNumber}, shouldInherit: ${shouldInherit}`);

          // Find the existing future lease for this unit
          const existingFutureLease = await tx.lease.findFirst({
            where: {
              Unit: {
                propertyId: propertyId,
                unitNumber: unitNumber
              },
              Tenancy: null, // Future lease
              NOT: {
                name: {
                  startsWith: '[PROCESSED]' // Exclude already processed leases
                }
              },
              IncomeVerification: {
                some: {
                  status: 'FINALIZED'
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

          if (existingFutureLease) {
            // Mark the future lease as processed (regardless of inheritance choice)
            const processedName = `[PROCESSED] ${existingFutureLease.name}`;
            await tx.lease.update({
              where: { id: existingFutureLease.id },
              data: { 
                name: processedName,
                updatedAt: new Date()
              }
            });
            console.log(`[DATA IMPORT] Marked future lease as processed: ${processedName}`);
          }
        }
      }

      // Now import the new rent roll data
      console.log(`[DATA IMPORT] 📥 Starting import of new rent roll data`);

      // Get the snapshot we're importing into
      const snapshot = await tx.rentRollSnapshot.findUnique({
        where: { id: snapshotId }
      });

      if (!snapshot) {
        throw new Error(`Snapshot ${snapshotId} not found`);
      }

      // Create rent roll for the new data
      const newRentRoll = await tx.rentRoll.create({
        data: {
          id: randomUUID(),
          propertyId,
          snapshotId: snapshot.id,
          filename: filename || `Rent Roll ${reportDate.toLocaleDateString()}`,
          uploadDate: reportDate,
        },
      });

      console.log(`[DATA IMPORT] Created rent roll ${newRentRoll.id}`);

      // First, get all units for this property to map unit numbers to unit IDs
      const propertyUnits = await tx.unit.findMany({
        where: { propertyId: propertyId },
        select: { id: true, unitNumber: true }
      });

      const unitNumberToIdMap = new Map<string, string>();
      propertyUnits.forEach(unit => {
        unitNumberToIdMap.set(unit.unitNumber, unit.id);
      });

      console.log(`[DATA IMPORT] Found ${propertyUnits.length} units for property`);

      // Process the unit groups and create leases/tenancies/residents
      const leasesData: any[] = [];
      const tenanciesData: any[] = [];
      const residentsData: any[] = [];

      for (const [unitKey, leases] of Object.entries(unitGroups as UnitGroup)) {
        for (const leaseData of leases) {
          const leaseId = randomUUID();
          const tenancyId = randomUUID();

          // Look up the actual unit ID from the unit number
          const actualUnitId = unitNumberToIdMap.get(leaseData.unitNumber);
          if (!actualUnitId) {
            console.error(`[DATA IMPORT] Unit not found for unit number: ${leaseData.unitNumber}`);
            throw new Error(`Unit not found for unit number: ${leaseData.unitNumber}`);
          }

          // Parse dates
          let leaseStartDate: Date | null = null;
          let leaseEndDate: Date | null = null;

          if (leaseData.leaseStartDate) {
            leaseStartDate = new Date(leaseData.leaseStartDate);
          }
          if (leaseData.leaseEndDate) {
            leaseEndDate = new Date(leaseData.leaseEndDate);
          }

          // Create lease
          leasesData.push({
            id: leaseId,
            name: `${leaseData.unitNumber} - ${leaseData.leaseStartDate || 'No Start Date'} to ${leaseData.leaseEndDate || 'No End Date'}`,
            leaseStartDate: leaseStartDate,
            leaseEndDate: leaseEndDate,
            leaseRent: leaseData.leaseRent ? new Prisma.Decimal(leaseData.leaseRent) : null,
            unitId: actualUnitId, // Use the actual unit ID, not the unit number
            createdAt: new Date(),
            updatedAt: new Date()
          });

          // Create tenancy
          tenanciesData.push({
            id: tenancyId,
            leaseId: leaseId,
            rentRollId: newRentRoll.id,
            createdAt: new Date(),
            updatedAt: new Date()
          });

          // Create residents
          for (const residentData of leaseData.residents) {
            const residentId = randomUUID();
            let annualizedIncome: Prisma.Decimal | null = null;

            if (residentData.annualizedIncome) {
              let income: number;
              if (typeof residentData.annualizedIncome === 'string') {
                income = parseFloat(residentData.annualizedIncome.replace(/[$,]/g, ''));
              } else {
                income = parseFloat(String(residentData.annualizedIncome));
              }
              if (!isNaN(income)) {
                annualizedIncome = new Prisma.Decimal(income);
              }
            }

            residentsData.push({
              id: residentId,
              name: residentData.name,
              leaseId: leaseId,
              annualizedIncome: annualizedIncome,
              originalRentRollIncome: annualizedIncome, // Store original rent roll income
              incomeFinalized: false,
              createdAt: new Date(),
              updatedAt: new Date()
            });
          }
        }
      }

      // Bulk insert all data
      console.log(`[DATA IMPORT] Creating ${leasesData.length} leases, ${tenanciesData.length} tenancies, ${residentsData.length} residents`);

      await tx.lease.createMany({ data: leasesData });
      await tx.tenancy.createMany({ data: tenanciesData });
      await tx.resident.createMany({ data: residentsData });

      // Handle inheritance if needed (copy verification data to new leases)
      if (inheritanceChoices && Object.keys(inheritanceChoices).length > 0) {
        console.log(`[DATA IMPORT] 🔄 Processing inheritance data transfer`);
        
        for (const [unitNumber, shouldInherit] of Object.entries(inheritanceChoices)) {
          if (!shouldInherit) {
            console.log(`[DATA IMPORT] User chose not to inherit for unit ${unitNumber}`);
            continue;
          }

          console.log(`[DATA IMPORT] Processing inheritance for unit ${unitNumber}`);

          // Find the processed future lease (marked with [PROCESSED])
          const processedFutureLease = await tx.lease.findFirst({
            where: {
              Unit: {
                propertyId: propertyId,
                unitNumber: unitNumber
              },
              name: {
                startsWith: '[PROCESSED]'
              }
            },
            include: {
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

          if (!processedFutureLease) {
            console.log(`[DATA IMPORT] No processed future lease found for unit ${unitNumber}`);
            continue;
          }

          // Find the new lease for this unit in the current rent roll
          const newLease = await tx.lease.findFirst({
            where: {
              Unit: {
                propertyId: propertyId,
                unitNumber: unitNumber
              },
              Tenancy: {
                rentRollId: newRentRoll.id
              }
            },
            include: {
              Unit: true,
              Resident: true
            }
          });

          if (!newLease) {
            console.log(`[DATA IMPORT] No new lease found for unit ${unitNumber} in rent roll ${newRentRoll.id}`);
            continue;
          }

          console.log(`[DATA IMPORT] Inheriting from processed future lease "${processedFutureLease.name}" to new lease "${newLease.name}"`);

          // Update residents in the new lease with inherited verification data
          for (const existingResident of processedFutureLease.Resident) {
            const matchingNewResident = newLease.Resident.find(r => 
              r.name.toLowerCase().trim() === existingResident.name.toLowerCase().trim()
            );
            
            if (matchingNewResident) {
              console.log(`[DATA IMPORT] Updating resident ${matchingNewResident.id} (${existingResident.name}) with inherited data`);
              
              await tx.resident.update({
                where: { id: matchingNewResident.id },
                data: {
                  verifiedIncome: existingResident.verifiedIncome,
                  calculatedAnnualizedIncome: existingResident.calculatedAnnualizedIncome,
                  incomeFinalized: existingResident.incomeFinalized,
                  hasNoIncome: existingResident.hasNoIncome,
                  finalizedAt: existingResident.finalizedAt,
                  updatedAt: new Date()
                }
              });

              // Copy income documents
              for (const doc of existingResident.IncomeDocument) {
                await tx.incomeDocument.create({
                  data: {
                    id: randomUUID(),
                    documentType: doc.documentType,
                    documentDate: doc.documentDate,
                    uploadDate: doc.uploadDate,
                    status: doc.status,
                    filePath: doc.filePath, // Reference same file
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
                    verificationId: doc.verificationId,
                    residentId: matchingNewResident.id
                  }
                });
              }
            }
          }

          // Create income verification for the new lease
          const existingVerification = processedFutureLease.IncomeVerification[0];
          if (existingVerification) {
            await tx.incomeVerification.create({
              data: {
                id: randomUUID(),
                leaseId: newLease.id,
                status: 'FINALIZED',
                reason: existingVerification.reason,
                calculatedVerifiedIncome: existingVerification.calculatedVerifiedIncome,
                finalizedAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date()
              }
            });
          }
        }
      }

      return {
        success: true,
        snapshotId: snapshot.id,
        rentRollId: newRentRoll.id,
        leasesCreated: leasesData.length,
        residentsCreated: residentsData.length,
        inheritanceProcessed: inheritanceChoices ? Object.keys(inheritanceChoices).length : 0
      };
    });

    console.log(`[DATA IMPORT] ✅ Data import completed successfully:`, result);
    return NextResponse.json(result);

  } catch (error) {
    console.error('❌ [DATA IMPORT] Error importing data:', error);
    return NextResponse.json(
      { error: 'Failed to import data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
