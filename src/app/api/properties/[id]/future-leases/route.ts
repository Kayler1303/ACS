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
        Unit: {
          include: {
            Lease: {
              where: {
                Tenancy: null // Future leases have no tenancy record
              },
              include: {
                Resident: {
                  include: {
                    IncomeDocument: true
                  }
                },
                IncomeVerification: {
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
        RentRoll: {
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
    const mostRecentRentRoll = property.RentRoll[0];
    const rentRollDate = mostRecentRentRoll ? new Date(mostRecentRentRoll.date) : new Date();

    const units: UnitFutureLeaseData[] = [];

        // Process each unit
    for (const unit of property.Unit) {
      const unitData: UnitFutureLeaseData = {
        unitId: unit.id,
        unitNumber: unit.unitNumber
      };



      // Find future leases (leases that start after rent roll date OR have null start date)
      const futureLeases = unit.Lease.filter((lease: any) => {
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
          
                          // Use the lease-specific verification function
        const { getLeaseVerificationStatus } = await import('@/services/verification');
        const verificationStatus = getLeaseVerificationStatus(futureLease);

          // Calculate total income - only for verified leases
          let totalIncome = 0;
          if (verificationStatus === 'Verified') {
            // For verified leases, use verified income (calculatedAnnualizedIncome or verifiedIncome)
            console.log(`[FUTURE LEASE AMI DEBUG] Lease ${futureLease.id} residents:`, (futureLease.Resident || []).map(r => ({
              name: r.name,
              calculatedAnnualizedIncome: r.calculatedAnnualizedIncome,
              verifiedIncome: r.verifiedIncome,
              incomeFinalized: r.incomeFinalized
            })));
            
            totalIncome = (futureLease.Resident || []).reduce((acc: number, resident: any) => {
              const calculatedIncome = resident.calculatedAnnualizedIncome ? Number(resident.calculatedAnnualizedIncome) : 0;
              const verifiedIncome = resident.verifiedIncome ? Number(resident.verifiedIncome) : 0;
              const income = calculatedIncome || verifiedIncome || 0;
              
              // CRITICAL: Future leases should NEVER use annualizedIncome (rent roll income)
              // They should ONLY use verified income from the income verification process
              if (income === 0 && resident.annualizedIncome) {
                console.log(`[FUTURE LEASE AMI WARNING] Resident ${resident.name} has rent roll income ($${resident.annualizedIncome}) but no verified income - CORRECTLY not using rent roll income for AMI calculation`);
              }
              
              console.log(`[FUTURE LEASE AMI DEBUG] Resident ${resident.name}: calculated=${calculatedIncome}, verified=${verifiedIncome}, final=${income}, rentRollIncome=${resident.annualizedIncome || 0}`);
              return acc + income;
            }, 0);
            
            console.log(`[FUTURE LEASE AMI DEBUG] Lease ${futureLease.id} total income: $${totalIncome}`);
          }
          // For non-verified future leases, totalIncome stays 0 (no rent roll data exists)

          // Generate lease name (first resident name + others)
          const residentNames = (futureLease.Resident || []).map((r: any) => r.name);
          const leaseName = residentNames.length > 1 
            ? `${residentNames[0]} + ${residentNames.length - 1} other${residentNames.length > 2 ? 's' : ''}`
            : residentNames[0] || 'Future Lease';

          // Only calculate compliance bucket if income is verified AND we have actual verified income
          let complianceBucket = '-';
          if (verificationStatus === 'Verified' && totalIncome > 0) {
            const hudIncomeLimits = await getHudIncomeLimits(property.county, property.state);
            console.log(`[FUTURE LEASE AMI DEBUG] AMI calculation for lease ${futureLease.id}:`, {
              verificationStatus,
              totalIncome,
              residentCount: (futureLease.Resident || []).length,
              complianceOption: property.complianceOption || "20% at 50% AMI, 55% at 80% AMI",
              county: property.county,
              state: property.state
            });
            
            complianceBucket = getActualAmiBucket(
              totalIncome,
              (futureLease.Resident || []).length,
              hudIncomeLimits,
              property.complianceOption || "20% at 50% AMI, 55% at 80% AMI"
            );
            
            console.log(`[FUTURE LEASE AMI DEBUG] Calculated AMI bucket: ${complianceBucket}`);
          } else {
            console.log(`[FUTURE LEASE AMI DEBUG] Lease ${futureLease.id} - Not calculating AMI bucket:`, {
              verificationStatus,
              totalIncome,
              reason: verificationStatus !== 'Verified' ? 'Not verified' : 'No verified income'
            });
          }

        unitData.futureLease = {
          id: futureLease.id,
          leaseName,
          verificationStatus,
          totalIncome: parseFloat(totalIncome.toString()),
          complianceBucket,
          leaseStartDate: futureLease.leaseStartDate?.toISOString() || '',
          isToggled: false, // Default to not toggled - will be managed by frontend state
          residents: futureLease.Resident
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