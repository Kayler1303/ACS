import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id: propertyId } = await params;

  try {
    const property = await prisma.property.findFirst({
      where: { 
        id: propertyId, 
        ownerId: session.user.id 
      },
      include: {
        Unit: {
          orderBy: {
            unitNumber: 'asc',
          },
        },
        RentRoll: {
          orderBy: {
            date: 'desc',
          },
          include: {
            Tenancy: {
              include: {
                Lease: {
                  include: {
                    Resident: true,
                    Unit: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    // Check for pending deletion request
    const pendingDeletionRequest = await prisma.overrideRequest.findFirst({
      where: {
        propertyId: propertyId,
        type: 'PROPERTY_DELETION',
        status: 'PENDING'
      },
      select: {
        id: true,
        userExplanation: true,
        createdAt: true
      }
    });

    // Add the pending deletion request to the property data
    const propertyWithDeletionStatus = {
      ...property,
      pendingDeletionRequest: pendingDeletionRequest || null
    };

    return NextResponse.json(propertyWithDeletionStatus);

  } catch (error: unknown) {
    console.error('Error fetching full property data:', error);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
} 

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id: propertyId } = await params;

  try {
    // First, verify the user owns the property
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        ownerId: session.user.id,
      },
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found or you do not have permission to delete it.' }, { status: 404 });
    }

    // Use a transaction to ensure atomicity
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Deleting a property will cascade and delete all related records
      // as defined by the `onDelete: Cascade` in the schema.
      await tx.property.delete({
        where: { id: propertyId },
      });
    });

    return NextResponse.json({ message: 'Property deleted successfully' }, { status: 200 });

  } catch (error: unknown) {
    console.error('Error deleting property:', error);
    if ((error as { code?: string })?.code === 'P2025') { // Prisma code for record to delete not found
        return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
    }
    return NextResponse.json({ error: 'An unexpected error occurred during property deletion.' }, { status: 500 });
  }
} 