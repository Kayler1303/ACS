'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface DiscrepancyData {
  discrepancy: {
    id: string;
    declaredUnitCount: number;
    actualUnitCount: number;
    paymentDifference: number;
    setupType: string;
    discoveredAt: string;
  };
  property: {
    id: string;
    name: string;
    stripeCustomerId?: string;
  };
}

function UnitDiscrepancyPaymentForm() {
  const params = useParams();
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();
  const propertyId = params.id as string;

  const [discrepancyData, setDiscrepancyData] = useState<DiscrepancyData | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  useEffect(() => {
    fetchDiscrepancyData();
  }, [propertyId]);

  const fetchDiscrepancyData = async () => {
    try {
      const response = await fetch(`/api/properties/${propertyId}/unit-discrepancy-payment`);
      if (!response.ok) {
        throw new Error('Failed to fetch discrepancy data');
      }
      const data = await response.json();
      setDiscrepancyData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load discrepancy data');
    } finally {
      setIsLoading(false);
    }
  };

  const createPaymentIntent = async () => {
    try {
      const response = await fetch(`/api/properties/${propertyId}/unit-discrepancy-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to create payment intent');
      }

      const data = await response.json();
      setClientSecret(data.clientSecret);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create payment');
    }
  };

  const handlePayment = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements || !clientSecret) {
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

    const { error: paymentError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: cardElement,
      },
    });

    if (paymentError) {
      setError(paymentError.message || 'Payment failed');
      setIsProcessing(false);
    } else if (paymentIntent?.status === 'succeeded') {
      setPaymentSuccess(true);
      setTimeout(() => {
        router.push(`/property/${propertyId}`);
      }, 3000);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded mb-4"></div>
            <div className="h-4 bg-gray-200 rounded mb-2"></div>
            <div className="h-4 bg-gray-200 rounded mb-2"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !discrepancyData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-red-800 mb-2">Error</h2>
            <p className="text-red-700">{error}</p>
            <button
              onClick={() => router.back()}
              className="mt-4 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (paymentSuccess) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="bg-green-50 border border-green-200 rounded-lg p-8">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
              <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-green-800 mb-2">Payment Successful!</h2>
            <p className="text-green-700 mb-4">
              Your unit count discrepancy has been resolved. Property access has been restored.
            </p>
            <p className="text-sm text-gray-600">
              Redirecting you back to the property page...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!discrepancyData) {
    return null;
  }

  const { discrepancy, property } = discrepancyData;
  const unitDifference = discrepancy.actualUnitCount - discrepancy.declaredUnitCount;
  const setupTypeLabel = discrepancy.setupType === 'FULL_SERVICE' ? 'Full Service' : 'Self Service';

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Resolve Unit Count Discrepancy
          </h1>
          <p className="text-gray-600">
            Additional payment required for {property.name}
          </p>
        </div>

        {/* Discrepancy Details */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold text-yellow-800 mb-4">Discrepancy Details</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Declared Units:</span>
              <span className="font-semibold ml-2">{discrepancy.declaredUnitCount}</span>
            </div>
            <div>
              <span className="text-gray-600">Actual Units:</span>
              <span className="font-semibold ml-2">{discrepancy.actualUnitCount}</span>
            </div>
            <div>
              <span className="text-gray-600">Additional Units:</span>
              <span className="font-semibold ml-2">{unitDifference}</span>
            </div>
            <div>
              <span className="text-gray-600">Setup Type:</span>
              <span className="font-semibold ml-2">{setupTypeLabel}</span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-yellow-200">
            <div className="text-center">
              <span className="text-gray-600">Amount Due:</span>
              <span className="text-2xl font-bold text-yellow-800 ml-2">
                ${discrepancy.paymentDifference.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Payment Form */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment Information</h2>
          
          {!clientSecret ? (
            <div className="text-center">
              <button
                onClick={createPaymentIntent}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Continue to Payment
              </button>
            </div>
          ) : (
            <form onSubmit={handlePayment}>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Card Information
                </label>
                <div className="border border-gray-300 rounded-md p-3">
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

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={!stripe || isProcessing}
                className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing Payment...
                  </>
                ) : (
                  `Pay $${discrepancy.paymentDifference.toFixed(2)}`
                )}
              </button>
            </form>
          )}

          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Alternative Payment Methods</h3>
            <p className="text-sm text-gray-600 mb-2">
              If you prefer to pay by ACH, check, wire transfer, or cash, please contact our support team.
            </p>
            <a
              href="/contact"
              className="text-sm text-blue-600 hover:text-blue-700 underline"
            >
              Contact Support for Alternative Payment
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UnitDiscrepancyPaymentPage() {
  return (
    <Elements stripe={stripePromise}>
      <UnitDiscrepancyPaymentForm />
    </Elements>
  );
}
