import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ leaseId: string; verificationId: string; residentId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leaseId, verificationId, residentId } = await params;

    // Verify the user owns this property
    const verification = await prisma.incomeVerification.findFirst({
      where: {
        id: verificationId,
        leaseId: leaseId,
        Lease: {
          Unit: {
            Property: {
              ownerId: session.user.id
            }
          }
        }
      },
      include: {
        Lease: {
          include: {
            Resident: true
          }
        }
      }
    });

    if (!verification) {
      return NextResponse.json({ error: 'Verification not found' }, { status: 404 });
    }

    // Find the resident
    const resident = verification.Lease.Resident.find((r: any) => r.id === residentId);
    if (!resident) {
      return NextResponse.json({ error: 'Resident not found in this lease' }, { status: 404 });
    }

    console.log(`[NO INCOME API] Marking resident ${resident.name} (${residentId}) as having no income`);
    console.log(`[NO INCOME API] Before update - hasNoIncome: ${resident.hasNoIncome}, verifiedIncome: ${resident.verifiedIncome}`);

    // Check for income discrepancy - if rent roll shows income but user says "No Income"
    const originalRentRollIncome = Number(resident.originalRentRollIncome || 0);
    const annualizedIncome = Number(resident.annualizedIncome || 0);
    const hasIncomeDiscrepancy = originalRentRollIncome > 0 || annualizedIncome > 0;

    console.log(`[NO INCOME API] Discrepancy check - originalRentRollIncome: $${originalRentRollIncome}, annualizedIncome: $${annualizedIncome}, hasDiscrepancy: ${hasIncomeDiscrepancy}`);

    if (hasIncomeDiscrepancy) {
      // There's a discrepancy - only mark as no income, don't finalize
      // Let the frontend handle the discrepancy modal
      await prisma.$executeRaw`
        UPDATE "Resident" 
        SET 
          "hasNoIncome" = true,
          "calculatedAnnualizedIncome" = 0::numeric,
          "verifiedIncome" = 0::numeric,
          "updatedAt" = NOW()
        WHERE "id" = ${residentId}
      `;

      console.log(`[NO INCOME API] Income discrepancy detected - marked as no income but NOT finalized`);
      
      return NextResponse.json({ 
        success: true, 
        hasDiscrepancy: true,
        message: `${resident.name} marked as having no income. Please resolve the income discrepancy to complete verification.`,
        discrepancyDetails: {
          originalIncome: originalRentRollIncome,
          verifiedIncome: 0
        }
      });
    } else {
      // No discrepancy - safe to auto-finalize
      await prisma.$executeRaw`
        UPDATE "Resident" 
        SET 
          "hasNoIncome" = true,
          "calculatedAnnualizedIncome" = 0::numeric,
          "verifiedIncome" = 0::numeric,
          "incomeFinalized" = true,
          "finalizedAt" = NOW(),
          "updatedAt" = NOW()
        WHERE "id" = ${residentId}
      `;

      console.log(`[NO INCOME API] No discrepancy detected - auto-finalized resident`);
    }

    console.log(`[NO INCOME API] Successfully updated resident ${residentId}`);

    // Verify the update worked
    const updatedResident = await prisma.resident.findUnique({
      where: { id: residentId },
      select: { 
        hasNoIncome: true, 
        verifiedIncome: true, 
        calculatedAnnualizedIncome: true,
        incomeFinalized: true,
        finalizedAt: true
      }
    });
    console.log(`[NO INCOME API] After update - resident data:`, updatedResident);

    // Return success response for no-discrepancy case
    return NextResponse.json({ 
      success: true, 
      hasDiscrepancy: false,
      message: `${resident.name} marked as having no income and automatically finalized.`,
      updatedResident
    });

  } catch (error) {
    console.error('Error marking resident as no income:', error);
    return NextResponse.json(
      { error: 'Failed to update resident status' },
      { status: 500 }
    );
  }
} 