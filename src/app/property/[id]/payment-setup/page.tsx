'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

// Initialize Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

// Helper functions
function calculateSetupFee(setupType: 'FULL_SERVICE' | 'SELF_SERVICE', numberOfUnits: number): number {
  const feePerUnit = setupType === 'FULL_SERVICE' ? 10 : 2;
  return feePerUnit * numberOfUnits;
}

function calculateMonthlyFee(numberOfUnits: number): number {
  return Math.round(numberOfUnits * 20 / 12 * 100) / 100; // $20/unit/year = $1.67/unit/month
}

function calculateFirstMonthFee(numberOfUnits: number): number {
  return calculateMonthlyFee(numberOfUnits);
}

function calculateTotalFirstPayment(setupType: 'FULL_SERVICE' | 'SELF_SERVICE', numberOfUnits: number): number {
  const setupFee = calculateSetupFee(setupType, numberOfUnits);
  const firstMonthFee = calculateFirstMonthFee(numberOfUnits);
  
  // Full Service: Setup fee only (billing starts after setup)
  // Self Service: Setup fee + first month (billing starts immediately)
  return setupType === 'FULL_SERVICE' ? setupFee : setupFee + firstMonthFee;
}

interface Property {
  id: string;
  name: string;
  numberOfUnits: number;
}

