"use client";

import { useState } from 'react';
import { useParams } from 'next/navigation';
import UnitListUploadForm from '@/components/UnitListUploadForm';
import { IndividualResidentData } from '@/types/compliance';

type BedroomCount = number | string;
type UnitNumber = string;

export default function UploadUnitsPage() {
  const params = useParams();
  const propertyId = params.id as string;

  const [step, setStep] = useState(1);
  const [unitData, setUnitData] = useState<IndividualResidentData[]>([]);

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