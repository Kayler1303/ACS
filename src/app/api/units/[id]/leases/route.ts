import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { randomUUID } from 'crypto';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: unitId } = await params;
  const { name, leaseStartDate, leaseEndDate, leaseRent } = await req.json();

  if (!name || !unitId) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 }
    );
  }

  try {
    const data: {
      id: string;
      name: string;
      Unit: { connect: { id: string } };
      leaseStartDate?: Date;
      leaseEndDate?: Date;
      leaseRent?: number;
      updatedAt: Date;
    } = {
      id: randomUUID(),
      name,
      Unit: {
        connect: {
          id: unitId,
        },
      },
      updatedAt: new Date(),
    };

    if (leaseStartDate) {
      data.leaseStartDate = new Date(leaseStartDate);
    }

    if (leaseEndDate) {
      data.leaseEndDate = new Date(leaseEndDate);
    }

    if (leaseRent) {
      data.leaseRent = parseFloat(leaseRent);
    }

    const newLease = await prisma.lease.create({
      data,
    });

    return NextResponse.json(newLease, { status: 201 });
  } catch (error) {
    console.error('Error creating lease:', error);
    return NextResponse.json(
      { error: 'Failed to create lease' },
      { status: 500 }
    );
  }
}