import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leaseId } = await params;
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

    // Calculate and update individual resident incomes based on their actual documents
    // This is much more accurate than the previous "dump everything on first resident" approach
    const residents = lease.Resident;
    if (residents.length === 0) {
      return NextResponse.json({ error: 'No residents found in this lease' }, { status: 400 });
    }

    console.log(`[ACCEPT VERIFIED INCOME] Processing ${residents.length} residents individually...`);

    // Process each resident individually based on their own documents
    for (const resident of residents) {
      // Get the resident's documents
      const residentDocuments = await prisma.incomeDocument.findMany({
        where: {
          residentId: resident.id,
          status: { in: ['COMPLETED', 'NEEDS_REVIEW'] }
        }
      });

      // Calculate this resident's individual income from their documents
      let residentCalculatedIncome = 0;
      
      // Separate documents by type
      const paystubs = residentDocuments.filter(doc => doc.documentType === 'PAYSTUB');
      const w2s = residentDocuments.filter(doc => doc.documentType === 'W2');
      
      // Calculate paystub income using average method
      if (paystubs.length > 0) {
        const validPaystubs = paystubs.filter(p => p.grossPayAmount && Number(p.grossPayAmount) > 0);
        if (validPaystubs.length > 0) {
          const totalGrossPay = validPaystubs.reduce((acc, p) => acc + Number(p.grossPayAmount || 0), 0);
          const averageGrossPay = totalGrossPay / validPaystubs.length;
          const payFrequency = validPaystubs[0]?.payFrequency || 'BI-WEEKLY';
          
          const frequencyMultipliers: { [key: string]: number } = {
            'WEEKLY': 52,
            'BI-WEEKLY': 26,
            'SEMI-MONTHLY': 24,
            'MONTHLY': 12
          };
          
          const multiplier = frequencyMultipliers[payFrequency] || 26;
          residentCalculatedIncome += averageGrossPay * multiplier;
          
          console.log(`[ACCEPT VERIFIED INCOME] ${resident.name}: ${validPaystubs.length} paystubs, avg $${averageGrossPay.toFixed(2)} ${payFrequency}, annual: $${(averageGrossPay * multiplier).toFixed(2)}`);
        }
      }
      
      // Add W2 income (highest of boxes 1, 3, 5)
      w2s.forEach(w2 => {
        const box1 = Number(w2.box1_wages || 0);
        const box3 = Number(w2.box3_ss_wages || 0);
        const box5 = Number(w2.box5_med_wages || 0);
        const highestAmount = Math.max(box1, box3, box5);
        residentCalculatedIncome += highestAmount;
        
        if (highestAmount > 0) {
          console.log(`[ACCEPT VERIFIED INCOME] ${resident.name}: W2 highest amount $${highestAmount.toFixed(2)}`);
        }
      });

      // Update the resident's annualizedIncome to match their individual calculated income
      // This ensures future rent roll uploads will match their actual verified income
      await prisma.resident.update({
        where: { id: resident.id },
        data: {
          annualizedIncome: residentCalculatedIncome,
          incomeFinalized: true,
          finalizedAt: new Date(),
          calculatedAnnualizedIncome: residentCalculatedIncome,
          verifiedIncome: residentCalculatedIncome
        }
      });

      console.log(`[ACCEPT VERIFIED INCOME] Updated ${resident.name}: $${residentCalculatedIncome.toFixed(2)}`);
    }

    // Calculate the total verified income from all residents
    const totalVerifiedIncome = residents.reduce((total, resident) => {
      // Get the updated resident data to calculate total
      return total + Number(resident.calculatedAnnualizedIncome || 0);
    }, 0);

    // Check if there's an active verification for this lease that should be finalized
    const activeVerification = await prisma.incomeVerification.findFirst({
      where: {
        leaseId: leaseId,
        status: 'IN_PROGRESS'
      }
    });

    // If there's an active verification and all residents are now finalized, finalize the verification
    if (activeVerification) {
      // Recalculate total from database to ensure accuracy
      const totalVerifiedIncomeResult = await prisma.resident.aggregate({
        where: {
          leaseId: leaseId,
          incomeFinalized: true
        },
        _sum: {
          calculatedAnnualizedIncome: true
        }
      });
      
      const accurateTotalVerifiedIncome = totalVerifiedIncomeResult._sum.calculatedAnnualizedIncome?.toNumber() || 0;

      await prisma.incomeVerification.update({
        where: { id: activeVerification.id },
        data: {
          status: 'FINALIZED',
          finalizedAt: new Date(),
          calculatedVerifiedIncome: accurateTotalVerifiedIncome
        }
      });
      console.log(`[ACCEPT VERIFIED INCOME] Finalized verification ${activeVerification.id} with accurate total verified income: $${accurateTotalVerifiedIncome.toFixed(2)}`);
    }

    console.log(`[ACCEPT VERIFIED INCOME] Successfully updated ${residents.length} residents with their individual calculated incomes`);

    return NextResponse.json({ 
      message: 'Individual resident incomes calculated and accepted successfully',
      updatedResidents: residents.length,
      verificationFinalized: activeVerification ? true : false
    }, { status: 200 });
  } catch (error) {
    console.error('Error accepting verified income:', error);
    return NextResponse.json({ error: 'Failed to accept verified income.' }, { status: 500 });
  }
} 