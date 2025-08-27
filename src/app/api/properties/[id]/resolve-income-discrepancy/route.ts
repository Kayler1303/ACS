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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id: propertyId } = await params;

  if (!propertyId) {
    return NextResponse.json({ error: 'Property ID is required' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { discrepancy, resolution, rentRollId }: { 
      discrepancy: IncomeDiscrepancy;
      resolution: 'accept-verified' | 'accept-rentroll';
      rentRollId: string;
    } = body;

    if (!discrepancy || !resolution || !rentRollId) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      if (resolution === 'accept-verified') {
        // Keep verified income: Update the new resident's annualizedIncome to match verified income
        console.log(`[RESOLVE DISCREPANCY] Keeping verified income: Updating new resident ${discrepancy.newResidentId} from $${discrepancy.newRentRollIncome} to $${discrepancy.verifiedIncome}`);
        
        const updatedResident = await tx.resident.update({
          where: { id: discrepancy.newResidentId },
          data: {
            annualizedIncome: discrepancy.verifiedIncome
          }
        });
        
        console.log(`[RESOLVE DISCREPANCY] Updated resident ${discrepancy.newResidentId}:`, {
          name: updatedResident.name,
          oldAnnualizedIncome: discrepancy.newRentRollIncome,
          newAnnualizedIncome: updatedResident.annualizedIncome,
          calculatedAnnualizedIncome: updatedResident.calculatedAnnualizedIncome,
          incomeFinalized: updatedResident.incomeFinalized
        });
        
        return {
          action: 'updated_new_resident_income',
          newIncome: discrepancy.verifiedIncome,
          previousIncome: discrepancy.newRentRollIncome
        };
      } else if (resolution === 'accept-rentroll') {
        // Accept rent roll income: Mark existing resident's income as out of date and unfinalize
        console.log(`[RESOLVE DISCREPANCY] Accepting rent roll income: Unfinalizing existing resident ${discrepancy.existingResidentId} and updating income from $${discrepancy.verifiedIncome} to $${discrepancy.newRentRollIncome}`);
        
        // Update the existing resident to unfinalize their income
        await tx.resident.update({
          where: { id: discrepancy.existingResidentId },
          data: {
            incomeFinalized: false,
            calculatedAnnualizedIncome: null,
            verifiedIncome: null,
            finalizedAt: null
          }
        });

        // Also need to update any verification status for the existing lease
        const existingVerifications = await tx.incomeVerification.findMany({
          where: { leaseId: discrepancy.existingLeaseId }
        });

        for (const verification of existingVerifications) {
          await tx.incomeVerification.update({
            where: { id: verification.id },
            data: {
              status: 'IN_PROGRESS',
              finalizedAt: null,
              calculatedVerifiedIncome: null
            }
          });
        }

        return {
          action: 'unfinalized_existing_resident',
          existingResidentId: discrepancy.existingResidentId,
          newIncome: discrepancy.newRentRollIncome
        };
      } else {
        throw new Error('Invalid resolution type');
      }
    });

    console.log(`[RESOLVE DISCREPANCY] Successfully resolved discrepancy for ${discrepancy.residentName} in Unit ${discrepancy.unitNumber}:`, result);

    return NextResponse.json({
      success: true,
      message: 'Income discrepancy resolved successfully',
      resolution: result
    });

  } catch (error: unknown) {
    console.error('Resolve income discrepancy error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ 
      error: 'Failed to resolve income discrepancy', 
      details: errorMessage 
    }, { status: 500 });
  }
} 