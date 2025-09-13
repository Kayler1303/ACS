import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/permissions';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id:string }> }
) {
  const session = await getServerSession(authOptions);
  const { id: propertyId } = await params;

  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if user has edit permission for this property (deleting units requires edit)
  const canEdit = await requirePermission(propertyId, session.user.id, 'edit');
  if (!canEdit) {
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