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
    
    console.log(`[FINALIZE DEBUG] Frontend sent calculatedVerifiedIncome: $${calculatedVerifiedIncome}`);

    // Verify that the user owns this property through the lease verification
    const verification = await prisma.incomeVerification.findFirst({
      where: {
        id: verificationId,
        leaseId: leaseId,
        Lease: {
          Unit: {
            Property: {
              ownerId: session.user.id
            }
          }
        }
      },
      include: {
        Lease: {
          include: {
            Resident: true,
            Unit: true
          }
        },
        IncomeDocument: {
          where: {
            residentId: residentId
          }
        }
      }
    });
    
    if (!verification) {
      return NextResponse.json({ error: 'Verification not found or access denied' }, { status: 404 });
    }

    // Calculate income from resident's documents instead of trusting frontend value
    let serverCalculatedIncome = 0;
    
    // Get all completed documents for this resident
    const residentDocuments = verification.IncomeDocument.filter(doc => 
      doc.status === 'COMPLETED' || doc.status === 'NEEDS_REVIEW'
    );
    
    console.log(`[FINALIZE DEBUG] Found ${residentDocuments.length} documents for resident ${residentId}`);
    
    // Process W2 documents - take highest of boxes 1, 3, 5
    const w2Documents = residentDocuments.filter(doc => doc.documentType === 'W2');
    w2Documents.forEach(doc => {
      const amounts = [doc.box1_wages, doc.box3_ss_wages, doc.box5_med_wages]
        .filter(amount => amount !== null && amount !== undefined && Number(amount) > 0)
        .map(amount => Number(amount));
      if (amounts.length > 0) {
        const highestAmount = Math.max(...amounts);
        serverCalculatedIncome += highestAmount;
        console.log(`[FINALIZE DEBUG] W2 document: highest amount $${highestAmount}`);
      }
    });
    
    // Process paystub documents - average and annualize
    const paystubDocuments = residentDocuments.filter(doc => 
      doc.documentType === 'PAYSTUB' && doc.grossPayAmount && Number(doc.grossPayAmount) > 0
    );
    
    if (paystubDocuments.length > 0) {
      const totalGrossPay = paystubDocuments.reduce((sum, doc) => sum + Number(doc.grossPayAmount), 0);
      const averageGrossPay = totalGrossPay / paystubDocuments.length;
      
      // Get pay frequency (should be consistent across paystubs)
      const payFrequency = paystubDocuments[0]?.payFrequency || 'BI-WEEKLY';
      const frequencyMultipliers: Record<string, number> = {
        'WEEKLY': 52,
        'BI-WEEKLY': 26,
        'SEMI-MONTHLY': 24,
        'MONTHLY': 12,
        'YEARLY': 1
      };
      
      const multiplier = frequencyMultipliers[payFrequency] || 26;
      const paystubIncome = averageGrossPay * multiplier;
      serverCalculatedIncome += paystubIncome;
      
      console.log(`[FINALIZE DEBUG] Paystub calculation: ${paystubDocuments.length} paystubs, average $${averageGrossPay.toFixed(2)} × ${multiplier} = $${paystubIncome.toFixed(2)}`);
    }
    
    console.log(`[FINALIZE DEBUG] Server calculated income: $${serverCalculatedIncome}`);
    console.log(`[FINALIZE DEBUG] Frontend sent income: $${calculatedVerifiedIncome}`);
    
    // Use server-calculated income instead of frontend value
    const finalIncomeToUse = serverCalculatedIncome || Number(calculatedVerifiedIncome) || 0;
    console.log(`[FINALIZE DEBUG] Final income to use: $${finalIncomeToUse}`);

    // Verify that the resident belongs to this lease
    const resident = verification.Lease.Resident.find(r => r.id === residentId);
    if (!resident) {
      return NextResponse.json({ error: 'Resident not found in this lease' }, { status: 404 });
    }

    // Update the resident's finalized income using server-calculated value (NOT frontend value)
    const numericVerifiedIncome = finalIncomeToUse;
    await prisma.$executeRaw`
      UPDATE "Resident" 
      SET 
        "calculatedAnnualizedIncome" = ${numericVerifiedIncome}::numeric,
        "incomeFinalized" = true,
        "finalizedAt" = NOW(),
        "verifiedIncome" = ${numericVerifiedIncome}::numeric
      WHERE "id" = ${residentId}
    `;

    // Mark all documents for this resident in this verification as COMPLETED
    // This ensures the verification status calculation recognizes them as verified
    await prisma.incomeDocument.updateMany({
      where: {
        residentId: residentId,
        verificationId: verificationId,
        status: {
          in: ['PROCESSING', 'NEEDS_REVIEW', 'UPLOADED'] // Only update non-completed documents
        }
      },
      data: {
        status: DocumentStatus.COMPLETED
      }
    });

    console.log(`[DEBUG] Marked documents as COMPLETED for resident ${residentId} in verification ${verificationId}`);

    // Get the total uploaded income for discrepancy check
    const totalUploadedIncome = verification.Lease.Resident.reduce((acc: number, r: any) => acc + (Number(r.annualizedIncome) || 0), 0);
    
    // Check for income discrepancy and create auto-override if needed
    try {
      await checkAndCreateIncomeDiscrepancyOverride({
        unitId: verification.Lease.Unit.id,
        verificationId: verification.id,
        residentId: residentId,
        totalUploadedIncome,
        totalVerifiedIncome: finalIncomeToUse,
        userId: session.user.id
      });
    } catch (error) {
      console.error('Failed to create auto-override request for income discrepancy:', error);
      // Don't fail the finalization, just log the error
    }

    // Check if all residents in the lease now have finalized income
    const allResidents = verification.Lease.Resident;
    const residentsWithFinalizedIncomeCount = await prisma.$queryRaw<{count: number}[]>`
      SELECT COUNT(*) as count 
      FROM "Resident" 
      WHERE "leaseId" = ${leaseId} AND "incomeFinalized" = true
    `;

    const finalizedCount = Number(residentsWithFinalizedIncomeCount[0]?.count || 0);
    const totalResidents = allResidents.length;
    
    console.log(`[DEBUG] Lease ${leaseId}: ${finalizedCount} finalized residents out of ${totalResidents} total`);

    // If all residents are now verified, finalize the entire verification
    if (finalizedCount === totalResidents) {
      // Calculate total verified income using Prisma ORM instead of raw SQL
      const totalVerifiedIncomeResult = await prisma.resident.aggregate({
        where: {
          leaseId: leaseId,
          incomeFinalized: true
        },
        _sum: {
          calculatedAnnualizedIncome: true
        }
      });
      
      const totalVerifiedIncome = totalVerifiedIncomeResult._sum.calculatedAnnualizedIncome?.toNumber() || 0;

      // Check for income discrepancy at verification level too
      try {
        await checkAndCreateIncomeDiscrepancyOverride({
          unitId: verification.Lease.Unit.id,
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
          status: 'FINALIZED',
          finalizedAt: new Date(),
          calculatedVerifiedIncome: totalVerifiedIncome
        }
      });

      console.log(`[DEBUG] Lease verification ${verificationId} finalized with total income: ${totalVerifiedIncome}`);

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