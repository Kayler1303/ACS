import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/services/stripe';
import { prisma } from '@/lib/prisma';
import Stripe from 'stripe';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }

    // Verify the webhook signature
    const event = verifyWebhookSignature(body, signature);

    // Handle the event
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 400 }
    );
  }
}

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const propertyId = paymentIntent.metadata.propertyId;
  const setupType = paymentIntent.metadata.setupType;
  const discrepancyId = paymentIntent.metadata.discrepancyId;
  const paymentType = paymentIntent.metadata.type;

  // Handle unit discrepancy payment
  if (paymentType === 'unit_discrepancy' && discrepancyId) {
    try {
      const { resolveUnitCountDiscrepancy } = await import('@/lib/unit-count-verification');
      await resolveUnitCountDiscrepancy(
        discrepancyId,
        'system', // System resolved via payment
        `Unit discrepancy resolved via Stripe payment. Payment Intent: ${paymentIntent.id}`
      );

      console.log(`Unit discrepancy payment succeeded for property ${propertyId}, discrepancy ${discrepancyId}`);
      return;
    } catch (error) {
      console.error('Error handling unit discrepancy payment:', error);
      return;
    }
  }

  if (!propertyId) {
    console.error('No propertyId in payment intent metadata');
    return;
  }

  try {
    // Update the property subscription
    await prisma.propertySubscription.upsert({
      where: { propertyId },
      update: {
        setupFeePaid: true,
        setupFeeTransactionId: paymentIntent.id,
        setupType: setupType as 'FULL_SERVICE' | 'SELF_SERVICE',
      },
      create: {
        propertyId,
        setupFeePaid: true,
        setupFeeTransactionId: paymentIntent.id,
        setupType: setupType as 'FULL_SERVICE' | 'SELF_SERVICE',
        setupFeeAmount: paymentIntent.amount / 100, // Convert from cents
      },
    });

    // Create transaction record
    await prisma.paymentTransaction.create({
      data: {
        propertySubscriptionId: (await prisma.propertySubscription.findUnique({
          where: { propertyId },
          select: { id: true }
        }))!.id,
        stripePaymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount / 100,
        transactionType: 'SETUP_FEE',
        status: 'SUCCEEDED',
        description: `${setupType === 'FULL_SERVICE' ? 'Full Service' : 'Self Service'} Setup Fee`,
      },
    });

    console.log(`Setup fee payment succeeded for property ${propertyId}`);
  } catch (error) {
    console.error('Error handling payment intent succeeded:', error);
  }
}

async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  const propertyId = paymentIntent.metadata.propertyId;

  if (!propertyId) {
    console.error('No propertyId in payment intent metadata');
    return;
  }

  try {
    const subscription = await prisma.propertySubscription.findUnique({
      where: { propertyId }
    });

    if (subscription) {
      // Create failed transaction record
      await prisma.paymentTransaction.create({
        data: {
          propertySubscriptionId: subscription.id,
          stripePaymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount / 100,
          transactionType: 'SETUP_FEE',
          status: 'FAILED',
          description: 'Setup fee payment failed',
        },
      });
    }

    console.log(`Setup fee payment failed for property ${propertyId}`);
  } catch (error) {
    console.error('Error handling payment intent failed:', error);
  }
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = (invoice as any).subscription as string;
  
  if (!subscriptionId) {
    return;
  }

  try {
    // Update subscription status to active
    await prisma.propertySubscription.updateMany({
      where: { stripeSubscriptionId: subscriptionId },
      data: {
        subscriptionStatus: 'ACTIVE',
        currentPeriodStart: new Date(invoice.period_start * 1000),
        currentPeriodEnd: new Date(invoice.period_end * 1000),
      },
    });

    // Create transaction record
    const subscription = await prisma.propertySubscription.findFirst({
      where: { stripeSubscriptionId: subscriptionId }
    });

    if (subscription) {
      await prisma.paymentTransaction.create({
        data: {
          propertySubscriptionId: subscription.id,
          amount: invoice.amount_paid / 100,
          transactionType: 'MONTHLY_SUBSCRIPTION',
          status: 'SUCCEEDED',
          description: 'Monthly subscription payment',
        },
      });
    }

    console.log(`Monthly payment succeeded for subscription ${subscriptionId}`);
  } catch (error) {
    console.error('Error handling invoice payment succeeded:', error);
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = (invoice as any).subscription as string;
  
  if (!subscriptionId) {
    return;
  }

  try {
    // Update subscription status to past due
    await prisma.propertySubscription.updateMany({
      where: { stripeSubscriptionId: subscriptionId },
      data: {
        subscriptionStatus: 'PAST_DUE',
      },
    });

    // Create failed transaction record
    const subscription = await prisma.propertySubscription.findFirst({
      where: { stripeSubscriptionId: subscriptionId }
    });

    if (subscription) {
      await prisma.paymentTransaction.create({
        data: {
          propertySubscriptionId: subscription.id,
          amount: invoice.amount_due / 100,
          transactionType: 'MONTHLY_SUBSCRIPTION',
          status: 'FAILED',
          description: 'Monthly subscription payment failed',
        },
      });
    }

    console.log(`Monthly payment failed for subscription ${subscriptionId}`);
  } catch (error) {
    console.error('Error handling invoice payment failed:', error);
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  try {
    let status: 'INACTIVE' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'UNPAID';
    
    switch (subscription.status) {
      case 'active':
        status = 'ACTIVE';
        break;
      case 'past_due':
        status = 'PAST_DUE';
        break;
      case 'canceled':
        status = 'CANCELED';
        break;
      case 'unpaid':
        status = 'UNPAID';
        break;
      default:
        status = 'INACTIVE';
    }

    await prisma.propertySubscription.updateMany({
      where: { stripeSubscriptionId: subscription.id },
      data: {
        subscriptionStatus: status,
        currentPeriodStart: new Date((subscription as any).current_period_start * 1000),
        currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
      },
    });

    console.log(`Subscription updated: ${subscription.id} -> ${status}`);
  } catch (error) {
    console.error('Error handling subscription updated:', error);
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  try {
    await prisma.propertySubscription.updateMany({
      where: { stripeSubscriptionId: subscription.id },
      data: {
        subscriptionStatus: 'CANCELED',
      },
    });

    console.log(`Subscription deleted: ${subscription.id}`);
  } catch (error) {
    console.error('Error handling subscription deleted:', error);
  }
}
