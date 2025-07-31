import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { leaseId: string; verificationId: string; residentId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leaseId, verificationId, residentId } = params;

    // Verify the user owns this property
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
            residents: true
          }
        }
      }
    });

    if (!verification) {
      return NextResponse.json({ error: 'Verification not found' }, { status: 404 });
    }

    // Find the resident
    const resident = verification.lease.residents.find(r => r.id === residentId);
    if (!resident) {
      return NextResponse.json({ error: 'Resident not found in this lease' }, { status: 404 });
    }

    // Mark resident as having no income and finalize them
    await prisma.$executeRaw`
      UPDATE "Resident" 
      SET 
        "hasNoIncome" = true,
        "incomeFinalized" = true,
        "finalizedAt" = NOW(),
        "calculatedAnnualizedIncome" = 0::numeric,
        "verifiedIncome" = 0::numeric
      WHERE "id" = ${residentId}
    `;

    // Check if all residents in the lease are now finalized
    const allResidents = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*) as count 
      FROM "Resident" 
      WHERE "leaseId" = ${leaseId} AND "incomeFinalized" = true
    `;

    const totalResidents = verification.lease.residents.length;
    const finalizedCount = Number(allResidents[0]?.count || 0);

    if (finalizedCount === totalResidents) {
      // All residents are finalized, finalize the verification
      // Calculate total verified income using raw SQL
      const totalIncomeResult = await prisma.$queryRaw<Array<{ total: number }>>`
        SELECT COALESCE(SUM("annualizedIncome"), 0) as total
        FROM "Resident"
        WHERE "leaseId" = ${leaseId} AND "incomeFinalized" = true
      `;
      const totalVerifiedIncome = Number(totalIncomeResult[0]?.total || 0);

      await prisma.incomeVerification.update({
        where: { id: verificationId },
        data: {
          status: 'FINALIZED',
          finalizedAt: new Date(),
          calculatedVerifiedIncome: totalVerifiedIncome
        }
      });
    }

    return NextResponse.json({ 
      success: true, 
      message: `${resident.name} marked as having no income and finalized` 
    });

  } catch (error) {
    console.error('Error marking resident as no income:', error);
    return NextResponse.json(
      { error: 'Failed to update resident status' },
      { status: 500 }
    );
  }
} 