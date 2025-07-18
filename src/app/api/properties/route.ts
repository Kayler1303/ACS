import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { name, address, county, state, numberOfUnits } = await request.json();

    if (!name || !county || !state) {
      return NextResponse.json(
        { error: 'Name, county, and state are required.' },
        { status: 400 }
      );
    }

    const newProperty = await prisma.property.create({
      data: {
        name,
        address,
        county,
        state,
        numberOfUnits: numberOfUnits ? parseInt(numberOfUnits, 10) : null,
        owner: {
          connect: {
            id: session.user.id,
          },
        },
      },
    });

    return NextResponse.json(newProperty, { status: 201 });
  } catch (error) {
    console.error('Property creation error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
} 