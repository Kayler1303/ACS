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
      
      
      // Check for residents who need property management system updates
      // These are residents where verified income differs from original rent roll income
      for (const currentResident of newResidents) {
        if (currentResident.incomeFinalized && currentResident.calculatedAnnualizedIncome && currentResident.originalRentRollIncome) {
          const verifiedIncome = Number(currentResident.calculatedAnnualizedIncome || 0);
          const originalRentRollIncome = Number(currentResident.originalRentRollIncome || 0);
          const discrepancy = Math.abs(verifiedIncome - originalRentRollIncome);
          const discrepancyPercentage = originalRentRollIncome > 0 ? (discrepancy / originalRentRollIncome) * 100 : 0;
          
          if (discrepancy > 1.00) {
            discrepancies.push({
              unitNumber: unit.unitNumber,
              residentName: currentResident.name,
              verifiedIncome: verifiedIncome,
              newRentRollIncome: originalRentRollIncome,
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
    }

    // Generate CSV content
    const csvHeaders = [
      'Property Name',
      'Property Address', 
      'Unit Number',
      'Resident Name',
      'Current Income in Property Management System',
      'Verified Income (Update To This Amount)',
      'Difference Amount',
      'Difference Percentage',
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
    const filename = `Property_Management_System_Updates_${sanitizedPropertyName}_${dateStr}.csv`;

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
