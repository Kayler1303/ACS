
import UnitListUploadForm from '@/components/UnitListUploadForm';

interface UploadUnitsPageProps {
  params: {
    id: string;
  };
}

export default async function UploadUnitsPage({ params }: UploadUnitsPageProps) {
  const { id: propertyId } = params;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold mb-2 text-center text-brand-blue">
          Upload Master Unit List
        </h1>
        <p className="text-lg text-gray-600 mb-8 text-center">
          This is a one-time setup to create the static list of units for your property.
        </p>
        <div className="bg-white p-8 rounded-lg shadow-md">
          <UnitListUploadForm propertyId={propertyId} />
        </div>
      </div>
    </div>
  );
} 