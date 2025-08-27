import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ leaseId: string; verificationId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leaseId, verificationId } = await params;

    // Verify that the user owns this property through the lease
    const lease = await prisma.lease.findUnique({
      where: { id: leaseId },
      include: {
        Unit: {
          include: {
            Property: true
          }
        }
      }
    });

    if (!lease || lease.Unit?.Property?.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get the verification to check its status
    const verification = await prisma.incomeVerification.findUnique({
      where: { id: verificationId },
      include: {
        IncomeDocument: true
      }
    });

    if (!verification) {
      return NextResponse.json({ error: 'Verification not found' }, { status: 404 });
    }

    // Only allow cancellation of IN_PROGRESS verifications that don't have documents
    if (verification.status !== 'IN_PROGRESS') {
      return NextResponse.json({ 
        error: 'Can only cancel verifications that are in progress' 
      }, { status: 400 });
    }

    if (verification.IncomeDocument && verification.IncomeDocument.length > 0) {
      return NextResponse.json({ 
        error: 'Cannot cancel verification that already has uploaded documents. Please finalize or delete documents first.' 
      }, { status: 400 });
    }

    // Delete the verification (cascade should handle related records)
    await prisma.incomeVerification.delete({
      where: { id: verificationId }
    });

    return NextResponse.json({ 
      message: 'Verification cancelled successfully' 
    }, { status: 200 });

  } catch (error) {
    console.error('Error cancelling verification:', error);
    return NextResponse.json({ 
      error: 'Failed to cancel verification.' 
    }, { status: 500 });
  }
} 