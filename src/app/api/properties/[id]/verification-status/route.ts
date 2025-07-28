import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { getUnitVerificationStatus, PropertyVerificationSummary, UnitVerificationData } from '@/services/verification';
import { createAutoOverrideRequest } from '@/services/override';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id: propertyId } = await params;

  try {
    // Get the property with units, leases, residents, income documents, and rent rolls
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        ownerId: session.user.id,
      },
      include: {
        units: {
          include: {
            leases: {
              include: {
                residents: {
                  include: {
                    incomeDocuments: {
                      where: {
                        status: 'COMPLETED', // Only include completed documents for verification
                      },
                      orderBy: {
                        uploadDate: 'desc',
                      },
                    },
                  },
                },
                tenancy: {
                  include: {
                    rentRoll: true,
                  },
                },
              },
            },
          },
        },
        rentRolls: {
          orderBy: {
            date: 'desc',
          },
          take: 1, // Get the most recent rent roll
        },
      },
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found or access denied' }, { status: 404 });
    }

    if (property.rentRolls.length === 0) {
      return NextResponse.json({ error: 'No rent rolls found for this property' }, { status: 404 });
    }

    const latestRentRollDate = new Date(property.rentRolls[0].date);
    const units: UnitVerificationData[] = [];
    let summary = {
      verified: 0,
      needsInvestigation: 0,
      outOfDate: 0,
      vacant: 0,
    };

    // Process each unit
    for (const unit of property.units) {
      const verificationStatus = getUnitVerificationStatus(unit, latestRentRollDate);
      
      // Automatically create override request for "Needs Investigation" status
      if (verificationStatus === 'Needs Investigation') {
        try {
          await createAutoOverrideRequest({
            type: 'INCOME_DISCREPANCY',
            unitId: unit.id,
            userId: session.user.id,
            systemExplanation: `System detected income discrepancy for Unit ${unit.unitNumber}. Verified income does not match compliance income. Admin review required to resolve discrepancy.`
          });
        } catch (overrideError) {
          console.error('Failed to create auto-override request for income discrepancy:', overrideError);
        }
      }
      
      // Find the active lease (with tenancy)
      const activeLease = unit.leases
        .filter(l => l.tenancy !== null)
        .sort((a, b) => new Date(b.tenancy!.createdAt).getTime() - new Date(a.tenancy!.createdAt).getTime())[0];

      // Calculate total uploaded income (from compliance uploads)
      const totalUploadedIncome = activeLease 
        ? activeLease.residents.reduce((acc, r) => acc + (r.annualizedIncome || 0), 0)
        : 0;

      // Calculate total verified income
      let totalVerifiedIncome = 0;
      if (activeLease) {
        const allDocuments = activeLease.residents.flatMap(r => r.incomeDocuments);
        const verifiedDocuments = allDocuments.filter(d => d.status === 'COMPLETED');
        
        // Sum W2 income
        const w2Income = verifiedDocuments
          .filter(d => d.documentType === 'W2')
          .reduce((acc, d) => acc + (d.box1_wages || 0), 0);
        
        // Sum paystub income - take just one annualized amount since they should all be the same for a resident
        const paystubDocuments = verifiedDocuments.filter(d => d.documentType === 'PAYSTUB');
        const paystubIncome = paystubDocuments.length > 0 && paystubDocuments[0].calculatedAnnualizedIncome
          ? paystubDocuments[0].calculatedAnnualizedIncome
          : 0;
          
        // Sum other income types
        const otherIncome = verifiedDocuments
          .filter(d => d.documentType !== 'W2' && d.documentType !== 'PAYSTUB' && d.calculatedAnnualizedIncome)
          .reduce((acc, d) => acc + d.calculatedAnnualizedIncome!, 0);

        totalVerifiedIncome = w2Income + paystubIncome + otherIncome;
        
        // Debug logging for Unit 0101
        if (unit.unitNumber === '0101') {
          console.log(`[DEBUG Unit 0101] Total uploaded income: $${totalUploadedIncome}`);
          console.log(`[DEBUG Unit 0101] Total verified income: $${totalVerifiedIncome}`);
          console.log(`[DEBUG Unit 0101] Paystub documents: ${paystubDocuments.length}`);
          console.log(`[DEBUG Unit 0101] Paystub income: $${paystubIncome}`);
          console.log(`[DEBUG Unit 0101] Discrepancy: $${Math.abs(totalUploadedIncome - totalVerifiedIncome)}`);
          console.log(`[DEBUG Unit 0101] Verification status: ${verificationStatus}`);
        }
      }

      // Count documents
      const documentCount = activeLease 
        ? activeLease.residents.flatMap(r => r.incomeDocuments).length
        : 0;

      // Find last verification update
      const lastVerificationUpdate = activeLease 
        ? activeLease.residents
            .flatMap(r => r.incomeDocuments)
            .reduce((latest, doc) => {
              const docDate = new Date(doc.uploadDate);
              return !latest || docDate > latest ? docDate : latest;
            }, null as Date | null)
        : null;

      const unitData: UnitVerificationData = {
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        verificationStatus,
        totalUploadedIncome,
        totalVerifiedIncome,
        leaseStartDate: activeLease?.leaseStartDate ? new Date(activeLease.leaseStartDate) : null,
        documentCount,
        lastVerificationUpdate,
      };

      units.push(unitData);

      // Update summary counts
      switch (verificationStatus) {
        case 'Verified':
          summary.verified++;
          break;
        case 'Needs Investigation':
          summary.needsInvestigation++;
          break;
        case 'Out of Date Income Documents':
          summary.outOfDate++;
          break;
        case 'Vacant':
          summary.vacant++;
          break;
      }
    }

    const response: PropertyVerificationSummary = {
      propertyId,
      units: units.sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true })),
      summary,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching verification status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch verification status' },
      { status: 500 }
    );
  }
} 