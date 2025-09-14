import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resolveUnitCountDiscrepancy, waiveUnitCountDiscrepancy } from '@/lib/unit-count-verification';

// GET /api/admin/properties/[id]/unit-discrepancy - Get unit count discrepancies for a property
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: propertyId } = await params;

    const discrepancies = await (prisma as any).unitCountDiscrepancy.findMany({
      where: {
        propertyId,
      },
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
      orderBy: {
        discoveredAt: 'desc'
      }
    });

    return NextResponse.json({ discrepancies });

  } catch (error) {
    console.error('Error fetching unit discrepancies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch unit discrepancies' },
      { status: 500 }
    );
  }
}

// POST /api/admin/properties/[id]/unit-discrepancy - Resolve or waive unit count discrepancy
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: propertyId } = await params;
    const { 
      discrepancyId, 
      action, 
      resolutionNotes,
      paymentIntentId 
    }: { 
      discrepancyId: string; 
      action: 'resolve' | 'waive';
      resolutionNotes?: string;
      paymentIntentId?: string;
    } = await request.json();

    if (!discrepancyId || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify the discrepancy belongs to this property
    const discrepancy = await (prisma as any).unitCountDiscrepancy.findFirst({
      where: {
        id: discrepancyId,
        propertyId,
        status: 'PENDING'
      }
    });

    if (!discrepancy) {
      return NextResponse.json({ error: 'Discrepancy not found or already resolved' }, { status: 404 });
    }

    if (action === 'resolve') {
      // If resolving, we expect payment to have been made
      await resolveUnitCountDiscrepancy(
        discrepancyId,
        session.user.id,
        resolutionNotes || `Resolved by admin. ${paymentIntentId ? `Payment ID: ${paymentIntentId}` : 'Manual payment confirmed.'}`
      );

      return NextResponse.json({
        success: true,
        message: 'Unit count discrepancy resolved successfully'
      });

    } else if (action === 'waive') {
      // Admin is waiving the discrepancy (no payment required)
      await waiveUnitCountDiscrepancy(
        discrepancyId,
        session.user.id,
        resolutionNotes || 'Waived by admin'
      );

      return NextResponse.json({
        success: true,
        message: 'Unit count discrepancy waived successfully'
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Error resolving unit discrepancy:', error);
    return NextResponse.json(
      { error: 'Failed to resolve unit discrepancy' },
      { status: 500 }
    );
  }
}
