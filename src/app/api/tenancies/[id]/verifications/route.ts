import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import crypto from 'crypto';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id: tenancyId } = await params;
  if (!tenancyId) {
    return NextResponse.json({ error: 'Tenancy ID is required' }, { status: 400 });
  }

  try {
    // Verify that the tenancy belongs to the current user
    const tenancy = await prisma.tenancy.findFirst({
      where: {
        id: tenancyId,
        Lease: {
          Unit: {
            Property: {
              ownerId: session.user.id
            }
          }
        }
      }
    });

    if (!tenancy) {
      return NextResponse.json({ error: 'Tenancy not found or access denied' }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Find the current in-progress verification for the tenancy
      const currentVerification = await tx.incomeVerification.findFirst({
        where: {
          leaseId: tenancy.leaseId,
          status: 'IN_PROGRESS',
        },
      });

      // 2. If one exists, finalize it
      if (currentVerification) {
        await tx.incomeVerification.update({
          where: { id: currentVerification.id },
          data: {
            status: 'FINALIZED',
            finalizedAt: new Date(),
          },
        });
      }

      // 3. Calculate verification period based on current lease
      const now = new Date();
      const leaseStart = new Date((tenancy as any).leaseStartDate || new Date());
      const leaseEnd = new Date((tenancy as any).leaseEndDate || new Date());
      
      // Calculate which lease year we're in
      const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
      const timeSinceLeaseStart = now.getTime() - leaseStart.getTime();
      const leaseYear = Math.ceil(timeSinceLeaseStart / msPerYear);
      
      // For annual recertification, verification period is typically the upcoming lease year
      const verificationPeriodStart = new Date(leaseStart);
      verificationPeriodStart.setFullYear(leaseStart.getFullYear() + (leaseYear - 1));
      
      const verificationPeriodEnd = new Date(verificationPeriodStart);
      verificationPeriodEnd.setFullYear(verificationPeriodStart.getFullYear() + 1);
      verificationPeriodEnd.setDate(verificationPeriodEnd.getDate() - 1); // End day before next period starts
      
      // Due date: 60 days before verification period starts (giving time to complete)
      const dueDate = new Date(verificationPeriodStart);
      dueDate.setDate(dueDate.getDate() - 60);
      
      // If due date is in the past, make it 30 days from now
      if (dueDate < now) {
        dueDate.setTime(now.getTime() + (30 * 24 * 60 * 60 * 1000));
      }

      // 4. Create a new in-progress verification
      const newVerification = await tx.incomeVerification.create({
        data: {
          id: crypto.randomUUID(),
          leaseId: tenancy.leaseId,
          status: 'IN_PROGRESS',
          reason: 'ANNUAL_RECERTIFICATION',
          verificationPeriodStart,
          verificationPeriodEnd,
          dueDate,
          leaseYear,
          associatedLeaseStart: (tenancy as any).leaseStartDate || null,
          associatedLeaseEnd: (tenancy as any).leaseEndDate || null,
          updatedAt: new Date(),
        },
      });

      return newVerification;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to create new verification period:', error);
    return NextResponse.json({ error: 'Failed to start a new verification period.' }, { status: 500 });
  }
} 

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: tenancyId } = await params;
    const { action, verificationId, calculatedVerifiedIncome } = await request.json();

    if (action !== 'finalize') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (!verificationId) {
      return NextResponse.json({ error: 'Verification ID is required' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx: any) => {
      // 1. Verify the tenancy belongs to the user
      const tenancy = await tx.tenancy.findFirst({
        where: {
          id: tenancyId,
          unit: {
            property: {
              ownerId: session.user.id
            }
          }
        }
      });

      if (!tenancy) {
        throw new Error('Tenancy not found or unauthorized');
      }

      // 2. Get the verification to finalize
      const verification = await tx.incomeVerification.findFirst({
        where: {
          id: verificationId,
          leaseId: tenancy.leaseId,
          status: 'IN_PROGRESS'
        },
        include: {
          IncomeDocument: true
        }
      });

      if (!verification) {
        throw new Error('Verification not found or not in progress');
      }

      // 3. Calculate verified income if not provided
      let finalVerifiedIncome = calculatedVerifiedIncome;
      if (!finalVerifiedIncome) {
        // Sum up all completed W2 wages from this verification
        finalVerifiedIncome = verification.IncomeDocument
          .filter((doc: any) => doc.status === 'COMPLETED' && doc.box1_wages)
          .reduce((sum: number, doc: any) => sum + (doc.box1_wages || 0), 0);
      }

      // 4. Update verification status to FINALIZED
      const finalizedVerification = await tx.incomeVerification.update({
        where: { id: verificationId },
        data: {
          status: 'FINALIZED',
          finalizedAt: new Date(),
          calculatedVerifiedIncome: finalVerifiedIncome
        },
        include: {
          incomeDocuments: {
            include: {
              resident: true
            }
          },
          lease: {
            include: {
              residents: true,
              unit: true
            }
          }
        }
      });

      // 5. Update residents' verified income
      // Group documents by resident and sum their income
      const residentIncomeMap = new Map<string, number>();
      
      verification.IncomeDocument
        .filter((doc: any) => doc.status === 'COMPLETED' && doc.box1_wages && doc.residentId)
        .forEach((doc: any) => {
          const currentSum = residentIncomeMap.get(doc.residentId!) || 0;
          residentIncomeMap.set(doc.residentId!, currentSum + (doc.box1_wages || 0));
        });

      // Update each resident's verified income
      for (const [residentId, verifiedIncome] of residentIncomeMap) {
        await tx.resident.update({
          where: { id: residentId },
          data: { verifiedIncome: verifiedIncome }
        });
      }

      return finalizedVerification;
    });

    return NextResponse.json({ 
      success: true, 
      verification: result,
      message: 'Verification finalized successfully'
    });

  } catch (error: any) {
    console.error('Failed to finalize verification:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to finalize verification' },
      { status: 500 }
    );
  }
} 