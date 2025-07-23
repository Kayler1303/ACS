import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const propertyId = params.id;

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
      },
    });

    return NextResponse.json(provisionalLeases, { status: 200 });
  } catch (error) {
    console.error('Error fetching provisional leases:', error);
    return NextResponse.json(
      { error: 'Failed to fetch provisional leases' },
      { status: 500 }
    );
  }
}
