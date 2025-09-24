import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leaseId } = await params;

    // Verify the lease exists and user has access
    const lease = await prisma.lease.findFirst({
      where: {
        id: leaseId,
        Unit: {
          Property: {
            ownerId: session.user.id
          }
        }
      },
      include: {
        Resident: true,
        IncomeVerification: {
          include: {
            IncomeDocument: true
          }
        },
        Tenancy: {
          include: {
            RentRoll: true
          }
        },
        Unit: {
          include: {
            Property: true
          }
        }
      }
    });

    if (!lease) {
      return NextResponse.json({ error: 'Lease not found or access denied' }, { status: 404 });
    }

    // Safety checks - only allow deletion of future leases that meet certain criteria
    const hasDocuments = lease.IncomeVerification.some(v => 
      v.IncomeDocument && v.IncomeDocument.length > 0
    );
    
    const hasFinalized = lease.IncomeVerification.some(v => 
      v.status === 'FINALIZED'
    );

    // Check if this is a future lease (has start date after rent roll date or no tenancy)
    const isFutureLease = !lease.Tenancy || 
      (lease.leaseStartDate && lease.Tenancy?.RentRoll?.uploadDate && 
       new Date(lease.leaseStartDate) > new Date(lease.Tenancy.RentRoll.uploadDate));

    if (!isFutureLease) {
      return NextResponse.json({ 
        error: 'Cannot delete current leases. Only future leases can be deleted.' 
      }, { status: 400 });
    }

    if (hasFinalized) {
      return NextResponse.json({ 
        error: 'Cannot delete lease with finalized income verification. Please unfinalize first.' 
      }, { status: 400 });
    }

    // Warn if there are documents but allow deletion
    let warningMessage = '';
    if (hasDocuments) {
      warningMessage = 'Lease had income documents that were also deleted.';
    }

    console.log(`[LEASE DELETE] User ${session.user.id} deleting lease ${leaseId} (${lease.name})`);
    console.log(`[LEASE DELETE] Lease has ${lease.Resident.length} residents, ${lease.IncomeVerification.length} verifications`);

    // Delete in transaction to ensure consistency
    await prisma.$transaction(async (tx) => {
      // Delete income documents first
      for (const verification of lease.IncomeVerification) {
        if (verification.IncomeDocument && verification.IncomeDocument.length > 0) {
          await tx.incomeDocument.deleteMany({
            where: {
              verificationId: verification.id
            }
          });
        }
      }

      // Delete income verifications
      await tx.incomeVerification.deleteMany({
        where: {
          leaseId: leaseId
        }
      });

      // Delete residents
      await tx.resident.deleteMany({
        where: {
          leaseId: leaseId
        }
      });

      // Delete tenancy record if it exists
      if (lease.Tenancy) {
        await tx.tenancy.delete({
          where: {
            leaseId: leaseId
          }
        });
      }

      // Finally delete the lease
      await tx.lease.delete({
        where: {
          id: leaseId
        }
      });
    });

    console.log(`[LEASE DELETE] Successfully deleted lease ${leaseId}`);

    return NextResponse.json({
      success: true,
      message: `Lease "${lease.name}" has been deleted successfully.${warningMessage ? ' ' + warningMessage : ''}`,
      deletedLease: {
        id: lease.id,
        name: lease.name,
        residentCount: lease.Resident.length,
        hadDocuments: hasDocuments
      }
    });

  } catch (error) {
    console.error('Error deleting lease:', error);
    return NextResponse.json(
      { error: 'Failed to delete lease' },
      { status: 500 }
    );
  }
}
