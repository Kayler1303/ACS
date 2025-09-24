import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendAdminDecisionNotification } from '@/services/emailNotification';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { requestId } = await params;
    const { action, adminNotes } = await request.json();

    if (!['approve', 'deny'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (!adminNotes || !adminNotes.trim()) {
      return NextResponse.json({ error: 'Admin notes are required' }, { status: 400 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });
    
    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Check if the override request exists and is pending
    const existingRequest = await prisma.overrideRequest.findUnique({
      where: { id: requestId }
    });

    if (!existingRequest) {
      return NextResponse.json({ error: 'Override request not found' }, { status: 404 });
    }

    if (existingRequest.status !== 'PENDING') {
      return NextResponse.json({ error: 'Override request has already been reviewed' }, { status: 400 });
    }

    // Update the override request
    const updatedRequest = await prisma.overrideRequest.update({
      where: { id: requestId },
      data: {
        status: action === 'approve' ? 'APPROVED' : 'DENIED',
        adminNotes: adminNotes.trim(),
        reviewerId: session.user.id,
        reviewedAt: new Date(),
      },
      include: {
        User_OverrideRequest_requesterIdToUser: {
          select: {
            id: true,
            name: true,
            email: true,
            company: true,
          }
        },
        User_OverrideRequest_reviewerIdToUser: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        },
        Property: {
          select: {
            id: true,
            name: true,
            address: true
          }
        },
        RentRollSnapshot: {
          select: {
            id: true,
            filename: true,
            uploadDate: true
          }
        },
        Unit: {
          select: {
            id: true,
            unitNumber: true
          }
        },
        Resident: {
          select: {
            id: true,
            name: true
          }
        },
        IncomeDocument: {
          select: {
            id: true,
            documentType: true
          }
        }
      }
    });

    // Handle property deletion if approved
    if (action === 'approve' && existingRequest.type === 'PROPERTY_DELETION' && updatedRequest.Property) {
      try {
        await prisma.property.delete({
          where: { id: updatedRequest.Property.id }
        });
        console.log(`Property ${updatedRequest.Property.name} (${updatedRequest.Property.id}) deleted by admin ${session.user.id}`);
      } catch (deleteError) {
        console.error('Error deleting property:', deleteError);
        // Revert the override request status if deletion fails
        await prisma.overrideRequest.update({
          where: { id: requestId },
          data: {
            status: 'PENDING',
            adminNotes: `${adminNotes.trim()}\n\nERROR: Property deletion failed. Please try again or contact support.`,
            reviewedAt: null,
          }
        });
        return NextResponse.json({ 
          error: 'Failed to delete property. The request has been reverted to pending status.' 
        }, { status: 500 });
      }
    }

    // Handle snapshot deletion if approved
    if (action === 'approve' && existingRequest.type === 'SNAPSHOT_DELETION' && updatedRequest.RentRollSnapshot) {
      try {
        await prisma.rentRollSnapshot.delete({
          where: { id: updatedRequest.RentRollSnapshot.id }
        });
        console.log(`Snapshot ${updatedRequest.RentRollSnapshot.filename || 'Unnamed'} (${updatedRequest.RentRollSnapshot.id}) deleted by admin ${session.user.id}`);
      } catch (deleteError) {
        console.error('Error deleting snapshot:', deleteError);
        // Revert the override request status if deletion fails
        await prisma.overrideRequest.update({
          where: { id: requestId },
          data: {
            status: 'PENDING',
            adminNotes: `${adminNotes.trim()}\n\nERROR: Snapshot deletion failed. Please try again or contact support.`,
            reviewedAt: null,
          }
        });
        return NextResponse.json({ 
          error: 'Failed to delete snapshot. The request has been reverted to pending status.' 
        }, { status: 500 });
      }
    }

    // Handle validation exception approval - automatically finalize resident income
    if (action === 'approve' && existingRequest.type === 'VALIDATION_EXCEPTION' && existingRequest.residentId && existingRequest.verificationId) {
      try {
        const now = new Date();
        
        // Get verification and lease data for lease auto-finalization check
        const verification = await prisma.incomeVerification.findUnique({
          where: { id: existingRequest.verificationId },
          include: {
            Lease: {
              include: {
                Resident: true
              }
            }
          }
        });

        if (!verification) {
          throw new Error(`Verification ${existingRequest.verificationId} not found`);
        }

        // Calculate the resident's income from their existing documents before finalizing
        const residentDocuments = await prisma.incomeDocument.findMany({
          where: {
            residentId: existingRequest.residentId,
            verificationId: existingRequest.verificationId,
            status: { in: ['COMPLETED', 'NEEDS_REVIEW'] } // Include both completed and admin-approved docs
          },
          orderBy: {
            uploadDate: 'desc'
          }
        });

        // Calculate total verified income from all documents
        let calculatedIncome = 0;
        
        // Separate documents by type
        const paystubs = residentDocuments.filter(doc => doc.documentType === 'PAYSTUB');
        const w2s = residentDocuments.filter(doc => doc.documentType === 'W2');
        
        // Calculate income from paystubs using average method
        if (paystubs.length > 0) {
          const validPaystubs = paystubs.filter(p => p.grossPayAmount && Number(p.grossPayAmount) > 0);
          if (validPaystubs.length > 0) {
            const totalGrossPay = validPaystubs.reduce((acc, p) => acc + Number(p.grossPayAmount || 0), 0);
            const averageGrossPay = totalGrossPay / validPaystubs.length;
            
            // Get pay frequency (should be same for all paystubs from same resident)
            const payFrequency = validPaystubs[0]?.payFrequency || 'WEEKLY'; // Default from the 4 weekly paystubs
            
            // Calculate annual multiplier
            const frequencyMultipliers: { [key: string]: number } = {
              'WEEKLY': 52,
              'BI-WEEKLY': 26, 
              'SEMI-MONTHLY': 24,
              'MONTHLY': 12
            };
            
            const multiplier = frequencyMultipliers[payFrequency] || 52; // Default to weekly for Keshuna
            calculatedIncome += averageGrossPay * multiplier;
            
            console.log(`Calculated paystub income for resident ${existingRequest.residentId}: ${validPaystubs.length} paystubs, avg $${averageGrossPay} ${payFrequency}, annual: $${averageGrossPay * multiplier}`);
          }
        }
        
        // Add income from W2s (use highest of boxes 1, 3, 5)
        w2s.forEach(w2 => {
          const box1 = Number(w2.box1_wages || 0);
          const box3 = Number(w2.box3_ss_wages || 0);
          const box5 = Number(w2.box5_med_wages || 0);
          const highestAmount = Math.max(box1, box3, box5);
          calculatedIncome += highestAmount;
        });

        console.log(`Total calculated income for resident ${existingRequest.residentId}: $${calculatedIncome} (${paystubs.length} paystubs + ${w2s.length} W2s)`);

        // Finalize the resident's income with calculated amount
        await prisma.resident.update({
          where: { id: existingRequest.residentId },
          data: {
            incomeFinalized: true,
            finalizedAt: now,
            calculatedAnnualizedIncome: calculatedIncome, // Set the calculated income!
            verifiedIncome: calculatedIncome
          }
        });

        // Mark all documents for this resident as COMPLETED (if they're not already)
        await prisma.incomeDocument.updateMany({
          where: {
            residentId: existingRequest.residentId,
            verificationId: existingRequest.verificationId,
            status: { in: ['NEEDS_REVIEW', 'PROCESSING'] }
          },
          data: {
            status: 'COMPLETED'
          }
        });

        console.log(`Validation exception approved - automatically finalized resident ${existingRequest.residentId} by admin ${session.user.id}`);

        // Check if this was the last unfinalized resident - if so, auto-finalize the lease/verification
        const leaseId = verification.Lease.id;
        const allResidents = verification.Lease.Resident;
        const finalizedResidentsCount = await prisma.resident.count({
          where: {
            leaseId: leaseId,
            OR: [
              { incomeFinalized: true },
              { hasNoIncome: true }
            ]
          }
        });

        const totalResidents = allResidents.length;
        
        console.log(`Lease ${leaseId}: ${finalizedResidentsCount} finalized residents out of ${totalResidents} total after admin approval`);

        // If all residents are now finalized, automatically finalize the entire verification
        if (finalizedResidentsCount === totalResidents) {
          // Calculate total verified income
          const totalVerifiedIncomeResult = await prisma.resident.aggregate({
            where: {
              leaseId: leaseId,
              OR: [
                { incomeFinalized: true },
                { hasNoIncome: true }
              ]
            },
            _sum: {
              verifiedIncome: true
            }
          });
          
          const totalVerifiedIncome = totalVerifiedIncomeResult._sum.verifiedIncome?.toNumber() || 0;

          // Finalize the verification
          await prisma.incomeVerification.update({
            where: { id: existingRequest.verificationId },
            data: {
              status: 'FINALIZED',
              finalizedAt: now,
              calculatedVerifiedIncome: totalVerifiedIncome
            }
          });

          console.log(`🎉 Admin approval triggered complete lease finalization! Verification ${existingRequest.verificationId} finalized with total income: $${totalVerifiedIncome}`);
        }

      } catch (finalizationError) {
        console.error('Error auto-finalizing resident after validation exception approval:', finalizationError);
        // Note: We don't revert the override request here as the approval was successful
        // The finalization can be done manually if needed
      }
    }

    // Send automatic email notification to user
    const requester = updatedRequest.User_OverrideRequest_requesterIdToUser;
    const reviewer = updatedRequest.User_OverrideRequest_reviewerIdToUser;
    
    if (requester && reviewer) {
      try {
        const emailResult = await sendAdminDecisionNotification({
          adminName: reviewer.name || reviewer.email || 'Admin',
          userEmail: requester.email,
          userFirstName: requester.name?.split(' ')[0] || 'there',
          decision: action === 'approve' ? 'APPROVED' : 'DENIED',
          adminNotes: adminNotes.trim(),
          overrideRequestType: updatedRequest.type,
          propertyName: updatedRequest.Property?.name,
          unitNumber: updatedRequest.Unit?.unitNumber?.toString(),
          documentType: updatedRequest.IncomeDocument?.documentType,
          residentName: updatedRequest.Resident?.name
        });

        if (emailResult.success) {
          console.log(`[ADMIN DECISION] Successfully sent ${action === 'approve' ? 'approval' : 'denial'} notification email to ${requester.email}`);
        } else {
          console.warn(`[ADMIN DECISION] Failed to send notification email: ${emailResult.error}`);
        }
      } catch (emailError) {
        console.error('[ADMIN DECISION] Error sending notification email:', emailError);
        // Continue execution - don't fail the admin decision because of email issues
      }
    }

    return NextResponse.json({
      success: true,
      request: updatedRequest
    });

  } catch (error) {
    console.error('Error updating override request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 