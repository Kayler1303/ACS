import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { leaseId } = await params;
    const { name, annualizedIncome } = await req.json();

    if (!name || !annualizedIncome) {
      return NextResponse.json(
        { error: 'Name and annualized income are required.' },
        { status: 400 }
      );
    }

    // 1. Verify the lease exists, belongs to the user, and is provisional
    const lease = await prisma.lease.findFirst({
      where: {
        id: leaseId,
        unit: {
          property: {
            ownerId: session.user.id,
          },
        },
      },
      include: {
        tenancy: true,
      },
    });

    if (!lease) {
      return NextResponse.json({ error: 'Lease not found or access denied' }, { status: 404 });
    }

    if (lease.tenancy) {
      return NextResponse.json(
        { error: 'Cannot manually add residents to a non-provisional lease.' },
        { status: 403 } // Forbidden
      );
    }

    // 2. Create the new resident
    const newResident = await prisma.resident.create({
      data: {
        name,
        annualizedIncome: parseFloat(annualizedIncome),
        lease: {
          connect: { id: leaseId },
        },
      },
    });

    return NextResponse.json(newResident, { status: 201 });
  } catch (error) {
    console.error('Error adding resident:', error);
    return NextResponse.json(
      { error: 'Failed to add resident to the lease.' },
      { status: 500 }
    );
  }
} 