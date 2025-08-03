import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { requestId } = await params;
    const { action, adminNotes } = await request.json();

    if (!['approve', 'deny'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (!adminNotes || !adminNotes.trim()) {
      return NextResponse.json({ error: 'Admin notes are required' }, { status: 400 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });
    
    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Check if the override request exists and is pending
    const existingRequest = await prisma.overrideRequest.findUnique({
      where: { id: requestId }
    });

    if (!existingRequest) {
      return NextResponse.json({ error: 'Override request not found' }, { status: 404 });
    }

    if (existingRequest.status !== 'PENDING') {
      return NextResponse.json({ error: 'Override request has already been reviewed' }, { status: 400 });
    }

    // Update the override request
    const updatedRequest = await prisma.overrideRequest.update({
      where: { id: requestId },
      data: {
        status: action === 'approve' ? 'APPROVED' : 'DENIED',
        adminNotes: adminNotes.trim(),
        reviewerId: session.user.id,
        reviewedAt: new Date(),
      },
      include: {
        User_OverrideRequest_requesterIdToUser: {
          select: {
            id: true,
            name: true,
            email: true,
            company: true,
          }
        },
        User_OverrideRequest_reviewerIdToUser: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        },
        Property: {
          select: {
            id: true,
            name: true,
            address: true
          }
        }
      }
    });

    // Handle property deletion if approved
    if (action === 'approve' && existingRequest.type === 'PROPERTY_DELETION' && updatedRequest.Property) {
      try {
        await prisma.property.delete({
          where: { id: updatedRequest.Property.id }
        });
        console.log(`Property ${updatedRequest.Property.name} (${updatedRequest.Property.id}) deleted by admin ${session.user.id}`);
      } catch (deleteError) {
        console.error('Error deleting property:', deleteError);
        // Revert the override request status if deletion fails
        await prisma.overrideRequest.update({
          where: { id: requestId },
          data: {
            status: 'PENDING',
            adminNotes: `${adminNotes.trim()}\n\nERROR: Property deletion failed. Please try again or contact support.`,
            reviewedAt: null,
          }
        });
        return NextResponse.json({ 
          error: 'Failed to delete property. The request has been reverted to pending status.' 
        }, { status: 500 });
      }
    }

    // Handle validation exception approval - automatically finalize resident income
    if (action === 'approve' && existingRequest.type === 'VALIDATION_EXCEPTION' && existingRequest.residentId) {
      try {
        const now = new Date();
        
        // Finalize the resident's income
        await prisma.resident.update({
          where: { id: existingRequest.residentId },
          data: {
            incomeFinalized: true,
            finalizedAt: now,
          }
        });

        // Mark all documents for this resident as COMPLETED (if they're not already)
        if (existingRequest.verificationId) {
          await prisma.incomeDocument.updateMany({
            where: {
              residentId: existingRequest.residentId,
              verificationId: existingRequest.verificationId,
              status: { in: ['NEEDS_REVIEW', 'PROCESSING'] }
            },
            data: {
              status: 'COMPLETED'
            }
          });
        }

        console.log(`Validation exception approved - automatically finalized resident ${existingRequest.residentId} by admin ${session.user.id}`);
      } catch (finalizationError) {
        console.error('Error auto-finalizing resident after validation exception approval:', finalizationError);
        // Note: We don't revert the override request here as the approval was successful
        // The finalization can be done manually if needed
      }
    }

    // TODO: In the future, we might want to:
    // 1. Send email notification to the requester
    // 2. If approved, automatically apply the override (depending on the type)
    // 3. Log the admin action for audit purposes

    return NextResponse.json({
      success: true,
      request: updatedRequest
    });

  } catch (error) {
    console.error('Error updating override request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 