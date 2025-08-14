import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

// Define a type for our unit with residents for easier handling
type UnitWithResidents = Prisma.UnitGetPayload<{
  include: { residents: true };
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
  { params }: { params: { id: string } }
) {
  const propertyId = params.id;
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // --- 1. Fetch all necessary data in parallel ---
  const propertyPromise = prisma.property.findFirst({
    where: { id: propertyId, ownerId: session.user.id },
    include: {
      units: {
        include: { residents: true },
      },
    },
  });

  const bedroomMappingsPromise = prisma.bedroomMapping.findMany();
  
  // We'll need the county/state from the property to fetch these
  const propertyForLocation = await prisma.property.findUnique({ where: { id: propertyId }});
  if (!propertyForLocation) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 });
  }

  const amiDataPromise = prisma.amiData.findFirst({
    where: { county: propertyForLocation.county, state: propertyForLocation.state, year: new Date().getFullYear() },
  });

  const maxRentDataPromise = prisma.maxRentData.findMany({
    where: { county: propertyForLocation.county, state: propertyForLocation.state, year: new Date().getFullYear() },
  });

  const [property, bedroomMappings, amiData, maxRentData] = await Promise.all([
    propertyPromise,
    bedroomMappingsPromise,
    amiDataPromise,
    maxRentDataPromise,
  ]);

  if (!property) {
    return NextResponse.json({ error: 'Property not found or access denied' }, { status: 404 });
  }
  if (!amiData || !maxRentData || maxRentData.length === 0) {
    return NextResponse.json({ error: 'AMI or Max Rent data not found for this property\'s county. Please upload it first.' }, { status: 400 });
  }

  // --- 2. Loop through each unit and perform calculations ---
  for (const unit of property.units) {
    // a. Calculate total household income and size
    const householdSize = unit.residents.length;
    const totalIncome = unit.residents.reduce((acc: number, resident: any) => 
      acc + (resident.annualizedIncome?.toNumber() || 0), 0);

    // b. Calculate AMI Percentage
    const ami100pct = getAmiForHousehold(amiData, householdSize);
    const amiPercentage = ami100pct > 0 ? (totalIncome / ami100pct) * 100 : 0;
    
    // c. Determine Bedroom Count
    const mapping = bedroomMappings.find(
      (m: any) => (unit.squareFootage || 0) >= m.minSqFt && (unit.squareFootage || 0) <= m.maxSqFt
    );
    const bedroomCount = mapping?.bedroomCount ?? null;

    // d. Get Max Rents
    const maxRent50 = bedroomCount !== null ? getMaxRent(maxRentData, 50, bedroomCount) : 0;
    const maxRent60 = bedroomCount !== null ? getMaxRent(maxRentData, 60, bedroomCount) : 0;
    const maxRent80 = bedroomCount !== null ? getMaxRent(maxRentData, 80, bedroomCount) : 0;

    // e. Determine Qualifications
    const qualifiesIncome50 = amiPercentage > 0 && amiPercentage <= 50;
    const qualifiesIncome60 = amiPercentage > 0 && amiPercentage <= 60;
    const qualifiesIncome80 = amiPercentage > 0 && amiPercentage <= 80;
    
    const leaseRent = unit.leaseRent?.toNumber() || 0;
    const qualifiesRentAndIncome50 = qualifiesIncome50 && leaseRent > 0 && leaseRent <= maxRent50;
    const qualifiesRentAndIncome60 = qualifiesIncome60 && leaseRent > 0 && leaseRent <= maxRent60;
    const qualifiesRentAndIncome80 = qualifiesIncome80 && leaseRent > 0 && leaseRent <= maxRent80;

    // f. Update the unit in the database
    await prisma.unit.update({
      where: { id: unit.id },
      data: {
        bedroomCount,
        amiPercentage,
        qualifiesIncome50,
        qualifiesIncome60,
        qualifiesIncome80,
        qualifiesRentAndIncome50,
        qualifiesRentAndIncome60,
        qualifiesRentAndIncome80,
      },
    });
  }

  return NextResponse.json({ message: 'Compliance calculations complete.' });
} 