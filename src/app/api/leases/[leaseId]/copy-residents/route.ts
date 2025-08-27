import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Decimal } from '@prisma/client/runtime/library';
import crypto from 'crypto';

type Resident = {
  id: string;
  name: string;
  annualizedIncome: number;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { leaseId: targetLeaseId } = await params;
    const { residentIds } = await req.json();

    if (!residentIds || !Array.isArray(residentIds) || residentIds.length === 0) {
      return NextResponse.json({ error: 'Resident IDs are required.' }, { status: 400 });
    }

    // 1. Verify the target lease is a valid, provisional lease owned by the user
    const targetLease = await prisma.lease.findFirst({
      where: {
        id: targetLeaseId,
        Unit: { Property: { ownerId: session.user.id } },
        Tenancy: null, // Must be provisional
      },
    });

    if (!targetLease) {
      return NextResponse.json({ error: 'Target lease not found, is not provisional, or access denied.' }, { status: 404 });
    }

    // 2. Fetch the source residents to be copied
    const sourceResidents = await prisma.resident.findMany({
      where: {
        id: { in: residentIds },
        // Security check: ensure the residents being copied belong to a lease in the same unit
        Lease: {
          unitId: targetLease.unitId,
        },
      },
    });
    
    if (sourceResidents.length !== residentIds.length) {
        return NextResponse.json({ error: 'One or more source residents could not be found or do not belong to this unit.' }, { status: 400 });
    }

    // 3. Prepare the data for the new resident records
    const newResidentsData = sourceResidents.map((resident: any) => ({
      id: crypto.randomUUID(),
      name: resident.name,
      annualizedIncome: resident.annualizedIncome ? resident.annualizedIncome.toNumber() : 0,
      leaseId: targetLeaseId,
      updatedAt: new Date(),
    }));

    // 4. Create the new residents in a single transaction
    const result = await prisma.resident.createMany({
      data: newResidentsData,
    });

    return NextResponse.json({ message: `${result.count} residents copied successfully.` }, { status: 201 });

  } catch (error) {
    console.error('Error copying residents:', error);
    return NextResponse.json(
      { error: 'Failed to copy residents.' },
      { status: 500 }
    );
  }
} 