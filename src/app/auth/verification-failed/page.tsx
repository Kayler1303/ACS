'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function VerificationFailedContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  let title = "Verification Failed";
  let message = "The verification link is invalid or has expired.";
  let suggestion = "Please try signing up again or contact support if you believe this is an error.";

  if (error === 'already-used') {
    title = "Already Verified";
    message = "This verification link has already been used.";
    suggestion = "Your email is already verified! You can now sign in to your account.";
  } else if (error === 'expired') {
    title = "Link Expired";
    message = "This verification link has expired.";
    suggestion = "Please sign up again to receive a new verification email.";
  } else if (error === 'notoken') {
    title = "Invalid Link";
    message = "The verification link is missing required information.";
    suggestion = "Please use the complete link from your email or sign up again.";
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 text-center">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-md">
        <h1 className={`text-3xl font-bold ${error === 'already-used' ? 'text-green-600' : 'text-red-600'}`}>
          {title}
        </h1>
        <p className="mt-4 text-lg text-gray-700">
          {message}
        </p>
        <p className="mt-2 text-gray-600">
          {suggestion}
        </p>
        <div className="mt-8">
          <Link
            href={error === 'already-used' ? "/auth/signin" : "/auth/register"}
            className="w-full inline-flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-brand-blue hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-accent"
          >
            {error === 'already-used' ? "Go to Sign In" : "Go to Registration"}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function VerificationFailedPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VerificationFailedContent />
    </Suspense>
  );
} 