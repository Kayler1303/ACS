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

interface PaymentSetupData {
  property: Property;
  subscription?: {
    setupFeePaid: boolean;
    setupType: string;
    subscriptionStatus: string;
  };
  hasAdminGrant: boolean;
}

function PaymentSetupForm() {
  const params = useParams();
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();
  
  const propertyId = params.id as string;
  const [paymentData, setPaymentData] = useState<PaymentSetupData | null>(null);
  const [selectedSetupType, setSelectedSetupType] = useState<'FULL_SERVICE' | 'SELF_SERVICE'>('FULL_SERVICE');
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [setupComplete, setSetupComplete] = useState(false);

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
      
      // If already set up or has admin grant, redirect to property page
      if (data.subscription?.setupFeePaid || data.hasAdminGrant) {
        router.push(`/property/${propertyId}`);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payment data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetupTypeSelection = async () => {
    if (!paymentData) return;

    setIsProcessing(true);
    setError(null);

    try {
      const response = await fetch(`/api/properties/${propertyId}/payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          setupType: selectedSetupType,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to set up payment');
      }

      const data = await response.json();
      setClientSecret(data.clientSecret);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set up payment');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaymentSubmit = async (event: React.FormEvent) => {
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

    const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: cardElement,
      },
    });

    if (stripeError) {
      setError(stripeError.message || 'Payment failed');
      setIsProcessing(false);
    } else if (paymentIntent?.status === 'succeeded') {
      // Complete the payment setup (create monthly subscription)
      try {
        const response = await fetch(`/api/properties/${propertyId}/payment`, {
          method: 'PUT',
        });

        if (!response.ok) {
          throw new Error('Failed to complete payment setup');
        }

        setSetupComplete(true);
        setTimeout(() => {
          router.push(`/property/${propertyId}/upload-units`);
        }, 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to complete setup');
      }
    }

    setIsProcessing(false);
  };

  const calculateSetupFee = (setupType: 'FULL_SERVICE' | 'SELF_SERVICE', units: number) => {
    const pricePerUnit = setupType === 'FULL_SERVICE' ? 10 : 2;
    return pricePerUnit * units;
  };

  const calculateMonthlyFee = (units: number) => {
    return (20 * units) / 12; // $20 per unit per year, billed monthly
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading payment setup...</p>
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

  if (setupComplete) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="bg-green-50 border border-green-200 rounded-lg p-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-green-800 mb-2">Payment Setup Complete!</h2>
            <p className="text-green-600 mb-4">
              Your property subscription has been activated. You can now proceed to set up your units.
            </p>
            <p className="text-sm text-gray-600">Redirecting to unit setup...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!paymentData) {
    return null;
  }

  const { property } = paymentData;
  const setupFee = calculateSetupFee(selectedSetupType, property.numberOfUnits);
  const monthlyFee = calculateMonthlyFee(property.numberOfUnits);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-blue mb-2">Set Up Payment</h1>
          <p className="text-gray-600">Choose your setup option for <strong>{property.name}</strong></p>
          <p className="text-sm text-gray-500">{property.numberOfUnits} units</p>
        </div>

        {!clientSecret ? (
          // Setup type selection
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* Full Service Option */}
            <div
              className={`border-2 rounded-lg p-6 cursor-pointer transition-all ${
                selectedSetupType === 'FULL_SERVICE'
                  ? 'border-brand-blue bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setSelectedSetupType('FULL_SERVICE')}
            >
              <div className="flex items-center mb-4">
                <input
                  type="radio"
                  name="setupType"
                  value="FULL_SERVICE"
                  checked={selectedSetupType === 'FULL_SERVICE'}
                  onChange={() => setSelectedSetupType('FULL_SERVICE')}
                  className="mr-3"
                />
                <h3 className="text-xl font-semibold text-brand-blue">Full Service Setup</h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>One-time setup fee:</span>
                  <span className="font-semibold">${calculateSetupFee('FULL_SERVICE', property.numberOfUnits).toFixed(2)}</span>
                </div>
                <div className="text-sm text-gray-600">
                  <p>✓ Complete property setup handled for you</p>
                  <p>✓ All compliance configurations included</p>
                  <p>✓ Priority support during setup</p>
                  <p>✓ Faster time to go live</p>
                </div>
              </div>
            </div>

            {/* Self Service Option */}
            <div
              className={`border-2 rounded-lg p-6 cursor-pointer transition-all ${
                selectedSetupType === 'SELF_SERVICE'
                  ? 'border-brand-blue bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setSelectedSetupType('SELF_SERVICE')}
            >
              <div className="flex items-center mb-4">
                <input
                  type="radio"
                  name="setupType"
                  value="SELF_SERVICE"
                  checked={selectedSetupType === 'SELF_SERVICE'}
                  onChange={() => setSelectedSetupType('SELF_SERVICE')}
                  className="mr-3"
                />
                <h3 className="text-xl font-semibold text-brand-blue">Self Service Setup</h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>One-time setup fee:</span>
                  <span className="font-semibold">${calculateSetupFee('SELF_SERVICE', property.numberOfUnits).toFixed(2)}</span>
                </div>
                <div className="text-sm text-gray-600">
                  <p>⚠️ Significant time required for setup</p>
                  <p>⚠️ Setup complexity depends on unit count</p>
                  <p>⚠️ Documentation requirements vary</p>
                  <p>✓ Lower upfront cost</p>
                </div>
              </div>
            </div>
          </div>

          {/* Help Section */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-brand-blue mb-2">
                Unsure which to choose? Let us help you decide
              </h3>
              <p className="text-gray-600 mb-4">
                Our team can help you determine the best setup option based on your property size, 
                documentation availability, and timeline requirements.
              </p>
              <a
                href={`mailto:contact@apartmentcompliance.com?subject=Payment Setup Help - Property: ${encodeURIComponent(property.name)}&body=Hi, I need help deciding between Full Service and Self Service setup for my property '${encodeURIComponent(property.name)}' with ${property.numberOfUnits} units. Please contact me to discuss the best option.`}
                className="inline-flex items-center px-6 py-3 bg-brand-blue text-white font-semibold rounded-lg hover:bg-brand-blue-dark transition-colors"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Contact Us
              </a>
            </div>
          </div>
        ) : (
          // Payment form
          <div className="max-w-md mx-auto">
            <div className="bg-white border rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold mb-4">Payment Summary</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Setup Type:</span>
                  <span className="font-medium">
                    {selectedSetupType === 'FULL_SERVICE' ? 'Full Service' : 'Self Service'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>One-time Setup Fee:</span>
                  <span className="font-semibold">${setupFee.toFixed(2)}</span>
                </div>
                <hr className="my-2" />
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Monthly Fee (after setup):</span>
                  <span>${monthlyFee.toFixed(2)}/month</span>
                </div>
              </div>
            </div>

            <form onSubmit={handlePaymentSubmit} className="bg-white border rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Payment Information</h3>
              <div className="mb-4">
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
              <button
                type="submit"
                disabled={!stripe || isProcessing}
                className="w-full bg-brand-blue text-white py-3 px-4 rounded-lg font-semibold hover:bg-brand-blue-dark disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? 'Processing...' : `Pay $${setupFee.toFixed(2)}`}
              </button>
            </form>
          </div>
        )}

        {!clientSecret && (
          <div className="text-center space-y-4">
            <button
              onClick={handleSetupTypeSelection}
              disabled={isProcessing}
              className="bg-brand-blue text-white py-3 px-8 rounded-lg font-semibold hover:bg-brand-blue-dark disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? 'Setting up...' : 'Continue to Credit Card Payment'}
            </button>
            
            <div className="text-sm text-gray-600">
              <p>or</p>
            </div>
            
            <div className="bg-gray-50 border rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 mb-2">Alternative Payment Methods</h4>
              <p className="text-sm text-gray-600 mb-3">
                Prefer to pay by ACH, check, or wire transfer? Contact our team to set up alternative payment arrangements.
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                  <span>ACH Bank Transfer</span>
                </div>
                <div className="flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                  <span>Check Payment</span>
                </div>
                <div className="flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                  <span>Wire Transfer</span>
                </div>
              </div>
              <a
                href="/contact"
                className="inline-block mt-3 px-4 py-2 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
              >
                Contact Support
              </a>
            </div>
          </div>
        )}

        <div className="mt-8 text-center text-sm text-gray-600">
          <p>Monthly billing of ${monthlyFee.toFixed(2)} will begin after setup is complete.</p>
          <p>You can cancel your subscription at any time.</p>
        </div>
      </div>
    </div>
  );
}

export default function PaymentSetupPage() {
  return (
    <Elements stripe={stripePromise}>
      <PaymentSetupForm />
    </Elements>
  );
}
