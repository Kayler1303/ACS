import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { add, endOfDay, startOfDay, sub } from 'date-fns';
import { randomUUID } from 'crypto';
import { setMasterVerification } from '@/services/verificationContinuity';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { leaseId } = await params;

  if (!leaseId) {
    return NextResponse.json({ error: 'Lease ID is required' }, { status: 400 });
  }

  try {
    const lease = await prisma.lease.findFirst({
      where: {
        id: leaseId,
        Unit: {
          Property: {
            ownerId: session.user.id,
          },
        },
      },
    });

    if (!lease) {
      return NextResponse.json(
        { error: 'Lease not found or you do not have permission to access it.' },
        { status: 404 }
      );
    }

    // NEW: Check if another verification is already in progress for this unit
    const unitId = lease.unitId;
    const existingInProgressVerification = await prisma.incomeVerification.findFirst({
      where: {
        status: 'IN_PROGRESS',
        Lease: {
          unitId: unitId,
        },
      },
    });

    if (existingInProgressVerification) {
      return NextResponse.json(
        {
          error:
            'Another verification is already in progress for this unit. Please finalize it before starting a new one.',
        },
        { status: 409 } // 409 Conflict is appropriate here
      );
    }

    // Set sensible defaults for a new verification period
    const now = new Date();
    const verificationPeriodStart = startOfDay(sub(now, { years: 1 }));
    const verificationPeriodEnd = endOfDay(now);
    const dueDate = add(now, { days: 90 });

    const newVerification = await prisma.incomeVerification.create({
      data: {
        id: randomUUID(),
        leaseId: leaseId,
        status: 'IN_PROGRESS',
        verificationPeriodStart,
        verificationPeriodEnd,
        dueDate,
        updatedAt: now,
      },
    });

    // Check if this verification should be set as a master verification
    // This happens when a user manually creates a verification (not inherited)
    const verificationSnapshot = await prisma.verificationSnapshot.findFirst({
      where: {
        leaseId: leaseId
      },
      include: {
        verificationContinuity: true
      }
    });

    if (verificationSnapshot && !verificationSnapshot.verificationContinuity.masterVerificationId) {
      // Set this as the master verification for continuity
      await setMasterVerification(newVerification.id, verificationSnapshot.verificationContinuityId);
      
      // Update the verification to link to continuity
      await prisma.incomeVerification.update({
        where: { id: newVerification.id },
        data: { verificationContinuityId: verificationSnapshot.verificationContinuityId }
      });
      
      console.log(`[CONTINUITY] Set verification ${newVerification.id} as master for continuity ${verificationSnapshot.verificationContinuityId}`);
    }

    return NextResponse.json(newVerification, { status: 201 });
  } catch (error) {
    console.error('Error creating new verification period:', error);
    return NextResponse.json(
      { error: 'Failed to start new verification period' },
      { status: 500 }
    );
  }
} 