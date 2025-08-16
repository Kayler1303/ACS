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

  try {
    const latestRentRoll = await prisma.rentRoll.findFirst({
      where: {
        propertyId: propertyId,
      },
      orderBy: {
        date: 'desc',
      },
    });

    if (!latestRentRoll) {
      return NextResponse.json([], { status: 200 });
    }

    const newTenancies = await prisma.tenancy.findMany({
      where: {
        rentRollId: latestRentRoll.id,
        lease: null,
      },
      include: {
        lease: {
          include: {
            unit: true,
          },
        },
      },
    });

    return NextResponse.json(newTenancies, { status: 200 });
  } catch (error) {
    console.error('Error fetching new tenancies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch new tenancies' },
      { status: 500 }
    );
  }
}
