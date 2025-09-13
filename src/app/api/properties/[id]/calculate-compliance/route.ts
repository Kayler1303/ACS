import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { checkPropertyAccess } from '@/lib/permissions';

// Define a type for our unit with residents for easier handling
type UnitWithResidents = Prisma.UnitGetPayload<{
  include: { Lease: { include: { Resident: true } } };
}>;

// Helper to get the 100% AMI income limit for a given household size
const getAmiForHousehold = (amiData: any, householdSize: number): number => {
  if (householdSize <= 0) return 0;
  const size = Math.min(householdSize, 8); // Cap at 8 for the lookup
  const key = `incomeLimit${size}Person100pct`;
  return amiData[key]?.toNumber() || 0;
};

// Helper to get the max rent for a given bedroom count and AMI level
const getMaxRent = (maxRentData: any[], amiLevel: number, bedroomCount: number): number => {
  const levelData = maxRentData.find(d => d.amiLevel === amiLevel);
  if (!levelData) return 0;
  
  const key = `maxRent${Math.min(bedroomCount, 5)}Bedroom`; // Cap at 5 for lookup
  if (bedroomCount === 0) return levelData.maxRentStudio?.toNumber() || 0;
  
  return levelData[key]?.toNumber() || 0;
};


export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: propertyId } = await params;
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if user has access to this property (owner or shared)
  const access = await checkPropertyAccess(propertyId, session.user.id);
  if (!access.hasAccess) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 });
  }

  // --- 1. Fetch all necessary data in parallel ---
  const propertyPromise = prisma.property.findUnique({
    where: { id: propertyId },
    include: {
      Unit: {
        include: { Lease: { include: { Resident: true } } },
      },
    },
  });

  const [property] = await Promise.all([
    propertyPromise,
  ]);

  if (!property) {
    return NextResponse.json({ error: 'Property not found or access denied' }, { status: 404 });
  }
  // TODO: Add AMI and Max Rent data validation when models are implemented

  // --- 2. Loop through each unit and perform calculations ---
  for (const unit of property.Unit) {
    // a. Calculate total household income and size
    // Get all residents from all leases in this unit
    const allResidents = unit.Lease.flatMap(lease => lease.Resident);
    const householdSize = allResidents.length;
    const totalIncome = allResidents.reduce((acc: number, resident: any) => 
      acc + (resident.annualizedIncome?.toNumber() || 0), 0);

    // b. Calculate AMI Percentage (TODO: implement when AMI data model is available)
    // const ami100pct = getAmiForHousehold(amiData, householdSize);
    // const amiPercentage = ami100pct > 0 ? (totalIncome / ami100pct) * 100 : 0;
    const amiPercentage = 0; // Placeholder
    
    // c. Use unit's bedroom count directly
    const bedroomCount = unit.bedroomCount || 0;

    // TODO: Implement rent and AMI qualification logic when data models are available

    // f. Update the unit in the database (only update existing fields)
    await prisma.unit.update({
      where: { id: unit.id },
      data: {
        bedroomCount,
        updatedAt: new Date(),
      },
    });
  }

  return NextResponse.json({ message: 'Compliance calculations complete.' });
} 