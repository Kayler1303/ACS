import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { IncomeDocument } from '@prisma/client';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leaseId: string; verificationId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { leaseId, verificationId } = await params;
  const { calculatedVerifiedIncome } = await req.json();

  if (!leaseId || !verificationId) {
    return NextResponse.json(
      { error: 'Lease ID and Verification ID are required' },
      { status: 400 }
    );
  }

  try {
    // Ensure the verification belongs to the user
    const verification = await prisma.incomeVerification.findUnique({
      where: { id: verificationId },
      include: { 
        lease: {
          include: {
            residents: {
              include: {
                incomeDocuments: true,
              }
            }
          }
        }
      }
    });

    if (!verification) {
      return NextResponse.json(
        { error: 'Verification not found or access denied' },
        { status: 404 }
      );
    }

    // New income calculation logic
    let totalVerifiedIncome = 0;

    for (const resident of verification.lease.residents) {
      const allWages = resident.incomeDocuments.flatMap((doc: IncomeDocument) => 
        [doc.box1_wages, doc.box3_ss_wages, doc.box5_med_wages]
        .filter((w): w is number => w !== null && w !== undefined)
      );
      
      const residentVerifiedIncome = allWages.length > 0 ? Math.max(...allWages) : 0;
      
      totalVerifiedIncome += residentVerifiedIncome;

      await prisma.resident.update({
        where: { id: resident.id },
        data: {
          verifiedIncome: residentVerifiedIncome,
        },
      });
    }

    const updatedVerification = await prisma.incomeVerification.update({
      where: { id: verificationId },
      data: {
        status: 'FINALIZED',
        finalizedAt: new Date(),
        calculatedVerifiedIncome: totalVerifiedIncome,
      },
    });

    return NextResponse.json(updatedVerification);
  } catch (error) {
    console.error('Error finalizing verification:', error);
    return NextResponse.json(
      { error: 'Failed to finalize verification' },
      { status: 500 }
    );
  }
} 