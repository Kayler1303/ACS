import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const propertyId = req.nextUrl.pathname.split('/')[3];

  try {
    const property = await prisma.property.findFirst({
      where: { 
        id: propertyId, 
        ownerId: session.user.id 
      },
      include: {
        units: {
          orderBy: {
            unitNumber: 'asc',
          },
        },
        rentRolls: {
          include: {
            tenancies: {
              include: {
                residents: true,
              },
            },
          },
          orderBy: {
            date: 'desc',
          },
        },
      },
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    return NextResponse.json(property);

  } catch (error: any) {
    console.error('Error fetching full property data:', error);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
} 