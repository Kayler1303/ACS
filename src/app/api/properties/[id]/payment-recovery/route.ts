import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/services/stripe';

// POST /api/properties/[id]/payment-recovery - Update payment method for past due subscription
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
    const { paymentMethodId }: { paymentMethodId: string } = await request.json();

    if (!paymentMethodId) {
      return NextResponse.json({ error: 'Payment method ID is required' }, { status: 400 });
    }

    // Verify user owns this property
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
    if (!subscription) {
      return NextResponse.json({ error: 'No subscription found for this property' }, { status: 404 });
    }

    if (subscription.subscriptionStatus !== 'PAST_DUE') {
      return NextResponse.json({ error: 'Subscription is not past due' }, { status: 400 });
    }

    if (!subscription.stripeCustomerId || !subscription.stripeSubscriptionId) {
      return NextResponse.json({ error: 'Stripe subscription not found' }, { status: 400 });
    }

    if (!stripe) {
      return NextResponse.json({ error: 'Payment system not available' }, { status: 503 });
    }

    // Attach the new payment method to the customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: subscription.stripeCustomerId,
    });

    // Update the customer's default payment method
    await stripe.customers.update(subscription.stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Update the subscription's default payment method
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      default_payment_method: paymentMethodId,
    });

    // Try to pay any outstanding invoices
    const invoices = await stripe.invoices.list({
      customer: subscription.stripeCustomerId,
      subscription: subscription.stripeSubscriptionId,
      status: 'open',
      limit: 10,
    });

    // Attempt to pay the most recent open invoice
    if (invoices.data.length > 0) {
      const latestInvoice = invoices.data[0];
      if (!latestInvoice?.id) {
        throw new Error('No valid invoice found');
      }
      
      try {
        await stripe.invoices.pay(latestInvoice.id);
        
        // Update subscription status to active if payment succeeded
        await prisma.propertySubscription.update({
          where: { id: subscription.id },
          data: {
            subscriptionStatus: 'ACTIVE',
          },
        });

        // Create transaction record for the recovery payment
        await prisma.paymentTransaction.create({
          data: {
            propertySubscriptionId: subscription.id,
            amount: latestInvoice.amount_paid / 100, // Convert from cents
            transactionType: 'MONTHLY_SUBSCRIPTION',
            status: 'SUCCEEDED',
            description: 'Payment recovery - outstanding invoice paid',
          },
        });

      } catch (paymentError) {
        console.error('Failed to pay outstanding invoice:', paymentError);
        // Don't fail the entire request - the payment method was updated successfully
        // The subscription will retry automatically
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Payment method updated successfully',
    });

  } catch (error) {
    console.error('Error updating payment method:', error);
    return NextResponse.json(
      { error: 'Failed to update payment method' },
      { status: 500 }
    );
  }
}
