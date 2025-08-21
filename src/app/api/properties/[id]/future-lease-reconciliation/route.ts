import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { 
  inheritVerification,
  setMasterVerification
} from '@/services/verificationContinuity';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id: propertyId } = await params;

  try {
    const body = await req.json();
    const { 
      leaseId, 
      continuityId, 
      futureLeaseId,
      masterVerificationId,
      action 
    } = body;

    if (!leaseId || !continuityId || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify user has access to this lease
    const lease = await prisma.lease.findFirst({
      where: {
        id: leaseId,
        Unit: {
          Property: {
            ownerId: session.user.id
          }
        }
      }
    });

    if (!lease) {
      return NextResponse.json({ error: 'Lease not found' }, { status: 404 });
    }

    if (action === 'accept_future_lease') {
      if (!futureLeaseId || !masterVerificationId) {
        return NextResponse.json({ error: 'Future lease ID and master verification ID required' }, { status: 400 });
      }

      // Inherit verification from future lease to current lease
      const newVerificationId = await inheritVerification(
        masterVerificationId,
        leaseId,
        continuityId
      );

      // Set this as the master verification for the continuity
      await setMasterVerification(newVerificationId, continuityId);

      // Update resident incomes to match verified amounts from future lease
      await updateResidentIncomesFromFutureLease(leaseId, futureLeaseId);

      return NextResponse.json({
        message: 'Future lease verification accepted successfully',
        verificationId: newVerificationId,
        notification: 'Income verification has been transferred from the future lease. All documents and verification status are now active for this lease.'
      });
    } else if (action === 'reject_future_lease') {
      // User wants to start fresh verification process
      // The continuity record already exists without a master verification
      // so normal verification process will proceed
      
      return NextResponse.json({
        message: 'Future lease rejected. You can now proceed with new income verification for this lease.',
        requiresNewVerification: true
      });
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error handling future lease reconciliation:', error);
    return NextResponse.json(
      { error: 'Failed to process future lease reconciliation' },
      { status: 500 }
    );
  }
}

/**
 * Updates resident incomes in the current lease to match verified amounts from future lease
 */
async function updateResidentIncomesFromFutureLease(
  currentLeaseId: string,
  futureLeaseId: string
): Promise<void> {
  const futureLeaseResidents = await prisma.resident.findMany({
    where: { 
      leaseId: futureLeaseId,
      incomeFinalized: true
    }
  });

  const currentLeaseResidents = await prisma.resident.findMany({
    where: { leaseId: currentLeaseId }
  });

  for (const currentResident of currentLeaseResidents) {
    const matchingFutureResident = futureLeaseResidents.find((r: any) => 
      r.name.trim().toLowerCase() === currentResident.name.trim().toLowerCase()
    );

    if (matchingFutureResident) {
      await prisma.resident.update({
        where: { id: currentResident.id },
        data: {
          annualizedIncome: matchingFutureResident.annualizedIncome,
          calculatedAnnualizedIncome: matchingFutureResident.calculatedAnnualizedIncome,
          verifiedIncome: matchingFutureResident.verifiedIncome,
          incomeFinalized: matchingFutureResident.incomeFinalized,
          hasNoIncome: matchingFutureResident.hasNoIncome,
          finalizedAt: matchingFutureResident.finalizedAt
        }
      });

      console.log(`[FUTURE LEASE RECONCILIATION] Updated ${currentResident.name} income from future lease`);
    }
  }
} 