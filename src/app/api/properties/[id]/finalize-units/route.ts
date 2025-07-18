import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

interface FinalizePayload {
  parsedUnits: {
    unitNumber: string;
    squareFootage: number | null;
  }[];
  bedroomMap: Record<number, number | string>;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const propertyId = params.id;

  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: FinalizePayload = await request.json();
    const { parsedUnits, bedroomMap } = body;

    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        ownerId: session.user.id,
      },
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }
    
    const unitsToCreate = parsedUnits.map(unit => {
      const bdrCount = unit.squareFootage ? bedroomMap[unit.squareFootage] : null;
      return {
        propertyId,
        unitNumber: unit.unitNumber,
        squareFootage: unit.squareFootage,
        bedroomCount: bdrCount ? parseInt(String(bdrCount), 10) : null,
      };
    });

    await prisma.$transaction(async (tx) => {
      // First, delete all existing static unit data for this property
      await tx.unit.deleteMany({
        where: { propertyId: propertyId },
      });
       // Then, delete associated rent rolls which will cascade to tenancies
      await tx.rentRoll.deleteMany({
        where: { propertyId: propertyId },
      });

      // Now, create the new units
      await tx.unit.createMany({
        data: unitsToCreate,
        skipDuplicates: true,
      });
    });

    return NextResponse.json({ message: 'Units created successfully' }, { status: 201 });

  } catch (error) {
    console.error('Error finalizing unit creation:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred during unit finalization.' },
      { status: 500 }
    );
  }
} 