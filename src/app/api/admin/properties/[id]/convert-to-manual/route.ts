import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/services/stripe';

// POST /api/admin/properties/[id]/convert-to-manual - Convert property to manual payment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id: propertyId } = await params;
    const { notes } = await request.json();

    // Verify property exists and get subscription
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        PropertySubscription: true
      }
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    const subscription = property.PropertySubscription;
    if (!subscription) {
      return NextResponse.json({ error: 'No subscription found for this property' }, { status: 404 });
    }

    if (subscription.isManualPayment) {
      return NextResponse.json({ error: 'Property is already set to manual payment' }, { status: 400 });
    }

    // Cancel Stripe subscription if it exists
    if (subscription.stripeSubscriptionId && stripe) {
      try {
        await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
        console.log(`Canceled Stripe subscription: ${subscription.stripeSubscriptionId}`);
      } catch (stripeError) {
        console.error('Error canceling Stripe subscription:', stripeError);
        // Continue with conversion even if Stripe cancellation fails
      }
    }

    // Update subscription to manual payment
    await (prisma as any).propertySubscription.update({
      where: { id: subscription.id },
      data: {
        isManualPayment: true,
        manualPaymentNotes: notes || 'Converted to manual payment by admin',
        subscriptionStatus: subscription.setupFeePaid ? 'ACTIVE' : 'INACTIVE',
        // Keep existing Stripe IDs for reference but mark as manual
        updatedAt: new Date(),
      },
    });

    // Create a transaction record for the conversion
    await (prisma as any).paymentTransaction.create({
      data: {
        propertySubscriptionId: subscription.id,
        amount: 0,
        transactionType: 'MANUAL_PAYMENT',
        status: 'SUCCEEDED',
        description: 'Converted to manual payment processing',
        metadata: {
          convertedBy: session.user.id,
          convertedAt: new Date().toISOString(),
          notes: notes || 'Converted to manual payment by admin',
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Property converted to manual payment successfully',
    });

  } catch (error) {
    console.error('Error converting to manual payment:', error);
    return NextResponse.json(
      { error: 'Failed to convert to manual payment' },
      { status: 500 }
    );
  }
}
