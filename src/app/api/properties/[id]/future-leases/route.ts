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

    // STEP 2: If we're filtering by a specific rent roll, also look for preserved future leases
    // that were created during snapshot creation for that rent roll
    let preservedFutureLeases: any[] = [];
    if (rentRollId && targetRentRoll) {
      console.log(`[FUTURE LEASE API] 🔍 Looking for preserved future leases for rent roll ${rentRollId}`);
      console.log(`[FUTURE LEASE API] 🔍 Target rent roll upload date: ${targetRentRoll.uploadDate}`);
      
      // Find the snapshot that corresponds to this rent roll
      const snapshot = await prisma.rentRollSnapshot.findFirst({
        where: {
          propertyId: propertyId,
          uploadDate: targetRentRoll.uploadDate
        }
      });

      console.log(`[FUTURE LEASE API] 🔍 Snapshot query result:`, snapshot ? `Found ${snapshot.id}` : 'Not found');

      if (snapshot) {
        console.log(`[FUTURE LEASE API] 📸 Found snapshot ${snapshot.id} for rent roll date ${targetRentRoll.uploadDate}`);
        
        // Find preserved future leases that were created during this snapshot
        // These are leases created around the same time as the snapshot with no Tenancy
        const snapshotTime = new Date(snapshot.uploadDate);
        const timeWindow = 5 * 60 * 1000; // 5 minutes window
        const startTime = new Date(snapshotTime.getTime() - timeWindow);
        const endTime = new Date(snapshotTime.getTime() + timeWindow);
        
        console.log(`[FUTURE LEASE API] 🔍 Searching for preserved leases created between ${startTime.toISOString()} and ${endTime.toISOString()}`);
        
        preservedFutureLeases = await prisma.lease.findMany({
          where: {
            Unit: {
              propertyId: propertyId
            },
            Tenancy: null, // Future leases don't have Tenancy records
            createdAt: {
              gte: startTime,
              lte: endTime
            },
            NOT: {
              name: {
                startsWith: '[PROCESSED]'
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
              orderBy: {
                createdAt: 'desc'
              }
            }
          }
        });
        
        console.log(`[FUTURE LEASE API] 🔍 Found ${preservedFutureLeases.length} preserved future leases for snapshot`);
        
        // Log details of each preserved lease found
        preservedFutureLeases.forEach((lease, index) => {
          console.log(`[FUTURE LEASE API] 📋 Preserved lease ${index + 1}: "${lease.name}" in unit ${lease.Unit.unitNumber}, created at ${lease.createdAt.toISOString()}`);
          
        });
      } else {
        console.log(`[FUTURE LEASE API] ❌ No snapshot found for rent roll date ${targetRentRoll.uploadDate}`);
        
        // Let's also check what snapshots exist for this property
        const allSnapshots = await prisma.rentRollSnapshot.findMany({
          where: { propertyId: propertyId },
          orderBy: { uploadDate: 'desc' }
        });
        console.log(`[FUTURE LEASE API] 📊 All snapshots for property:`, allSnapshots.map(s => ({ id: s.id, uploadDate: s.uploadDate.toISOString() })));
      }
    }

    try {
      const fs = await import('fs');
      fs.appendFileSync('/tmp/future-lease-debug.log', `${new Date().toISOString()} - Property found with ${property.Unit.length} units\n`);
      fs.appendFileSync('/tmp/future-lease-debug.log', `${new Date().toISOString()} - Rent roll date: ${rentRollDate.toISOString()}\n`);
      fs.appendFileSync('/tmp/future-lease-debug.log', `${new Date().toISOString()} - Preserved future leases: ${preservedFutureLeases.length}\n`);
    } catch (e) {}

    const units: UnitFutureLeaseData[] = [];

    console.error(`🔍 STARTING TO PROCESS ${property.Unit.length} UNITS FOR FUTURE LEASES`);
    
    // Log all unit numbers to see if Unit 1216 is included
    const allUnitNumbers = property.Unit.map(u => u.unitNumber).sort();
    console.error(`🚨🚨🚨 ALL UNIT NUMBERS IN FUTURE LEASES API: [${allUnitNumbers.join(', ')}] 🚨🚨🚨`);
    console.error(`🚨🚨🚨 UNIT 1216 EXISTS IN FUTURE LEASES API: ${allUnitNumbers.includes('1216')} 🚨🚨🚨`);

        // Process each unit
    let processedCount = 0;
    for (const unit of property.Unit) {
      try {
        processedCount++;
        console.log(`[FUTURE LEASE API] ========== Processing Unit ${unit.unitNumber} (${processedCount}/${property.Unit.length}) ==========`);
        console.error(`🔄 PROCESSING UNIT ${processedCount}: ${unit.unitNumber}`);
      
      // Special debugging for Unit 1216
      if (unit.unitNumber === '1216') {
        console.error(`🚨🚨🚨 UNIT 1216 FOUND IN FUTURE LEASES API! 🚨🚨🚨`);
        console.error(`🚨🚨🚨 Unit 1216 has ${unit.Lease.length} leases 🚨🚨🚨`);
        unit.Lease.forEach((lease: any, index: number) => {
          console.error(`🚨🚨🚨 Unit 1216 Lease ${index + 1}: ${lease.name}, Start: ${lease.leaseStartDate?.toISOString() || 'null'}, Tenancy: ${!!lease.Tenancy}, TenancyId: ${lease.Tenancy?.id || 'null'} 🚨🚨🚨`);
        });
        
        // Also log preserved future leases for this unit
        const preservedForUnit = preservedFutureLeases.filter(lease => lease.Unit.unitNumber === '1216');
        console.error(`🚨🚨🚨 Unit 1216 preserved future leases: ${preservedForUnit.length} 🚨🚨🚨`);
        preservedForUnit.forEach((lease: any, index: number) => {
          console.error(`🚨🚨🚨 Unit 1216 Preserved Lease ${index + 1}: ${lease.name}, Start: ${lease.leaseStartDate?.toISOString() || 'null'}, Tenancy: ${!!lease.Tenancy} 🚨🚨🚨`);
        });
      }
      
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
      
      // Add preserved future leases for this unit to the unit's lease list
      const allLeasesForUnit = [...unit.Lease];
      const preservedLeasesForUnit = preservedFutureLeases.filter(lease => lease.Unit.unitNumber === unit.unitNumber);
      
      if (preservedLeasesForUnit.length > 0) {
        console.log(`[FUTURE LEASE DEBUG] Unit ${unit.unitNumber} - Adding ${preservedLeasesForUnit.length} preserved future leases`);
        allLeasesForUnit.push(...preservedLeasesForUnit);
      }

      const futureLeases = allLeasesForUnit.filter((lease: any) => {
        // Filter out processed leases (marked with [PROCESSED] prefix)
        if (lease.name.startsWith('[PROCESSED]')) {
          console.log(`[FUTURE LEASE DEBUG] Unit ${unit.unitNumber} - Excluding processed lease: ${lease.name}`);
          return false;
        }
        
        // ALIGN WITH VERIFICATION STATUS API: A lease is "future" if it has no Tenancy record FOR THE CURRENT RENT ROLL
        // This matches the logic in verification-status API more precisely
        const hasCurrentTenancy = lease.Tenancy && targetRentRoll && lease.Tenancy.rentRollId === targetRentRoll.id;
        const hasStartDate = !!lease.leaseStartDate;
        
        // If start date is null, this could be a future lease (like "August 2025 Lease Renewal")
        if (!lease.leaseStartDate) {
          console.log(`[FUTURE LEASE DEBUG] Unit ${unit.unitNumber} - Including lease with null start date: ${lease.name}`);
          if (unit.unitNumber === '1216') {
            console.error(`🚨🚨🚨 Unit 1216 - NULL START DATE LEASE: ${lease.name} 🚨🚨🚨`);
          }
          return true; // Include leases with null start dates as potential future leases
        }
        
        // UPDATED LOGIC: Use same definition as verification-status API
        // A lease is "future" if it has no Tenancy record FOR THE CURRENT RENT ROLL and has a start date
        const isFutureLease = !hasCurrentTenancy && hasStartDate;
        
        const leaseStartDate = new Date(lease.leaseStartDate);
        const now = new Date();
        const isAfterNow = leaseStartDate > now;
        const isAfterRentRoll = leaseStartDate > rentRollDate;
        
        // Special debugging for Unit 1216
        if (unit.unitNumber === '1216') {
          console.error(`🚨🚨🚨 Unit 1216 FILTERING - Lease ${lease.name}:`, {
            leaseStart: leaseStartDate.toISOString(),
            now: now.toISOString(),
            rentRollDate: rentRollDate.toISOString(),
            isAfterNow,
            isAfterRentRoll,
            hasTenancy: !!lease.Tenancy,
            tenancyRentRollId: lease.Tenancy?.rentRollId || 'null',
            targetRentRollId: targetRentRoll?.id || 'null',
            hasCurrentTenancy,
            hasStartDate,
            isFutureLease: isFutureLease,
            reason: isFutureLease ? 'No Current Tenancy + has start date' : (hasCurrentTenancy ? 'Has Current Tenancy' : 'No start date'),
            tenancyId: lease.Tenancy?.id || 'null'
          });
        }
        
        console.log(`[FUTURE LEASE DEBUG] Unit ${unit.unitNumber} - Lease ${lease.name}:`, {
          leaseStart: leaseStartDate.toISOString(),
          now: now.toISOString(),
          rentRollDate: rentRollDate.toISOString(),
          isAfterNow,
          isAfterRentRoll,
          hasTenancy: !!lease.Tenancy,
          hasCurrentTenancy,
          hasStartDate,
          isFutureLease: isFutureLease,
          reason: isFutureLease ? 'No Current Tenancy + has start date' : (hasCurrentTenancy ? 'Has Current Tenancy' : 'No start date')
        });
        
        return isFutureLease;
      });
      
      console.log(`[FUTURE LEASE DEBUG] Unit ${unit.unitNumber} - Found ${futureLeases.length} future leases`);
      
      // Special debugging for Unit 1216 final result
      if (unit.unitNumber === '1216') {
        console.error(`🚨🚨🚨 Unit 1216 FINAL RESULT: Found ${futureLeases.length} future leases 🚨🚨🚨`);
        futureLeases.forEach((lease: any, index: number) => {
          console.error(`🚨🚨🚨 Unit 1216 Future Lease ${index + 1}: ${lease.name}, Start: ${lease.leaseStartDate?.toISOString() || 'null'} 🚨🚨🚨`);
        });
      }

        if (futureLeases.length > 0) {
          // Get the most recent future lease
          const futureLease = futureLeases[0];
          
                          // Use the lease-specific verification function
        const { getLeaseVerificationStatus } = await import('../../../../../services/verification');
        
        // Debug logging for Unit 310 verification status calculation
        if (unit.unitNumber === '310') {
          console.log(`[UNIT ${unit.unitNumber} LEASE DEBUG] Future lease data for verification:`, {
            leaseId: futureLease.id,
            leaseName: futureLease.name,
            totalResidents: (futureLease.Resident || []).length,
            residents: (futureLease.Resident || []).map(r => ({
              name: r.name,
              incomeFinalized: r.incomeFinalized,
              hasNoIncome: r.hasNoIncome,
              finalizedAt: r.finalizedAt,
              verifiedIncome: r.verifiedIncome,
              calculatedAnnualizedIncome: r.calculatedAnnualizedIncome
            }))
          });
        }
        
        let verificationStatus = getLeaseVerificationStatus({...futureLease, Tenancy: null} as any);
        
        // TEMPORARY FIX: If the calculated status is "In Progress" but we have FINALIZED verifications,
        // override the status to "Verified". This handles cases where preserved data has incorrect
        // incomeFinalized flags but the verification itself is FINALIZED.
        if (verificationStatus === 'In Progress - Finalize to Process' && 
            futureLease.IncomeVerification && 
            futureLease.IncomeVerification.some((v: any) => v.status === 'FINALIZED')) {
          console.log(`[FUTURE LEASE API] Overriding status for lease ${futureLease.id}: ${verificationStatus} -> Verified (has FINALIZED verification)`);
          verificationStatus = 'Verified';
        }
        
        if (unit.unitNumber === '310') {
          console.log(`[UNIT 310 LEASE DEBUG] Calculated verification status:`, verificationStatus);
        }

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
      } catch (error) {
        console.error(`🚨 ERROR processing unit ${unit.unitNumber}:`, error);
        console.error(`🚨 Unit processing stopped at unit ${processedCount}: ${unit.unitNumber}`);
        // Continue processing other units instead of stopping
      }
    }
    
    console.error(`🏁 FINISHED PROCESSING ${processedCount} UNITS OUT OF ${property.Unit.length} TOTAL`);

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