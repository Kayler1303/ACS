import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '../../../../../lib/prisma';
import { getActualAmiBucket } from '../../../../../services/income';
import { getHudIncomeLimits } from '../../../../../services/hud';
import { getLeaseVerificationStatus } from '../../../../../services/verification';
import { isFutureLease, debugLeaseClassification } from '../../../../../lib/lease-classification';

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
    // Only use rent rolls that have valid snapshots (exclude orphaned rent rolls)
    let targetRentRoll;
    if (rentRollId) {
      targetRentRoll = property.RentRoll.find(rr => rr.id === rentRollId && rr.snapshotId);
    } else {
      // Find the most recent rent roll that has a valid snapshot
      targetRentRoll = property.RentRoll.find(rr => rr.snapshotId);
    }
    
    if (!targetRentRoll) {
      console.error(`❌ No valid rent roll with snapshot found for property ${propertyId}`);
      return NextResponse.json({ 
        units: [],
        totalFutureLeases: 0,
        processingTime: 0
      }, { status: 200 });
    }
    
    console.error(`🎯 Selected rent roll: ${targetRentRoll.id} (${targetRentRoll.uploadDate}) with snapshot: ${targetRentRoll.snapshotId}`);
    const rentRollDate = new Date(targetRentRoll.uploadDate);
    
    const processingStart = Date.now();

    const units: UnitFutureLeaseData[] = [];

    // Process each unit efficiently
    for (const unit of property.Unit) {
      try {
        const unitData: UnitFutureLeaseData = {
          unitId: unit.id,
          unitNumber: unit.unitNumber
        };

        // Filter for future leases using consistent date-based classification
        const futureLeases = unit.Lease.filter((lease: any) => {
          // Skip processed leases
          if (lease.name && lease.name.startsWith('[PROCESSED]')) {
            return false;
          }
          
          // Use consistent date-based classification
          return isFutureLease(lease, rentRollDate);
        });
        
        if (futureLeases.length > 0) {
          // Sort future leases to prioritize FINALIZED verifications first, then by creation date
          const sortedFutureLeases = futureLeases.sort((a: any, b: any) => {
            // First priority: FINALIZED verifications
            const aHasFinalized = a.IncomeVerification && a.IncomeVerification.some((v: any) => v.status === 'FINALIZED');
            const bHasFinalized = b.IncomeVerification && b.IncomeVerification.some((v: any) => v.status === 'FINALIZED');
            
            if (aHasFinalized && !bHasFinalized) return -1;
            if (!aHasFinalized && bHasFinalized) return 1;
            
            // Second priority: Most recent creation date
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });
          
          // Get the highest priority future lease
          const futureLease = sortedFutureLeases[0];
          
          console.log(`[FUTURE LEASES API DEBUG] Unit ${unit.unitNumber} lease selection:`, {
            totalFutureLeases: futureLeases.length,
            selectedLeaseId: futureLease.id,
            selectedLeaseCreatedAt: futureLease.createdAt,
            hasFinalized: futureLease.IncomeVerification && futureLease.IncomeVerification.some((v: any) => v.status === 'FINALIZED'),
            allLeaseIds: futureLeases.map((l: any) => ({ id: l.id, createdAt: l.createdAt, hasFinalized: l.IncomeVerification && l.IncomeVerification.some((v: any) => v.status === 'FINALIZED') }))
          });
          
          // Use the lease-specific verification function
          const { getLeaseVerificationStatus } = await import('../../../../../services/verification');
          let verificationStatus = getLeaseVerificationStatus({...futureLease, Tenancy: null} as any);
          
          console.log(`[FUTURE LEASES API DEBUG] Unit ${unit.unitNumber} Lease ${futureLease.id}:`, {
            initialStatus: verificationStatus,
            hasIncomeVerification: !!futureLease.IncomeVerification,
            verificationCount: futureLease.IncomeVerification?.length || 0,
            verificationStatuses: futureLease.IncomeVerification?.map((v: any) => v.status) || [],
            shouldOverride: verificationStatus === 'In Progress - Finalize to Process' && 
                           futureLease.IncomeVerification && 
                           futureLease.IncomeVerification.some((v: any) => v.status === 'FINALIZED')
          });
          
          // Override status if we have FINALIZED verifications
          if (verificationStatus === 'In Progress - Finalize to Process' && 
              futureLease.IncomeVerification && 
              futureLease.IncomeVerification.some((v: any) => v.status === 'FINALIZED')) {
            console.log(`[FUTURE LEASES API DEBUG] Overriding status: ${verificationStatus} -> Verified`);
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
      console.error(`🔢 Skipping HUD API calls - will use frontend cached data for AMI calculations`);
      
      // Don't make HUD API calls from the backend - let the frontend handle AMI calculations
      // The frontend has cached HUD data and can calculate AMI buckets client-side
      for (const unit of unitsNeedingAmi) {
        if (unit.futureLease) {
          // For $0 income, show proper message
          if (unit.futureLease.totalIncome === 0) {
            unit.futureLease.complianceBucket = 'No Income Information';
          } else {
            // Let frontend calculate AMI using cached data
            unit.futureLease.complianceBucket = 'Calculate Client-Side';
          }
        }
      }
      console.error(`✅ AMI calculation deferred to frontend (using cached HUD data)`);
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