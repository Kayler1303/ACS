import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { 
  createStripeCustomer, 
  createSetupFeePaymentIntent, 
  createMonthlySubscription,
  calculateSetupFee,
  calculateMonthlyFee 
} from '@/services/stripe';

// GET /api/properties/[id]/payment - Get payment status for a property
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

    // Verify user owns or has access to this property
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        OR: [
          { ownerId: session.user.id },
          {
            PropertyShare: {
              some: { userId: session.user.id }
            }
          }
        ]
      },
      include: {
        PropertySubscription: {
          include: {
            adminGrant: true,
            transactions: {
              orderBy: { createdAt: 'desc' },
              take: 10
            }
          }
        }
      }
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    return NextResponse.json({
      property: {
        id: property.id,
        name: property.name,
        numberOfUnits: property.numberOfUnits,
      },
      subscription: property.PropertySubscription,
      hasAdminGrant: !!property.PropertySubscription?.adminGrant?.isActive,
    });

  } catch (error) {
    console.error('Error fetching payment status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment status' },
      { status: 500 }
    );
  }
}

// POST /api/properties/[id]/payment - Set up payment for a property
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
    const { setupType }: { setupType: 'FULL_SERVICE' | 'SELF_SERVICE' } = await request.json();

    if (!setupType || !['FULL_SERVICE', 'SELF_SERVICE'].includes(setupType)) {
      return NextResponse.json({ error: 'Invalid setup type' }, { status: 400 });
    }

    // Verify user owns this property
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        ownerId: session.user.id
      },
      include: {
        User: true,
        PropertySubscription: true
      }
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found or access denied' }, { status: 404 });
    }

    if (!property.numberOfUnits) {
      return NextResponse.json({ error: 'Property must have unit count specified' }, { status: 400 });
    }

    // Check if payment is already set up
    if (property.PropertySubscription?.setupFeePaid) {
      return NextResponse.json({ error: 'Payment already set up for this property' }, { status: 400 });
    }

    // Create or get Stripe customer
    let stripeCustomerId = property.PropertySubscription?.stripeCustomerId;
    
    if (!stripeCustomerId) {
      const customer = await createStripeCustomer(
        property.User.email,
        property.User.name || undefined,
        property.User.company
      );
      stripeCustomerId = customer.id;
    }

    // Calculate fees
    const setupFee = calculateSetupFee(setupType, property.numberOfUnits);
    const monthlyFee = calculateMonthlyFee(property.numberOfUnits);
    const firstMonthFee = Math.round(monthlyFee / 12 * 100) / 100; // Monthly fee (annual fee / 12)
    const totalFirstPayment = setupFee + firstMonthFee;

    // Create setup fee payment intent (now includes first month)
    const paymentIntent = await createSetupFeePaymentIntent(
      stripeCustomerId,
      totalFirstPayment,
      propertyId,
      setupType
    );

    // Create or update property subscription
    const subscription = await prisma.propertySubscription.upsert({
      where: { propertyId },
      update: {
        setupType,
        setupFeeAmount: setupFee,
        monthlyFeeAmount: monthlyFee,
        stripeCustomerId,
      },
      create: {
        propertyId,
        setupType,
        setupFeeAmount: setupFee,
        monthlyFeeAmount: monthlyFee,
        stripeCustomerId,
      },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      setupFee,
      monthlyFee,
      setupType,
      subscriptionId: subscription.id,
    });

  } catch (error) {
    console.error('Error setting up payment:', error);
    return NextResponse.json(
      { error: 'Failed to set up payment' },
      { status: 500 }
    );
  }
}

// PUT /api/properties/[id]/payment - Complete payment setup (after successful setup fee)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: propertyId } = await params;

    // Verify user owns this property and setup fee is paid
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        ownerId: session.user.id
      },
      include: {
        PropertySubscription: true
      }
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found or access denied' }, { status: 404 });
    }

    const subscription = property.PropertySubscription;
    if (!subscription?.setupFeePaid) {
      return NextResponse.json({ error: 'Setup fee must be paid first' }, { status: 400 });
    }

    if (subscription.stripeSubscriptionId) {
      return NextResponse.json({ error: 'Monthly subscription already set up' }, { status: 400 });
    }

    // Create monthly subscription
    const stripeSubscription = await createMonthlySubscription(
      subscription.stripeCustomerId!,
      20.00, // $20 per unit per year
      property.numberOfUnits!,
      propertyId
    );

    // Update property subscription with Stripe subscription ID
    await prisma.propertySubscription.update({
      where: { id: subscription.id },
      data: {
        stripeSubscriptionId: stripeSubscription.id,
        subscriptionStatus: 'ACTIVE',
        currentPeriodStart: new Date((stripeSubscription as any).current_period_start * 1000),
        currentPeriodEnd: new Date((stripeSubscription as any).current_period_end * 1000),
      },
    });

    return NextResponse.json({
      success: true,
      subscriptionId: stripeSubscription.id,
    });

  } catch (error) {
    console.error('Error completing payment setup:', error);
    return NextResponse.json(
      { error: 'Failed to complete payment setup' },
      { status: 500 }
    );
  }
}
