import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import IncomeDocumentUploadForm from '@/components/IncomeDocumentUploadForm';

type ResidentPageProps = {
  params: {
    id: string;
  };
};

export default async function ResidentPage({ params }: ResidentPageProps) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect(`/api/auth/signin?callbackUrl=/resident/${params.id}`);
  }

  const resident = await prisma.resident.findUnique({
    where: { id: params.id },
    include: {
      tenancy: {
        include: {
          unit: {
            include: {
              property: true,
            },
          },
        },
      },
    },
  });

  // Security check: Ensure the logged-in user owns the property this resident belongs to
  if (!resident || resident.tenancy.unit.property.ownerId !== session.user.id) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-4xl font-bold mb-4">Resident Not Found</h1>
        <p>
          Either this resident does not exist or you do not have permission to
          view it.
        </p>
        <Link href="/dashboard" className="text-indigo-600 hover:underline mt-4 inline-block">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-2">{resident.name}</h1>
      <p className="text-lg text-gray-600 mb-8">
        Unit {resident.tenancy.unit.unitNumber} at {resident.tenancy.unit.property.name}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
          <h2 className="text-2xl font-semibold mb-4">Income Details</h2>
          <div className="bg-white p-6 rounded-lg shadow-md mb-8">
            <p>Annualized Income: {resident.annualizedIncome?.toString() || 'Not yet calculated.'}</p>
            {/* More details will go here */}
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-semibold mb-4">Upload Income Documents</h2>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <IncomeDocumentUploadForm residentId={resident.id} />
          </div>
        </div>
      </div>
    </div>
  );
} 