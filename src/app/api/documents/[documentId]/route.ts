import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
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
  { params }: { params: { documentId: string } }
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
        // Get all remaining COMPLETED documents for this resident
        const remainingDocuments = await tx.incomeDocument.findMany({
          where: {
            residentId: residentId,
            status: 'COMPLETED'
          }
        });

        console.log(`📊 Recalculating income for resident after document deletion. Remaining documents: ${remainingDocuments.length}`);

        // Calculate new verified income based on remaining documents
        let newVerifiedIncome = 0;

                 for (const doc of remainingDocuments) {
           if (doc.documentType === 'W2') {
             // For W2s, use the highest of boxes 1, 3, 5
             const box1 = Number(doc.box1_wages || 0);
             const box3 = Number(doc.box3_ss_wages || 0);
             const box5 = Number(doc.box5_med_wages || 0);
             const highestAmount = Math.max(box1, box3, box5);
             newVerifiedIncome += highestAmount;
           } else if (doc.documentType === 'PAYSTUB') {
             // For paystubs, use calculatedAnnualizedIncome
             newVerifiedIncome += Number(doc.calculatedAnnualizedIncome || 0);
           } else if (doc.documentType === 'SOCIAL_SECURITY') {
             // For Social Security, use calculatedAnnualizedIncome
             newVerifiedIncome += Number(doc.calculatedAnnualizedIncome || 0);
           } else if (doc.documentType === 'SSA_1099') {
             // For SSA-1099, use calculatedAnnualizedIncome
             newVerifiedIncome += Number(doc.calculatedAnnualizedIncome || 0);
           }
         }

        console.log(`📊 New verified income for resident: $${newVerifiedIncome}`);

        // Update the resident's verified income and related fields
        await tx.resident.update({
          where: { id: residentId },
          data: {
            verifiedIncome: newVerifiedIncome,
            calculatedAnnualizedIncome: newVerifiedIncome > 0 ? newVerifiedIncome : null,
            // If no documents remain, mark as not finalized
            incomeFinalized: remainingDocuments.length > 0,
            finalizedAt: remainingDocuments.length > 0 ? undefined : null,
          }
        });

        console.log(`✅ Updated resident verified income to $${newVerifiedIncome}, finalized: ${remainingDocuments.length > 0}`);
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