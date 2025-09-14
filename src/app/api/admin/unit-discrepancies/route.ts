import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/admin/unit-discrepancies - Get all unit count discrepancies
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const discrepancies = await (prisma as any).unitCountDiscrepancy.findMany({
      include: {
        property: {
          select: {
            name: true,
            numberOfUnits: true,
            PropertySubscription: {
              select: {
                setupType: true,
                setupFeePaid: true
              }
            }
          }
        },
        rentRoll: {
          select: {
            filename: true,
            uploadDate: true
          }
        },
        resolvedBy: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: [
        { status: 'asc' }, // PENDING first
        { discoveredAt: 'desc' }
      ]
    });

    return NextResponse.json({ discrepancies });

  } catch (error) {
    console.error('Error fetching all unit discrepancies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch unit discrepancies' },
      { status: 500 }
    );
  }
}
