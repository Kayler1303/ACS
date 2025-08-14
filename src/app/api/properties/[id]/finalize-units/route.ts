import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

type BedroomCount = number | string;
type UnitNumber = string;

interface RequestBody {
  parsedUnits: {
    unitNumber: string;
    squareFootage: number | null;
  }[];
  bedroomMap: Record<BedroomCount, number>;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const propertyId = params.id;

  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: RequestBody = await req.json();
    const { parsedUnits, bedroomMap } = body;

    // Use a transaction to ensure all or nothing
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const property = await tx.property.findFirst({
        where: {
          id: propertyId,
          ownerId: session.user.id,
        },
      });

      if (!property) {
        throw new Error('Property not found or you do not have permission to access it.');
      }
      
      const unitsToCreate = parsedUnits.map((unit) => {
        const bdrCount = unit.squareFootage ? bedroomMap[unit.squareFootage] : null;
        return {
          id: randomUUID(),
          propertyId,
          unitNumber: unit.unitNumber,
          squareFootage: unit.squareFootage,
          bedroomCount: bdrCount ? parseInt(String(bdrCount), 10) : null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

      await tx.unit.createMany({
        data: unitsToCreate,
        skipDuplicates: true,
      });
    });

    return NextResponse.json({ message: 'Units finalized successfully' });
  } catch (error) {
    console.error('Error finalizing unit creation:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred during unit finalization.' },
      { status: 500 }
    );
  }
} 