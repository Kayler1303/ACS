import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createPaymentIntent } from '@/services/stripe';

// GET /api/properties/[id]/unit-discrepancy-payment - Get unit discrepancy payment info
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: propertyId } = await params;

    // Verify user owns this property
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        ownerId: session.user.id
      },
      include: {
        UnitCountDiscrepancy: {
          where: { status: 'PENDING' },
          orderBy: { discoveredAt: 'desc' },
          take: 1
        },
        PropertySubscription: {
          select: {
            stripeCustomerId: true
          }
        }
      }
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found or access denied' }, { status: 404 });
    }

    const discrepancy = property.UnitCountDiscrepancy[0];
    if (!discrepancy) {
      return NextResponse.json({ error: 'No pending unit count discrepancy found' }, { status: 404 });
    }

    return NextResponse.json({
      discrepancy: {
        id: discrepancy.id,
        declaredUnitCount: discrepancy.declaredUnitCount,
        actualUnitCount: discrepancy.actualUnitCount,
        paymentDifference: Number(discrepancy.paymentDifference),
        setupType: discrepancy.setupType,
        discoveredAt: discrepancy.discoveredAt
      },
      property: {
        id: property.id,
        name: property.name,
        stripeCustomerId: property.PropertySubscription?.stripeCustomerId
      }
    });

  } catch (error) {
    console.error('Error fetching unit discrepancy payment info:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment information' },
      { status: 500 }
    );
  }
}

// POST /api/properties/[id]/unit-discrepancy-payment - Create payment intent for unit discrepancy
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: propertyId } = await params;

    // Verify user owns this property and get discrepancy info
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        ownerId: session.user.id
      },
      include: {
        UnitCountDiscrepancy: {
          where: { status: 'PENDING' },
          orderBy: { discoveredAt: 'desc' },
          take: 1
        },
        PropertySubscription: true,
        User: true
      }
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found or access denied' }, { status: 404 });
    }

    const discrepancy = property.UnitCountDiscrepancy[0];
    if (!discrepancy) {
      return NextResponse.json({ error: 'No pending unit count discrepancy found' }, { status: 404 });
    }

    const subscription = property.PropertySubscription;
    if (!subscription?.stripeCustomerId) {
      return NextResponse.json({ error: 'No payment method on file' }, { status: 400 });
    }

    // Create payment intent for the discrepancy amount
    const paymentIntent = await createPaymentIntent(
      subscription.stripeCustomerId,
      Number(discrepancy.paymentDifference),
      `Unit count discrepancy payment for ${property.name}`,
      {
        propertyId,
        discrepancyId: discrepancy.id,
        type: 'unit_discrepancy'
      }
    );

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: Number(discrepancy.paymentDifference)
    });

  } catch (error) {
    console.error('Error creating unit discrepancy payment:', error);
    return NextResponse.json(
      { error: 'Failed to create payment' },
      { status: 500 }
    );
  }
}
