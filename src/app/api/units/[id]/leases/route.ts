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
    // Determine lease type based on dates and rent roll context
    const rentRollDate = new Date(targetRentRoll.uploadDate);
    const leaseStartDateObj = leaseStartDate ? new Date(leaseStartDate) : null;
    
    // Classify as FUTURE if lease starts after rent roll date, otherwise CURRENT
    const leaseType = leaseStartDateObj && leaseStartDateObj > rentRollDate ? 'FUTURE' : 'CURRENT';
    
    console.log(`[MANUAL LEASE CREATION] Classifying lease as ${leaseType}:`);
    console.log(`  Rent roll date: ${rentRollDate.toISOString()}`);
    console.log(`  Lease start date: ${leaseStartDateObj?.toISOString() || 'null'}`);

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
      await tx.tenancy.create({
        data: {
          id: tenancyId,
          rentRollId: targetRentRoll.id,
          leaseId: leaseId,
          updatedAt: new Date(),
        },
      });

      console.log(`[MANUAL LEASE CREATION] Created lease "${name}" (${leaseId}) with tenancy (${tenancyId}) linked to rent roll ${targetRentRoll.id}`);

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