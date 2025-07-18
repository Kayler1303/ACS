'use client';

import Link from 'next/link';

export default function VerificationFailedPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 text-center">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-md">
        <h1 className="text-3xl font-bold text-red-600">Verification Failed</h1>
        <p className="mt-4 text-lg text-gray-700">
          The verification link is invalid or has expired.
        </p>
        <p className="mt-2 text-gray-600">
          Please try signing up again or contact support if you believe this is an error.
        </p>
        <div className="mt-8">
          <Link
            href="/auth/register"
            className="w-full inline-flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-brand-blue hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-accent"
          >
            Go to Registration
          </Link>
        </div>
      </div>
    </div>
  );
} 