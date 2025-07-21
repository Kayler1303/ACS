import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import IncomeDocumentUploadForm from '@/components/IncomeDocumentUploadForm';
import { format } from 'date-fns';

type IncomeDocumentForPage = {
  id: string;
  documentType: string;
  documentDate: Date;
  uploadDate: Date;
  status: string;
}

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
      incomeDocuments: {
        orderBy: {
          uploadDate: 'desc',
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
            <p className="mb-2"><strong>Declared Annualized Income:</strong> {resident.annualizedIncome?.toString() ? `$${resident.annualizedIncome.toString()}` : 'Not provided.'}</p>
            <p><strong>Verified Annualized Income:</strong> {resident.verifiedIncome?.toString() ? `$${resident.verifiedIncome.toString()}` : 'Not yet verified.'}</p>
          </div>

          <h2 className="text-2xl font-semibold mb-4">Uploaded Documents</h2>
           <div className="bg-white p-6 rounded-lg shadow-md">
            {resident.incomeDocuments.length > 0 ? (
              <ul className="space-y-3">
                {resident.incomeDocuments.map((doc: IncomeDocumentForPage) => (
                  <li key={doc.id} className="flex justify-between items-center p-2 border rounded-md">
                    <div>
                      <p className="font-semibold">{doc.documentType}</p>
                      <p className="text-sm text-gray-500">
                        Document Date: {format(doc.documentDate, 'MM/dd/yyyy')} | Uploaded: {format(doc.uploadDate, 'MM/dd/yyyy')}
                      </p>
                    </div>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      doc.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                      doc.status === 'PROCESSING' ? 'bg-yellow-100 text-yellow-800' :
                      doc.status === 'NEEDS_REVIEW' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {doc.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No documents have been uploaded for this resident yet.</p>
            )}
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