import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: propertyId } = await params;
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reason } = await request.json();

    if (!reason) {
      return NextResponse.json({ error: 'Reason for deletion is required' }, { status: 400 });
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
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    // Check if there's already a pending deletion request for this property
    const existingRequest = await prisma.overrideRequest.findFirst({
      where: {
        propertyId: propertyId,
        type: 'PROPERTY_DELETION',
        status: 'PENDING'
      }
    });

    if (existingRequest) {
      return NextResponse.json({ 
        error: 'A deletion request for this property is already pending review' 
      }, { status: 400 });
    }

    // Create the deletion request
    const deletionRequest = await prisma.overrideRequest.create({
      data: {
        id: randomUUID(),
        type: 'PROPERTY_DELETION',
        status: 'PENDING',
        userExplanation: reason,
        propertyId: propertyId,
        requesterId: session.user.id,
        updatedAt: new Date()
      }
    });

    return NextResponse.json({ 
      success: true, 
      requestId: deletionRequest.id,
      message: 'Property deletion request submitted successfully. An admin will review your request.'
    });

  } catch (error) {
    console.error('Error creating property deletion request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 