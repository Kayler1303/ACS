import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: propertyId } = await params;

  try {
    const provisionalLeases = await prisma.lease.findMany({
      where: {
        unit: {
          propertyId: propertyId,
        },
        tenancy: null,
      },
      include: {
        unit: true,
        incomeVerifications: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 1
        }
      },
    });

    // Add verification status to each lease
    const leasesWithVerificationStatus = provisionalLeases.map(lease => ({
      ...lease,
      isVerificationFinalized: lease.incomeVerifications.length > 0 && 
        lease.incomeVerifications[0].status === 'FINALIZED'
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
