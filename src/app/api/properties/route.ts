import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get all properties for admin users with enhanced data
    const properties = await prisma.property.findMany({
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
        complianceOption: true,
        ownerId: true,
        User: {
          select: {
            id: true,
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
      },
      orderBy: {
        name: 'asc'
      }
    });

    // Enhance properties with snapshot details and stats
    const enhancedProperties = await Promise.all(
      properties.map(async (property) => {
        // Get recent snapshots
        const recentSnapshots = await prisma.rentRollSnapshot.findMany({
          where: { propertyId: property.id },
          orderBy: { uploadDate: 'desc' },
          take: 5,
          select: {
            id: true,
            uploadDate: true,
            filename: true,
            isActive: true
          }
        });

        // Get pending override requests for this property
        const pendingRequests = await prisma.overrideRequest.count({
          where: {
            propertyId: property.id,
            status: 'PENDING'
          }
        });

        // Get total units and leases
        const totalLeases = await prisma.lease.count({
          where: {
            Unit: {
              propertyId: property.id
            }
          }
        });

        return {
          ...property,
          stats: {
            totalSnapshots: property._count.RentRollSnapshot,
            totalUnits: property._count.Unit,
            totalLeases,
            pendingRequests,
            totalRequests: property._count.OverrideRequest
          },
          recentSnapshots
        };
      })
    );

    return NextResponse.json({
      properties: enhancedProperties,
      totalProperties: enhancedProperties.length,
      totalUnits: enhancedProperties.reduce((sum, prop) => sum + prop.stats.totalUnits, 0),
      totalSnapshots: enhancedProperties.reduce((sum, prop) => sum + prop.stats.totalSnapshots, 0),
      pendingRequests: enhancedProperties.reduce((sum, prop) => sum + prop.stats.pendingRequests, 0)
    });
  } catch (error: any) {
    console.error('Error fetching properties:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  console.log('🔍 [DEBUG] Property creation API called');
  
  const session = await getServerSession(authOptions);
  console.log('🔍 [DEBUG] Session:', { 
    exists: !!session, 
    userId: session?.user?.id,
    userEmail: session?.user?.email 
  });

  if (!session || !session.user?.id) {
    console.log('🚨 [DEBUG] No session or user ID');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    console.log('🔍 [DEBUG] Request body:', body);
    
    const { name, address, county, state, numberOfUnits, placedInServiceDate } = body;

    if (!name || !county || !state) {
      console.log('🚨 [DEBUG] Missing required fields:', { name: !!name, county: !!county, state: !!state });
      return NextResponse.json(
        { error: 'Name, county, and state are required.' },
        { status: 400 }
      );
    }

    console.log('🔍 [DEBUG] Creating property with data:', {
      name,
      address,
      county,
      state,
      numberOfUnits,
      placedInServiceDate,
      ownerId: session.user.id
    });

    const newProperty = await prisma.property.create({
      data: {
        id: randomUUID(),
        name,
        address,
        county,
        state,
        numberOfUnits: numberOfUnits ? parseInt(numberOfUnits, 10) : null,
        placedInServiceDate: placedInServiceDate ? new Date(placedInServiceDate) : null,
        ownerId: session.user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    console.log('✅ [DEBUG] Property created successfully:', newProperty.id);
    return NextResponse.json({ property: newProperty }, { status: 201 });
  } catch (error: any) {
    console.error('🚨 [DEBUG] Property creation error:', error);
    console.error('🚨 [DEBUG] Error details:', {
      code: error.code,
      message: error.message,
      meta: error.meta,
      stack: error.stack
    });
    
    // Handle foreign key constraint errors (user doesn't exist)
    if (error.code === 'P2003' && error.meta?.field_name === 'ownerId') {
      console.log('🚨 [DEBUG] Foreign key constraint error - user does not exist');
      return NextResponse.json(
        { error: 'Your session is invalid. Please log out and log back in.' },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
} 