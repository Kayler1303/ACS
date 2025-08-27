import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const { id: unitId } = await params;

  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { unitNumber, squareFootage, bedroomCount } = body;

  // Basic validation
  if (!unitNumber && !squareFootage && !bedroomCount) {
    return NextResponse.json(
      { error: 'At least one field must be provided to update.' },
      { status: 400 }
    );
  }

  try {
    // Verify the user owns the property associated with the unit
    const unit = await prisma.unit.findUnique({
      where: { id: unitId },
      select: { Property: { select: { ownerId: true } } },
    });

    if (!unit) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    }

    if (unit.Property.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updatedUnit = await prisma.unit.update({
      where: { id: unitId },
      data: {
        ...(unitNumber && { unitNumber: String(unitNumber) }),
        ...(squareFootage && { squareFootage: parseInt(String(squareFootage).replace(/,/g, ''), 10) }),
        ...(bedroomCount && { bedroomCount: parseInt(String(bedroomCount), 10) }),
      },
    });

    return NextResponse.json(updatedUnit, { status: 200 });
  } catch (error) {
    console.error('Error updating unit:', error);
    return NextResponse.json(
      { error: 'An error occurred while updating the unit.' },
      { status: 500 }
    );
  }
} 