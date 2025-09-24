import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; snapshotId: string }> }
) {
  try {
    const { id: propertyId, snapshotId } = await params;
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reason } = await request.json();

    if (!reason || reason.trim().length < 10) {
      return NextResponse.json({ error: 'Reason for deletion must be at least 10 characters' }, { status: 400 });
    }

    // Verify the property exists and belongs to the user
    const property = await prisma.property.findFirst({
      where: { 
        id: propertyId,
        ownerId: session.user.id 
      },
      select: { id: true, name: true, address: true }
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found or access denied' }, { status: 404 });
    }

    // Verify the snapshot exists and belongs to this property
    const snapshot = await prisma.rentRollSnapshot.findFirst({
      where: {
        id: snapshotId,
        propertyId: propertyId
      },
      select: { 
        id: true, 
        filename: true, 
        uploadDate: true, 
        isActive: true,
        _count: {
          select: {
            rentRolls: true
          }
        }
      }
    });

    if (!snapshot) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
    }

    // Check if there's already a pending deletion request for this snapshot
    const existingRequest = await prisma.overrideRequest.findFirst({
      where: {
        snapshotId: snapshotId,
        type: 'SNAPSHOT_DELETION',
        status: 'PENDING'
      }
    });

    if (existingRequest) {
      return NextResponse.json({ 
        error: 'A deletion request for this snapshot is already pending review' 
      }, { status: 400 });
    }

    // Create the deletion request
    const deletionRequest = await prisma.overrideRequest.create({
      data: {
        id: randomUUID(),
        type: 'SNAPSHOT_DELETION',
        status: 'PENDING',
        userExplanation: reason.trim(),
        propertyId: propertyId,
        snapshotId: snapshotId,
        requesterId: session.user.id,
        updatedAt: new Date()
      }
    });

    return NextResponse.json({ 
      success: true,
      requestId: deletionRequest.id,
      message: 'Snapshot deletion request submitted successfully. An admin will review your request.'
    });

  } catch (error) {
    console.error('Error creating snapshot deletion request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
