import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { unlink } from 'fs/promises';

async function deleteFileLocally(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error: unknown) {
    // If the file doesn't exist, we can ignore the error.
    if ((error as { code?: string })?.code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { documentId } = await params;
  if (!documentId) {
    return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
  }

  try {
    const document = await prisma.incomeDocument.findFirst({
      where: {
        id: documentId,
        IncomeVerification: {
          Lease: {
            Unit: {
              Property: {
                ownerId: session.user.id,
              },
            },
          },
        },
      },
      include: {
        Resident: true, // Include resident info for income recalculation
      },
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found or access denied.' }, { status: 404 });
    }

    const residentId = document.residentId;

    // Use a transaction to delete document and recalculate income
    await prisma.$transaction(async (tx) => {
      // First, delete any override requests associated with this document
      const deletedOverrideRequests = await tx.overrideRequest.deleteMany({
        where: {
          documentId: documentId,
        },
      });

      console.log(`🧹 Deleted ${deletedOverrideRequests.count} override request(s) for document ${documentId}`);

      // Then delete the document itself
      await tx.incomeDocument.delete({
        where: { id: documentId },
      });

      // Recalculate resident's verified income after document deletion
      if (residentId) {
        // First, get the current resident state to preserve their finalization status
        const currentResident = await tx.resident.findUnique({
          where: { id: residentId },
          select: { incomeFinalized: true, finalizedAt: true }
        });

        // Get all remaining COMPLETED documents for this resident (for income calculation)
        const remainingCompletedDocuments = await tx.incomeDocument.findMany({
          where: {
            residentId: residentId,
            status: 'COMPLETED'
          }
        });

        // Get all remaining documents (COMPLETED + NEEDS_REVIEW) to determine finalization status
        const allRemainingDocuments = await tx.incomeDocument.findMany({
          where: {
            residentId: residentId,
            status: { in: ['COMPLETED', 'NEEDS_REVIEW'] }
          }
        });

        const hasDocumentsInReview = await tx.incomeDocument.count({
          where: {
            residentId: residentId,
            status: 'NEEDS_REVIEW'
          }
        });

        console.log(`📊 Recalculating income for resident after document deletion. Remaining completed documents: ${remainingCompletedDocuments.length}, documents in review: ${hasDocumentsInReview}`);

        // Calculate new verified income based on remaining COMPLETED documents only
        let newVerifiedIncome = 0;

        // Group paystubs separately to handle averaging
        const paystubDocuments = remainingCompletedDocuments.filter(doc => doc.documentType === 'PAYSTUB');
        const nonPaystubDocuments = remainingCompletedDocuments.filter(doc => doc.documentType !== 'PAYSTUB');

        // Handle paystubs - AVERAGE them, don't sum them
        if (paystubDocuments.length > 0) {
          const totalGrossPay = paystubDocuments.reduce((sum, doc) => sum + (Number(doc.grossPayAmount) || 0), 0);
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
          newVerifiedIncome += paystubIncome;
          
          console.log(`📊 Paystub calculation for resident:`, {
            paystubCount: paystubDocuments.length,
            totalGrossPay,
            averageGrossPay,
            payFrequency,
            multiplier,
            paystubIncome
          });
        }

        // Handle all other document types
        for (const doc of nonPaystubDocuments) {
          const docType = doc.documentType as string;
          
          if (docType === 'W2') {
            // For W2s, use the highest of boxes 1, 3, 5
            const box1 = Number(doc.box1_wages || 0);
            const box3 = Number(doc.box3_ss_wages || 0);
            const box5 = Number(doc.box5_med_wages || 0);
            const highestAmount = Math.max(box1, box3, box5);
            newVerifiedIncome += highestAmount;
          } else if (docType === 'SOCIAL_SECURITY') {
            // For Social Security, use calculatedAnnualizedIncome
            newVerifiedIncome += Number(doc.calculatedAnnualizedIncome || 0);
          } else if (docType === 'SSA_1099') {
            // For SSA-1099, use calculatedAnnualizedIncome
            newVerifiedIncome += Number(doc.calculatedAnnualizedIncome || 0);
          } else if (docType === 'OTHER') {
            // For OTHER documents, use calculatedAnnualizedIncome
            newVerifiedIncome += Number(doc.calculatedAnnualizedIncome || 0);
          }
          // BANK_STATEMENT and OFFER_LETTER don't contribute to verified income calculation
        }

        console.log(`📊 New verified income for resident: $${newVerifiedIncome}`);

        // CRITICAL FIX: Only keep resident finalized if they were ALREADY finalized
        // AND they still have completed documents with no pending review
        // Do NOT auto-finalize residents just because they have completed documents
        const wasAlreadyFinalized = currentResident?.incomeFinalized || false;
        const canStayFinalized = remainingCompletedDocuments.length > 0 && hasDocumentsInReview === 0;
        const shouldRemainFinalized = wasAlreadyFinalized && canStayFinalized;

        // If they were finalized but now have documents in review or no completed docs, unfinalize them
        if (wasAlreadyFinalized && !canStayFinalized) {
          console.log(`📊 Unfinalizing resident because they have documents in review (${hasDocumentsInReview}) or no completed documents (${remainingCompletedDocuments.length})`);
        }

        // Update the resident's verified income and related fields
        await tx.resident.update({
          where: { id: residentId },
          data: {
            verifiedIncome: newVerifiedIncome,
            calculatedAnnualizedIncome: newVerifiedIncome > 0 ? newVerifiedIncome : null,
            // Only keep finalized if they were already finalized AND conditions are still met
            incomeFinalized: shouldRemainFinalized,
            finalizedAt: shouldRemainFinalized ? currentResident?.finalizedAt : null,
          }
        });

        console.log(`✅ Updated resident verified income to $${newVerifiedIncome}, finalized: ${shouldRemainFinalized} (was finalized: ${wasAlreadyFinalized}, can stay finalized: ${canStayFinalized})`);

        // If the resident was just finalized, check if all residents in the lease are now finalized
        if (shouldRemainFinalized && residentId) {
          // Get the lease information for this resident
          const resident = await tx.resident.findUnique({
            where: { id: residentId },
            include: {
              Lease: {
                include: {
                  Resident: true,
                  IncomeVerification: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                  }
                }
              }
            }
          });

          if (resident?.Lease) {
            const lease = resident.Lease;
            
            // Count finalized residents in this lease
            const finalizedResidentsCount = await tx.resident.count({
              where: {
                leaseId: lease.id,
                incomeFinalized: true
              }
            });

            const totalResidents = lease.Resident.length;
            
            console.log(`[DOCUMENT DELETION] Lease ${lease.id}: ${finalizedResidentsCount} finalized residents out of ${totalResidents} total`);

            // If all residents are now finalized, finalize the lease verification
            if (finalizedResidentsCount === totalResidents && lease.IncomeVerification.length > 0) {
              const verification = lease.IncomeVerification[0];
              
              // Calculate total verified income from all finalized residents
              const totalVerifiedIncomeResult = await tx.resident.aggregate({
                where: {
                  leaseId: lease.id,
                  incomeFinalized: true
                },
                _sum: {
                  calculatedAnnualizedIncome: true
                }
              });
              
              const totalVerifiedIncome = totalVerifiedIncomeResult._sum.calculatedAnnualizedIncome?.toNumber() || 0;

              // Finalize the verification
              await tx.incomeVerification.update({
                where: { id: verification.id },
                data: {
                  status: 'FINALIZED',
                  finalizedAt: new Date(),
                  calculatedVerifiedIncome: totalVerifiedIncome
                }
              });

              console.log(`[DOCUMENT DELETION] Auto-finalized lease verification ${verification.id} with total income: $${totalVerifiedIncome}`);
            }
          }
        }
      }
    });

    // Delete the physical file after successful database operations
    if (document.filePath) {
      await deleteFileLocally(document.filePath);
    }

    return NextResponse.json({ 
      message: 'Document deleted and resident income recalculated successfully',
      recalculatedIncome: true
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 