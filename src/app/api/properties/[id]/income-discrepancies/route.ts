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
      
      // Get existing leases for this unit that have verified income
      const existingLeases = await prisma.lease.findMany({
        where: {
          unitId: unit.id,
          id: { not: tenancy.Lease.id }, // Exclude the new lease
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
        }
      });

      // Check for income discrepancies between new and verified residents
      for (const existingLease of existingLeases) {
        for (const existingResident of existingLease.Resident) {
          // Find matching resident by name in new lease
          const matchingNewResident = newResidents.find(
            newRes => newRes.name.toLowerCase().trim() === existingResident.name.toLowerCase().trim()
          );

          if (matchingNewResident) {
            const verifiedIncome = Number(existingResident.calculatedAnnualizedIncome || 0);
            const newRentRollIncome = Number(matchingNewResident.annualizedIncome || 0);
            const discrepancy = Math.abs(verifiedIncome - newRentRollIncome);
            
            // If discrepancy is greater than $1, flag it
            if (discrepancy > 1.00) {
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

              console.log(`[INCOME DISCREPANCY] Unit ${unit.unitNumber}, ${existingResident.name}: Verified $${verifiedIncome} vs New Rent Roll $${newRentRollIncome} (diff: $${discrepancy})`);
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