import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: propertyId } = await params;

    // Verify property ownership
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: { owner: true }
    });

    if (!property || property.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Property not found or access denied' }, { status: 404 });
    }

    // Get all rent roll snapshots for this property
    const snapshots = await prisma.rentRoll.findMany({
      where: { propertyId },
      orderBy: { uploadDate: 'desc' },
      select: {
        id: true,
        uploadDate: true,
        filename: true,
        isActive: true
      }
    });

    return NextResponse.json({
      success: true,
      snapshots
    });

  } catch (error) {
    console.error('[SNAPSHOTS API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch snapshots', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 