import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getPropertySnapshots } from '@/services/verificationContinuity';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id: propertyId } = await params;

  if (!propertyId) {
    return NextResponse.json({ error: 'Property ID is required' }, { status: 400 });
  }

  try {
    // Verify user has access to this property
    const { prisma } = await import('@/lib/prisma');
    const property = await prisma.property.findFirst({
      where: { 
        id: propertyId, 
        OR: [
          { ownerId: session.user.id },
          { PropertyShare: { some: { userId: session.user.id } } }
        ]
      }
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    const snapshots = await getPropertySnapshots(propertyId);
    
    return NextResponse.json(snapshots);
  } catch (error) {
    console.error('Error fetching property snapshots:', error);
    return NextResponse.json(
      { error: 'Failed to fetch property snapshots' },
      { status: 500 }
    );
  }
} 