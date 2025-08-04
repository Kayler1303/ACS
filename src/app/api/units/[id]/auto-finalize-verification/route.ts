import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: unitId } = await params;
  const { reason } = await req.json();

  try {
    // Find any IN_PROGRESS verification for this unit
    const existingVerification = await prisma.incomeVerification.findFirst({
      where: {
        status: 'IN_PROGRESS',
        Lease: {
          unitId: unitId,
          Unit: {
            Property: {
              ownerId: session.user.id, // Security: ensure user owns the property
            },
          },
        },
      },
      include: {
        Lease: {
          select: {
            name: true,
            unitId: true,
          },
        },
      },
    });

    if (!existingVerification) {
      return NextResponse.json(
        { message: 'No IN_PROGRESS verification found for this unit' },
        { status: 200 }
      );
    }

    // Auto-finalize the existing verification
    const finalizedVerification = await prisma.incomeVerification.update({
      where: { id: existingVerification.id },
      data: {
        status: 'FINALIZED',
        finalizedAt: new Date(),
      },
    });

    console.log(`🔄 [AUTO-FINALIZE] Verification ${existingVerification.id} auto-finalized for unit ${unitId}. Reason: ${reason}`);

    return NextResponse.json({
      message: `Auto-finalized verification for ${existingVerification.Lease.name}`,
      verificationId: existingVerification.id,
      reason: reason || 'Auto-finalized for new lease creation',
    });

  } catch (error) {
    console.error('Error auto-finalizing verification:', error);
    return NextResponse.json(
      { error: 'Failed to auto-finalize verification' },
      { status: 500 }
    );
  }
} 