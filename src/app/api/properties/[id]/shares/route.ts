import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { PermissionLevel } from '@prisma/client';
import { requirePermission } from '@/lib/permissions';

// GET /api/properties/[id]/shares - List all shares for a property (owner only)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: propertyId } = await params;

    // Only property owners can view shares
    const canShare = await requirePermission(propertyId, session.user.id, 'share');
    if (!canShare) {
      return NextResponse.json({ error: 'Permission denied. Only property owners can view shares.' }, { status: 403 });
    }

    const shares = await prisma.propertyShare.findMany({
      where: { propertyId },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        },
        sharedBy: {
          select: { name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ shares });

  } catch (error) {
    console.error('Error fetching property shares:', error);
    return NextResponse.json(
      { error: 'Failed to fetch property shares' },
      { status: 500 }
    );
  }
}

// POST /api/properties/[id]/shares - Create a new property share
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: propertyId } = await params;
    const body = await req.json();
    const { userEmail, permission } = body;

    // Validate input
    if (!userEmail || !permission) {
      return NextResponse.json({ error: 'User email and permission level are required' }, { status: 400 });
    }

    if (!Object.values(PermissionLevel).includes(permission)) {
      return NextResponse.json({ error: 'Invalid permission level' }, { status: 400 });
    }

    // Only property owners can share
    const canShare = await requirePermission(propertyId, session.user.id, 'share');
    if (!canShare) {
      return NextResponse.json({ error: 'Permission denied. Only property owners can share properties.' }, { status: 403 });
    }

    // Find the user to share with
    const targetUser = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true, name: true, email: true }
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Don't allow sharing with self
    if (targetUser.id === session.user.id) {
      return NextResponse.json({ error: 'Cannot share property with yourself' }, { status: 400 });
    }

    // Check if share already exists
    const existingShare = await prisma.propertyShare.findUnique({
      where: {
        propertyId_userId: {
          propertyId,
          userId: targetUser.id
        }
      }
    });

    if (existingShare) {
      return NextResponse.json({ error: 'Property is already shared with this user' }, { status: 400 });
    }

    // Create the share
    const share = await prisma.propertyShare.create({
      data: {
        propertyId,
        userId: targetUser.id,
        sharedById: session.user.id,
        permission
      },
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
      message: 'Property shared successfully',
      share 
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating property share:', error);
    return NextResponse.json(
      { error: 'Failed to create property share' },
      { status: 500 }
    );
  }
} 