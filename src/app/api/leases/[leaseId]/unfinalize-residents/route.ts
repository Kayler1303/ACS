import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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
        unit: {
          include: {
            property: true
          }
        },
        residents: true,
        incomeVerifications: true
      }
    });

    if (!lease || lease.unit?.property?.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Unfinalize all residents in this lease
    const updatedResidents = await prisma.resident.updateMany({
      where: { leaseId: leaseId },
      data: {
        incomeFinalized: false,
        finalizedAt: null
        // Keep calculatedAnnualizedIncome so they don't lose their calculations
      }
    });

    // Update all income verifications for this lease to reflect the unfinalized state
    await prisma.incomeVerification.updateMany({
      where: { leaseId: leaseId },
      data: {
        status: 'IN_PROGRESS',
        finalizedAt: null,
        calculatedVerifiedIncome: 0 // Reset since residents are no longer finalized
      }
    });

    console.log(`[UNFINALIZE RESIDENTS] Unfinalized ${updatedResidents.count} residents in lease ${leaseId}`);

    return NextResponse.json({ 
      message: 'All residents unfinalized successfully',
      unfinalizedCount: updatedResidents.count
    }, { status: 200 });
  } catch (error) {
    console.error('Error unfinalizing residents:', error);
    return NextResponse.json({ error: 'Failed to unfinalize residents.' }, { status: 500 });
  }
} 