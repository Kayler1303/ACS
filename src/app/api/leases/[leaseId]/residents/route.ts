import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { randomUUID } from 'crypto';

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

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required.' },
        { status: 400 }
      );
    }

    // 1. Verify the lease exists, belongs to the user, and is provisional
    const lease = await prisma.lease.findFirst({
      where: {
        id: leaseId,
        Unit: {
          Property: {
            ownerId: session.user.id,
          },
        },
      },
      include: {
        Tenancy: true,
      },
    });

    if (!lease) {
      return NextResponse.json({ error: 'Lease not found or access denied' }, { status: 404 });
    }

    if (lease.Tenancy) {
      return NextResponse.json(
        { error: 'Cannot manually add residents to a non-provisional lease.' },
        { status: 403 } // Forbidden
      );
    }

    // 2. Create the new resident
    const newResident = await prisma.resident.create({
      data: {
        id: randomUUID(),
        name,
        annualizedIncome: annualizedIncome ? parseFloat(annualizedIncome) : null,
        updatedAt: new Date(),
        Lease: {
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