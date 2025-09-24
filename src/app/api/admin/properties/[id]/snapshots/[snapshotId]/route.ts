import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
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

    // Check if user is admin
    const adminUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    if (adminUser?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id: propertyId, snapshotId } = await params;
    const url = new URL(request.url);
    const force = url.searchParams.get('force');

    // Verify property exists
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        name: true,
        User: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    // Get the snapshot to verify it exists and get details
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

    // Admin can force delete, but warn about consequences
    if (force !== 'true') {
      // Check if this is the active snapshot
      if (snapshot.isActive) {
        return NextResponse.json({ 
          error: 'This is the active snapshot. Deleting it may cause data loss.',
          requiresForce: true,
          details: {
            isActive: true,
            rentRollCount: snapshot.rentRolls.length
          }
        }, { status: 400 });
      }

      // Check if there are any rent rolls associated with this snapshot
      if (snapshot.rentRolls.length > 0) {
        return NextResponse.json({ 
          error: `This snapshot has ${snapshot.rentRolls.length} associated rent roll(s). Deleting it will cause data loss.`,
          requiresForce: true,
          details: {
            isActive: snapshot.isActive,
            rentRollCount: snapshot.rentRolls.length
          }
        }, { status: 400 });
      }
    }

    // Perform the deletion (with cascade handling)
    await prisma.$transaction(async (tx) => {
      // If there are rent rolls, we need to handle them first
      if (snapshot.rentRolls.length > 0) {
        // Set rent roll snapshot references to null before deleting snapshot
        await tx.rentRoll.updateMany({
          where: { snapshotId: snapshotId },
          data: { snapshotId: null }
        });
      }

      // Delete the snapshot
      await tx.rentRollSnapshot.delete({
        where: { id: snapshotId }
      });
    });

    console.log(`[ADMIN SNAPSHOT DELETE] Admin ${session.user.id} deleted snapshot ${snapshotId} for property ${propertyId} (${property.name}) owned by ${property.User.email}`);

    return NextResponse.json({
      success: true,
      message: 'Snapshot deleted successfully',
      details: {
        snapshotId,
        propertyName: property.name,
        propertyOwner: property.User.email,
        rentRollsAffected: snapshot.rentRolls.length
      }
    });

  } catch (error) {
    console.error('[ADMIN SNAPSHOT DELETE API] Error:', error);
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

    // Check if user is admin
    const adminUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    if (adminUser?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id: propertyId, snapshotId } = await params;
    const { action } = await request.json();

    // Verify property exists
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        name: true,
        User: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
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

      console.log(`[ADMIN SNAPSHOT ACTIVATE] Admin ${session.user.id} made snapshot ${snapshotId} active for property ${propertyId} (${property.name}) owned by ${property.User.email}`);

      return NextResponse.json({
        success: true,
        message: 'Snapshot activated successfully',
        details: {
          snapshotId,
          propertyName: property.name,
          propertyOwner: property.User.email
        }
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('[ADMIN SNAPSHOT PATCH API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update snapshot', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
