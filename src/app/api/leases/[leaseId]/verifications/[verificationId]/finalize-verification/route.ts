import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ leaseId: string; verificationId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leaseId, verificationId } = await params;

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

    console.log(`[FINALIZE VERIFICATION API] Finalizing verification ${verificationId} for lease ${leaseId}`);

    // Check if all residents are finalized (either incomeFinalized=true OR hasNoIncome=true)
    const allResidents = verification.Lease.Resident;
    const finalizedResidentsCount = await prisma.resident.count({
      where: {
        leaseId: leaseId,
        OR: [
          { incomeFinalized: true },
          { hasNoIncome: true }
        ]
      }
    });

    const totalResidents = allResidents.length;
    
    console.log(`[FINALIZE VERIFICATION API] Lease ${leaseId}: ${finalizedResidentsCount} finalized residents out of ${totalResidents} total`);

    if (finalizedResidentsCount !== totalResidents) {
      return NextResponse.json({ 
        error: 'Cannot finalize verification - not all residents are finalized',
        finalizedCount: finalizedResidentsCount,
        totalCount: totalResidents
      }, { status: 400 });
    }

    // Calculate total verified income using verifiedIncome field
    const totalVerifiedIncomeResult = await prisma.resident.aggregate({
      where: {
        leaseId: leaseId,
        OR: [
          { incomeFinalized: true },
          { hasNoIncome: true }
        ]
      },
      _sum: {
        verifiedIncome: true
      }
    });
    
    const totalVerifiedIncome = totalVerifiedIncomeResult._sum.verifiedIncome?.toNumber() || 0;

    // Finalize the verification
    await prisma.incomeVerification.update({
      where: { id: verificationId },
      data: {
        status: 'FINALIZED',
        finalizedAt: new Date(),
        calculatedVerifiedIncome: totalVerifiedIncome
      }
    });

    console.log(`[FINALIZE VERIFICATION API] ✅ Verification ${verificationId} finalized with total income: ${totalVerifiedIncome}`);

    return NextResponse.json({ 
      success: true, 
      message: 'Verification finalized successfully',
      totalVerifiedIncome,
      finalizedResidents: finalizedResidentsCount,
      totalResidents
    });

  } catch (error) {
    console.error('Error finalizing verification:', error);
    return NextResponse.json(
      { error: 'Failed to finalize verification' },
      { status: 500 }
    );
  }
}
