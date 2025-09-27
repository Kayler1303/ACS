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
  const { name, leaseStartDate, leaseEndDate, leaseRent, rentRollId } = await req.json();

  if (!name || !unitId) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 }
    );
  }

  try {
    // Verify unit ownership and get rent roll context
    const unit = await prisma.unit.findFirst({
      where: {
        id: unitId,
        Property: {
          ownerId: session.user.id
        }
      },
      include: {
        Property: {
          include: {
            RentRoll: {
              orderBy: {
                uploadDate: 'desc'
              },
              take: 1
            }
          }
        }
      }
    });

    if (!unit) {
      return NextResponse.json(
        { error: 'Unit not found or access denied' },
        { status: 404 }
      );
    }

    // Determine which rent roll to link to
    let targetRentRoll = null;
    if (rentRollId) {
      // Validate the provided rent roll ID belongs to this property
      targetRentRoll = await prisma.rentRoll.findFirst({
        where: {
          id: rentRollId,
          propertyId: unit.Property.id
        }
      });
      
      if (!targetRentRoll) {
        return NextResponse.json(
          { error: 'Invalid rent roll ID for this property' },
          { status: 400 }
        );
      }
    } else {
      // Use the most recent rent roll for this property
      targetRentRoll = unit.Property.RentRoll[0];
    }

    if (!targetRentRoll) {
      return NextResponse.json(
        { error: 'No rent roll found for this property. Please upload a rent roll first.' },
        { status: 400 }
      );
    }
    // Get the snapshot date (report date) from the rent roll's snapshot
    const rentRollWithSnapshot = await prisma.rentRoll.findFirst({
      where: { id: targetRentRoll.id },
      include: { snapshot: true }
    });

    if (!rentRollWithSnapshot?.snapshot) {
      return NextResponse.json(
        { error: 'Rent roll snapshot not found' },
        { status: 400 }
      );
    }

    // Determine lease type based on dates and rent roll context
    // Use the snapshot's report date, not the rent roll upload date
    const snapshotReportDate = new Date(rentRollWithSnapshot.snapshot.uploadDate + 'T12:00:00'); // Add time to avoid timezone issues
    const leaseStartDateObj = leaseStartDate ? new Date(leaseStartDate + 'T12:00:00') : null;
    
    // Classify lease type:
    // 1. If no lease start date provided → manually created future lease → FUTURE
    // 2. If lease start date provided → compare with snapshot date
    let leaseType: 'CURRENT' | 'FUTURE';
    
    if (!leaseStartDateObj) {
      // No start date = manually created future lease
      leaseType = 'FUTURE';
      console.log(`[MANUAL LEASE CREATION] No start date provided - classifying as FUTURE lease`);
    } else {
      // Has start date - compare with snapshot date
      leaseType = leaseStartDateObj > snapshotReportDate ? 'FUTURE' : 'CURRENT';
      console.log(`[MANUAL LEASE CREATION] Classifying lease as ${leaseType} based on dates:`);
      console.log(`  Snapshot report date: ${snapshotReportDate.toISOString()}`);
      console.log(`  Lease start date: ${leaseStartDateObj.toISOString()}`);
    }

    // Create lease and tenancy in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const leaseId = randomUUID();
      const tenancyId = randomUUID();

      const leaseData: {
        id: string;
        name: string;
        leaseType: 'CURRENT' | 'FUTURE';
        Unit: { connect: { id: string } };
        leaseStartDate?: Date;
        leaseEndDate?: Date;
        leaseRent?: number;
        updatedAt: Date;
      } = {
        id: leaseId,
        name,
        leaseType,
        Unit: {
          connect: {
            id: unitId,
          },
        },
        updatedAt: new Date(),
      };

      if (leaseStartDate) {
        leaseData.leaseStartDate = new Date(leaseStartDate);
      }

      if (leaseEndDate) {
        leaseData.leaseEndDate = new Date(leaseEndDate);
      }

      if (leaseRent) {
        leaseData.leaseRent = parseFloat(leaseRent);
      }

      // Create the lease
      const newLease = await tx.lease.create({
        data: leaseData,
      });

      // Create the tenancy record to link lease to rent roll
      // Both CURRENT and FUTURE leases should be linked to rent rolls (part of snapshot)
      await tx.tenancy.create({
        data: {
          id: tenancyId,
          rentRollId: targetRentRoll.id,
          leaseId: leaseId,
          updatedAt: new Date(),
        },
      });

      console.log(`[MANUAL LEASE CREATION] Created ${leaseType} lease "${name}" (${leaseId}) with tenancy (${tenancyId}) linked to rent roll ${targetRentRoll.id}`);

      return newLease;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating lease:', error);
    return NextResponse.json(
      { error: 'Failed to create lease' },
      { status: 500 }
    );
  }
}