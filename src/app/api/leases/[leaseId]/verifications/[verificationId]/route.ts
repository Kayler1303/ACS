import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { IncomeDocument } from '@prisma/client';
import { checkAndCreateIncomeDiscrepancyOverride } from '@/services/verification';

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
        Lease: {
          include: {
            Resident: {
              include: {
                IncomeDocument: true,
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

    for (const resident of verification.Lease.Resident) {
      const allWages = resident.IncomeDocument.flatMap((doc: IncomeDocument) => 
        [doc.box1_wages, doc.box3_ss_wages, doc.box5_med_wages]
        .filter((w) => w !== null && w !== undefined)
        .map((w) => typeof w === 'number' ? w : w.toNumber())
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
      include: {
        Lease: {
          include: {
            Resident: true,
            Unit: true
          }
        }
      }
    });

    // Check for income discrepancy and create auto-override if needed
    const totalUploadedIncome = updatedVerification.Lease.Resident.reduce((acc: number, r: any) => 
      acc + (r.annualizedIncome ? r.annualizedIncome.toNumber() : 0), 0);
    
    try {
      await checkAndCreateIncomeDiscrepancyOverride({
        unitId: updatedVerification.Lease.Unit.id,
        verificationId: updatedVerification.id,
        totalUploadedIncome,
        totalVerifiedIncome,
        userId: session.user.id
      });
    } catch (error) {
      console.error('Failed to create auto-override request for income discrepancy:', error);
      // Don't fail the finalization, just log the error
    }

    return NextResponse.json(updatedVerification);
  } catch (error) {
    console.error('Error finalizing verification:', error);
    return NextResponse.json(
      { error: 'Failed to finalize verification' },
      { status: 500 }
    );
  }
} 