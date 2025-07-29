import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { getUnitVerificationStatus, PropertyVerificationSummary, UnitVerificationData } from '@/services/verification';
import { createAutoOverrideRequest } from '@/services/override';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id: propertyId } = await params;

  try {
    // Get the property with units, leases, residents, income documents, and rent rolls
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        ownerId: session.user.id,
      },
      include: {
        units: {
          include: {
            leases: {
              include: {
                residents: {
                  include: {
                    incomeDocuments: {
                      where: {
                        status: 'COMPLETED', // Only include completed documents for verification
                      },
                      orderBy: {
                        uploadDate: 'desc',
                      },
                    },
                  },
                },
                incomeVerifications: {
                  orderBy: {
                    createdAt: 'desc',
                  },
                },
                tenancy: {
                  include: {
                    rentRoll: true,
                  },
                },
              },
            },
          },
        },
        rentRolls: {
          orderBy: {
            date: 'desc',
          },
          take: 1, // Get the most recent rent roll
        },
      },
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found or access denied' }, { status: 404 });
    }

    if (property.rentRolls.length === 0) {
      return NextResponse.json({ error: 'No rent rolls found for this property' }, { status: 404 });
    }

    const latestRentRollDate = new Date(property.rentRolls[0].date);
    const units: UnitVerificationData[] = [];
    let summary = {
      verified: 0,
      needsInvestigation: 0,
      outOfDate: 0,
      vacant: 0,
      verificationInProgress: 0,
    };

    // Process each unit
    for (const unit of property.units) {
      // Initialize enhanced unit (will be populated later with resident income data)
      let enhancedUnit = { ...unit };
      
      // Find the active lease (with tenancy)
      const currentLease = unit.leases
        .filter(l => l.tenancy !== null)
        .sort((a, b) => new Date(b.tenancy!.createdAt).getTime() - new Date(a.tenancy!.createdAt).getTime())[0];

      let verificationStatus: any;

      // Check if there's an active income verification in progress
      if (currentLease && currentLease.incomeVerifications.length > 0) {
        const latestVerification = currentLease.incomeVerifications[0]; // Already sorted by createdAt desc
        
        if (latestVerification.status === 'IN_PROGRESS') {
          verificationStatus = 'In Progress - Finalize to Process';
        } else if (latestVerification.status === 'FINALIZED') {
          // Only check for discrepancies if verification is finalized
          verificationStatus = getUnitVerificationStatus(enhancedUnit, latestRentRollDate);
        } else {
          verificationStatus = getUnitVerificationStatus(enhancedUnit, latestRentRollDate);
        }
      } else {
        // No verification process started yet
        verificationStatus = getUnitVerificationStatus(enhancedUnit, latestRentRollDate);
      }
      
      // Automatically create override request for "Needs Investigation" status
      if (verificationStatus === 'Needs Investigation') {
        try {
          await createAutoOverrideRequest({
            type: 'INCOME_DISCREPANCY',
            unitId: unit.id,
            userId: session.user.id,
            systemExplanation: `System detected income discrepancy for Unit ${unit.unitNumber}. Verified income does not match compliance income. Admin review required to resolve discrepancy.`
          });
        } catch (overrideError) {
          console.error('Failed to create auto-override request for income discrepancy:', overrideError);
        }
      }
      
      // Find the active lease (with tenancy)
      const activeLease = unit.leases
        .filter(l => l.tenancy !== null)
        .sort((a, b) => new Date(b.tenancy!.createdAt).getTime() - new Date(a.tenancy!.createdAt).getTime())[0];

      // Calculate total uploaded income (from compliance uploads)
      const totalUploadedIncome = activeLease 
        ? activeLease.residents.reduce((acc, r) => acc + (r.annualizedIncome || 0), 0)
        : 0;

      // Calculate total verified income using resident-level data and create enhanced unit for verification status
      let totalVerifiedIncome = 0;
      
      if (activeLease) {
        // Fetch resident-level income data using raw SQL (temporary workaround for Prisma client types)
        const enhancedResidents = [];
        for (const resident of activeLease.residents) {
          try {
            const residentIncomeData = await prisma.$queryRaw<Array<{
              calculatedAnnualizedIncome: number | null;
              incomeFinalized: boolean;
            }>>`
              SELECT "calculatedAnnualizedIncome", "incomeFinalized"
              FROM "Resident"
              WHERE "id" = ${resident.id}
            `;
            
            const enhancedResident = {
              ...resident,
              calculatedAnnualizedIncome: residentIncomeData.length > 0 ? residentIncomeData[0].calculatedAnnualizedIncome : null,
              incomeFinalized: residentIncomeData.length > 0 ? residentIncomeData[0].incomeFinalized : false
            };
            enhancedResidents.push(enhancedResident);
            
            if (residentIncomeData.length > 0 && residentIncomeData[0].incomeFinalized) {
              totalVerifiedIncome += Number(residentIncomeData[0].calculatedAnnualizedIncome) || 0;
            }
          } catch (error) {
            console.error(`Error fetching resident income data for ${resident.id}:`, error);
            enhancedResidents.push(resident); // Fallback to original resident data
          }
        }
        
        // Create enhanced unit with enhanced residents for verification status calculation
        const enhancedLease = { ...activeLease, residents: enhancedResidents };
        enhancedUnit = {
          ...unit,
          leases: unit.leases.map(lease => 
            lease.id === activeLease.id ? enhancedLease : lease
          )
        };
      }
        
      // Debug logging for Unit 0101
      if (unit.unitNumber === '0101') {
        console.log(`[DEBUG Unit 0101] Total uploaded income: $${totalUploadedIncome}`);
        console.log(`[DEBUG Unit 0101] Total verified income: $${totalVerifiedIncome}`);
        console.log(`[DEBUG Unit 0101] Discrepancy: $${Math.abs(totalUploadedIncome - totalVerifiedIncome)}`);
        console.log(`[DEBUG Unit 0101] Verification status: ${verificationStatus}`);
      }

      // Count documents
      const documentCount = activeLease 
        ? activeLease.residents.flatMap(r => r.incomeDocuments).length
        : 0;

      // Find last verification update
      const lastVerificationUpdate = activeLease 
        ? activeLease.residents
            .flatMap(r => r.incomeDocuments)
            .reduce((latest, doc) => {
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
        leaseStartDate: activeLease?.leaseStartDate ? new Date(activeLease.leaseStartDate) : null,
        documentCount,
        lastVerificationUpdate,
      };

      units.push(unitData);

      // Update summary counts
      switch (verificationStatus) {
        case 'Verified':
          summary.verified++;
          break;
        case 'Needs Investigation':
          summary.needsInvestigation++;
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