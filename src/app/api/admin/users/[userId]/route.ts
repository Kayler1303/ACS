import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check if user is admin
    const adminUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    if (adminUser?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { userId } = await params;

    // Prevent admin from deleting themselves
    if (userId === session.user.id) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      );
    }

    // Check if user exists
    const userToDelete = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        _count: {
          select: {
            Property: true,
            OverrideRequest_OverrideRequest_requesterIdToUser: true,
            AdminMessage_AdminMessage_recipientIdToUser: true
          }
        }
      }
    });

    if (!userToDelete) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Prevent deleting other admin users
    if (userToDelete.role === 'ADMIN') {
      return NextResponse.json(
        { error: 'Cannot delete admin users' },
        { status: 400 }
      );
    }

    // Start a transaction to safely delete the user and handle related data
    const result = await prisma.$transaction(async (tx) => {
      // Delete related data in the correct order to avoid foreign key constraints

      // 1. Delete admin messages sent by this user
      await tx.adminMessage.deleteMany({
        where: { adminId: userId }
      });

      // 2. Delete admin messages received by this user
      await tx.adminMessage.deleteMany({
        where: { recipientId: userId }
      });

      // 3. Delete override requests created by this user
      await tx.overrideRequest.deleteMany({
        where: { requesterId: userId }
      });

      // 4. Delete override requests reviewed by this user
      await tx.overrideRequest.deleteMany({
        where: { reviewerId: userId }
      });

      // 5. Handle property sharing - remove this user from all property shares
      await tx.propertyShare.deleteMany({
        where: { userId: userId }
      });

      await tx.propertyShare.deleteMany({
        where: { sharedById: userId }
      });

      // 6. Handle properties - we need to either delete them or reassign them
      // For safety, we'll check if there are properties and return an error if there are
      const userProperties = await tx.property.findMany({
        where: { ownerId: userId },
        select: { id: true, name: true }
      });

      if (userProperties.length > 0) {
        throw new Error(`User has ${userProperties.length} properties that must be reassigned or deleted first`);
      }

      // 7. Delete verification tokens
      await tx.verificationToken.deleteMany({
        where: { identifier: userId }
      });

      // 8. Finally delete the user
      await tx.user.delete({
        where: { id: userId }
      });

      return {
        deleted: true,
        user: {
          id: userToDelete.id,
          name: userToDelete.name,
          email: userToDelete.email
        }
      };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error deleting user:', error);

    // Handle specific error cases
    if (error.message?.includes('properties that must be reassigned')) {
      return NextResponse.json(
        {
          error: error.message,
          code: 'USER_HAS_PROPERTIES'
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred while deleting the user.' },
      { status: 500 }
    );
  }
}
