import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id:string } }
) {
  const session = await getServerSession(authOptions);
  const propertyId = params.id;

  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const property = await prisma.property.findUnique({
    where: {
      id: propertyId,
      ownerId: session.user.id,
    },
  });

  if (!property) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 });
  }

  try {
    // Using a transaction to ensure all or nothing is deleted.
    // Cascading deletes are set up in the schema. Deleting units and rent rolls
    // will trigger deletion of tenancies, residents, and incomes.
    await prisma.$transaction([
      prisma.rentRoll.deleteMany({ where: { propertyId: propertyId } }),
      prisma.unit.deleteMany({ where: { propertyId: propertyId } }),
    ]);

    return NextResponse.json({ message: 'Master unit list and all associated data have been successfully deleted.' });
  } catch (error) {
    console.error('Error deleting unit list:', error);
    return NextResponse.json({ error: 'Failed to delete master unit list and associated data.' }, { status: 500 });
  }
} 