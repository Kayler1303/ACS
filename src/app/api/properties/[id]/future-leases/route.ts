import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '../../../../../lib/prisma';
import { getActualAmiBucket } from '../../../../../services/income';
import { getHudIncomeLimits } from '../../../../../services/hud';
import { getLeaseVerificationStatus } from '../../../../../services/verification';

// Disable caching for this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  console.error(`🚀 FUTURE LEASE API STARTED at ${new Date().toISOString()}`);
  
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: propertyId } = await params;
    const { searchParams } = new URL(request.url);
    const rentRollId = searchParams.get('rentRollId');
    
    console.error(`🔍 FUTURE LEASE API: Property ${propertyId}, RentRoll ${rentRollId || 'latest'}`);
    
    const queryStart = Date.now();

    // Optimized query - only get what we need
    const property = await prisma.property.findUnique({
      where: { 
        id: propertyId,
        ownerId: (session.user as any).id 
      },
      include: {
        Unit: {
          include: {
            Lease: {
              where: {
                // Only get leases that could potentially be future leases
                OR: [
                  { leaseStartDate: null }, // Manual future leases with no date
                  { leaseStartDate: { gt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } } // Leases within last year
                ]
              },
              include: {
                Resident: {
                  include: {
                    IncomeDocument: {
                      select: {
                        id: true,
                        documentType: true,
                        status: true
                      }
                    }
                  }
                },
                IncomeVerification: {
                  orderBy: {
                    createdAt: 'desc'
                  },
                  take: 1 // Only get the latest verification
                },
                Tenancy: {
                  select: {
                    id: true,
                    rentRollId: true
                  }
                }
              }
            }
          }
        },
        RentRoll: {
          orderBy: {
            uploadDate: 'desc'
          }
        }
      }
    });

    const queryEnd = Date.now();
    console.error(`⏱️ DATABASE QUERY took ${queryEnd - queryStart}ms`);

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    console.error(`📊 PROPERTY DATA: ${property.Unit.length} units, ${property.RentRoll.length} rent rolls`);

    // Get the target rent roll date for filtering future leases
    let targetRentRoll;
    if (rentRollId) {
      targetRentRoll = property.RentRoll.find(rr => rr.id === rentRollId);
    } else {
      targetRentRoll = property.RentRoll[0]; // Most recent
    }
    const rentRollDate = targetRentRoll ? new Date(targetRentRoll.uploadDate) : new Date();
    
    const processingStart = Date.now();

    const units: UnitFutureLeaseData[] = [];

    // Process each unit efficiently
    for (const unit of property.Unit) {
      try {
        const unitData: UnitFutureLeaseData = {
          unitId: unit.id,
          unitNumber: unit.unitNumber
        };

        // Filter for future leases efficiently
        const futureLeases = unit.Lease.filter((lease: any) => {
          // Skip processed leases
          if (lease.name.startsWith('[PROCESSED]')) {
            return false;
          }
          
          // Check if lease has current tenancy for this rent roll
          const hasCurrentTenancy = lease.Tenancy && targetRentRoll && lease.Tenancy.rentRollId === targetRentRoll.id;
          
          // If no current tenancy, check if it's a future lease
          if (!hasCurrentTenancy) {
            // Manual future lease with no date
            if (!lease.leaseStartDate) {
              return true;
            }
            
            // Automatic future lease (starts after rent roll date)
            const leaseStartDate = new Date(lease.leaseStartDate);
            return leaseStartDate > rentRollDate;
          }
          
          return false;
        });
        if (futureLeases.length > 0) {
          // Get the most recent future lease
          const futureLease = futureLeases[0];
          
          // Use the lease-specific verification function
          const { getLeaseVerificationStatus } = await import('../../../../../services/verification');
          let verificationStatus = getLeaseVerificationStatus({...futureLease, Tenancy: null} as any);
          
          // Override status if we have FINALIZED verifications
          if (verificationStatus === 'In Progress - Finalize to Process' && 
              futureLease.IncomeVerification && 
              futureLease.IncomeVerification.some((v: any) => v.status === 'FINALIZED')) {
            verificationStatus = 'Verified';
          }

          // Calculate total income - only for verified leases
          let totalIncome = 0;
          if (verificationStatus === 'Verified') {
            totalIncome = (futureLease.Resident || []).reduce((acc: number, resident: any) => {
              const calculatedIncome = resident.calculatedAnnualizedIncome ? Number(resident.calculatedAnnualizedIncome) : 0;
              const verifiedIncome = resident.verifiedIncome ? Number(resident.verifiedIncome) : 0;
              return acc + (calculatedIncome || verifiedIncome || 0);
            }, 0);
          }

          // Generate lease name (first resident name + others)
          const residentNames = (futureLease.Resident || []).map((r: any) => r.name);
          const leaseName = residentNames.length > 1 
            ? `${residentNames[0]} + ${residentNames.length - 1} other${residentNames.length > 2 ? 's' : ''}`
            : residentNames[0] || 'Future Lease';

          // Calculate compliance bucket for verified leases with income
          let complianceBucket = '-';
          if (verificationStatus === 'Verified' && totalIncome > 0) {
            // For performance, we'll calculate AMI buckets in a batch after processing all units
            // For now, just mark that this unit needs AMI calculation
            complianceBucket = 'Calculating...';
          }

          unitData.futureLease = {
            id: futureLease.id,
            leaseName,
            verificationStatus,
            totalIncome: parseFloat(totalIncome.toString()),
            complianceBucket,
            leaseStartDate: futureLease.leaseStartDate?.toISOString() || '',
            isToggled: false,
            residents: futureLease.Resident
          };
        }

        units.push(unitData);
      } catch (error) {
        console.error(`Error processing unit ${unit.unitNumber}:`, error);
        // Continue processing other units
      }
    }
    
    // Filter to only return units that have future leases
    const unitsWithFutureLeases = units.filter(unit => unit.futureLease);
    
    const processingEnd = Date.now();
    console.error(`⏱️ PROCESSING took ${processingEnd - processingStart}ms`);
    
    // Batch calculate AMI buckets with timeout protection
    const amiStart = Date.now();
    const unitsNeedingAmi = unitsWithFutureLeases.filter(unit => 
      unit.futureLease?.complianceBucket === 'Calculating...'
    );
    
    if (unitsNeedingAmi.length > 0) {
      try {
        console.error(`🔢 Calculating AMI for ${unitsNeedingAmi.length} units using robust HUD API approach`);
        
        // Use the same robust approach as the income-limits API
        const currentYear = new Date().getFullYear();
        let hudIncomeLimits;
        
        try {
          // Try current year first
          hudIncomeLimits = await getHudIncomeLimits(property.county, property.state, currentYear, property.placedInServiceDate || undefined);
        } catch (error) {
          // Fall back to previous year if current year fails
          const fallbackYear = currentYear - 1;
          console.log(`Failed to fetch ${currentYear} limits, falling back to ${fallbackYear}:`, error);
          hudIncomeLimits = await getHudIncomeLimits(property.county, property.state, fallbackYear, property.placedInServiceDate || undefined);
          console.log(`Successfully fetched ${fallbackYear} limits as fallback`);
        }
        
        for (const unit of unitsNeedingAmi) {
          if (unit.futureLease) {
            unit.futureLease.complianceBucket = getActualAmiBucket(
              unit.futureLease.totalIncome,
              unit.futureLease.residents.length,
              hudIncomeLimits,
              property.complianceOption || "20% at 50% AMI, 55% at 80% AMI"
            );
          }
        }
        console.error(`✅ AMI calculations completed successfully`);
      } catch (hudError: any) {
        console.error('⚠️ HUD API failed for both current and previous year:', hudError?.message || hudError);
        // Set fallback messages when HUD API completely fails
        for (const unit of unitsNeedingAmi) {
          if (unit.futureLease) {
            // For $0 income, show proper message instead of trying to calculate AMI
            if (unit.futureLease.totalIncome === 0) {
              unit.futureLease.complianceBucket = 'No Income Information';
            } else {
              unit.futureLease.complianceBucket = 'HUD API Unavailable';
            }
          }
        }
      }
    }
    
    const amiEnd = Date.now();
    console.error(`🔢 AMI calculation took ${amiEnd - amiStart}ms`);
    
    const endTime = Date.now();
    console.error(`🏁 TOTAL API TIME: ${endTime - startTime}ms`);
    console.error(`📈 FOUND ${unitsWithFutureLeases.length} units with future leases`);

    return NextResponse.json({ 
      units: unitsWithFutureLeases,
      totalFutureLeases: unitsWithFutureLeases.length,
      processingTime: endTime - startTime
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    console.error('Error fetching future leases:', error);
    return NextResponse.json(
      { error: 'Failed to fetch future leases data' },
      { status: 500 }
    );
  }
} 