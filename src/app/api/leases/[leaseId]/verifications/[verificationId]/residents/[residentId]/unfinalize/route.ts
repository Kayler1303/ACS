import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { DocumentStatus, VerificationStatus } from '@prisma/client';

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

    // Verify that the user owns this property through the lease verification
    const verification = await prisma.incomeVerification.findFirst({
      where: {
        id: verificationId,
        leaseId: leaseId,
        lease: {
          unit: {
            property: {
              ownerId: session.user.id
            }
          }
        }
      },
      include: {
        lease: {
          include: {
            residents: true,
            unit: true
          }
        }
      }
    });

    if (!verification) {
      return NextResponse.json({ error: 'Verification not found or access denied' }, { status: 404 });
    }

    // Verify that the resident belongs to this lease
    const resident = verification.lease.residents.find(r => r.id === residentId);
    if (!resident) {
      return NextResponse.json({ error: 'Resident not found in this lease' }, { status: 404 });
    }

    // Unfinalize the resident's income - set incomeFinalized to false and clear finalizedAt
    // Reset hasNoIncome to false so they can select "No Income" again if needed
    // Keep calculatedAnnualizedIncome so they don't lose their calculation
    await prisma.$executeRaw`
      UPDATE "Resident" 
      SET 
        "incomeFinalized" = false,
        "finalizedAt" = NULL,
        "hasNoIncome" = false
      WHERE "id" = ${residentId}
    `;

    console.log(`[DEBUG] Resident ${residentId} income has been unfinalized`);

    // Check if verification should be set back to in progress since we removed finalization
    const allResidents = verification.lease.residents;
    const residentsWithFinalizedIncomeCount = await prisma.$queryRaw<{count: number}[]>`
      SELECT COUNT(*) as count 
      FROM "Resident" 
      WHERE "leaseId" = ${leaseId} AND "incomeFinalized" = true
    `;

    const finalizedCount = Number(residentsWithFinalizedIncomeCount[0]?.count || 0);
    const totalResidents = allResidents.length;
    
    console.log(`[DEBUG] After unfinalizing - Lease ${leaseId}: ${finalizedCount} finalized residents out of ${totalResidents} total`);

    // If this was the last finalized resident, set verification back to IN_PROGRESS
    if (finalizedCount === 0) {
      await prisma.incomeVerification.update({
        where: { id: verificationId },
        data: {
          status: 'IN_PROGRESS',
          finalizedAt: null,
          calculatedVerifiedIncome: 0
        }
      });

      console.log(`[DEBUG] Lease verification ${verificationId} set back to IN_PROGRESS`);

      return NextResponse.json({ 
        success: true, 
        residentUnfinalized: true,
        verificationUnfinalized: true,
        message: `Income unfinalized for ${resident.name}. Verification is now in progress.`
      });
    } else {
      // Recalculate total verified income for remaining finalized residents
      const totalVerifiedIncomeResult = await prisma.resident.aggregate({
        where: {
          leaseId: leaseId,
          incomeFinalized: true
        },
        _sum: {
          calculatedAnnualizedIncome: true
        }
      });
      
      const totalVerifiedIncome = totalVerifiedIncomeResult._sum.calculatedAnnualizedIncome || 0;

      await prisma.incomeVerification.update({
        where: { id: verificationId },
        data: {
          calculatedVerifiedIncome: totalVerifiedIncome
        }
      });

      console.log(`[DEBUG] Lease verification ${verificationId} updated with new total income: ${totalVerifiedIncome}`);

      return NextResponse.json({ 
        success: true, 
        residentUnfinalized: true,
        verificationUnfinalized: false,
        totalVerifiedIncome,
        message: `Income unfinalized for ${resident.name}`
      });
    }

  } catch (error) {
    console.error('Error unfinalizing resident verification:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 