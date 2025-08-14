import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { name, address, county, state, numberOfUnits, placedInServiceDate } = await request.json();

    if (!name || !county || !state) {
      return NextResponse.json(
        { error: 'Name, county, and state are required.' },
        { status: 400 }
      );
    }

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

    return NextResponse.json({ property: newProperty }, { status: 201 });
  } catch (error: any) {
    console.error('Property creation error:', error);
    
    // Handle foreign key constraint errors (user doesn't exist)
    if (error.code === 'P2003' && error.meta?.field_name === 'ownerId') {
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