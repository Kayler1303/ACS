import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> }
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

    const { propertyId } = await params;

    // Verify property exists and get basic info
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        name: true,
        address: true,
        county: true,
        state: true,
        ownerId: true,
        User: {
          select: {
            name: true,
            email: true,
            company: true
          }
        }
      }
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    // Get all snapshots for this property
    const snapshots = await prisma.rentRollSnapshot.findMany({
      where: { propertyId },
      orderBy: { uploadDate: 'desc' },
      select: {
        id: true,
        uploadDate: true,
        filename: true,
        isActive: true,
        _count: {
          select: {
            rentRolls: true
          }
        }
      }
    });

    // Get additional statistics
    const activeSnapshot = snapshots.find(s => s.isActive);
    const totalSnapshots = snapshots.length;
    const recentUploads = snapshots.filter(s =>
      s.uploadDate >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    ).length;

    // Group snapshots by month for better organization
    const snapshotsByMonth = snapshots.reduce((acc, snapshot) => {
      const monthKey = snapshot.uploadDate.toISOString().slice(0, 7); // YYYY-MM
      if (!acc[monthKey]) {
        acc[monthKey] = [];
      }
      acc[monthKey].push(snapshot);
      return acc;
    }, {} as Record<string, typeof snapshots>);

    // Calculate file size statistics (if available)
    const filenameStats = snapshots.reduce((acc, snapshot) => {
      if (snapshot.filename) {
        const extension = snapshot.filename.split('.').pop()?.toLowerCase();
        if (extension) {
          acc[extension] = (acc[extension] || 0) + 1;
        }
      }
      return acc;
    }, {} as Record<string, number>);

    return NextResponse.json({
      property: {
        id: property.id,
        name: property.name,
        address: property.address,
        county: property.county,
        state: property.state,
        owner: property.User
      },
      snapshots,
      statistics: {
        totalSnapshots,
        activeSnapshot: activeSnapshot ? {
          id: activeSnapshot.id,
          uploadDate: activeSnapshot.uploadDate,
          filename: activeSnapshot.filename
        } : null,
        recentUploads,
        fileTypes: filenameStats,
        snapshotsByMonth: Object.keys(snapshotsByMonth).sort().reverse().map(month => ({
          month,
          count: snapshotsByMonth[month].length,
          snapshots: snapshotsByMonth[month]
        }))
      }
    });
  } catch (error: any) {
    console.error('Error fetching property snapshots:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
