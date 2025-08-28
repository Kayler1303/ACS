import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '../../../../../lib/prisma';
import { getActualAmiBucket } from '../../../../../services/income';
import { getHudIncomeLimits } from '../../../../../services/hud';

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
  console.log(`[FUTURE LEASE API] ======================== GET REQUEST RECEIVED ========================`);
  console.log(`[FUTURE LEASE API] Request URL: ${request.url}`);
  console.log(`[FUTURE LEASE API] Method: ${request.method}`);
  console.log(`[FUTURE LEASE API] Headers:`, Object.fromEntries(request.headers.entries()));
  
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: propertyId } = await params;
    const { searchParams } = new URL(request.url);
    const rentRollId = searchParams.get('rentRollId');
    
    console.log(`[FUTURE LEASE API] Property ID: ${propertyId}`);
    console.log(`[FUTURE LEASE API] RentRoll ID: ${rentRollId || 'latest'}`);
    console.log(`[FUTURE LEASE API] Request URL: ${request.url}`);
    console.log(`[FUTURE LEASE API] ============================================================================`);
    
    // Force a visible log that should definitely appear
    console.error(`🚀 FUTURE LEASE API CALLED FOR PROPERTY: ${propertyId}, RENT ROLL: ${rentRollId || 'latest'}`);
    
    // Write to file to confirm API is being called
    try {
      const fs = await import('fs');
      fs.appendFileSync('/tmp/future-lease-debug.log', `${new Date().toISOString()} - API called for property ${propertyId}\n`);
      fs.appendFileSync('/tmp/future-lease-debug.log', `${new Date().toISOString()} - About to query property with units\n`);
    } catch (e) {
      // Ignore file write errors
    }

    // Get property with units and their future leases
    const property = await prisma.property.findUnique({
      where: { 
        id: propertyId,
        ownerId: (session.user as any).id 
      },
      include: {
        Unit: {
          include: {
            Lease: {
              // Get all leases - we'll filter for future ones later
              // Some future leases might have tenancy records if they're in the current rent roll
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
                },
                Tenancy: true // Include tenancy to check if lease is current or future
              },
              orderBy: {
                leaseStartDate: 'desc'
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

    if (!property) {
      try {
        const fs = await import('fs');
        fs.appendFileSync('/tmp/future-lease-debug.log', `${new Date().toISOString()} - Property not found!\n`);
      } catch (e) {}
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    // Get the target rent roll date for filtering future leases
    let targetRentRoll;
    if (rentRollId) {
      targetRentRoll = property.RentRoll.find(rr => rr.id === rentRollId);
    } else {
      targetRentRoll = property.RentRoll[0]; // Most recent
    }
    const rentRollDate = targetRentRoll ? new Date(targetRentRoll.uploadDate) : new Date();

    try {
      const fs = await import('fs');
      fs.appendFileSync('/tmp/future-lease-debug.log', `${new Date().toISOString()} - Property found with ${property.Unit.length} units\n`);
      fs.appendFileSync('/tmp/future-lease-debug.log', `${new Date().toISOString()} - Rent roll date: ${rentRollDate.toISOString()}\n`);
    } catch (e) {}

    const units: UnitFutureLeaseData[] = [];

    console.error(`🔍 STARTING TO PROCESS ${property.Unit.length} UNITS FOR FUTURE LEASES`);

        // Process each unit
    for (const unit of property.Unit) {
      console.log(`[FUTURE LEASE API] ========== Processing Unit ${unit.unitNumber} ==========`);
      
      const unitData: UnitFutureLeaseData = {
        unitId: unit.id,
        unitNumber: unit.unitNumber
      };



      // Find future leases (leases that start after rent roll date OR have null start date)
      console.log(`[FUTURE LEASE DEBUG] Unit ${unit.unitNumber} - Total leases: ${unit.Lease.length}`);
      console.log(`[FUTURE LEASE DEBUG] Unit ${unit.unitNumber} - Rent roll date: ${rentRollDate.toISOString()}`);
      console.log(`[FUTURE LEASE DEBUG] Unit ${unit.unitNumber} - Current date: ${new Date().toISOString()}`);
      
      unit.Lease.forEach((lease: any, index: number) => {
        console.log(`[FUTURE LEASE DEBUG] Unit ${unit.unitNumber} - Lease ${index + 1}:`, {
          id: lease.id,
          name: lease.name,
          leaseStartDate: lease.leaseStartDate?.toISOString() || 'null',
          hasResidents: (lease.Resident || []).length > 0,
          residentCount: (lease.Resident || []).length,
          hasTenancy: !!lease.Tenancy
        });
        
        // Also write to debug file (removed to fix compilation error)
      });
      
      const futureLeases = unit.Lease.filter((lease: any) => {
        // If start date is null, this could be a future lease (like "August 2025 Lease Renewal")
        if (!lease.leaseStartDate) {
          console.log(`[FUTURE LEASE DEBUG] Unit ${unit.unitNumber} - Including lease with null start date: ${lease.name}`);
          return true; // Include leases with null start dates as potential future leases
        }
        
        const leaseStartDate = new Date(lease.leaseStartDate);
        const now = new Date();
        const isAfterNow = leaseStartDate > now;
        const isAfterRentRoll = leaseStartDate > rentRollDate;
        
        // A lease is considered "future" if it starts after the rent roll date
        // This means leases that start after the snapshot date are "future leases"
        const isFutureLease = isAfterRentRoll;
        
        console.log(`[FUTURE LEASE DEBUG] Unit ${unit.unitNumber} - Lease ${lease.name}:`, {
          leaseStart: leaseStartDate.toISOString(),
          now: now.toISOString(),
          rentRollDate: rentRollDate.toISOString(),
          isAfterNow,
          isAfterRentRoll,
          hasTenancy: !!lease.Tenancy,
          isFutureLease
        });
        
        return isFutureLease;
      });
      
      console.log(`[FUTURE LEASE DEBUG] Unit ${unit.unitNumber} - Found ${futureLeases.length} future leases`);

        if (futureLeases.length > 0) {
          // Get the most recent future lease
          const futureLease = futureLeases[0];
          
                          // Use the lease-specific verification function
        const { getLeaseVerificationStatus } = await import('../../../../../services/verification');
        const verificationStatus = getLeaseVerificationStatus({...futureLease, Tenancy: null} as any);

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

                  console.log(`[FUTURE LEASE AMI DEBUG] Processing lease ${futureLease.id} (Unit ${unit.unitNumber}):`, {
          leaseName,
          verificationStatus,
          totalIncome,
          residents: (futureLease.Resident || []).map(r => ({
            name: r.name,
            calculatedIncome: r.calculatedAnnualizedIncome ? Number(r.calculatedAnnualizedIncome) : 0,
            verifiedIncome: r.verifiedIncome ? Number(r.verifiedIncome) : 0,
            incomeFinalized: r.incomeFinalized
          }))
        });

        // Only calculate compliance bucket if income is verified AND we have actual verified income
        let complianceBucket = '-';
        if (verificationStatus === 'Verified' && totalIncome > 0) {
          try {
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
          } catch (hudError) {
            console.error(`[FUTURE LEASE AMI DEBUG] Failed to fetch HUD income limits for AMI calculation:`, hudError);
            complianceBucket = 'Error loading AMI data';
          }
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

    console.log(`[FUTURE LEASE API] Final results:`, {
      totalUnits: units.length,
      unitsWithFutureLeases: unitsWithFutureLeases.length,
      rentRollDate: rentRollDate.toISOString(),
      units: units.map(u => ({
        unitId: u.unitId,
        unitNumber: u.unitNumber,
        hasFutureLease: !!u.futureLease,
        totalLeases: property.Unit.find(unit => unit.id === u.unitId)?.Lease.length || 0
      }))
    });

    return NextResponse.json({ 
      units: unitsWithFutureLeases,
      totalFutureLeases: unitsWithFutureLeases.length,
      debug: {
        totalUnitsProcessed: units.length,
        rentRollDate: rentRollDate.toISOString(),
        sampleLeases: units.slice(0, 3).map(u => ({
          unitNumber: u.unitNumber,
          totalLeases: property.Unit.find(unit => unit.id === u.unitId)?.Lease.length || 0,
          leaseStartDates: property.Unit.find(unit => unit.id === u.unitId)?.Lease.map(l => l.leaseStartDate?.toISOString() || 'null') || []
        }))
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