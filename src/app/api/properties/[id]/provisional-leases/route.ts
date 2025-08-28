import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: propertyId } = await params;
  const { searchParams } = new URL(req.url);
  const rentRollId = searchParams.get('rentRollId');

  console.log(`[PROVISIONAL LEASES API] Property: ${propertyId}, RentRoll: ${rentRollId || 'latest'}`);

  try {
    // Get the target rent roll date for this property to determine what's "future"
    let targetRentRoll;
    if (rentRollId) {
      targetRentRoll = await prisma.rentRoll.findUnique({
        where: { id: rentRollId, propertyId }
      });
    } else {
      targetRentRoll = await prisma.rentRoll.findFirst({
        where: {
          propertyId: propertyId,
        },
        orderBy: {
          uploadDate: 'desc'
        }
      });
    }

    const provisionalLeases = await prisma.lease.findMany({
      where: {
        Unit: {
          propertyId: propertyId,
        },
        Tenancy: null,
        // Only include leases that START after the target rent roll date
        // This excludes active leases (including month-to-month) and past leases
        leaseStartDate: targetRentRoll ? {
          gt: targetRentRoll.uploadDate
        } : undefined,
      },
      include: {
        Unit: true,
        Resident: {
          include: {
            IncomeDocument: {
              where: {
                status: { in: ['COMPLETED', 'NEEDS_REVIEW'] }
              },
              orderBy: {
                uploadDate: 'desc'
              }
            }
          }
        },
        IncomeVerification: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 1
        }
      },
    });

    // Add verification status and resident count to each lease
    const leasesWithVerificationStatus = provisionalLeases.map(lease => ({
      ...lease,
      isVerificationFinalized: lease.IncomeVerification.length > 0 && 
        lease.IncomeVerification[0].status === 'FINALIZED',
      residentCount: lease.Resident.length
    }));

    return NextResponse.json(leasesWithVerificationStatus, { status: 200 });
  } catch (error) {
    console.error('Error fetching provisional leases:', error);
    return NextResponse.json(
      { error: 'Failed to fetch provisional leases' },
      { status: 500 }
    );
  }
}
