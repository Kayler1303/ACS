import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { DocumentStatus } from '@prisma/client';
import { sendAdminDecisionNotification } from '@/services/emailNotification';

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
        Resident: true,
        IncomeVerification: {
          include: {
            Lease: {
              include: {
                Unit: true
              }
            }
          }
        }
      }
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Find associated override request - check for any status first
    const existingOverrideRequest = await prisma.overrideRequest.findFirst({
      where: {
        documentId: documentId
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!existingOverrideRequest) {
      return NextResponse.json({ error: 'No override request found for this document' }, { status: 404 });
    }

    // Check if already processed
    if (existingOverrideRequest.status !== 'PENDING') {
      const statusMessage = existingOverrideRequest.status === 'APPROVED' 
        ? 'This document has already been approved'
        : existingOverrideRequest.status === 'DENIED'
        ? 'This document has already been denied'
        : `This document has already been processed (status: ${existingOverrideRequest.status})`;
        
      return NextResponse.json({ 
        error: statusMessage,
        alreadyProcessed: true,
        currentStatus: existingOverrideRequest.status,
        reviewedAt: existingOverrideRequest.reviewedAt
      }, { status: 409 }); // 409 Conflict
    }

    const overrideRequest = existingOverrideRequest;

    if (action === 'approve') {
      // Admin approves the document - mark as completed with optional corrections
      const updateData: Record<string, any> = {
        status: DocumentStatus.COMPLETED
      };

      // If admin provided corrected values, use them - handle all document types
      if (correctedValues) {
        // Common fields
        if (correctedValues.employeeName) updateData.employeeName = correctedValues.employeeName;
        if (correctedValues.employerName) updateData.employerName = correctedValues.employerName;
        
        // Paystub fields
        if (correctedValues.grossPayAmount) updateData.grossPayAmount = correctedValues.grossPayAmount;
        if (correctedValues.payFrequency) updateData.payFrequency = correctedValues.payFrequency;
        if (correctedValues.payPeriodStartDate) {
          const startDate = new Date(correctedValues.payPeriodStartDate + 'T12:00:00');
          updateData.payPeriodStartDate = startDate;
        }
        if (correctedValues.payPeriodEndDate) {
          const endDate = new Date(correctedValues.payPeriodEndDate + 'T12:00:00');
          updateData.payPeriodEndDate = endDate;
        }
        
        // W2 fields
        if (correctedValues.box1_wages) updateData.box1_wages = correctedValues.box1_wages;
        if (correctedValues.box3_ss_wages) updateData.box3_ss_wages = correctedValues.box3_ss_wages;
        if (correctedValues.box5_med_wages) updateData.box5_med_wages = correctedValues.box5_med_wages;
        if (correctedValues.taxYear) updateData.taxYear = correctedValues.taxYear;
        
        // Social Security / SSA-1099 fields (direct annual income)
        if (correctedValues.calculatedAnnualizedIncome) {
          updateData.calculatedAnnualizedIncome = correctedValues.calculatedAnnualizedIncome;
        }
        
        // Other document type (direct annual income)
        if (correctedValues.annualIncome) {
          updateData.calculatedAnnualizedIncome = correctedValues.annualIncome;
        }
      }

      // Calculate annualized income based on document type
      let calculatedAnnualizedIncome = null;
      
      // Check if admin directly provided annual income (for non-paystub/W2 types)
      if (correctedValues?.annualIncome) {
        calculatedAnnualizedIncome = correctedValues.annualIncome;
      } else if (correctedValues?.calculatedAnnualizedIncome) {
        calculatedAnnualizedIncome = correctedValues.calculatedAnnualizedIncome;
      } else {
        // Calculate based on document type
        switch (document.documentType) {
          case 'W2':
            // For W2, use highest of boxes 1, 3, 5
            const amounts = [
              correctedValues?.box1_wages || document.box1_wages,
              correctedValues?.box3_ss_wages || document.box3_ss_wages,
              correctedValues?.box5_med_wages || document.box5_med_wages
            ].filter(amount => amount != null);
            
            if (amounts.length > 0) {
              calculatedAnnualizedIncome = Math.max(...amounts);
            }
            break;
            
          case 'PAYSTUB':
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
            break;
            
          default:
            // For SOCIAL_SECURITY, SSA_1099, OTHER, BANK_STATEMENT, OFFER_LETTER
            // Use the existing calculatedAnnualizedIncome if available
            calculatedAnnualizedIncome = document.calculatedAnnualizedIncome;
            break;
        }
      }

      // Store the calculated income if we have one
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
      const updatedOverrideRequest = await prisma.overrideRequest.update({
        where: { id: overrideRequest.id },
        data: {
          status: 'APPROVED',
          adminNotes: adminNotes || `Document approved by admin. ${correctedValues ? 'Values were corrected during review.' : 'Original extracted values were accepted.'}`,
          reviewerId: session.user.id,
          reviewedAt: new Date()
        },
        include: {
          User_OverrideRequest_requesterIdToUser: {
            select: { id: true, name: true, email: true }
          },
          Unit: {
            select: { unitNumber: true, Property: { select: { name: true } } }
          },
          Resident: {
            select: { name: true }
          }
        }
      });

      // Send approval notification email
      const admin = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true, email: true }
      });

      if (updatedOverrideRequest.User_OverrideRequest_requesterIdToUser && admin) {
        const requester = updatedOverrideRequest.User_OverrideRequest_requesterIdToUser;
        try {
          await sendAdminDecisionNotification({
            adminName: admin.name || admin.email || 'Admin',
            userEmail: requester.email,
            userFirstName: requester.name?.split(' ')[0] || 'there',
            decision: 'APPROVED',
            adminNotes: adminNotes || `Document approved by admin. ${correctedValues ? 'Values were corrected during review.' : 'Original extracted values were accepted.'}`,
            overrideRequestType: 'DOCUMENT_REVIEW',
            propertyName: updatedOverrideRequest.Unit?.Property?.name,
            unitNumber: updatedOverrideRequest.Unit?.unitNumber?.toString(),
            documentType: document.documentType,
            residentName: updatedOverrideRequest.Resident?.name
          });
          console.log(`[DOCUMENT APPROVAL] Sent approval notification to ${requester.email}`);
        } catch (emailError) {
          console.error('[DOCUMENT APPROVAL] Failed to send notification email:', emailError);
        }
      }

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
      const updatedOverrideRequest = await prisma.overrideRequest.update({
        where: { id: overrideRequest.id },
        data: {
          status: 'DENIED',
          adminNotes: adminNotes || 'Document rejected by admin. Manual data entry required.',
          reviewerId: session.user.id,
          reviewedAt: new Date()
        },
        include: {
          User_OverrideRequest_requesterIdToUser: {
            select: { id: true, name: true, email: true }
          },
          Unit: {
            select: { unitNumber: true, Property: { select: { name: true } } }
          },
          Resident: {
            select: { name: true }
          }
        }
      });

      // Send denial notification email
      const admin = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true, email: true }
      });

      if (updatedOverrideRequest.User_OverrideRequest_requesterIdToUser && admin) {
        const requester = updatedOverrideRequest.User_OverrideRequest_requesterIdToUser;
        try {
          await sendAdminDecisionNotification({
            adminName: admin.name || admin.email || 'Admin',
            userEmail: requester.email,
            userFirstName: requester.name?.split(' ')[0] || 'there',
            decision: 'DENIED',
            adminNotes: adminNotes || 'Document rejected by admin. Manual data entry required.',
            overrideRequestType: 'DOCUMENT_REVIEW',
            propertyName: updatedOverrideRequest.Unit?.Property?.name,
            unitNumber: updatedOverrideRequest.Unit?.unitNumber?.toString(),
            documentType: document.documentType,
            residentName: updatedOverrideRequest.Resident?.name
          });
          console.log(`[DOCUMENT DENIAL] Sent denial notification to ${requester.email}`);
        } catch (emailError) {
          console.error('[DOCUMENT DENIAL] Failed to send notification email:', emailError);
        }
      }

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
        Resident: {
          select: {
            id: true,
            name: true,
            annualizedIncome: true,
            calculatedAnnualizedIncome: true
          }
        },
        IncomeVerification: {
          include: {
            Lease: {
              include: {
                Unit: {
                  select: {
                    unitNumber: true,
                    Property: {
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