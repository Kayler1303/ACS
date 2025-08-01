import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { getActualAmiBucket } from '@/services/income';
import { getHudIncomeLimits } from '@/services/hud';

interface UnitFutureLeaseData {
  unitId: string;
  unitNumber: string;
  futureLease?: {
    id: string;
    leaseName: string;
    verificationStatus: string;
    totalIncome: number;
    complianceBucket: string;
    leaseStartDate: string;
    isToggled: boolean;
    residents: any[];
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const propertyId = params.id;

    // Get property with units and their future leases
    const property = await prisma.property.findUnique({
      where: { 
        id: propertyId,
        ownerId: session.user.id 
      },
      include: {
        units: {
          include: {
            leases: {
              where: {
                tenancy: null // Future leases have no tenancy record
              },
              include: {
                residents: {
                  include: {
                    incomeDocuments: true
                  }
                },
                incomeVerifications: {
                  orderBy: {
                    createdAt: 'desc'
                  }
                }
              },
              orderBy: {
                leaseStartDate: 'desc'
              }
            }
          }
        },
        rentRolls: {
          orderBy: {
            date: 'desc'
          }
        }
      }
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    // Get the most recent rent roll date for filtering future leases
    const mostRecentRentRoll = property.rentRolls[0];
    const rentRollDate = mostRecentRentRoll ? new Date(mostRecentRentRoll.date) : new Date();

    const units: UnitFutureLeaseData[] = [];

        // Process each unit
    for (const unit of property.units) {
      const unitData: UnitFutureLeaseData = {
        unitId: unit.id,
        unitNumber: unit.unitNumber
      };



      // Find future leases (leases that start after rent roll date OR have null start date)
      const futureLeases = unit.leases.filter((lease: any) => {
        // If start date is null, this could be a future lease (like "August 2025 Lease Renewal")
        if (!lease.leaseStartDate) {
          return true; // Include leases with null start dates as potential future leases
        }
        
        const leaseStartDate = new Date(lease.leaseStartDate);
        const isAfterRentRoll = leaseStartDate > rentRollDate;
        
        return isAfterRentRoll;
      });

        if (futureLeases.length > 0) {
          // Get the most recent future lease
          const futureLease = futureLeases[0];
          
          // Calculate verification status
          let verificationStatus = 'Pending Verification';
          if (futureLease.incomeVerifications.length > 0) {
            const latestVerification = futureLease.incomeVerifications[0];
            if (latestVerification.status === 'FINALIZED') {
              verificationStatus = 'Verified';
            } else if (latestVerification.status === 'IN_PROGRESS') {
              // Check if any documents are waiting for admin review
              const hasDocumentsNeedingReview = futureLease.residents.some((resident: any) => 
                resident.incomeDocuments.some((doc: any) => doc.status === 'NEEDS_REVIEW')
              );
              
              if (hasDocumentsNeedingReview) {
                verificationStatus = 'Waiting for Admin Review';
              } else {
                verificationStatus = 'In Progress';
              }
            }
          }

          // Calculate total income
          const totalIncome = futureLease.residents.reduce((acc: number, resident: any) => {
            return acc + (resident.annualizedIncome || 0);
          }, 0);

          // Generate lease name (first resident name + others)
          const residentNames = futureLease.residents.map((r: any) => r.name);
          const leaseName = residentNames.length > 1 
            ? `${residentNames[0]} + ${residentNames.length - 1} other${residentNames.length > 2 ? 's' : ''}`
            : residentNames[0] || 'Future Lease';

          // Only calculate compliance bucket if income is verified
          let complianceBucket = '-';
          if (verificationStatus === 'Verified') {
            const hudIncomeLimits = await getHudIncomeLimits(property.county, property.state);
            complianceBucket = getActualAmiBucket(
              totalIncome,
              futureLease.residents.length,
              hudIncomeLimits,
              property.complianceOption || "20% at 50% AMI, 55% at 80% AMI"
            );
          }

        unitData.futureLease = {
          id: futureLease.id,
          leaseName,
          verificationStatus,
          totalIncome: parseFloat(totalIncome.toString()),
          complianceBucket,
          leaseStartDate: futureLease.leaseStartDate?.toISOString() || '',
          isToggled: false, // Default to not toggled - will be managed by frontend state
          residents: futureLease.residents
        };
      }

      units.push(unitData);
    }

    // Filter to only return units that have future leases
    const unitsWithFutureLeases = units.filter(unit => unit.futureLease);

    return NextResponse.json({ 
      units: unitsWithFutureLeases,
      totalFutureLeases: unitsWithFutureLeases.length
    });

  } catch (error) {
    console.error('Error fetching future leases:', error);
    return NextResponse.json(
      { error: 'Failed to fetch future leases data' },
      { status: 500 }
    );
  }
} 