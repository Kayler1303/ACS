import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { VerificationStatus } from '@/services/verification';

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
  const exportType = url.searchParams.get('type'); // 'verification', 'compliance', or 'units'

  if (!propertyId) {
    return NextResponse.json({ error: 'Property ID is required' }, { status: 400 });
  }

  if (!exportType || !['verification', 'compliance', 'units'].includes(exportType)) {
    return NextResponse.json({ error: 'Export type must be one of: verification, compliance, units' }, { status: 400 });
  }

  try {
    // Get property information
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        RentRoll: {
          include: {
            Tenancy: {
              include: {
                Lease: {
                  include: {
                    Resident: {
                      include: {
                        IncomeDocument: true
                      }
                    },
                    Unit: true,
                    IncomeVerification: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    // Get the most recent rent roll
    const rentRoll = property.RentRoll?.[0];
    if (!rentRoll) {
      return NextResponse.json({ error: 'No rent roll found for this property' }, { status: 404 });
    }

    // Process tenancies to get unit data
    const processedTenancies = rentRoll.Tenancy.map(tenancy => {
      const unit = tenancy.Lease.Unit;
      const residents = tenancy.Lease.Resident;
      const lease = tenancy.Lease;
      
      // Calculate total income
      const totalIncome = residents.reduce((sum, resident) => {
        const income = Number(resident.calculatedAnnualizedIncome || resident.annualizedIncome || 0);
        return sum + income;
      }, 0);

      // Simplified AMI bucket calculation (you can enhance this later)
      let actualBucket = "Market Rate";
      if (totalIncome > 0 && residents.length > 0) {
        const amiPercentage = Math.round(totalIncome / (residents.length * 50000) * 100); // Simplified calculation
        if (amiPercentage <= 30) actualBucket = "30% AMI";
        else if (amiPercentage <= 50) actualBucket = "50% AMI";
        else if (amiPercentage <= 60) actualBucket = "60% AMI";
        else if (amiPercentage <= 80) actualBucket = "80% AMI";
      }
      
      // Simplified verification status calculation
      let verificationStatus: VerificationStatus = "In Progress - Finalize to Process";
      if (residents.length === 0) {
        verificationStatus = "Vacant";
      } else {
        const finalizedResidents = residents.filter(r => r.incomeFinalized);
        if (finalizedResidents.length === residents.length) {
          verificationStatus = "Verified";
        } else {
          verificationStatus = "In Progress - Finalize to Process";
        }
      }

      return {
        id: unit.id,
        unitNumber: unit.unitNumber,
        bedroomCount: unit.bedroomCount,
        squareFootage: unit.squareFootage,
        residentCount: residents.length,
        totalIncome: totalIncome,
        actualBucket: actualBucket,
        complianceBucket: actualBucket, // Simplified for export
        verificationStatus: verificationStatus,
        residents: residents.map(r => ({
          name: r.name,
          income: Number(r.calculatedAnnualizedIncome || r.annualizedIncome || 0),
          finalized: r.incomeFinalized
        }))
      };
    });

    // Generate appropriate CSV based on export type
    let csvContent = '';
    let filename = '';

    if (exportType === 'verification') {
      // Verification Status Summary Export
      const verificationCounts = {
        'Verified': 0,
        'In Progress - Finalize to Process': 0,
        'Out of Date Income Documents': 0,
        'Waiting for Admin Review': 0,
        'Vacant': 0,
        'Needs Investigation': 0
      };

      processedTenancies.forEach(unit => {
        const status = unit.verificationStatus;
        if (verificationCounts.hasOwnProperty(status)) {
          verificationCounts[status as keyof typeof verificationCounts]++;
        } else {
          verificationCounts['Needs Investigation']++;
        }
      });

      const totalUnits = processedTenancies.length;
      const csvHeaders = ['Status', 'Count', 'Percentage', 'Description'];
      const csvRows = Object.entries(verificationCounts).map(([status, count]) => [
        `"${status}"`,
        `"${count}"`,
        `"${totalUnits > 0 ? (count / totalUnits * 100).toFixed(1) : 0}%"`,
        `"${getVerificationDescription(status)}"`
      ]);

      csvContent = [csvHeaders.join(','), ...csvRows.map(row => row.join(','))].join('\n');
      filename = `Verification_Status_Summary_${property.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;

    } else if (exportType === 'compliance') {
      // Compliance Summary Export (both percentages and unit counts)
      const complianceOption = property.complianceOption || "20% at 50% AMI, 55% at 80% AMI";
      const totalUnits = processedTenancies.length;
      
      // Calculate bucket counts
      const bucketCounts: { [key: string]: number } = {};
      processedTenancies.forEach(unit => {
        const bucket = unit.actualBucket;
        bucketCounts[bucket] = (bucketCounts[bucket] || 0) + 1;
      });

      // Get target percentages and counts
      const targets = getTargetPercentages(complianceOption, totalUnits);
      const targetCounts = getTargetCounts(complianceOption, totalUnits);

      const csvHeaders = ['Bucket', 'Target %', 'Target Units', 'Occupied %', 'Occupied Units', 'Compliance %', 'Compliance Units', 'Over/Under %', 'Over/Under Units'];
      const csvRows = Object.entries(targets).map(([bucket, targetPercent]) => {
        const targetUnits = targetCounts[bucket] || 0;
        const actualUnits = bucketCounts[bucket] || 0;
        const actualPercent = totalUnits > 0 ? (actualUnits / totalUnits * 100) : 0;
        const overUnderPercent = actualPercent - targetPercent;
        const overUnderUnits = actualUnits - targetUnits;

        return [
          `"${bucket}"`,
          `"${targetPercent.toFixed(1)}%"`,
          `"${targetUnits}"`,
          `"${actualPercent.toFixed(1)}%"`,
          `"${actualUnits}"`,
          `"${actualPercent.toFixed(1)}%"`,
          `"${actualUnits}"`,
          `"${overUnderPercent >= 0 ? '+' : ''}${overUnderPercent.toFixed(1)}%"`,
          `"${overUnderUnits >= 0 ? '+' : ''}${overUnderUnits}"`
        ];
      });

      csvContent = [csvHeaders.join(','), ...csvRows.map(row => row.join(','))].join('\n');
      filename = `Compliance_Summary_${property.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;

    } else if (exportType === 'units') {
      // Unit Details Export
      const csvHeaders = ['Unit #', 'Bedrooms', 'Sq Ft', '# of Residents', 'Total Income', 'Actual Bucket', 'Compliance Bucket', 'Verification Status', 'Resident Names', 'Individual Incomes'];
      const csvRows = processedTenancies.map(unit => [
        `"${unit.unitNumber}"`,
        `"${unit.bedroomCount}"`,
        `"${unit.squareFootage || ''}"`,
        `"${unit.residentCount}"`,
        `"$${unit.totalIncome.toLocaleString()}"`,
        `"${unit.actualBucket}"`,
        `"${unit.complianceBucket}"`,
        `"${getVerificationStatusText(unit.verificationStatus)}"`,
        `"${unit.residents.map(r => r.name).join('; ')}"`,
        `"${unit.residents.map(r => `$${r.income.toLocaleString()}`).join('; ')}"`
      ]);

      csvContent = [csvHeaders.join(','), ...csvRows.map(row => row.join(','))].join('\n');
      filename = `Unit_Details_${property.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    }

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
    console.error('Property summary export error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to export property summary', details: errorMessage }, { status: 500 });
  }
}

function getVerificationDescription(status: string): string {
  switch (status) {
    case 'Verified': return 'All income documents verified and finalized';
    case 'In Progress - Finalize to Process': return 'Income documents uploaded but not finalized';
    case 'Out of Date Income Documents': return 'Income documents are older than required timeframe';
    case 'Waiting for Admin Review': return 'Documents require administrator review';
    case 'Vacant': return 'Unit is currently vacant';
    default: return 'Other verification status';
  }
}

function getVerificationStatusText(status: VerificationStatus): string {
  return status; // VerificationStatus is already a string
}

// Helper functions for compliance calculations
function getTargetPercentages(complianceOption: string, totalUnits: number): { [key: string]: number } {
  // Simplified implementation - you may need to import the actual logic
  const targets: { [key: string]: number } = {};
  
  if (complianceOption.includes("20% at 50% AMI")) {
    targets["50% AMI"] = 20;
  }
  if (complianceOption.includes("55% at 80% AMI")) {
    targets["80% AMI"] = 55;
  }
  
  return targets;
}

function getTargetCounts(complianceOption: string, totalUnits: number): { [key: string]: number } {
  const percentages = getTargetPercentages(complianceOption, totalUnits);
  const counts: { [key: string]: number } = {};
  
  Object.entries(percentages).forEach(([bucket, percent]) => {
    counts[bucket] = Math.ceil(totalUnits * percent / 100);
  });
  
  return counts;
}
