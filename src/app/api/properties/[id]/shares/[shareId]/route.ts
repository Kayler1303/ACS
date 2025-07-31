import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { PermissionLevel } from '@prisma/client';
import { requirePermission } from '@/lib/permissions';

// PUT /api/properties/[id]/shares/[shareId] - Update a property share's permission level
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; shareId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: propertyId, shareId } = await params;
    const body = await req.json();
    const { permission } = body;

    // Validate input
    if (!permission) {
      return NextResponse.json({ error: 'Permission level is required' }, { status: 400 });
    }

    if (!Object.values(PermissionLevel).includes(permission)) {
      return NextResponse.json({ error: 'Invalid permission level' }, { status: 400 });
    }

    // Only property owners can update shares
    const canShare = await requirePermission(propertyId, session.user.id, 'share');
    if (!canShare) {
      return NextResponse.json({ error: 'Permission denied. Only property owners can update shares.' }, { status: 403 });
    }

    // Verify the share exists and belongs to this property
    const existingShare = await prisma.propertyShare.findUnique({
      where: { id: shareId },
      include: {
        property: { select: { id: true } }
      }
    });

    if (!existingShare) {
      return NextResponse.json({ error: 'Share not found' }, { status: 404 });
    }

    if (existingShare.property.id !== propertyId) {
      return NextResponse.json({ error: 'Share does not belong to this property' }, { status: 400 });
    }

    // Update the share
    const updatedShare = await prisma.propertyShare.update({
      where: { id: shareId },
      data: { permission },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        },
        sharedBy: {
          select: { name: true, email: true }
        }
      }
    });

    return NextResponse.json({ 
      message: 'Share updated successfully',
      share: updatedShare 
    });

  } catch (error) {
    console.error('Error updating property share:', error);
    return NextResponse.json(
      { error: 'Failed to update property share' },
      { status: 500 }
    );
  }
}

// DELETE /api/properties/[id]/shares/[shareId] - Remove a property share
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; shareId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: propertyId, shareId } = await params;

    // Only property owners can delete shares
    const canShare = await requirePermission(propertyId, session.user.id, 'share');
    if (!canShare) {
      return NextResponse.json({ error: 'Permission denied. Only property owners can remove shares.' }, { status: 403 });
    }

    // Verify the share exists and belongs to this property
    const existingShare = await prisma.propertyShare.findUnique({
      where: { id: shareId },
      include: {
        property: { select: { id: true } },
        user: { select: { name: true, email: true } }
      }
    });

    if (!existingShare) {
      return NextResponse.json({ error: 'Share not found' }, { status: 404 });
    }

    if (existingShare.property.id !== propertyId) {
      return NextResponse.json({ error: 'Share does not belong to this property' }, { status: 400 });
    }

    // Delete the share
    await prisma.propertyShare.delete({
      where: { id: shareId }
    });

    return NextResponse.json({ 
      message: `Property access removed for ${existingShare.user.email}` 
    });

  } catch (error) {
    console.error('Error deleting property share:', error);
    return NextResponse.json(
      { error: 'Failed to delete property share' },
      { status: 500 }
    );
  }
} 