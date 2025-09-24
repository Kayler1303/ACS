import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; snapshotId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: propertyId, snapshotId } = await params;

    // Verify property ownership
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: { User: true }
    });

    if (!property || property.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Property not found or access denied' }, { status: 404 });
    }

    // Get the snapshot to verify ownership and check if it's active
    const snapshot = await prisma.rentRollSnapshot.findUnique({
      where: { id: snapshotId },
      include: {
        rentRolls: {
          select: { id: true }
        }
      }
    });

    if (!snapshot) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
    }

    if (snapshot.propertyId !== propertyId) {
      return NextResponse.json({ error: 'Snapshot does not belong to this property' }, { status: 403 });
    }

    // Check if this is the active snapshot
    if (snapshot.isActive) {
      return NextResponse.json({ 
        error: 'Cannot delete the active snapshot. Please make another snapshot active first.' 
      }, { status: 400 });
    }

    // Check if there are any rent rolls associated with this snapshot
    if (snapshot.rentRolls.length > 0) {
      return NextResponse.json({ 
        error: `Cannot delete snapshot with ${snapshot.rentRolls.length} associated rent roll(s). This would cause data loss.` 
      }, { status: 400 });
    }

    // Delete the snapshot
    await prisma.rentRollSnapshot.delete({
      where: { id: snapshotId }
    });

    console.log(`[SNAPSHOT DELETE] User ${session.user.id} deleted snapshot ${snapshotId} for property ${propertyId}`);

    return NextResponse.json({
      success: true,
      message: 'Snapshot deleted successfully'
    });

  } catch (error) {
    console.error('[SNAPSHOT DELETE API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete snapshot', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; snapshotId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: propertyId, snapshotId } = await params;
    const { action } = await request.json();

    // Verify property ownership
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: { User: true }
    });

    if (!property || property.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Property not found or access denied' }, { status: 404 });
    }

    if (action === 'make_active') {
      // Make this snapshot active and deactivate others
      await prisma.$transaction(async (tx) => {
        // Deactivate all other snapshots for this property
        await tx.rentRollSnapshot.updateMany({
          where: { 
            propertyId: propertyId,
            id: { not: snapshotId }
          },
          data: { isActive: false }
        });

        // Activate the selected snapshot
        await tx.rentRollSnapshot.update({
          where: { id: snapshotId },
          data: { isActive: true }
        });
      });

      console.log(`[SNAPSHOT ACTIVATE] User ${session.user.id} made snapshot ${snapshotId} active for property ${propertyId}`);

      return NextResponse.json({
        success: true,
        message: 'Snapshot activated successfully'
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('[SNAPSHOT PATCH API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update snapshot', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
