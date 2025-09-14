import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/admin/properties/[id]/grant-access - Grant free access to a property
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id: propertyId } = await params;
    const { reason, expiresAt }: { reason?: string; expiresAt?: string } = await request.json();

    // Verify property exists
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        PropertySubscription: {
          include: {
            adminGrant: true
          }
        }
      }
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    // Create or update property subscription if it doesn't exist
    let subscription = property.PropertySubscription;
    if (!subscription) {
      subscription = await prisma.propertySubscription.create({
        data: {
          propertyId,
          setupType: 'PENDING',
          subscriptionStatus: 'INACTIVE',
        },
        include: {
          adminGrant: true
        }
      });
    }

    // Check if there's already an active grant
    if (subscription.adminGrant?.isActive) {
      return NextResponse.json({ error: 'Property already has active admin grant' }, { status: 400 });
    }

    // Create admin grant
    const adminGrant = await prisma.propertyAdminGrant.create({
      data: {
        propertySubscriptionId: subscription.id,
        grantedById: session.user.id,
        reason: reason || 'Admin granted free access',
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: true,
      },
      include: {
        grantedBy: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      grant: adminGrant,
    });

  } catch (error) {
    console.error('Error granting admin access:', error);
    return NextResponse.json(
      { error: 'Failed to grant admin access' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/properties/[id]/grant-access - Revoke admin grant
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id: propertyId } = await params;

    // Find and deactivate the admin grant
    const subscription = await prisma.propertySubscription.findUnique({
      where: { propertyId },
      include: {
        adminGrant: true
      }
    });

    if (!subscription?.adminGrant?.isActive) {
      return NextResponse.json({ error: 'No active admin grant found' }, { status: 404 });
    }

    await prisma.propertyAdminGrant.update({
      where: { id: subscription.adminGrant.id },
      data: {
        isActive: false,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Admin grant revoked',
    });

  } catch (error) {
    console.error('Error revoking admin access:', error);
    return NextResponse.json(
      { error: 'Failed to revoke admin access' },
      { status: 500 }
    );
  }
}
