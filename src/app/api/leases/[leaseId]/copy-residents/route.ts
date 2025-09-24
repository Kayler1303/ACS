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

    // 1. Verify the target lease is a valid lease owned by the user
    const targetLease = await prisma.lease.findFirst({
      where: {
        id: targetLeaseId,
        Unit: { Property: { ownerId: session.user.id } },
      },
      include: {
        Resident: true, // Include residents to check if lease is empty
        Tenancy: true, // Include tenancy to check if lease is provisional
      }
    });

    if (!targetLease) {
      return NextResponse.json({ error: 'Target lease not found or access denied.' }, { status: 404 });
    }

    // Check if this is a valid target for copying residents:
    // 1. Either it's a provisional lease (no Tenancy record), OR
    // 2. It's a newly created manual lease (has Tenancy but no residents yet)
    const isProvisionalLease = !targetLease.Tenancy;
    const isNewManualLease = targetLease.Tenancy && targetLease.Resident.length === 0;
    
    console.log(`[COPY RESIDENTS DEBUG] Lease ${targetLeaseId}:`, {
      leaseName: targetLease.name,
      hasTenancy: !!targetLease.Tenancy,
      residentCount: targetLease.Resident.length,
      isProvisionalLease,
      isNewManualLease,
      canCopyResidents: isProvisionalLease || isNewManualLease
    });
    
    if (!isProvisionalLease && !isNewManualLease) {
      return NextResponse.json({ 
        error: 'Target lease already has residents or is not available for resident copying.' 
      }, { status: 400 });
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