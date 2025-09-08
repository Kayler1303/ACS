import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

interface IncomeDiscrepancy {
  unitNumber: string | number;
  residentName: string;
  verifiedIncome: number;
  newRentRollIncome: number;
  discrepancy: number;
  discrepancyPercentage: number;
  existingLeaseId: string;
  newLeaseId: string;
  existingResidentId: string;
  newResidentId: string;
  propertyName?: string;
  propertyAddress?: string;
  leaseStartDate?: string;
  leaseEndDate?: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id: propertyId } = await params;
  const url = new URL(req.url);
  const rentRollId = url.searchParams.get('rentRollId');

  if (!propertyId) {
    return NextResponse.json({ error: 'Property ID is required' }, { status: 400 });
  }

  if (!rentRollId) {
    return NextResponse.json({ error: 'Rent roll ID is required' }, { status: 400 });
  }

  try {
    const discrepancies: IncomeDiscrepancy[] = [];
    
    // Get the property information for the report
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { name: true, address: true }
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }
    
    // Get the rent roll data
    const rentRoll = await prisma.rentRoll.findUnique({
      where: { 
        id: rentRollId,
        propertyId: propertyId
      },
      include: {
        Tenancy: {
          include: {
            Lease: {
              include: {
                Resident: true,
                Unit: true
              }
            }
          }
        }
      }
    });

    if (!rentRoll) {
      return NextResponse.json({ error: 'Rent roll not found' }, { status: 404 });
    }

    // For each new tenancy, check if there are existing leases with verified income
    for (const tenancy of rentRoll.Tenancy) {
      const unit = tenancy.Lease.Unit;
      const newResidents = tenancy.Lease.Resident;
      
      // Get the most recent CURRENT lease for this unit that has verified income (not the new lease)
      const existingLeases = await prisma.lease.findMany({
        where: {
          unitId: unit.id,
          id: { not: tenancy.Lease.id }, // Exclude the new lease
          Tenancy: { isNot: null }, // Only current leases (with Tenancy), not future leases
          Resident: {
            some: {
              AND: [
                { incomeFinalized: true },
                { calculatedAnnualizedIncome: { not: null } }
              ]
            }
          }
        },
        include: {
          Resident: {
            where: {
              AND: [
                { incomeFinalized: true },
                { calculatedAnnualizedIncome: { not: null } }
              ]
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 1
      });
      
      // First, check for discrepancies within the current lease itself (after inheritance)
      for (const currentResident of newResidents) {
        if (currentResident.incomeFinalized && currentResident.calculatedAnnualizedIncome) {
          const verifiedIncome = Number(currentResident.calculatedAnnualizedIncome || 0);
          const rentRollIncome = Number(currentResident.annualizedIncome || 0);
          const discrepancy = Math.abs(verifiedIncome - rentRollIncome);
          const discrepancyPercentage = rentRollIncome > 0 ? (discrepancy / rentRollIncome) * 100 : 0;
          
          if (discrepancy > 1.00) {
            discrepancies.push({
              unitNumber: unit.unitNumber,
              residentName: currentResident.name,
              verifiedIncome: verifiedIncome,
              newRentRollIncome: rentRollIncome,
              discrepancy: discrepancy,
              discrepancyPercentage: discrepancyPercentage,
              existingLeaseId: tenancy.Lease.id,
              newLeaseId: tenancy.Lease.id,
              existingResidentId: currentResident.id,
              newResidentId: currentResident.id,
              propertyName: property.name,
              propertyAddress: property.address || '',
              leaseStartDate: tenancy.Lease.leaseStartDate?.toISOString().split('T')[0] || '',
              leaseEndDate: tenancy.Lease.leaseEndDate?.toISOString().split('T')[0] || ''
            });
          }
        }
      }
      
      // Then, check for income discrepancies between new and verified residents from previous leases
      for (const existingLease of existingLeases) {
        for (const existingResident of existingLease.Resident) {
          // Find matching resident by name in new lease
          const matchingNewResident = newResidents.find(
            newRes => newRes.name.toLowerCase().trim() === existingResident.name.toLowerCase().trim()
          );

          if (matchingNewResident) {
            // Skip if the resident already has verified income in the current lease
            if (matchingNewResident.incomeFinalized && matchingNewResident.calculatedAnnualizedIncome) {
              continue;
            }
            
            const verifiedIncome = Number(existingResident.calculatedAnnualizedIncome || 0);
            const newRentRollIncome = Number(matchingNewResident.annualizedIncome || 0);
            const discrepancy = Math.abs(verifiedIncome - newRentRollIncome);
            const discrepancyPercentage = newRentRollIncome > 0 ? (discrepancy / newRentRollIncome) * 100 : 0;
            
            // If discrepancy is greater than $1, flag it
            if (discrepancy > 1.00) {
              discrepancies.push({
                unitNumber: unit.unitNumber,
                residentName: existingResident.name,
                verifiedIncome: verifiedIncome,
                newRentRollIncome: newRentRollIncome,
                discrepancy: discrepancy,
                discrepancyPercentage: discrepancyPercentage,
                existingLeaseId: existingLease.id,
                newLeaseId: tenancy.Lease.id,
                existingResidentId: existingResident.id,
                newResidentId: matchingNewResident.id,
                propertyName: property.name,
                propertyAddress: property.address || '',
                leaseStartDate: tenancy.Lease.leaseStartDate?.toISOString().split('T')[0] || '',
                leaseEndDate: tenancy.Lease.leaseEndDate?.toISOString().split('T')[0] || ''
              });
            }
          }
        }
      }
    }

    // Generate CSV content
    const csvHeaders = [
      'Property Name',
      'Property Address', 
      'Unit Number',
      'Resident Name',
      'Verified Income',
      'Rent Roll Income',
      'Discrepancy Amount',
      'Discrepancy Percentage',
      'Lease Start Date',
      'Lease End Date',
      'Generated Date'
    ];

    const csvRows = discrepancies.map(discrepancy => [
      `"${discrepancy.propertyName || ''}"`,
      `"${discrepancy.propertyAddress || ''}"`,
      `"${discrepancy.unitNumber}"`,
      `"${discrepancy.residentName}"`,
      `"$${discrepancy.verifiedIncome.toFixed(2)}"`,
      `"$${discrepancy.newRentRollIncome.toFixed(2)}"`,
      `"$${discrepancy.discrepancy.toFixed(2)}"`,
      `"${discrepancy.discrepancyPercentage.toFixed(2)}%"`,
      `"${discrepancy.leaseStartDate}"`,
      `"${discrepancy.leaseEndDate}"`,
      `"${new Date().toISOString().split('T')[0]}"`
    ]);

    // Create CSV content
    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.join(','))
    ].join('\n');

    // Generate filename with property name and date
    const sanitizedPropertyName = property.name.replace(/[^a-zA-Z0-9]/g, '_');
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `Income_Discrepancies_${sanitizedPropertyName}_${dateStr}.csv`;

    // Return CSV file
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache'
      }
    });

  } catch (error: unknown) {
    console.error('Income discrepancies CSV export error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to export income discrepancies', details: errorMessage }, { status: 500 });
  }
}
