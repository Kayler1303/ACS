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
    
    // Full Service: Setup fee only (we set it up, billing starts after setup)
    // Self Service: Setup fee + first month (they set it up, billing starts immediately)
    const totalFirstPayment = setupType === 'FULL_SERVICE' ? setupFee : setupFee + firstMonthFee;

    // Debug logging
    console.log(`[PAYMENT DEBUG] Property ${propertyId} - ${setupType}:`, {
      numberOfUnits: property.numberOfUnits,
      setupFee,
      monthlyFee,
      firstMonthFee,
      totalFirstPayment
    });

    // Create setup fee payment intent
    const paymentIntent = await createSetupFeePaymentIntent(
      stripeCustomerId,
      totalFirstPayment,
      propertyId,
      setupType
    );
    
    console.log('💳 [POST DEBUG] Created payment intent:', {
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      propertyId,
      setupType
    });

    // Create or update property subscription
    const subscription = await prisma.propertySubscription.upsert({
      where: { propertyId },
      update: {
        setupType,
        setupFeeAmount: setupFee,
        monthlyFeeAmount: monthlyFee,
        stripeCustomerId,
        setupFeeTransactionId: paymentIntent.id, // Store the payment intent ID
      },
      create: {
        propertyId,
        setupType,
        setupFeeAmount: setupFee,
        monthlyFeeAmount: monthlyFee,
        stripeCustomerId,
        setupFeeTransactionId: paymentIntent.id, // Store the payment intent ID
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
  const { id: propertyId } = await params;
  
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    
    console.log('🔍 [PUT DEBUG] Checking setup fee payment status:', {
      propertyId,
      subscriptionId: subscription?.id,
      setupFeePaid: subscription?.setupFeePaid,
      setupFeeTransactionId: subscription?.setupFeeTransactionId
    });
    
    if (!subscription?.setupFeePaid) {
      console.log('⚠️ [PUT DEBUG] Setup fee not marked as paid in DB');
      
      // If setup fee isn't marked as paid in DB, check if there's a successful payment intent
      if (subscription?.setupFeeTransactionId) {
        console.log('🔍 [PUT DEBUG] Found transaction ID, checking Stripe status:', subscription.setupFeeTransactionId);
        try {
          const { retrievePaymentIntent, ensureStripe } = await import('@/services/stripe');
          const paymentIntent = await retrievePaymentIntent(subscription.setupFeeTransactionId);
          if (paymentIntent?.status !== 'succeeded') {
            return NextResponse.json({ error: 'Setup fee payment not completed' }, { status: 400 });
          }
          
          // Payment succeeded but webhook hasn't updated DB yet - update it now
          await prisma.propertySubscription.update({
            where: { id: subscription.id },
            data: { setupFeePaid: true }
          });
          
          console.log('✅ [PUT DEBUG] Setup fee payment verified, proceeding with subscription creation');
        } catch (error) {
          console.error('❌ [PUT DEBUG] Error checking payment intent status:', error);
          return NextResponse.json({ error: 'Setup fee must be paid first' }, { status: 400 });
        }
      } else {
        console.log('❌ [PUT DEBUG] No transaction ID found - setup fee not paid');
        return NextResponse.json({ error: 'Setup fee must be paid first' }, { status: 400 });
      }
    }

    if (subscription.stripeSubscriptionId) {
      return NextResponse.json({ error: 'Monthly subscription already set up' }, { status: 400 });
    }

    // For Self Service, create subscription immediately
    // For Full Service, we'll create the subscription later when setup is complete
    let stripeSubscription: any = null;
    
    if (subscription.setupType === 'SELF_SERVICE') {
      console.log('📅 [PUT DEBUG] Creating monthly subscription for Self Service:', {
        customerId: subscription.stripeCustomerId,
        units: property.numberOfUnits,
        propertyId
      });
      
      // Create monthly subscription immediately for Self Service
      try {
        // Get the payment method from the successful payment intent and attach it to customer
        let paymentMethodId: string | undefined;
        if (subscription.setupFeeTransactionId) {
          const { retrievePaymentIntent, ensureStripe } = await import('@/services/stripe');
          const paymentIntent = await retrievePaymentIntent(subscription.setupFeeTransactionId);
          paymentMethodId = paymentIntent?.payment_method as string;
          
          console.log('💳 [PUT DEBUG] Retrieved payment method from setup payment:', {
            paymentMethodId,
            customerId: subscription.stripeCustomerId
          });
          
          // Attach the payment method to the customer if not already attached
          if (paymentMethodId && subscription.stripeCustomerId) {
            try {
              const stripe = ensureStripe();
              
              // Check if payment method is already attached to this customer
              const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
              console.log('🔍 [PUT DEBUG] Payment method current status:', {
                id: paymentMethod.id,
                customer: paymentMethod.customer,
                targetCustomer: subscription.stripeCustomerId
              });
              
              if (paymentMethod.customer !== subscription.stripeCustomerId) {
                console.log('🔗 [PUT DEBUG] Attaching payment method to customer...');
                await stripe.paymentMethods.attach(paymentMethodId, {
                  customer: subscription.stripeCustomerId,
                });
                console.log('✅ [PUT DEBUG] Payment method attached successfully');
              } else {
                console.log('ℹ️ [PUT DEBUG] Payment method already attached to correct customer');
              }
            } catch (attachError: any) {
              console.error('❌ [PUT DEBUG] Error attaching payment method:', {
                error: attachError.message,
                type: attachError.type,
                code: attachError.code,
                paymentMethodId,
                customerId: subscription.stripeCustomerId
              });
              // Don't fail completely - let Stripe handle the error in subscription creation
            }
          }
        }
        
        stripeSubscription = await createMonthlySubscription(
          subscription.stripeCustomerId!,
          20.00, // $20 per unit per year
          property.numberOfUnits!,
          propertyId,
          paymentMethodId // Pass the payment method ID directly
        );
        console.log('✅ [PUT DEBUG] Monthly subscription created:', stripeSubscription.id);
      } catch (subscriptionError: any) {
        console.error('❌ [PUT DEBUG] Failed to create monthly subscription:', {
          error: subscriptionError.message,
          type: subscriptionError.type,
          code: subscriptionError.code,
          customerId: subscription.stripeCustomerId,
          units: property.numberOfUnits
        });
        throw subscriptionError; // Re-throw to be caught by outer try-catch
      }

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
    } else {
      // For Full Service, mark as setup complete but don't start billing yet
      await prisma.propertySubscription.update({
        where: { id: subscription.id },
        data: {
          subscriptionStatus: 'SETUP_COMPLETE',
        },
      });
    }

    return NextResponse.json({
      success: true,
      subscriptionId: stripeSubscription?.id || null,
      setupType: subscription.setupType,
    });

  } catch (error) {
    console.error('Error completing payment setup:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      propertyId
    });
    return NextResponse.json(
      { 
        error: 'Failed to complete payment setup',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
