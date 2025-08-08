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

    // Instead of auto-finalizing, check if this verification has any documents uploaded
    // If no documents were uploaded to this verification, we should delete it instead of finalizing it
    // This preserves the original lease status when user chooses "New Lease"
    const documentsCount = await prisma.incomeDocument.count({
      where: {
        verificationId: existingVerification.id
      }
    });

    let result;
    if (documentsCount === 0) {
      // No documents uploaded - delete the verification to restore original status
      await prisma.incomeVerification.delete({
        where: { id: existingVerification.id }
      });
      
      console.log(`🗑️ [AUTO-CLEANUP] Empty verification ${existingVerification.id} deleted for unit ${unitId}. Reason: ${reason}`);
      result = {
        message: `Removed empty verification for ${existingVerification.Lease.name}`,
        action: 'deleted',
        verificationId: existingVerification.id,
        reason: reason || 'Deleted empty verification for new lease creation',
      };
    } else {
      // Documents were uploaded - auto-finalize as before
      const finalizedVerification = await prisma.incomeVerification.update({
        where: { id: existingVerification.id },
        data: {
          status: 'FINALIZED',
          finalizedAt: new Date(),
        },
      });

      console.log(`🔄 [AUTO-FINALIZE] Verification ${existingVerification.id} auto-finalized for unit ${unitId}. Reason: ${reason}`);
      result = {
        message: `Auto-finalized verification for ${existingVerification.Lease.name}`,
        action: 'finalized', 
        verificationId: existingVerification.id,
        reason: reason || 'Auto-finalized for new lease creation',
      };
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error('Error auto-finalizing verification:', error);
    return NextResponse.json(
      { error: 'Failed to auto-finalize verification' },
      { status: 500 }
    );
  }
} 