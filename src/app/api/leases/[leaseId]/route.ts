import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

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