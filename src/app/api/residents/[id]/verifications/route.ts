import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const residentId = params.id;
  if (!residentId) {
    return NextResponse.json({ error: 'Resident ID is required' }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Find the current in-progress verification for the resident
      const currentVerification = await tx.incomeVerification.findFirst({
        where: {
          residentId,
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

      // 3. Create a new in-progress verification
      const newVerification = await tx.incomeVerification.create({
        data: {
          residentId,
          status: 'IN_PROGRESS',
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