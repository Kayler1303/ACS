import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ leaseId: string; residentId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leaseId, residentId } = await params;
    const { verifiedIncome } = await request.json();

    // Verify that the user owns this property through the lease
    const lease = await prisma.lease.findUnique({
      where: { id: leaseId },
      include: {
        Unit: {
          include: {
            Property: true
          }
        },
        Resident: true
      }
    });

    if (!lease || lease.Unit?.Property?.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify that the resident belongs to this lease
    const resident = lease.Resident.find(r => r.id === residentId);
    if (!resident) {
      return NextResponse.json({ error: 'Resident not found in this lease' }, { status: 404 });
    }

    // Update the specific resident's annualizedIncome to match the verified income
    // This ensures that future rent roll uploads will match
    await prisma.resident.update({
      where: { id: residentId },
      data: {
        annualizedIncome: verifiedIncome,
        verifiedIncome: verifiedIncome
      }
    });

    console.log(`[ACCEPT VERIFIED INCOME] Updated resident ${residentId} in lease ${leaseId} - annualizedIncome set to: $${verifiedIncome}`);

    return NextResponse.json({ 
      message: 'Individual resident verified income accepted successfully',
      residentId: residentId,
      updatedIncome: verifiedIncome
    }, { status: 200 });
  } catch (error) {
    console.error('Error accepting individual resident verified income:', error);
    return NextResponse.json({ error: 'Failed to accept verified income.' }, { status: 500 });
  }
} 