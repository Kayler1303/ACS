import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

interface IncomeDiscrepancy {
  unitNumber: string | number;
  residentName: string;
  verifiedIncome: number;
  newRentRollIncome: number;
  discrepancy: number;
  existingLeaseId: string;
  newLeaseId: string;
  existingResidentId: string;
  newResidentId: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id: propertyId } = await params;
  const url = new URL(req.url);
  const rentRollId = url.searchParams.get('rentRollId');

  if (!propertyId) {
    return NextResponse.json({ error: 'Property ID is required' }, { status: 400 });
  }

  if (!rentRollId) {
    return NextResponse.json({ error: 'Rent roll ID is required' }, { status: 400 });
  }

  try {
    const discrepancies: IncomeDiscrepancy[] = [];
    
    // Get the rent roll data
    const rentRoll = await prisma.rentRoll.findUnique({
      where: { 
        id: rentRollId,
        propertyId: propertyId
      },
      include: {
        Tenancy: {
          include: {
            Lease: {
              include: {
                Resident: true,
                Unit: true
              }
            }
          }
        }
      }
    });

    if (!rentRoll) {
      return NextResponse.json({ error: 'Rent roll not found' }, { status: 404 });
    }

    // For each new tenancy, check if there are existing leases with verified income
    for (const tenancy of rentRoll.Tenancy) {
      const unit = tenancy.Lease.Unit;
      const newResidents = tenancy.Lease.Resident;
      
      // Get the most recent CURRENT lease for this unit that has verified income (not the new lease)
      // Only look at leases that have Tenancy records (current leases), not future leases
      const existingLeases = await prisma.lease.findMany({
        where: {
          unitId: unit.id,
          id: { not: tenancy.Lease.id }, // Exclude the new lease
          Tenancy: { isNot: null }, // Only current leases (with Tenancy), not future leases
          Resident: {
            some: {
              AND: [
                { incomeFinalized: true },
                { calculatedAnnualizedIncome: { not: null } }
              ]
            }
          }
        },
        include: {
          Resident: {
            where: {
              AND: [
                { incomeFinalized: true },
                { calculatedAnnualizedIncome: { not: null } }
              ]
            }
          }
        },
        orderBy: {
          createdAt: 'desc' // Get the most recent lease first
        },
        take: 1 // Only take the most recent lease to prevent duplicates
      });

      // Also check how many future leases we're excluding for debugging
      const futureLeases = await prisma.lease.findMany({
        where: {
          unitId: unit.id,
          id: { not: tenancy.Lease.id },
          Tenancy: null, // Future leases (no Tenancy)
          Resident: {
            some: {
              AND: [
                { incomeFinalized: true },
                { calculatedAnnualizedIncome: { not: null } }
              ]
            }
          }
        }
      });

      console.log(`[DISCREPANCY API] 🔍 Unit ${unit.unitNumber}: Found ${existingLeases.length} existing CURRENT leases with verified income`);
      console.log(`[DISCREPANCY API] 🔮 Unit ${unit.unitNumber}: Excluding ${futureLeases.length} future leases with verified income from discrepancy check`);
      
      // Debug: Also check the current lease residents to see if they have verified income
      console.log(`[DISCREPANCY API] 📋 Unit ${unit.unitNumber}: Current lease residents:`, newResidents.map(r => ({
        name: r.name,
        annualizedIncome: r.annualizedIncome,
        calculatedAnnualizedIncome: r.calculatedAnnualizedIncome,
        incomeFinalized: r.incomeFinalized
      })));
      
      // First, check for discrepancies within the current lease itself (after inheritance)
      for (const currentResident of newResidents) {
        if (currentResident.incomeFinalized && currentResident.calculatedAnnualizedIncome) {
          const verifiedIncome = Number(currentResident.calculatedAnnualizedIncome || 0);
          const rentRollIncome = Number(currentResident.annualizedIncome || 0);
          const discrepancy = Math.abs(verifiedIncome - rentRollIncome);
          
          if (discrepancy > 1.00) {
            console.log(`[DISCREPANCY API] 🚨 INTERNAL DISCREPANCY DETECTED: Unit ${unit.unitNumber}, ${currentResident.name}: Verified $${verifiedIncome} vs Rent Roll $${rentRollIncome} (diff: $${discrepancy})`);
            
            discrepancies.push({
              unitNumber: unit.unitNumber,
              residentName: currentResident.name,
              verifiedIncome: verifiedIncome,
              newRentRollIncome: rentRollIncome,
              discrepancy: discrepancy,
              existingLeaseId: tenancy.Lease.id, // Same lease
              newLeaseId: tenancy.Lease.id, // Same lease
              existingResidentId: currentResident.id,
              newResidentId: currentResident.id
            });
          } else {
            console.log(`[DISCREPANCY API] ✅ No internal discrepancy: Unit ${unit.unitNumber}, ${currentResident.name}: Verified $${verifiedIncome} vs Rent Roll $${rentRollIncome} (diff: $${discrepancy})`);
          }
        }
      }
      
      // Then, check for income discrepancies between new and verified residents from previous leases
      // BUT ONLY for residents who don't already have verified income in the current lease
      for (const existingLease of existingLeases) {
        console.log(`[DISCREPANCY API] 📋 Comparing against lease ${existingLease.id} with ${existingLease.Resident.length} verified residents`);
        for (const existingResident of existingLease.Resident) {
          // Find matching resident by name in new lease
          const matchingNewResident = newResidents.find(
            newRes => newRes.name.toLowerCase().trim() === existingResident.name.toLowerCase().trim()
          );

          if (matchingNewResident) {
            // CRITICAL: Skip if the resident already has verified income in the current lease
            // This prevents duplicate discrepancies when inheritance has already occurred
            if (matchingNewResident.incomeFinalized && matchingNewResident.calculatedAnnualizedIncome) {
              console.log(`[DISCREPANCY API] ⏭️ Skipping ${matchingNewResident.name} - already has verified income in current lease (inheritance occurred)`);
              continue;
            }
            const verifiedIncome = Number(existingResident.calculatedAnnualizedIncome || 0);
            const newRentRollIncome = Number(matchingNewResident.annualizedIncome || 0);
            const discrepancy = Math.abs(verifiedIncome - newRentRollIncome);
            
            // If discrepancy is greater than $1, flag it
            if (discrepancy > 1.00) {
              console.log(`[DISCREPANCY API] 🚨 DISCREPANCY DETECTED: Unit ${unit.unitNumber}, ${existingResident.name}: Verified $${verifiedIncome} vs New Rent Roll $${newRentRollIncome} (diff: $${discrepancy})`);
              
              discrepancies.push({
                unitNumber: unit.unitNumber,
                residentName: existingResident.name,
                verifiedIncome: verifiedIncome,
                newRentRollIncome: newRentRollIncome,
                discrepancy: discrepancy,
                existingLeaseId: existingLease.id,
                newLeaseId: tenancy.Lease.id,
                existingResidentId: existingResident.id,
                newResidentId: matchingNewResident.id
              });
            } else {
              console.log(`[DISCREPANCY API] ✅ No discrepancy: Unit ${unit.unitNumber}, ${existingResident.name}: Verified $${verifiedIncome} vs New Rent Roll $${newRentRollIncome} (diff: $${discrepancy})`);
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      discrepancies,
      count: discrepancies.length
    });

  } catch (error: unknown) {
    console.error('Income discrepancies fetch error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to fetch income discrepancies', details: errorMessage }, { status: 500 });
  }
} 