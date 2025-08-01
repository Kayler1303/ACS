import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { VerificationStatus } from '@prisma/client';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leaseId } = await params;

    // Verify that the user owns this property through the lease
    const lease = await prisma.lease.findUnique({
      where: { id: leaseId },
      include: {
        residents: true,
        unit: {
          include: {
            property: true
          }
        },
        incomeVerifications: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!lease || lease.unit?.property?.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Unfinalize all residents
    const unfinalizedResidents = await prisma.resident.updateMany({
      where: { 
        leaseId: leaseId,
        incomeFinalized: true
      },
      data: {
        incomeFinalized: false,
        finalizedAt: null,
        // Keep calculatedAnnualizedIncome so users don't lose their calculations
      }
    });

    console.log(`[UNFINALIZE ALL] Lease ${leaseId}: Unfinalized ${unfinalizedResidents.count} residents`);

    // Update the income verification status for the lease
    const currentVerification = lease.incomeVerifications[0];
    if (currentVerification) {
      await prisma.incomeVerification.update({
        where: { id: currentVerification.id },
        data: {
          status: 'IN_PROGRESS' as VerificationStatus,
          calculatedVerifiedIncome: null,
          finalizedAt: null,
        }
      });
    }

    return NextResponse.json({ 
      message: `Successfully unfinalized ${unfinalizedResidents.count} residents`,
      unfinalizedCount: unfinalizedResidents.count
    }, { status: 200 });

  } catch (error) {
    console.error('Error unfinalizing all residents:', error);
    return NextResponse.json({ error: 'Failed to unfinalize residents.' }, { status: 500 });
  }
} 