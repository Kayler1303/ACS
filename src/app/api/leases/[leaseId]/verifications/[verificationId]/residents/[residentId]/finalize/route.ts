import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { DocumentStatus, VerificationStatus } from '@prisma/client';
import { checkAndCreateIncomeDiscrepancyOverride } from '@/services/verification';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ leaseId: string; verificationId: string; residentId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leaseId, verificationId, residentId } = await params;
    const { calculatedVerifiedIncome } = await request.json();

    // Verify that the user owns this property through the lease verification
    const verification = await prisma.incomeVerification.findFirst({
      where: {
        id: verificationId,
        leaseId: leaseId,
        lease: {
          unit: {
            property: {
              ownerId: session.user.id
            }
          }
        }
      },
      include: {
        lease: {
          include: {
            residents: true,
            unit: true
          }
        },
        incomeDocuments: {
          where: {
            residentId: residentId,
            status: DocumentStatus.COMPLETED
          }
        }
      }
    });

    if (!verification) {
      return NextResponse.json({ error: 'Verification not found or access denied' }, { status: 404 });
    }

    // Verify that the resident belongs to this lease
    const resident = verification.lease.residents.find(r => r.id === residentId);
    if (!resident) {
      return NextResponse.json({ error: 'Resident not found in this lease' }, { status: 404 });
    }

    // Update the resident's finalized income using the new architecture
    // Temporary workaround: Use prisma.$executeRaw to update new fields until client is updated
    await prisma.$executeRaw`
      UPDATE "Resident" 
      SET 
        "calculatedAnnualizedIncome" = ${calculatedVerifiedIncome},
        "incomeFinalized" = true,
        "finalizedAt" = NOW(),
        "verifiedIncome" = ${calculatedVerifiedIncome}
      WHERE "id" = ${residentId}
    `;

    // Get the total uploaded income for discrepancy check
    const totalUploadedIncome = verification.lease.residents.reduce((acc, r) => acc + (Number(r.annualizedIncome) || 0), 0);
    
    // Check for income discrepancy and create auto-override if needed
    try {
      await checkAndCreateIncomeDiscrepancyOverride({
        unitId: verification.lease.unit.id,
        verificationId: verification.id,
        residentId: residentId,
        totalUploadedIncome,
        totalVerifiedIncome: calculatedVerifiedIncome,
        userId: session.user.id
      });
    } catch (error) {
      console.error('Failed to create auto-override request for income discrepancy:', error);
      // Don't fail the finalization, just log the error
    }

    // Check if all residents in the lease now have finalized income
    const allResidents = verification.lease.residents;
    const residentsWithFinalizedIncomeCount = await prisma.$queryRaw<{count: number}[]>`
      SELECT COUNT(*) as count 
      FROM "Resident" 
      WHERE "leaseId" = ${leaseId} AND "incomeFinalized" = true
    `;

    // If all residents are now verified, finalize the entire verification
    if (residentsWithFinalizedIncomeCount[0].count === allResidents.length) {
      const totalVerifiedIncomeResult = await prisma.$queryRaw<{total: number}[]>`
        SELECT SUM("calculatedAnnualizedIncome") as total
        FROM "Resident" 
        WHERE "leaseId" = ${leaseId} AND "incomeFinalized" = true
      `;
      
      const totalVerifiedIncome = totalVerifiedIncomeResult[0].total || 0;

      // Check for income discrepancy at verification level too
      try {
        await checkAndCreateIncomeDiscrepancyOverride({
          unitId: verification.lease.unit.id,
          verificationId: verification.id,
          totalUploadedIncome,
          totalVerifiedIncome,
          userId: session.user.id
        });
      } catch (error) {
        console.error('Failed to create auto-override request for verification income discrepancy:', error);
        // Don't fail the finalization, just log the error
      }

      await prisma.incomeVerification.update({
        where: { id: verificationId },
        data: {
          status: VerificationStatus.FINALIZED,
          finalizedAt: new Date(),
          calculatedVerifiedIncome: totalVerifiedIncome
        }
      });

      return NextResponse.json({ 
        success: true, 
        residentFinalized: true,
        verificationFinalized: true,
        totalVerifiedIncome
      });
    }

    return NextResponse.json({ 
      success: true, 
      residentFinalized: true,
      verificationFinalized: false
    });

  } catch (error) {
    console.error('Error finalizing resident verification:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 