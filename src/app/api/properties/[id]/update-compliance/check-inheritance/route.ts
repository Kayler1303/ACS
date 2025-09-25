import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: propertyId } = await params;
    const { rentRollId } = await request.json();

    console.log(`[CHECK INHERITANCE] Starting future lease inheritance check for property ${propertyId}, rentRollId ${rentRollId}`);

    // Verify property ownership
    const property = await prisma.property.findFirst({
      where: { 
        id: propertyId,
        ownerId: session.user.id 
      }
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found or access denied' }, { status: 404 });
    }

    // Get the rent roll to find the upload date
    const rentRoll = await prisma.rentRoll.findUnique({
      where: { id: rentRollId },
      select: { uploadDate: true }
    });

    if (!rentRoll) {
      return NextResponse.json({ error: 'Rent roll not found' }, { status: 404 });
    }

    const rentRollDate = rentRoll.uploadDate;

    // Find existing future leases with finalized verifications
    const existingFutureLeases = await prisma.lease.findMany({
      where: {
        Unit: {
          propertyId: propertyId
        },
        leaseStartDate: {
          gt: rentRollDate // Lease starts after the rent roll date
        },
        Tenancy: null, // Future leases don't have Tenancy records
        NOT: {
          name: {
            startsWith: '[PROCESSED]' // Exclude processed leases
          }
        },
        IncomeVerification: {
          some: {
            status: 'FINALIZED' // Only consider leases with finalized verifications
          }
        }
      },
      include: {
        Unit: true,
        Resident: {
          include: {
            IncomeDocument: true
          }
        },
        IncomeVerification: {
          where: {
            status: 'FINALIZED'
          }
        }
      }
    });

    console.log(`[CHECK INHERITANCE] 🔍 Found ${existingFutureLeases.length} existing future leases with finalized verifications`);

    if (existingFutureLeases.length === 0) {
      console.log(`[CHECK INHERITANCE] No existing future leases found, no inheritance needed`);
      return NextResponse.json({
        hasFutureLeaseMatches: false,
        futureLeaseMatches: [],
        message: 'No existing future leases found'
      });
    }

    // Get new lease data from the current rent roll
    const newLeases = await prisma.lease.findMany({
      where: {
        Unit: {
          propertyId: propertyId
        },
        Tenancy: {
          rentRollId: rentRollId
        }
      },
      include: {
        Unit: true,
        Resident: true
      }
    });

    console.log(`[CHECK INHERITANCE] 🔍 New rent roll contains ${newLeases.length} leases`);

    // Group new leases by unit number for easy lookup
    const unitGroups: { [unitNumber: string]: any } = {};
    newLeases.forEach(lease => {
      const unitNumber = lease.Unit.unitNumber;
      if (!unitGroups[unitNumber]) {
        unitGroups[unitNumber] = {
          unitId: lease.Unit.id,
          unitNumber: unitNumber,
          leases: []
        };
      }
      
      unitGroups[unitNumber].leases.push({
        leaseStartDate: lease.leaseStartDate?.toISOString(),
        leaseEndDate: lease.leaseEndDate?.toISOString(),
        residents: lease.Resident.map(r => ({
          name: r.name,
          firstName: r.firstName,
          lastName: r.lastName
        }))
      });
    });

    const unitNumbers = Object.keys(unitGroups);
    console.log(`[CHECK INHERITANCE] 🔍 New rent roll contains ${unitNumbers.length} units: [${unitNumbers.slice(0, 10).join(', ')}${unitNumbers.length > 10 ? '...' : ''}]`);

    const futureLeaseMatches: any[] = [];

    // Check each existing future lease for potential matches
    for (const existingFutureLease of existingFutureLeases) {
      const unitNumber = existingFutureLease.Unit.unitNumber;
      console.log(`[CHECK INHERITANCE] 🔍 Checking existing future lease for unit ${unitNumber}: "${existingFutureLease.name}"`);

      // Check if this unit exists in the new rent roll data
      const newUnitData = unitGroups[unitNumber];
      if (!newUnitData) {
        console.log(`[CHECK INHERITANCE] ❌ Unit ${unitNumber} not found in new rent roll data`);
        continue;
      }

      // For now, assume the first lease in the new data is the one to compare
      // (This could be enhanced to handle multiple leases per unit)
      const newLeaseData = newUnitData.leases[0];
      if (!newLeaseData) {
        console.log(`[CHECK INHERITANCE] ❌ No lease data found for unit ${unitNumber} in new rent roll`);
        continue;
      }

      console.log(`[CHECK INHERITANCE] 🔍 Comparing existing future lease with new lease data for unit ${unitNumber}`);
      console.log(`[CHECK INHERITANCE] - Existing: "${existingFutureLease.name}"`);
      console.log(`[CHECK INHERITANCE] - Start: ${existingFutureLease.leaseStartDate?.toISOString() || 'null'}`);
      console.log(`[CHECK INHERITANCE] - End: ${existingFutureLease.leaseEndDate?.toISOString() || 'null'}`);
      console.log(`[CHECK INHERITANCE] - New lease dates: ${newLeaseData.leaseStartDate} to ${newLeaseData.leaseEndDate}`);

      // Compare dates and residents (simplified logic for now)
      const existingStartTime = existingFutureLease.leaseStartDate?.getTime();
      const existingEndTime = existingFutureLease.leaseEndDate?.getTime();
      const newStartTime = newLeaseData.leaseStartDate ? new Date(newLeaseData.leaseStartDate).getTime() : null;
      const newEndTime = newLeaseData.leaseEndDate ? new Date(newLeaseData.leaseEndDate).getTime() : null;

      const datesAreIdentical = existingStartTime === newStartTime && existingEndTime === newEndTime;
      
      console.log(`[CHECK INHERITANCE] - Dates identical: ${datesAreIdentical}`);
      console.log(`[CHECK INHERITANCE] - Existing residents: ${existingFutureLease.Resident.length} (${existingFutureLease.Resident.map(r => r.name).join(', ')})`);
      console.log(`[CHECK INHERITANCE] - New residents: ${(newLeaseData.residents || []).length} (${(newLeaseData.residents || []).map((r: any) => r.name).join(', ')})`);

      // For now, if dates don't match or there are different residents, add to matches
      // This is a simplified version - the full logic from finalize route can be added later
      if (!datesAreIdentical) {
        console.log(`[CHECK INHERITANCE] 🎯 Future lease differs (dates) - inheritance decision needed for unit ${unitNumber}`);
        
        const residents = existingFutureLease.Resident.map(r => ({
          id: r.id,
          name: r.name,
          verifiedIncome: r.calculatedAnnualizedIncome ? parseFloat(r.calculatedAnnualizedIncome.toString()) : 0
        }));

        futureLeaseMatches.push({
          unitNumber,
          newLeaseStartDate: newLeaseData.leaseStartDate,
          newLeaseEndDate: newLeaseData.leaseEndDate,
          existingFutureLease: {
            id: existingFutureLease.id,
            name: existingFutureLease.name,
            leaseStartDate: existingFutureLease.leaseStartDate,
            leaseEndDate: existingFutureLease.leaseEndDate,
            residents: residents
          }
        });

        console.log(`[CHECK INHERITANCE] ✅ Added inheritance match for unit ${unitNumber}`);
      } else {
        console.log(`[CHECK INHERITANCE] ✅ Future lease matches exactly - automatic inheritance for unit ${unitNumber}`);
      }
    }

    console.log(`[CHECK INHERITANCE] 🎯 FINAL RESULT:`);
    console.log(`[CHECK INHERITANCE] - Future lease matches found: ${futureLeaseMatches.length}`);
    console.log(`[CHECK INHERITANCE] - hasFutureLeaseMatches: ${futureLeaseMatches.length > 0}`);

    return NextResponse.json({
      hasFutureLeaseMatches: futureLeaseMatches.length > 0,
      futureLeaseMatches,
      existingFutureLeases: existingFutureLeases.length,
      newLeases: newLeases.length,
      processingTime: Date.now()
    });

  } catch (error) {
    console.error('[CHECK INHERITANCE] Error:', error);
    return NextResponse.json(
      { error: 'Failed to check future lease inheritance' },
      { status: 500 }
    );
  }
}
