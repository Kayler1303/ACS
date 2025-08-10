import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { leaseId } = await params;

  if (!leaseId) {
    return NextResponse.json({ error: 'Lease ID is required' }, { status: 400 });
  }

  try {
    const lease = await prisma.lease.findUnique({
      where: { id: leaseId },
      include: {
        Resident: {
          include: {
            IncomeDocument: {
              where: {
                status: { in: ['COMPLETED', 'NEEDS_REVIEW'] }
              },
              orderBy: { uploadDate: 'desc' }
            }
          }
        },
        IncomeVerification: {
          orderBy: { createdAt: 'desc' }
        },
        Tenancy: {
          include: {
            RentRoll: true
          }
        },
        Unit: {
          include: {
            Property: {
              select: {
                id: true,
                name: true,
                ownerId: true,
              }
            }
          }
        }
      }
    });

    if (!lease) {
      return NextResponse.json({ error: 'Lease not found' }, { status: 404 });
    }

    if (lease.Unit.Property.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Structure the response to match what the frontend expects
    const response = {
      lease: {
        id: lease.id,
        name: lease.name,
        leaseStartDate: lease.leaseStartDate,
        leaseEndDate: lease.leaseEndDate,
        leaseRent: lease.leaseRent,
        Resident: lease.Resident,
        IncomeVerification: lease.IncomeVerification,
        Tenancy: lease.Tenancy
      },
      unit: {
        id: lease.Unit.id,
        unitNumber: lease.Unit.unitNumber,
        bedroomCount: lease.Unit.bedroomCount,
        squareFootage: lease.Unit.squareFootage
      },
      property: {
        id: lease.Unit.Property.id,
        name: lease.Unit.Property.name
      }
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error fetching lease:', error);
    return NextResponse.json(
      { error: 'Failed to fetch lease' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { leaseId } = await params;

  if (!leaseId) {
    return NextResponse.json({ error: 'Lease ID is required' }, { status: 400 });
  }

  try {
    const lease = await prisma.lease.findUnique({
      where: { id: leaseId },
      include: {
        Tenancy: true,
        Unit: {
          select: {
            Property: {
              select: {
                ownerId: true,
              },
            },
          },
        },
      },
    });

    if (!lease) {
      return NextResponse.json({ error: 'Lease not found' }, { status: 404 });
    }

    if (lease.Unit.Property.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Only allow deleting "provisional" leases (not linked to a tenancy)
    if (lease.Tenancy) {
      return NextResponse.json(
        {
          error:
            'Cannot delete a lease that is part of a rent roll. This is not a provisional lease.',
        },
        { status: 400 }
      );
    }

    await prisma.lease.delete({
      where: {
        id: leaseId,
      },
    });

    return NextResponse.json({ message: 'Lease deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Error deleting lease:', error);
    return NextResponse.json(
      { error: 'Failed to delete lease' },
      { status: 500 }
    );
  }
} 