import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ leaseId: string; residentId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leaseId, residentId } = await params;
    const { verifiedIncome } = await request.json();

    // Verify that the user owns this property through the lease
    const lease = await prisma.lease.findUnique({
      where: { id: leaseId },
      include: {
        Unit: {
          include: {
            Property: true
          }
        },
        Resident: true
      }
    });

    if (!lease || lease.Unit?.Property?.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify that the resident belongs to this lease
    const resident = lease.Resident.find(r => r.id === residentId);
    if (!resident) {
      return NextResponse.json({ error: 'Resident not found in this lease' }, { status: 404 });
    }

    // Update the specific resident's annualizedIncome to match the verified income AND finalize them
    // This ensures that future rent roll uploads will match and the resident is finalized
    await prisma.resident.update({
      where: { id: residentId },
      data: {
        annualizedIncome: verifiedIncome,
        verifiedIncome: verifiedIncome,
        incomeFinalized: true,
        finalizedAt: new Date()
      }
    });

    console.log(`[ACCEPT VERIFIED INCOME] Updated and finalized resident ${residentId} in lease ${leaseId} - annualizedIncome set to: $${verifiedIncome}`);

    // Check if all residents in the lease are now finalized
    const allResidents = lease.Resident;
    const finalizedResidents = allResidents.filter(r => r.id === residentId || r.incomeFinalized);
    
    if (finalizedResidents.length === allResidents.length) {
      console.log(`[ACCEPT VERIFIED INCOME] All residents in lease ${leaseId} are now finalized, finalizing verification`);
      
      // Find the active verification for this lease
      const activeVerification = await prisma.incomeVerification.findFirst({
        where: {
          leaseId: leaseId,
          status: 'IN_PROGRESS'
        }
      });

      if (activeVerification) {
        // Calculate total verified income from all finalized residents
        const totalVerifiedIncome = allResidents.reduce((sum, resident) => {
          const residentIncome = resident.id === residentId ? verifiedIncome : (resident.calculatedAnnualizedIncome || 0);
          return sum + Number(residentIncome);
        }, 0);

        // Finalize the verification
        await prisma.incomeVerification.update({
          where: { id: activeVerification.id },
          data: {
            status: 'FINALIZED',
            finalizedAt: new Date(),
            calculatedVerifiedIncome: totalVerifiedIncome
          }
        });

        console.log(`[ACCEPT VERIFIED INCOME] Finalized verification ${activeVerification.id} with total income: $${totalVerifiedIncome}`);
      }
    }

    return NextResponse.json({ 
      message: 'Individual resident verified income accepted successfully',
      residentId: residentId,
      updatedIncome: verifiedIncome
    }, { status: 200 });
  } catch (error) {
    console.error('Error accepting individual resident verified income:', error);
    return NextResponse.json({ error: 'Failed to accept verified income.' }, { status: 500 });
  }
} 