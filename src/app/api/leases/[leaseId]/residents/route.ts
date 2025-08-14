import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
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

    console.log(`[RESIDENT CREATION DEBUG] Received data:`, { leaseId, name, annualizedIncome, type: typeof annualizedIncome });

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
    let parsedIncome = null;
    if (annualizedIncome != null && annualizedIncome !== '') {
      const parsed = parseFloat(annualizedIncome.toString());
      if (!isNaN(parsed)) {
        parsedIncome = parsed;
      }
    }

    console.log(`[RESIDENT CREATION DEBUG] Parsed income:`, { original: annualizedIncome, parsed: parsedIncome });

    const newResident = await prisma.resident.create({
      data: {
        id: randomUUID(),
        name,
        annualizedIncome: parsedIncome,
        updatedAt: new Date(),
        Lease: {
          connect: { id: leaseId },
        },
      },
    });

    console.log(`[RESIDENT CREATION DEBUG] Successfully created resident:`, { id: newResident.id, name: newResident.name });
    return NextResponse.json(newResident, { status: 201 });
  } catch (error) {
    console.error('Error adding resident:', error);
    return NextResponse.json(
      { error: 'Failed to add resident to the lease.' },
      { status: 500 }
    );
  }
} 