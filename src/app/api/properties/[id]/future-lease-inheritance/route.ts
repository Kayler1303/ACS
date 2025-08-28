import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';

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
    const { inheritanceChoices, rentRollId } = body;

    console.log(`[FUTURE LEASE INHERITANCE] Processing inheritance choices for property ${propertyId}:`, inheritanceChoices);

    const result = await prisma.$transaction(async (tx) => {
      const inheritedLeases: any[] = [];

      for (const [unitNumber, shouldInherit] of Object.entries(inheritanceChoices)) {
        console.log(`[FUTURE LEASE INHERITANCE] Processing unit ${unitNumber}, shouldInherit: ${shouldInherit}`);

        // Find the existing future lease for this unit (regardless of inheritance choice)
        const existingFutureLease = await tx.lease.findFirst({
          where: {
            Unit: {
              propertyId: propertyId,
              unitNumber: unitNumber
            },
            Tenancy: null, // Future lease
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

        if (!existingFutureLease) {
          console.log(`[FUTURE LEASE INHERITANCE] No existing future lease found for unit ${unitNumber}`);
          continue;
        }

        // Mark the future lease as processed by updating its name (so it won't appear in future snapshots)
        const processedName = `[PROCESSED] ${existingFutureLease.name}`;
        await tx.lease.update({
          where: { id: existingFutureLease.id },
          data: { 
            name: processedName,
            updatedAt: new Date()
          }
        });
        console.log(`[FUTURE LEASE INHERITANCE] Marked future lease as processed: ${processedName}`);

        if (!shouldInherit) {
          console.log(`[FUTURE LEASE INHERITANCE] User chose not to inherit - future lease marked as processed but no inheritance`);
          continue;
        }

        // Find the new lease for this unit in the current rent roll
        // Find the new lease from the rent roll for this unit
        // We need to find the lease that was just created in the most recent rent roll upload
        const newLease = await tx.lease.findFirst({
          where: {
            Unit: {
              propertyId: propertyId,
              unitNumber: unitNumber
            },
            Tenancy: {
              rentRollId: rentRollId
            }
          },
          include: {
            Unit: true,
            Resident: true
          },
          orderBy: {
            createdAt: 'desc' // Get the most recently created lease for this unit in this rent roll
          }
        });

        console.log(`[FUTURE LEASE INHERITANCE] Looking for new lease in unit ${unitNumber} for rent roll ${rentRollId}`);

        if (!newLease) {
          console.log(`[FUTURE LEASE INHERITANCE] No new lease found for unit ${unitNumber} in rent roll ${rentRollId}`);
          continue;
        }

        console.log(`[FUTURE LEASE INHERITANCE] Inheriting from future lease "${existingFutureLease.name}" (${existingFutureLease.id}) to new lease "${newLease.name}" (${newLease.id})`);
        console.log(`[FUTURE LEASE INHERITANCE] Existing future lease has ${existingFutureLease.Resident.length} residents, new lease has ${newLease.Resident.length} residents`);

        // Update existing residents in the new lease with inherited verification data
        for (const existingResident of existingFutureLease.Resident) {
          // Find matching resident in the new lease by name
          const matchingNewResident = newLease.Resident.find(r => 
            r.name.toLowerCase().trim() === existingResident.name.toLowerCase().trim()
          );
          
          let targetResidentId: string;
          
          if (matchingNewResident) {
            console.log(`[FUTURE LEASE INHERITANCE] Updating existing resident ${matchingNewResident.id} (${existingResident.name}) with inherited verification data`);
            
            // Update the existing resident with inherited verification data
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
            
            targetResidentId = matchingNewResident.id;
          } else {
            console.log(`[FUTURE LEASE INHERITANCE] No matching resident found for ${existingResident.name} - creating new resident`);
            
            // Only create new resident if no match found (edge case)
            const newResidentId = randomUUID();
            await tx.resident.create({
              data: {
                id: newResidentId,
                name: existingResident.name,
                leaseId: newLease.id,
                annualizedIncome: existingResident.annualizedIncome,
                verifiedIncome: existingResident.verifiedIncome,
                calculatedAnnualizedIncome: existingResident.calculatedAnnualizedIncome,
                incomeFinalized: existingResident.incomeFinalized,
                hasNoIncome: existingResident.hasNoIncome,
                finalizedAt: existingResident.finalizedAt,
                createdAt: new Date(),
                updatedAt: new Date()
              }
            });
            
            targetResidentId = newResidentId;
          }

          console.log(`[FUTURE LEASE INHERITANCE] Processed resident inheritance for ${existingResident.name}`);

          // Copy income documents to the target resident
          for (const existingDoc of existingResident.IncomeDocument) {
            await tx.incomeDocument.create({
              data: {
                id: randomUUID(),
                documentType: existingDoc.documentType,
                documentDate: existingDoc.documentDate,
                uploadDate: existingDoc.uploadDate,
                status: existingDoc.status,
                filePath: existingDoc.filePath,
                box1_wages: existingDoc.box1_wages,
                box3_ss_wages: existingDoc.box3_ss_wages,
                box5_med_wages: existingDoc.box5_med_wages,
                employeeName: existingDoc.employeeName,
                employerName: existingDoc.employerName,
                taxYear: existingDoc.taxYear,
                grossPayAmount: existingDoc.grossPayAmount,
                payFrequency: existingDoc.payFrequency,
                payPeriodStartDate: existingDoc.payPeriodStartDate,
                payPeriodEndDate: existingDoc.payPeriodEndDate,
                calculatedAnnualizedIncome: existingDoc.calculatedAnnualizedIncome,
                verificationId: existingFutureLease.IncomeVerification[0].id, // Link to existing verification
                residentId: targetResidentId
              }
            });
          }
        }

        // Create or update income verification for the new lease
        const existingVerification = existingFutureLease.IncomeVerification[0];
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

        // Future lease is already marked as processed above, no need to delete
        console.log(`[FUTURE LEASE INHERITANCE] Future lease ${existingFutureLease.id} successfully processed and inherited`);

        inheritedLeases.push({
          unitNumber,
          existingLeaseId: existingFutureLease.id,
          newLeaseId: newLease.id,
          residentsInherited: existingFutureLease.Resident.length,
          documentsInherited: existingFutureLease.Resident.reduce((sum, r) => sum + r.IncomeDocument.length, 0)
        });
      }

      return {
        success: true,
        inheritedLeases,
        totalInheritances: inheritedLeases.length
      };
    });

    console.log(`[FUTURE LEASE INHERITANCE] Completed inheritance process:`, result);

    return NextResponse.json(result);

  } catch (error) {
    console.error('[FUTURE LEASE INHERITANCE] Error processing inheritance:', error);
    return NextResponse.json(
      { error: 'Failed to process future lease inheritance' },
      { status: 500 }
    );
  }
}
