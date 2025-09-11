import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
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

    // Check if resident already has accepted verified income (user already resolved discrepancy)
    const currentResident = await prisma.resident.findUnique({
      where: { id: residentId },
      select: {
        incomeFinalized: true,
        annualizedIncome: true,
        calculatedAnnualizedIncome: true,
        verifiedIncome: true,
        finalizedAt: true
      }
    });

    let finalIncomeToUse: number;

    if (currentResident?.incomeFinalized) {
      // Resident is already finalized - respect the user's decision and don't recalculate
      // Use annualizedIncome as the source of truth (updated by accept-verified-income)
      finalIncomeToUse = Number(currentResident.annualizedIncome || currentResident.verifiedIncome || currentResident.calculatedAnnualizedIncome || 0);
      console.log(`[FINALIZE DEBUG] Resident already finalized - using existing income: $${finalIncomeToUse} (from annualizedIncome: ${currentResident.annualizedIncome})`);
    } else {
      // Calculate income from resident's documents for new finalization
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
      
      // Process paystub documents - use proper pay period grouping (same as income service)
      const paystubDocuments = residentDocuments.filter(doc => 
        doc.documentType === 'PAYSTUB' && doc.grossPayAmount && Number(doc.grossPayAmount) > 0
      );
      
      if (paystubDocuments.length > 0) {
        // Group paystubs by pay period (start date + end date) to avoid double-counting
        const payPeriodGroups = new Map<string, number>();
        
        for (const doc of paystubDocuments) {
          const grossPayAmount = Number(doc.grossPayAmount);
          const startDate = doc.payPeriodStartDate ? new Date(doc.payPeriodStartDate).toISOString().split('T')[0] : 'unknown-start';
          const endDate = doc.payPeriodEndDate ? new Date(doc.payPeriodEndDate).toISOString().split('T')[0] : 'unknown-end';
          const payPeriodKey = `${startDate}_${endDate}`;
          
          const currentAmount = payPeriodGroups.get(payPeriodKey) || 0;
          payPeriodGroups.set(payPeriodKey, currentAmount + grossPayAmount);
        }
        
        // Calculate average from pay period totals (not individual paystubs)
        const payPeriodTotals = Array.from(payPeriodGroups.values());
        const totalGrossPay = payPeriodTotals.reduce((acc, total) => acc + total, 0);
        const averageGrossPay = totalGrossPay / payPeriodTotals.length;
        
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
        
        console.log(`[FINALIZE DEBUG] Paystub calculation: ${paystubDocuments.length} paystubs, ${payPeriodGroups.size} unique periods, average $${averageGrossPay.toFixed(2)} × ${multiplier} = $${paystubIncome.toFixed(2)}`);
      }
      
      // Process Social Security documents
      const socialSecurityDocuments = residentDocuments.filter(doc => 
        doc.documentType === 'SOCIAL_SECURITY'
      );
      
      socialSecurityDocuments.forEach(doc => {
        // For Social Security, use calculatedAnnualizedIncome if available, otherwise annualize grossPayAmount
        const annualIncome = Number(doc.calculatedAnnualizedIncome) || (doc.grossPayAmount ? Number(doc.grossPayAmount) * 12 : 0);
        serverCalculatedIncome += annualIncome;
        
        console.log(`[FINALIZE DEBUG] Social Security document: annual income $${annualIncome}`);
      });
      
      // Use server-calculated income for new finalization
      finalIncomeToUse = serverCalculatedIncome || Number(calculatedVerifiedIncome) || 0;
      console.log(`[FINALIZE DEBUG] Server calculated income: $${serverCalculatedIncome}`);
      console.log(`[FINALIZE DEBUG] Frontend sent income: $${calculatedVerifiedIncome}`);
      console.log(`[FINALIZE DEBUG] Final income to use: $${finalIncomeToUse}`);
    }

    // Verify that the resident belongs to this lease
    const resident = verification.Lease.Resident.find(r => r.id === residentId);
    if (!resident) {
      return NextResponse.json({ error: 'Resident not found in this lease' }, { status: 404 });
    }

    // Update the resident's finalized income
    const numericVerifiedIncome = finalIncomeToUse;
    
    if (currentResident?.incomeFinalized) {
      // Resident already finalized - don't update income fields, just ensure finalization status
      console.log(`[FINALIZE DEBUG] Resident already finalized, preserving existing income values`);
      
      // Only update finalization timestamp if it wasn't set
      if (!currentResident.finalizedAt) {
        await prisma.resident.update({
          where: { id: residentId },
          data: {
            finalizedAt: new Date()
          }
        });
      }
    } else {
      // New finalization - update all income fields
      await prisma.$executeRaw`
        UPDATE "Resident" 
        SET 
          "calculatedAnnualizedIncome" = ${numericVerifiedIncome}::numeric,
          "incomeFinalized" = true,
          "finalizedAt" = NOW(),
          "verifiedIncome" = ${numericVerifiedIncome}::numeric
        WHERE "id" = ${residentId}
      `;
      console.log(`[FINALIZE DEBUG] Updated resident ${residentId} with income: $${numericVerifiedIncome}`);
    }

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

    // NOTE: Income discrepancy override requests should only be created when the user 
    // explicitly chooses "Submit for Admin Review" in the frontend discrepancy modal.
    // Automatic creation here was causing unwanted admin review requests even when
    // users accepted the discrepancy. The frontend handles discrepancy detection and
    // user choice appropriately.

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
          verifiedIncome: true
        }
      });
      
      const totalVerifiedIncome = totalVerifiedIncomeResult._sum.verifiedIncome?.toNumber() || 0;

      // NOTE: Automatic income discrepancy checking removed - this should only happen
      // when user explicitly chooses "Submit for Admin Review" in the frontend modal

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