import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: propertyId } = await params;
    const { searchParams } = new URL(request.url);
    const rentRollId = searchParams.get('rentRollId');

    console.log(`[SNAPSHOT DATA API] Property: ${propertyId}, RentRoll: ${rentRollId || 'latest'}`);

    // Verify property ownership
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { ownerId: true }
    });

    if (!property || property.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Property not found or access denied' }, { status: 404 });
    }

    // Get the target rent roll (specific or latest)
    let targetRentRoll;
    if (rentRollId) {
      targetRentRoll = await prisma.rentRoll.findUnique({
        where: { id: rentRollId, propertyId }
      });
    } else {
      targetRentRoll = await prisma.rentRoll.findFirst({
        where: { propertyId },
        orderBy: { uploadDate: 'desc' }
      });
    }

    if (!targetRentRoll) {
      return NextResponse.json({ error: 'Rent roll not found' }, { status: 404 });
    }

    console.log(`[SNAPSHOT DATA API] Using rent roll date: ${targetRentRoll.uploadDate}`);

    // Get all units for the property
    const units = await prisma.unit.findMany({
      where: { propertyId },
      orderBy: { unitNumber: 'asc' }
    });

    // Get tenancies for the specific rent roll (these are "current" leases)
    const tenancies = await prisma.tenancy.findMany({
      where: { rentRollId: targetRentRoll.id },
      include: {
        Lease: {
          include: {
            Resident: true,
            Unit: true
          }
        }
      }
    });

    // Get all leases that existed at the time of this rent roll
    // A lease "existed" if it was created before or during this rent roll upload
    const allLeases = await prisma.lease.findMany({
      where: {
        Unit: { propertyId },
        createdAt: { lte: targetRentRoll.uploadDate }
      },
      include: {
        Resident: true,
        Unit: true,
        Tenancy: {
          where: { rentRollId: targetRentRoll.id }
        }
      }
    });

    // Process units to determine their status in this snapshot
    const processedUnits = units.map(unit => {
      // Find current lease (has tenancy in this rent roll)
      const currentTenancy = tenancies.find(t => t.Lease.unitId === unit.id);
      const currentLease = currentTenancy?.Lease;

      // Find future leases (exist but no tenancy in this rent roll, start after rent roll date)
      const futureLeases = allLeases.filter(lease => 
        lease.unitId === unit.id && 
        !lease.Tenancy && // No tenancy in this rent roll
        lease.leaseStartDate && 
        new Date(lease.leaseStartDate) > targetRentRoll.uploadDate
      );

      return {
        id: unit.id,
        unitNumber: unit.unitNumber,
        bedroomCount: unit.bedroomCount,
        squareFootage: unit.squareFootage,
        currentLease: currentLease ? {
          id: currentLease.id,
          name: currentLease.name,
          leaseStartDate: currentLease.leaseStartDate,
          leaseEndDate: currentLease.leaseEndDate,
          leaseRent: currentLease.leaseRent,
          residents: currentLease.Resident || []
        } : null,
        futureLeases: futureLeases.map(lease => ({
          id: lease.id,
          name: lease.name,
          leaseStartDate: lease.leaseStartDate,
          leaseEndDate: lease.leaseEndDate,
          leaseRent: lease.leaseRent,
          residents: lease.Resident || []
        })),
        status: currentLease ? 'current' : (futureLeases.length > 0 ? 'future' : 'vacant')
      };
    });

    return NextResponse.json({
      rentRoll: {
        id: targetRentRoll.id,
        uploadDate: targetRentRoll.uploadDate
      },
      units: processedUnits
    });

  } catch (error) {
    console.error('Error fetching snapshot data:', error);
    return NextResponse.json({ 
      error: 'Internal Server Error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
