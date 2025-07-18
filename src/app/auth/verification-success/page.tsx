import Link from 'next/link';

export default function VerificationSuccessPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 text-center">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-md">
        <h1 className="text-3xl font-bold text-green-600">Verification Successful!</h1>
        <p className="mt-4 text-lg text-gray-700">
          Your email address has been successfully verified.
        </p>
        <p className="mt-2 text-gray-600">
          You can now sign in to your account.
        </p>
        <div className="mt-8">
          <Link
            href="/auth/signin"
            className="w-full inline-flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-brand-blue hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-accent"
          >
            Go to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
} 