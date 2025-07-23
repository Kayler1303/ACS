import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { leaseId, tenancyId } = await req.json();

  if (!leaseId || !tenancyId) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 }
    );
  }

  try {
    const updatedTenancy = await prisma.tenancy.update({
      where: {
        id: tenancyId,
      },
      data: {
        leaseId: leaseId,
      },
    });

    return NextResponse.json(updatedTenancy, { status: 200 });
  } catch (error) {
    console.error('Error reconciling tenancy:', error);
    return NextResponse.json(
      { error: 'Failed to reconcile tenancy' },
      { status: 500 }
    );
  }
}
