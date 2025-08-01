import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { DocumentStatus } from '@prisma/client';

/**
 * Admin API endpoint to handle document review decisions
 * POST: Approve or reject a document that needs manual review
 */
export async function POST(
  request: NextRequest, 
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin (you may have a different admin check mechanism)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    });

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { documentId } = await params;
    const { action, adminNotes, correctedValues } = await request.json();

    // Validate input
    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Must be "approve" or "reject"' }, { status: 400 });
    }

    // Find the document and associated override request
    const document = await prisma.incomeDocument.findUnique({
      where: { id: documentId },
      include: {
        resident: true,
        verification: {
          include: {
            lease: {
              include: {
                unit: true
              }
            }
          }
        }
      }
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Find associated override request
    const overrideRequest = await prisma.overrideRequest.findFirst({
      where: {
        documentId: documentId,
        status: 'PENDING'
      }
    });

    if (!overrideRequest) {
      return NextResponse.json({ error: 'No pending override request found for this document' }, { status: 404 });
    }

    if (action === 'approve') {
      // Admin approves the document - mark as completed with optional corrections
      const updateData: Record<string, any> = {
        status: DocumentStatus.COMPLETED
      };

      // If admin provided corrected values, use them
      if (correctedValues) {
        if (correctedValues.grossPayAmount) updateData.grossPayAmount = correctedValues.grossPayAmount;
        if (correctedValues.box1_wages) updateData.box1_wages = correctedValues.box1_wages;
        if (correctedValues.box3_ss_wages) updateData.box3_ss_wages = correctedValues.box3_ss_wages;
        if (correctedValues.box5_med_wages) updateData.box5_med_wages = correctedValues.box5_med_wages;
        if (correctedValues.employeeName) updateData.employeeName = correctedValues.employeeName;
        if (correctedValues.employerName) updateData.employerName = correctedValues.employerName;
        if (correctedValues.payPeriodStartDate) updateData.payPeriodStartDate = new Date(correctedValues.payPeriodStartDate);
        if (correctedValues.payPeriodEndDate) updateData.payPeriodEndDate = new Date(correctedValues.payPeriodEndDate);
        if (correctedValues.payFrequency) updateData.payFrequency = correctedValues.payFrequency;
      }

      // Calculate annualized income based on document type
      let calculatedAnnualizedIncome = null;
      
      if (document.documentType === 'W2') {
        // For W2, use highest of boxes 1, 3, 5
        const amounts = [
          correctedValues?.box1_wages || document.box1_wages,
          correctedValues?.box3_ss_wages || document.box3_ss_wages,
          correctedValues?.box5_med_wages || document.box5_med_wages
        ].filter(amount => amount != null);
        
        if (amounts.length > 0) {
          calculatedAnnualizedIncome = Math.max(...amounts);
        }
      } else if (document.documentType === 'PAYSTUB') {
        // For paystub, calculate based on pay frequency
        const grossPay = correctedValues?.grossPayAmount || document.grossPayAmount;
        const frequency = correctedValues?.payFrequency || document.payFrequency;
        
        if (grossPay && frequency) {
          const frequencyMultipliers: Record<string, number> = {
            'WEEKLY': 52,
            'BI-WEEKLY': 26,
            'SEMI-MONTHLY': 24,
            'MONTHLY': 12
          };
          
          const multiplier = frequencyMultipliers[frequency] || 26; // Default to bi-weekly
          calculatedAnnualizedIncome = grossPay * multiplier;
        }
      }

      if (calculatedAnnualizedIncome) {
        updateData.calculatedAnnualizedIncome = calculatedAnnualizedIncome;
      }

      // Update the document
      const updatedDocument = await prisma.incomeDocument.update({
        where: { id: documentId },
        data: updateData
      });

      // Update resident-level calculated income if we have it
      if (calculatedAnnualizedIncome) {
        await prisma.$executeRaw`
          UPDATE "Resident" 
          SET "calculatedAnnualizedIncome" = ${Number(calculatedAnnualizedIncome)}::numeric
          WHERE "id" = ${document.residentId}
        `;
        
        console.log(`Admin approved document ${documentId} - Updated resident ${document.residentId} with calculated income: $${calculatedAnnualizedIncome}`);
      }

      // Update the override request
      await prisma.overrideRequest.update({
        where: { id: overrideRequest.id },
        data: {
          status: 'APPROVED',
          adminNotes: adminNotes || `Document approved by admin. ${correctedValues ? 'Values were corrected during review.' : 'Original extracted values were accepted.'}`,
          reviewerId: session.user.id,
          reviewedAt: new Date()
        }
      });

      return NextResponse.json({
        message: 'Document approved successfully',
        document: updatedDocument,
        calculatedAnnualizedIncome
      });

    } else { // action === 'reject'
      // Admin rejects the document - mark as needs manual processing
      await prisma.incomeDocument.update({
        where: { id: documentId },
        data: {
          status: DocumentStatus.NEEDS_REVIEW // Keep in needs review state
        }
      });

      // Update the override request
      await prisma.overrideRequest.update({
        where: { id: overrideRequest.id },
        data: {
          status: 'DENIED',
          adminNotes: adminNotes || 'Document rejected by admin. Manual data entry required.',
          reviewerId: session.user.id,
          reviewedAt: new Date()
        }
      });

      console.log(`Admin rejected document ${documentId} - Manual data entry will be required`);

      return NextResponse.json({
        message: 'Document rejected. Manual data entry will be required.',
        requiresManualEntry: true
      });
    }

  } catch (error) {
    console.error('Error processing admin document review:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET: Retrieve document details for admin review
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    });

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { documentId } = await params;

    const document = await prisma.incomeDocument.findUnique({
      where: { id: documentId },
      include: {
        resident: {
          select: {
            id: true,
            name: true,
            annualizedIncome: true,
            calculatedAnnualizedIncome: true
          }
        },
        verification: {
          include: {
            lease: {
              include: {
                unit: {
                  select: {
                    unitNumber: true,
                    property: {
                      select: {
                        name: true,
                        address: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Get associated override request with details
    const overrideRequest = await prisma.overrideRequest.findFirst({
      where: {
        documentId: documentId,
        type: 'DOCUMENT_REVIEW'
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json({
      document,
      overrideRequest,
      filePath: document.filePath // Admin will need this to view the actual document
    });

  } catch (error) {
    console.error('Error retrieving document for admin review:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 