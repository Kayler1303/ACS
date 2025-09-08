import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

interface IncomeDiscrepancy {
  unitNumber: string | number;
  residentName: string;
  verifiedIncome: number;
  rentRollIncome: number;
  discrepancy: number;
  discrepancyPercentage: number;
  propertyName: string;
  propertyAddress: string;
  leaseStartDate: string;
  leaseEndDate: string;
  rentRollName: string;
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

  if (!propertyId) {
    return NextResponse.json({ error: 'Property ID is required' }, { status: 400 });
  }

  try {
    const discrepancies: IncomeDiscrepancy[] = [];
    
    // Get the property information
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { name: true, address: true }
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }
    
    // Get all rent rolls for this property
    const rentRolls = await prisma.rentRoll.findMany({
      where: { propertyId: propertyId },
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
      },
      orderBy: { uploadDate: 'desc' }
    });

    // Process each rent roll to find discrepancies
    for (const rentRoll of rentRolls) {
      for (const tenancy of rentRoll.Tenancy) {
        const unit = tenancy.Lease.Unit;
        const residents = tenancy.Lease.Resident;
        
        // Check for discrepancies within each lease
        for (const resident of residents) {
          if (resident.incomeFinalized && resident.calculatedAnnualizedIncome && resident.annualizedIncome) {
            const verifiedIncome = Number(resident.calculatedAnnualizedIncome || 0);
            const rentRollIncome = Number(resident.annualizedIncome || 0);
            const discrepancy = Math.abs(verifiedIncome - rentRollIncome);
            const discrepancyPercentage = rentRollIncome > 0 ? (discrepancy / rentRollIncome) * 100 : 0;
            
            // Only include discrepancies greater than $1
            if (discrepancy > 1.00) {
              discrepancies.push({
                unitNumber: unit.unitNumber,
                residentName: resident.name,
                verifiedIncome: verifiedIncome,
                rentRollIncome: rentRollIncome,
                discrepancy: discrepancy,
                discrepancyPercentage: discrepancyPercentage,
                propertyName: property.name,
                propertyAddress: property.address || '',
                leaseStartDate: tenancy.Lease.leaseStartDate?.toISOString().split('T')[0] || '',
                leaseEndDate: tenancy.Lease.leaseEndDate?.toISOString().split('T')[0] || '',
                rentRollName: rentRoll.filename || `Rent Roll ${rentRoll.uploadDate.toISOString().split('T')[0]}`
              });
            }
          }
        }
      }
    }

    // If no discrepancies found, return a message
    if (discrepancies.length === 0) {
      return NextResponse.json({ 
        message: 'No income discrepancies found for this property',
        count: 0 
      });
    }

    // Generate CSV content
    const csvHeaders = [
      'Property Name',
      'Property Address', 
      'Rent Roll',
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
      `"${discrepancy.propertyName}"`,
      `"${discrepancy.propertyAddress}"`,
      `"${discrepancy.rentRollName}"`,
      `"${discrepancy.unitNumber}"`,
      `"${discrepancy.residentName}"`,
      `"$${discrepancy.verifiedIncome.toFixed(2)}"`,
      `"$${discrepancy.rentRollIncome.toFixed(2)}"`,
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
    const filename = `All_Income_Discrepancies_${sanitizedPropertyName}_${dateStr}.csv`;

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
    console.error('Property income discrepancies CSV export error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to export income discrepancies', details: errorMessage }, { status: 500 });
  }
}
