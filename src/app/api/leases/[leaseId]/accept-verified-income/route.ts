import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leaseId } = await params;
    const { verifiedIncome } = await request.json();

    // Verify that the user owns this property through the lease
    const lease = await prisma.lease.findUnique({
      where: { id: leaseId },
      include: {
        unit: {
          include: {
            property: true
          }
        },
        residents: {
          where: { incomeFinalized: true }
        }
      }
    });

    if (!lease || lease.unit?.property?.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Update all residents in the lease to have the verified income distributed among them
    // For simplicity, we'll update the first resident's income to match the total verified income
    // In a real scenario, you might want to distribute it proportionally
    const residents = lease.residents;
    if (residents.length === 0) {
      return NextResponse.json({ error: 'No finalized residents found in this lease' }, { status: 400 });
    }

    // Update the first resident's annualizedIncome to match the verified income
    // This ensures that future rent roll uploads will match
    await prisma.resident.update({
      where: { id: residents[0].id },
      data: {
        annualizedIncome: verifiedIncome
      }
    });

    // If there are multiple residents, set others to 0 to avoid double-counting
    if (residents.length > 1) {
      await prisma.resident.updateMany({
        where: {
          id: { in: residents.slice(1).map(r => r.id) }
        },
        data: {
          annualizedIncome: 0
        }
      });
    }

    console.log(`[ACCEPT VERIFIED INCOME] Updated lease ${leaseId} residents to match verified income: $${verifiedIncome}`);

    return NextResponse.json({ 
      message: 'Verified income accepted successfully',
      updatedResidents: residents.length
    }, { status: 200 });
  } catch (error) {
    console.error('Error accepting verified income:', error);
    return NextResponse.json({ error: 'Failed to accept verified income.' }, { status: 500 });
  }
} 