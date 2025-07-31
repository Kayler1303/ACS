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
    // Get the most recent rent roll date for this property to determine what's "future"
    const mostRecentRentRoll = await prisma.rentRoll.findFirst({
      where: {
        propertyId: propertyId,
      },
      orderBy: {
        date: 'desc'
      }
    });

    const provisionalLeases = await prisma.lease.findMany({
      where: {
        unit: {
          propertyId: propertyId,
        },
        tenancy: null,
        // Only include leases that START after the most recent rent roll date
        // This excludes active leases (including month-to-month) and past leases
        leaseStartDate: mostRecentRentRoll ? {
          gt: mostRecentRentRoll.date
        } : undefined,
      },
      include: {
        unit: true,
        residents: true,
        incomeVerifications: {
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
      isVerificationFinalized: lease.incomeVerifications.length > 0 && 
        lease.incomeVerifications[0].status === 'FINALIZED',
      residentCount: lease.residents.length
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
