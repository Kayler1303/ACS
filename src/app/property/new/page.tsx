import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import PropertyCreateForm from '@/components/PropertyCreateForm';

export default async function NewPropertyPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/api/auth/signin?callbackUrl=/property/new');
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-center text-brand-blue">Create a New Property</h1>
        <div className="bg-white p-8 rounded-lg shadow-md">
          <PropertyCreateForm />
        </div>
      </div>
    </div>
  );
} 