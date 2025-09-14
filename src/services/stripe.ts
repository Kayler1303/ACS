import Stripe from 'stripe';

// Initialize Stripe with secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

export { stripe };

// Pricing constants based on requirements
export const PRICING = {
  FULL_SERVICE_SETUP: 10.00, // $10 per unit
  SELF_SERVICE_SETUP: 2.00,  // $2 per unit
  MONTHLY_FEE: 20.00,        // $20 per unit per year (billed monthly = $1.67 per unit per month)
} as const;

/**
 * Create a Stripe customer for a user
 */
export async function createStripeCustomer(email: string, name?: string, company?: string) {
  try {
    const customer = await stripe.customers.create({
      email,
      name: name || undefined,
      metadata: {
        company: company || '',
      },
    });
    return customer;
  } catch (error) {
    console.error('Error creating Stripe customer:', error);
    throw new Error('Failed to create customer');
  }
}

/**
 * Create a payment intent for setup fees
 */
export async function createSetupFeePaymentIntent(
  customerId: string,
  amount: number,
  propertyId: string,
  setupType: 'FULL_SERVICE' | 'SELF_SERVICE'
) {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      customer: customerId,
      metadata: {
        propertyId,
        setupType,
        type: 'setup_fee',
      },
      description: `${setupType === 'FULL_SERVICE' ? 'Full Service' : 'Self Service'} Setup Fee`,
    });
    return paymentIntent;
  } catch (error) {
    console.error('Error creating setup fee payment intent:', error);
    throw new Error('Failed to create payment intent');
  }
}

/**
 * Create a subscription for monthly billing
 */
export async function createMonthlySubscription(
  customerId: string,
  pricePerUnit: number,
  units: number,
  propertyId: string
) {
  try {
    // Create a price for this specific property (since unit count varies)
    const price = await stripe.prices.create({
      unit_amount: Math.round((pricePerUnit / 12) * 100), // Monthly amount in cents
      currency: 'usd',
      recurring: {
        interval: 'month',
      },
      product_data: {
        name: `Property Subscription - ${units} units`,
        metadata: {
          propertyId,
          units: units.toString(),
        },
      },
    });

    // Create the subscription
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [
        {
          price: price.id,
          quantity: units,
        },
      ],
      metadata: {
        propertyId,
        units: units.toString(),
      },
      collection_method: 'charge_automatically',
      expand: ['latest_invoice.payment_intent'],
    });

    return subscription;
  } catch (error) {
    console.error('Error creating monthly subscription:', error);
    throw new Error('Failed to create subscription');
  }
}

/**
 * Cancel a subscription
 */
export async function cancelSubscription(subscriptionId: string) {
  try {
    const subscription = await stripe.subscriptions.cancel(subscriptionId);
    return subscription;
  } catch (error) {
    console.error('Error canceling subscription:', error);
    throw new Error('Failed to cancel subscription');
  }
}

/**
 * Retrieve a payment intent
 */
export async function retrievePaymentIntent(paymentIntentId: string) {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return paymentIntent;
  } catch (error) {
    console.error('Error retrieving payment intent:', error);
    throw new Error('Failed to retrieve payment intent');
  }
}

/**
 * Retrieve a subscription
 */
export async function retrieveSubscription(subscriptionId: string) {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return subscription;
  } catch (error) {
    console.error('Error retrieving subscription:', error);
    throw new Error('Failed to retrieve subscription');
  }
}

/**
 * Calculate total setup fee based on setup type and unit count
 */
export function calculateSetupFee(setupType: 'FULL_SERVICE' | 'SELF_SERVICE', units: number): number {
  const pricePerUnit = setupType === 'FULL_SERVICE' ? PRICING.FULL_SERVICE_SETUP : PRICING.SELF_SERVICE_SETUP;
  return pricePerUnit * units;
}

/**
 * Calculate monthly fee based on unit count
 */
export function calculateMonthlyFee(units: number): number {
  return (PRICING.MONTHLY_FEE * units) / 12; // Monthly amount
}

/**
 * Update customer's default payment method
 */
export async function updateCustomerPaymentMethod(customerId: string, paymentMethodId: string) {
  try {
    // Attach the payment method to the customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    // Set as default payment method
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    return { success: true };
  } catch (error) {
    console.error('Error updating customer payment method:', error);
    throw new Error('Failed to update payment method');
  }
}

/**
 * Retry payment for a past due subscription
 */
export async function retrySubscriptionPayment(subscriptionId: string) {
  try {
    // Get the subscription
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    // Get the latest invoice
    if (subscription.latest_invoice) {
      const invoice = await stripe.invoices.retrieve(subscription.latest_invoice as string);
      
      if (invoice.status === 'open') {
        // Attempt to pay the invoice
        const paidInvoice = await stripe.invoices.pay(invoice.id);
        return paidInvoice;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error retrying subscription payment:', error);
    throw new Error('Failed to retry payment');
  }
}

/**
 * Get outstanding invoices for a customer
 */
export async function getOutstandingInvoices(customerId: string) {
  try {
    const invoices = await stripe.invoices.list({
      customer: customerId,
      status: 'open',
      limit: 10,
    });
    return invoices.data;
  } catch (error) {
    console.error('Error fetching outstanding invoices:', error);
    throw new Error('Failed to fetch invoices');
  }
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(payload: string, signature: string): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
  
  try {
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    return event;
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    throw new Error('Invalid webhook signature');
  }
}
