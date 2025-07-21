import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { IndividualResidentData } from '@/types/compliance';


interface Unit {
  id: string;
  unitNumber: string | number;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // Workaround for Next.js 15 params bug
  const propertyId = req.nextUrl.pathname.split('/')[3];
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  if (!propertyId) {
    return NextResponse.json({ error: 'Property ID is required' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { rentRollDate, data } = body;

    if (!rentRollDate || !data || !Array.isArray(data)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    
    const property = await prisma.property.findFirst({
        where: { id: propertyId, ownerId: session.user.id },
        include: { units: true }
    });

    if (!property) {
        return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }
    
    const unitMap = new Map(property.units.map((u: Unit) => [parseInt(String(u.unitNumber), 10), u.id]));

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const newRentRoll = await tx.rentRoll.create({
        data: {
          propertyId: propertyId,
          date: new Date(rentRollDate),
        },
      });

      // Group data by unit to optimize database operations
      const unitGroups = new Map<string, IndividualResidentData[]>();
      const notFoundUnits: string[] = [];

      for (const row of data as IndividualResidentData[]) {
        const unitNumber = parseInt(String(row.unit), 10);
        const unitId = unitMap.get(unitNumber);

        if (!unitId) {
          notFoundUnits.push(String(row.unit));
          continue;
        }

        if (!unitGroups.has(unitId)) {
          unitGroups.set(unitId, []);
        }
        unitGroups.get(unitId)!.push(row);
      }
      
      if (notFoundUnits.length > 0) {
        // Use a Set to get unique unit numbers
        const uniqueNotFound = [...new Set(notFoundUnits)];
        throw new Error(`The following units could not be found: ${uniqueNotFound.join(', ')}. Please correct the data or update the master unit list.`);
      }

      // Prepare bulk data for batch inserts
      const tenanciesData: any[] = [];
      const residentsData: any[] = [];
      
      for (const [unitId, rows] of unitGroups.entries()) {
        // Get rent amount from first row (all rows for same unit should have same rent)
        const rentValue = parseFloat(String(rows[0].rent || '0').replace(/[^0-9.-]+/g,""));
        const { leaseStartDate, leaseEndDate } = rows[0];

        if (!leaseStartDate || !leaseEndDate) {
          throw new Error(`Lease start and end dates are required for unit ${rows[0].unit}.`);
        }
        
        // Create tenancy data
        const timestamp = Date.now().toString();
        const tenancyId = `tenancy_${timestamp}_${unitId}`;
        tenanciesData.push({
          id: tenancyId,
          rentRollId: newRentRoll.id,
          unitId: unitId,
          leaseRent: rentValue,
          leaseStartDate: new Date(leaseStartDate),
          leaseEndDate: new Date(leaseEndDate),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        
        // Create residents data for this tenancy
        for (const row of rows) {
          const timestamp = Date.now().toString();
          const randomSuffix = Math.random().toString(36).substr(2, 9);
          
          residentsData.push({
            id: `resident_${timestamp}_${randomSuffix}`,
            tenancyId: tenancyId,
            name: row.resident,
            annualizedIncome: Number(row.totalIncome) || 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }

      // Perform batch inserts
      if (tenanciesData.length > 0) {
        await tx.tenancy.createMany({
          data: tenanciesData
        });
      }
      
      if (residentsData.length > 0) {
        await tx.resident.createMany({
          data: residentsData
        });
      }
      
      return { rentRollId: newRentRoll.id };
    }, {
      timeout: 30000, // Increase timeout to 30 seconds
    });

    return NextResponse.json({
        message: 'Compliance data updated successfully.',
        rentRollId: result.rentRollId,
    });

  } catch (error: any) {
    console.error('Finalize error:', error);
    if (error.message.includes('The following units could not be found') || error.message.includes('Lease start and end dates are required')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
} 