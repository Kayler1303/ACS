'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

// Initialize Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface Property {
  id: string;
  name: string;
  numberOfUnits: number;
}

interface PaymentRecoveryData {
  property: Property;
  subscription?: {
    id: string;
    setupFeePaid: boolean;
    setupType: string;
    subscriptionStatus: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    monthlyFeeAmount: number;
  };
  hasAdminGrant: boolean;
}

function PaymentRecoveryForm() {
  const params = useParams();
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();
  
  const propertyId = params.id as string;
  const [paymentData, setPaymentData] = useState<PaymentRecoveryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchPaymentData();
  }, [propertyId]);

  const fetchPaymentData = async () => {
    try {
      const response = await fetch(`/api/properties/${propertyId}/payment`);
      if (!response.ok) {
        throw new Error('Failed to fetch payment data');
      }
      const data = await response.json();
      setPaymentData(data);
      
      // If not past due or has admin grant, redirect to property page
      if (data.subscription?.subscriptionStatus !== 'PAST_DUE' || data.hasAdminGrant) {
        router.push(`/property/${propertyId}`);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payment data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePaymentMethod = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements || !paymentData?.subscription) {
      return;
    }

    setIsProcessing(true);
    setError(null);

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setError('Card element not found');
      setIsProcessing(false);
      return;
    }

    try {
      // Create a new payment method
      const { error: paymentMethodError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      });

      if (paymentMethodError) {
        setError(paymentMethodError.message || 'Failed to create payment method');
        setIsProcessing(false);
        return;
      }

      // Update the subscription with the new payment method
      const response = await fetch(`/api/properties/${propertyId}/payment-recovery`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentMethodId: paymentMethod.id,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update payment method');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(`/property/${propertyId}`);
      }, 2000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update payment method');
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading payment recovery...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-red-800 mb-2">Error</h2>
            <p className="text-red-600">{error}</p>
            <button
              onClick={() => router.push('/dashboard')}
              className="mt-4 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="bg-green-50 border border-green-200 rounded-lg p-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-green-800 mb-2">Payment Method Updated!</h2>
            <p className="text-green-600 mb-4">
              Your payment method has been updated successfully. Your property access will be restored shortly.
            </p>
            <p className="text-sm text-gray-600">Redirecting to property page...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!paymentData) {
    return null;
  }

  const { property, subscription } = paymentData;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-red-600 mb-2">Payment Recovery Required</h1>
          <p className="text-gray-600">Update your payment method for <strong>{property.name}</strong></p>
          <p className="text-sm text-gray-500">{property.numberOfUnits} units</p>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-8">
          <div className="flex items-center mb-4">
            <svg className="w-6 h-6 text-red-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <h3 className="text-lg font-semibold text-red-800">Access Restricted</h3>
          </div>
          <p className="text-red-700 mb-2">
            Your monthly payment of <strong>${subscription?.monthlyFeeAmount?.toFixed(2)}</strong> failed to process.
          </p>
          <p className="text-red-600 text-sm">
            Property access has been restricted until payment is updated. Please update your payment method below to restore access.
          </p>
        </div>

        <form onSubmit={handleUpdatePaymentMethod} className="bg-white border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Update Payment Method</h3>
          
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              New Payment Method
            </label>
            <div className="border rounded-lg p-3">
              <CardElement
                options={{
                  style: {
                    base: {
                      fontSize: '16px',
                      color: '#424770',
                      '::placeholder': {
                        color: '#aab7c4',
                      },
                    },
                  },
                }}
              />
            </div>
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="flex-1 bg-gray-300 text-gray-700 py-3 px-4 rounded-lg font-semibold hover:bg-gray-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!stripe || isProcessing}
              className="flex-1 bg-brand-blue text-white py-3 px-4 rounded-lg font-semibold hover:bg-brand-blue-dark disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? 'Updating...' : 'Update Payment Method'}
            </button>
          </div>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600">
          <p>Your subscription will automatically retry payment once the payment method is updated.</p>
          <p>Need help? <a href="/contact" className="text-brand-blue hover:underline">Contact Support</a></p>
        </div>
      </div>
    </div>
  );
}

export default function PaymentRecoveryPage() {
  return (
    <Elements stripe={stripePromise}>
      <PaymentRecoveryForm />
    </Elements>
  );
}