function PaymentSetupForm() {
  const params = useParams();
  const router = useRouter();
  const propertyId = params.id as string;

  const [property, setProperty] = useState<Property | null>(null);
  const [selectedSetupType, setSelectedSetupType] = useState<'FULL_SERVICE' | 'SELF_SERVICE' | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);

  const stripe = useStripe();
  const elements = useElements();

  useEffect(() => {
    fetchPaymentData();
  }, [propertyId]);

  const fetchPaymentData = async () => {
    try {
      const response = await fetch('/api/properties/' + propertyId + '/payment');
      if (!response.ok) {
        throw new Error('Failed to fetch payment data');
      }
      const data = await response.json();
      setProperty(data.property);

      // If already set up or has admin grant, redirect to property page
      if (data.subscription?.setupFeePaid || data.hasAdminGrant) {
        router.push('/property/' + propertyId);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payment data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetupTypeSelection = async (setupType: 'FULL_SERVICE' | 'SELF_SERVICE') => {
    setSelectedSetupType(setupType);
    setIsLoading(true);

    try {
      const response = await fetch('/api/properties/' + propertyId + '/payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          setupType,
          numberOfUnits: property?.numberOfUnits,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create payment intent');
      }

      const data = await response.json();
      setClientSecret(data.clientSecret);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to setup payment');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!stripe || !elements || !clientSecret || !selectedSetupType) {
      return;
    }

    setIsProcessing(true);

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
        const response = await fetch('/api/properties/' + propertyId + '/payment', {
          method: 'PUT',
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('Payment setup completion failed:', {
            status: response.status,
            statusText: response.statusText,
            errorData
          });
          throw new Error(errorData.details || errorData.error || 'Failed to complete payment setup');
        }

        setSetupComplete(true);
        setTimeout(() => {
          router.push('/property/' + propertyId + '/upload-units');
        }, 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to complete setup');
      }
    }

    setIsProcessing(false);
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
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-gray-600">Property not found</p>
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
              Your payment has been processed successfully. You'll be redirected to upload your units.
            </p>
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600 mx-auto"></div>
          </div>
        </div>
      </div>
    );
  }

  const monthlyFee = calculateMonthlyFee(property.numberOfUnits);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-blue mb-2">Pricing for {property.name}</h1>
          <p className="text-gray-600">Transparent pricing for your {property.numberOfUnits}-unit property</p>
        </div>

        {!clientSecret ? (
          <>
            {/* Pricing Overview Section - Show all options before selection */}
            {!selectedSetupType && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-8 mb-8">
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-brand-blue mb-2">Your Pricing Structure</h2>
                  <p className="text-gray-600">Simple, transparent pricing with no hidden fees</p>
                </div>
                
                <div className="grid md:grid-cols-2 gap-6">
                  {/* One-time Setup Fee */}
                  <div className="bg-white rounded-lg p-6 border border-blue-100">
                    <div className="text-center">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <svg className="w-6 h-6 text-brand-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">One-Time Setup Fee</h3>
                      <p className="text-sm text-gray-600 mb-3 text-center">Choose one option below:</p>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center p-2 bg-blue-50 rounded">
                          <span className="text-sm font-medium text-gray-700">Full Service Option:</span>
                          <span className="font-bold text-lg text-brand-blue">${calculateSetupFee('FULL_SERVICE', property.numberOfUnits).toLocaleString()}</span>
                        </div>
                        <div className="text-center text-xs text-gray-500 py-1">OR</div>
                        <div className="flex justify-between items-center p-2 bg-green-50 rounded">
                          <span className="text-sm font-medium text-gray-700">Self Service Option:</span>
                          <span className="font-bold text-lg text-green-600">${calculateSetupFee('SELF_SERVICE', property.numberOfUnits).toLocaleString()}</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-2 text-center">You'll choose your preferred option below</p>
                    </div>
                  </div>

                  {/* Ongoing Monthly Fee */}
                  <div className="bg-white rounded-lg p-6 border border-blue-100">
                    <div className="text-center">
                      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Monthly Subscription</h3>
                      <div className="text-3xl font-bold text-green-600 mb-1">
                        ${monthlyFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <p className="text-sm text-gray-600">per month</p>
                      <p className="text-xs text-gray-500 mt-2">
                        ${(monthlyFee * 12).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} annually • Same for both options
                      </p>
                    </div>
                  </div>
                </div>

                {/* Total Cost Preview */}
                <div className="mt-8 bg-white rounded-lg p-6 border border-blue-100">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">Your Total First Year Cost</h3>
                  <div className="flex flex-col md:flex-row gap-6 items-center">
                    <div className="flex-1 text-center p-4 bg-blue-50 rounded-lg">
                      <div className="text-sm text-gray-600">Full Service Option</div>
                      <div className="text-xl font-bold text-brand-blue">
                        ${(calculateSetupFee('FULL_SERVICE', property.numberOfUnits) + (monthlyFee * 12)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs text-gray-500">Setup + 12 months</div>
                    </div>
                    
                    <div className="text-center">
                      <div className="bg-gray-200 rounded-full px-3 py-1 text-sm font-medium text-gray-600">OR</div>
                    </div>
                    
                    <div className="flex-1 text-center p-4 bg-green-50 rounded-lg">
                      <div className="text-sm text-gray-600">Self Service Option</div>
                      <div className="text-xl font-bold text-green-600">
                        ${(calculateSetupFee('SELF_SERVICE', property.numberOfUnits) + (monthlyFee * 12)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs text-gray-500">Setup + 12 months</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Choose Your Setup Option */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-center mb-6">Choose Your Setup Option</h2>
              
              <div className="flex flex-col md:flex-row gap-6 items-center">
                {/* Full Service Option */}
                <div
                  className={'flex-1 border-2 rounded-lg p-6 cursor-pointer transition-all ' + 
                    (selectedSetupType === 'FULL_SERVICE'
                      ? 'border-brand-blue bg-blue-50 ring-2 ring-brand-blue ring-opacity-20'
                      : 'border-gray-200 hover:border-brand-blue hover:bg-blue-50')}
                  onClick={() => handleSetupTypeSelection('FULL_SERVICE')}
                >
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-brand-blue rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-brand-blue">Full Service Setup</h3>
                      <div className="text-lg font-bold text-brand-blue">${calculateSetupFee('FULL_SERVICE', property.numberOfUnits).toLocaleString()} one-time</div>
                    </div>
                  </div>
                  
                  <div className="mt-4 space-y-3">
                    <div className="flex items-start space-x-2">
                      <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span><strong>We handle everything</strong> - Complete setup and configuration</span>
                    </div>
                    <div className="flex items-start space-x-2">
                      <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span><strong>Priority support</strong> - Dedicated assistance throughout setup</span>
                    </div>
                    <div className="flex items-start space-x-2">
                      <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span><strong>Faster deployment</strong> - Ready to use in 1-2 business days</span>
                    </div>
                    <div className="flex items-start space-x-2">
                      <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span><strong>Quality assurance</strong> - Professional review and validation</span>
                    </div>
                  </div>
                </div>

                {/* OR Divider */}
                <div className="text-center">
                  <div className="bg-gray-200 rounded-full px-4 py-2 text-sm font-medium text-gray-600">OR</div>
                </div>

                {/* Self Service Option */}
                <div
                  className={'flex-1 border-2 rounded-lg p-6 cursor-pointer transition-all ' + 
                    (selectedSetupType === 'SELF_SERVICE'
                      ? 'border-brand-blue bg-blue-50 ring-2 ring-brand-blue ring-opacity-20'
                      : 'border-gray-200 hover:border-brand-blue hover:bg-blue-50')}
                  onClick={() => handleSetupTypeSelection('SELF_SERVICE')}
                >
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-brand-blue">Self Service Setup</h3>
                      <div className="text-lg font-bold text-green-600">${calculateSetupFee('SELF_SERVICE', property.numberOfUnits).toLocaleString()} one-time</div>
                    </div>
                  </div>
                  
                  <div className="mt-4 space-y-3">
                    <div className="flex items-start space-x-2">
                      <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span><strong>Lower upfront cost</strong> - Save ${(calculateSetupFee('FULL_SERVICE', property.numberOfUnits) - calculateSetupFee('SELF_SERVICE', property.numberOfUnits)).toLocaleString()} on setup</span>
                    </div>
                    <div className="flex items-start space-x-2">
                      <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span><strong>Full control</strong> - Configure at your own pace</span>
                    </div>
                    <div className="flex items-start space-x-2">
                      <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span><strong>Guided process</strong> - Step-by-step instructions and support</span>
                    </div>
                    <div className="flex items-start space-x-2">
                      <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span><strong>Same great features</strong> - All compliance tools included</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Selected Plan Summary */}
            {selectedSetupType && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-8 mb-8">
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-brand-blue mb-2">Selected Plan Summary</h2>
                  <p className="text-gray-600">{selectedSetupType === 'FULL_SERVICE' ? 'Full Service Setup' : 'Self Service Setup'}</p>
                </div>
                
                <div className="grid md:grid-cols-3 gap-6">
                  <div className="bg-white rounded-lg p-6 border border-blue-100">
                    <div className="text-center">
                      <div className="text-sm text-gray-600">Setup Fee</div>
                      <div className="font-bold text-xl text-brand-blue">
                        ${calculateSetupFee(selectedSetupType, property.numberOfUnits).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-6 border border-blue-100">
                    <div className="text-center">
                      <div className="text-sm text-gray-600">First Month Fee</div>
                      <div className="font-bold text-xl text-green-600">
                        ${calculateFirstMonthFee(property.numberOfUnits).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs text-gray-500">
                        {selectedSetupType === 'SELF_SERVICE' ? 'Included in first payment' : 'Not included in first payment'}
                      </div>
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-6 border border-blue-100">
                    <div className="text-center">
                      <div className="text-sm text-gray-600">Total First Payment</div>
                      <div className="font-bold text-3xl text-red-600">
                        ${calculateTotalFirstPayment(selectedSetupType, property.numberOfUnits).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs text-gray-500">
                        {selectedSetupType === 'FULL_SERVICE' ? 'Setup fee only' : 'Setup fee + first month'}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="mt-6 text-center bg-white rounded-lg p-4 border border-blue-100">
                  <div className="text-sm text-gray-600">Total First Year Cost</div>
                  <div className="font-bold text-2xl text-gray-900">
                    ${(calculateSetupFee(selectedSetupType, property.numberOfUnits) + (monthlyFee * 12)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-gray-500">Setup fee + 12 months subscription</div>
                </div>
              </div>
            )}

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
                  href={"mailto:contact@apartmentcompliance.com?subject=Payment Setup Help - Property: " + encodeURIComponent(property.name) + "&body=Hi, I need help deciding between Full Service and Self Service setup for my property '" + encodeURIComponent(property.name) + "' with " + property.numberOfUnits + " units. Please contact me to discuss the best option."}
                  className="inline-flex items-center px-6 py-3 bg-brand-blue text-white font-semibold rounded-lg hover:bg-brand-blue-dark transition-colors"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Contact Us
                </a>
              </div>
            </div>
          </>
        ) : (
          /* Payment Form */
          <div className="max-w-2xl mx-auto">
            <div className="bg-white border rounded-lg p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Payment Summary</h2>
              <div className="space-y-2 mb-4">
                <div className="flex justify-between">
                  <span>Setup Fee:</span>
                  <span className="font-semibold">${calculateSetupFee(selectedSetupType!, property.numberOfUnits).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                {selectedSetupType === 'SELF_SERVICE' && (
                  <div className="flex justify-between">
                    <span>First Month:</span>
                    <span className="font-semibold">${calculateFirstMonthFee(property.numberOfUnits).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="border-t pt-2">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total Due Today:</span>
                    <span>${calculateTotalFirstPayment(selectedSetupType!, property.numberOfUnits).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600 mt-2">
                    <span>Monthly Fee (ongoing):</span>
                    <span>${monthlyFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/month</span>
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={handlePaymentSubmit} className="bg-white border rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Payment Information</h2>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Card Details
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

              <button
                type="submit"
                disabled={!stripe || isProcessing}
                className="w-full bg-brand-blue text-white py-3 px-4 rounded-lg font-semibold hover:bg-brand-blue-dark disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? 'Processing...' : 'Pay $' + calculateTotalFirstPayment(selectedSetupType!, property.numberOfUnits).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </button>
            </form>
          </div>
        )}

        {error && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Payment Error</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{error}</p>
                </div>
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className="bg-red-50 text-red-800 rounded-md p-2 inline-flex items-center text-sm font-medium hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 text-center text-sm text-gray-600">
          <p>Monthly billing will begin after setup is complete.</p>
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
