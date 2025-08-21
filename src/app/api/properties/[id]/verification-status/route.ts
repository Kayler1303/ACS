import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getUnitVerificationStatus, PropertyVerificationSummary, UnitVerificationData } from '@/services/verification';
import { createAutoOverrideRequest } from '@/services/override';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log(`🚨🚨🚨 VERIFICATION STATUS API FUNCTION CALLED 🚨🚨🚨`);
  console.log(`[VERIFICATION STATUS API] ============== FUNCTION ENTRY ==============`);
  console.log(`[VERIFICATION STATUS API] Request URL: ${req.url}`);
  
  const session = await getServerSession(authOptions);
  console.log(`[VERIFICATION STATUS API] Session check complete, user ID: ${session?.user?.id || 'NONE'}`);
  
  if (!session?.user?.id) {
    console.log(`[VERIFICATION STATUS API] Authentication failed - returning 401`);
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id: propertyId } = await params;
  const { searchParams } = new URL(req.url);
  const rentRollId = searchParams.get('rentRollId');
  
  console.log(`[VERIFICATION STATUS API] ============== STARTING API CALL ==============`);
  console.log(`[VERIFICATION STATUS API] Property ID: ${propertyId}`);
  console.log(`[VERIFICATION STATUS API] Rent Roll ID: ${rentRollId || 'latest'}`);
  console.log(`[VERIFICATION STATUS API] Request URL: ${req.url}`);

  try {
    console.log(`[VERIFICATION STATUS API] About to query property: ${propertyId}`);
    console.log(`[VERIFICATION STATUS API] User ID: ${session.user.id}`);
    
    // Get the property with units, leases, residents, income documents, and rent rolls
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        ownerId: session.user.id,
      },
      include: {
        Unit: {
          include: {
            Lease: {
              include: {
                Resident: {
                  include: {
                    IncomeDocument: {
                      where: {
                        status: { in: ['COMPLETED', 'NEEDS_REVIEW'] }, // Include completed and needs review documents
                      },
                      orderBy: {
                        uploadDate: 'desc',
                      },
                    },
                  },
                },
                IncomeVerification: {
                  orderBy: {
                    createdAt: 'desc',
                  },
                },
                Tenancy: {
                  include: {
                    RentRoll: true,
                  },
                },
              },
            },
          },
        },
        RentRoll: rentRollId ? {
          where: {
            id: rentRollId
          }
        } : {
          orderBy: {
            date: 'desc',
          },
          take: 1, // Get the most recent rent roll
        },
      },
    });

    if (!property) {
      console.log(`[VERIFICATION STATUS API] Property ${propertyId} not found - returning 404`);
      return NextResponse.json({ error: 'Property not found or access denied' }, { status: 404 });
    }
    
    console.log(`[VERIFICATION STATUS API] Property found: ${property.name} with ${property.Unit.length} units`);

    if (property.RentRoll.length === 0) {
      console.log(`[VERIFICATION STATUS API] No rent rolls found for property ${propertyId} - returning 404`);
      return NextResponse.json({ error: 'No rent rolls found for this property' }, { status: 404 });
    }

    const latestRentRollDate = new Date(property.RentRoll[0].date);
    const units: UnitVerificationData[] = [];
    const summary = {
      verified: 0,
      outOfDate: 0,
      vacant: 0,
      verificationInProgress: 0,
      waitingForAdminReview: 0,
    };

    // Process each unit
    console.log(`[VERIFICATION STATUS DEBUG] Total units in property: ${property.Unit.length}`);
    console.log(`[VERIFICATION STATUS DEBUG] All unit numbers:`, property.Unit.map((u: any) => u.unitNumber));
    
    for (const unit of property.Unit) {
      console.log(`[VERIFICATION STATUS DEBUG] Processing unit ${unit.unitNumber} (ID: ${unit.id})`);
      // SIMPLIFIED: Only handle current leases (with tenancy)
      console.log(`[VERIFICATION STATUS DEBUG] Unit ${unit.unitNumber}: Found ${unit.Lease.length} total leases`);
      const leasesWithTenancy = unit.Lease.filter((l: any) => l.tenancy !== null);
      console.log(`[VERIFICATION STATUS DEBUG] Unit ${unit.unitNumber}: ${leasesWithTenancy.length} leases with tenancy`);
      
      const currentLease = leasesWithTenancy
        .sort((a: any, b: any) => {
          const aDate = a.tenancy?.createdAt ? new Date(a.tenancy.createdAt).getTime() : 0;
          const bDate = b.tenancy?.createdAt ? new Date(b.tenancy.createdAt).getTime() : 0;
          return bDate - aDate;
        })[0];
        
      if (!currentLease) {
        console.log(`[VERIFICATION STATUS DEBUG] Unit ${unit.unitNumber}: No current lease found, skipping`);
        continue;
      }
      
      console.log(`[VERIFICATION STATUS DEBUG] Unit ${unit.unitNumber}: Processing with lease ${currentLease.id}`);

      // Calculate total uploaded income (from compliance uploads) - only use active lease
      const totalUploadedIncome = currentLease 
        ? (currentLease.Resident || []).reduce((acc: any, r: any) => acc + (r.annualizedIncome || 0), 0)
        : 0;

      // Calculate total verified income using resident-level data and create enhanced unit for verification status
      let totalVerifiedIncome = 0;
      let enhancedUnit = { ...unit };
      
      if (currentLease) {
        // Batch fetch all resident income data in a single query instead of individual queries
        const residentIds = (currentLease.Resident || []).map((r: any) => r.id);
        const residentIncomeDataMap = await prisma.resident.findMany({
          where: { id: { in: residentIds } },
          select: {
            id: true,
            incomeFinalized: true,
            hasNoIncome: true,
            annualizedIncome: true,
            calculatedAnnualizedIncome: true
          }
        }).then((results: any[]) => 
          results.reduce((map: Record<string, any>, resident: any) => {
            map[resident.id] = resident;
            return map;
          }, {} as Record<string, any>)
        );

        const enhancedResidents = [];
        for (const resident of currentLease.Resident || []) {
          const residentIncomeData = residentIncomeDataMap[resident.id];
          
          const enhancedResident = {
            ...resident,
            incomeFinalized: residentIncomeData?.incomeFinalized || false,
            hasNoIncome: residentIncomeData?.hasNoIncome || false,
            calculatedAnnualizedIncome: residentIncomeData?.calculatedAnnualizedIncome ? Number(residentIncomeData.calculatedAnnualizedIncome) : null,
            // Preserve the IncomeDocument array from the original resident
            IncomeDocument: resident.IncomeDocument || []
          };
          enhancedResidents.push(enhancedResident);
          
          // Calculate verified income using approved amounts that users have already accepted
          if (residentIncomeData?.incomeFinalized) {
            // For finalized residents, use their approved income amount
            // Prioritize calculatedAnnualizedIncome (the approved amount) over annualizedIncome (rent roll)
            const approvedIncome = residentIncomeData.calculatedAnnualizedIncome || residentIncomeData.annualizedIncome || 0;
            
            console.log(`[DEBUG ${unit.unitNumber}] Resident ${resident.id} - USING APPROVED AMOUNT:`, {
              incomeFinalized: residentIncomeData.incomeFinalized,
              calculatedAnnualizedIncome: residentIncomeData.calculatedAnnualizedIncome,
              annualizedIncome: residentIncomeData.annualizedIncome,
              approvedIncome: approvedIncome
            });
            
            totalVerifiedIncome += Number(approvedIncome);
          }
        }
        
        // Create enhanced unit with enhanced residents for verification status calculation
        const enhancedLease = { 
          ...currentLease, 
          Resident: enhancedResidents,
          // Ensure all original relationships are preserved
          Tenancy: currentLease.Tenancy,
          IncomeVerification: currentLease.IncomeVerification
        };
        enhancedUnit = {
          ...unit,
          Lease: (unit.Lease || []).map((lease: any) => 
            lease.id === currentLease.id ? enhancedLease : lease
          )
        };
        
        // DEBUG: Check if IncomeDocument arrays are preserved
        console.log(`[VERIFICATION STATUS DEBUG] Unit ${unit.unitNumber} enhanced residents:`, 
          enhancedResidents.map((r: any) => ({
            name: r.name,
            documentsCount: r.IncomeDocument?.length || 0,
            documents: r.IncomeDocument?.map((d: any) => ({ type: d.documentType, status: d.status })) || []
          }))
        );
      }

      // NOW calculate verification status with enhanced unit data
      let verificationStatus: any;

      if (!currentLease) {
        // No active lease = Vacant
        verificationStatus = 'Vacant';
      } else {
        // Check if there's an active income verification in progress  
        if (currentLease.IncomeVerification.length > 0) {
          const latestVerification = currentLease.IncomeVerification[0]; // Already sorted by createdAt desc
          
          if (latestVerification.status === 'IN_PROGRESS') {
            // Check if any documents are waiting for admin review
            const documentsNeedingReview = (currentLease.Resident || []).flatMap((resident: any) => 
              (resident.IncomeDocument || []).filter((doc: any) => doc.status === 'NEEDS_REVIEW')
            );
            
            if (documentsNeedingReview.length > 0) {
              // Check if there are pending override requests for these documents
              const pendingOverrideRequests = await prisma.overrideRequest.findMany({
                where: {
                  status: 'PENDING',
                  documentId: {
                    in: documentsNeedingReview.map((doc: any) => doc.id)
                  }
                }
              });
              
              if (pendingOverrideRequests.length > 0) {
                verificationStatus = 'Waiting for Admin Review';
              } else {
                // NEEDS_REVIEW documents exist but no pending override requests (denied/approved)
                // Return "Out of Date Income Documents" directly to avoid getUnitVerificationStatus
                // which would return "Waiting for Admin Review" for any NEEDS_REVIEW documents
                verificationStatus = 'Out of Date Income Documents';
              }
            } else {
              // Check for pending validation exception override requests
              console.log(`[VERIFICATION STATUS DEBUG] Checking for pending validation exceptions for verification ${latestVerification.id}`);
              const pendingValidationExceptions = await prisma.overrideRequest.findMany({
                where: {
                  status: 'PENDING',
                  type: 'VALIDATION_EXCEPTION',
                  verificationId: latestVerification.id
                }
              });
              
              console.log(`[VERIFICATION STATUS DEBUG] Found ${pendingValidationExceptions.length} pending validation exceptions:`, pendingValidationExceptions);
              
              if (pendingValidationExceptions.length > 0) {
                console.log(`[VERIFICATION STATUS DEBUG] Setting status to 'Waiting for Admin Review' due to pending validation exceptions`);
                verificationStatus = 'Waiting for Admin Review';
              } else {
                console.log(`[VERIFICATION STATUS DEBUG] No pending validation exceptions found, setting status to 'In Progress - Finalize to Process'`);
                verificationStatus = 'In Progress - Finalize to Process';
              }
            }
          } else if (latestVerification.status === 'FINALIZED') {
            // Only check for discrepancies if verification is finalized
            verificationStatus = getUnitVerificationStatus(enhancedUnit as any, latestRentRollDate);
          } else {
            // Fallback verification status for edge cases
            verificationStatus = getUnitVerificationStatus(enhancedUnit as any, latestRentRollDate);
          }
          
          // IMPORTANT: After setting verification status through other means, check for pending validation exceptions
          // This must come AFTER the other status checks to avoid being overridden
          if (latestVerification && latestVerification.status === 'IN_PROGRESS') {
            console.log(`[VERIFICATION STATUS DEBUG] Final check for pending validation exceptions for verification ${latestVerification.id}`);
            const finalPendingValidationExceptions = await prisma.overrideRequest.findMany({
              where: {
                status: 'PENDING',
                type: 'VALIDATION_EXCEPTION',
                verificationId: latestVerification.id
              }
            });
            
            if (finalPendingValidationExceptions.length > 0) {
              console.log(`[VERIFICATION STATUS DEBUG] FINAL: Overriding status to 'Waiting for Admin Review' due to ${finalPendingValidationExceptions.length} pending validation exceptions`);
              verificationStatus = 'Waiting for Admin Review';
            }
          }
        } else {
          // No verification in progress, check overall unit status
          verificationStatus = getUnitVerificationStatus(enhancedUnit as any, latestRentRollDate);
        }
      }
      
      // Note: Income discrepancy requests should be created at the resident level, not unit level
      // This automatic unit-level override creation was causing inappropriate admin review requests
      // Resident-level discrepancy handling is done through the ResidentFinalizationDialog and individual resident workflows
      
      
        
      // Debug logging for Unit 0101
      if (unit.unitNumber === '0101') {
        console.log(`[DEBUG Unit 0101] Total uploaded income: $${totalUploadedIncome}`);
        console.log(`[DEBUG Unit 0101] Total verified income: $${totalVerifiedIncome}`);
        console.log(`[DEBUG Unit 0101] Discrepancy: $${Math.abs(totalUploadedIncome - totalVerifiedIncome)}`);
        console.log(`[DEBUG Unit 0101] Verification status: ${verificationStatus}`);
      }

      // Debug logging for Unit 0208 to understand finalization issue
      if (unit.unitNumber === '0208') {
        console.log(`[DEBUG Unit 0208] Unit ID: ${unit.id}`);
        console.log(`[DEBUG Unit 0208] Current lease:`, currentLease?.id);
        console.log(`[DEBUG Unit 0208] Residents in lease:`, (currentLease?.Resident || []).map((r: any) => ({
          id: r.id,
          name: r.name,
          incomeFinalized: r.incomeFinalized,
          hasNoIncome: r.hasNoIncome,
          calculatedAnnualizedIncome: r.calculatedAnnualizedIncome
        })));
        console.log(`[DEBUG Unit 0208] Documents count:`, (currentLease?.Resident || []).flatMap((r: any) => r.IncomeDocument || []).length);
        console.log(`[DEBUG Unit 0208] Document statuses:`, (currentLease?.Resident || []).flatMap((r: any) => r.IncomeDocument || []).map((d: any) => ({
          id: d.id,
          type: d.documentType,
          status: d.status,
          residentId: d.residentId
        })));
        console.log(`[DEBUG Unit 0208] Verification from service: ${verificationStatus}`);
        console.log(`[DEBUG Unit 0208] Total uploaded income: $${totalUploadedIncome}`);
        console.log(`[DEBUG Unit 0208] Total verified income: $${totalVerifiedIncome}`);
      }

      // Count documents
      const documentCount = currentLease 
        ? (currentLease.Resident || []).flatMap((r: any) => r.IncomeDocument || []).length
        : 0;

      // Find last verification update
      const lastVerificationUpdate = currentLease 
        ? (currentLease.Resident || [])
            .flatMap((r: any) => r.IncomeDocument || [])
            .reduce((latest: any, doc: any) => {
              const docDate = new Date(doc.uploadDate);
              return !latest || docDate > latest ? docDate : latest;
            }, null as Date | null)
        : null;

      const unitData: UnitVerificationData = {
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        verificationStatus,
        totalUploadedIncome,
        totalVerifiedIncome,
        leaseStartDate: currentLease?.leaseStartDate ? new Date(currentLease.leaseStartDate) : null,
        documentCount,
        lastVerificationUpdate,
      };

      units.push(unitData);

      // Update summary counts
      switch (verificationStatus) {
        case 'Verified':
          summary.verified++;
          break;

        case 'Out of Date Income Documents':
          summary.outOfDate++;
          break;
        case 'Vacant':
          summary.vacant++;
          break;
        case 'In Progress - Finalize to Process':
          summary.verificationInProgress++;
          break;
        case 'Waiting for Admin Review':
          summary.waitingForAdminReview++;
          break;
      }
    }

    const response: PropertyVerificationSummary = {
      propertyId,
      units: units.sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true })),
      summary,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching verification status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch verification status' },
      { status: 500 }
    );
  }
} 