import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
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

    // Get the target user to verify they exist
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, company: true }
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get owned properties
    const ownedProperties = await prisma.property.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        name: true,
        address: true,
        county: true,
        state: true,
        numberOfUnits: true,
        createdAt: true,
        updatedAt: true,
        placedInServiceDate: true,
        _count: {
          select: {
            Unit: true,
            RentRollSnapshot: true,
            OverrideRequest: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    // Get shared properties (where user has access through PropertyShare)
    const sharedPropertiesRaw = await prisma.propertyShare.findMany({
      where: { userId: userId },
      include: {
        property: {
          select: {
            id: true,
            name: true,
            address: true,
            county: true,
            state: true,
            numberOfUnits: true,
            createdAt: true,
            updatedAt: true,
            placedInServiceDate: true,
            ownerId: true,
            User: {
              select: {
                name: true,
                email: true,
                company: true
              }
            },
            _count: {
              select: {
                Unit: true,
                RentRollSnapshot: true,
                OverrideRequest: true
              }
            }
          }
        },
        sharedBy: {
          select: {
            name: true,
            email: true,
            company: true
          }
        }
      }
    });

    // Format shared properties
    const sharedProperties = sharedPropertiesRaw.map(share => ({
      ...share.property,
      sharedBy: share.sharedBy,
      permission: share.permission,
      sharedAt: share.createdAt
    }));

    // Get recent snapshots for each property (last 3 for performance)
    const allProperties = [...ownedProperties, ...sharedProperties];

    const propertiesWithSnapshots = await Promise.all(
      allProperties.map(async (property) => {
        const recentSnapshots = await prisma.rentRollSnapshot.findMany({
          where: { propertyId: property.id },
          orderBy: { uploadDate: 'desc' },
          take: 3,
          select: {
            id: true,
            uploadDate: true,
            filename: true,
            isActive: true
          }
        });

        return {
          ...property,
          recentSnapshots,
          isOwned: property.ownerId === userId,
          ownership: property.ownerId === userId ? 'owned' : 'shared'
        };
      })
    );

    return NextResponse.json({
      user: targetUser,
      properties: propertiesWithSnapshots,
      summary: {
        totalProperties: propertiesWithSnapshots.length,
        ownedProperties: ownedProperties.length,
        sharedProperties: sharedProperties.length,
        totalUnits: propertiesWithSnapshots.reduce((sum, prop) => sum + (prop._count?.Unit || 0), 0),
        totalSnapshots: propertiesWithSnapshots.reduce((sum, prop) => sum + (prop._count?.RentRollSnapshot || 0), 0),
        totalRequests: propertiesWithSnapshots.reduce((sum, prop) => sum + (prop._count?.OverrideRequest || 0), 0)
      }
    });
  } catch (error: any) {
    console.error('Error fetching user properties:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
