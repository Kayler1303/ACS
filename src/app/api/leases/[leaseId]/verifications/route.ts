import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leaseId } = await params;
    
    // Debug the request
    const contentType = request.headers.get('content-type');
    console.log(`[VERIFICATION] Content-Type: ${contentType}`);
    
    let body;
    try {
      const rawBody = await request.text();
      console.log(`[VERIFICATION] Raw body: "${rawBody}"`);
      
      if (!rawBody || rawBody.trim() === '') {
        console.log(`[VERIFICATION] Empty body received, using defaults`);
        body = {};
      } else {
        body = JSON.parse(rawBody);
      }
    } catch (parseError) {
      console.error(`[VERIFICATION] JSON parse error:`, parseError);
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }
    
    const { reason, verificationPeriodStart, verificationPeriodEnd, dueDate, leaseYear } = body;

    console.log(`[VERIFICATION] Creating new verification for lease ${leaseId}`);

    // Verify lease exists and user has access
    const lease = await prisma.lease.findFirst({
      where: { 
        id: leaseId,
        Unit: {
          Property: {
            OR: [
              { ownerId: session.user.id },
              { PropertyShare: { some: { userId: session.user.id } } }
            ]
          }
        }
      },
      include: {
        Unit: {
          include: {
            Property: true
          }
        }
      }
    });

    if (!lease) {
      return NextResponse.json({ error: 'Lease not found or access denied' }, { status: 404 });
    }

    // Create new income verification
    const now = new Date();
    const newVerification = await prisma.incomeVerification.create({
      data: {
        id: randomUUID(),
        leaseId,
        status: 'IN_PROGRESS',
        reason: reason || 'ANNUAL_RECERTIFICATION',
        verificationPeriodStart: verificationPeriodStart ? new Date(verificationPeriodStart) : null,
        verificationPeriodEnd: verificationPeriodEnd ? new Date(verificationPeriodEnd) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        leaseYear: leaseYear || null,
        createdAt: now,
        updatedAt: now,
      }
    });

    console.log(`[VERIFICATION] Created new verification ${newVerification.id} for lease ${leaseId}`);

    return NextResponse.json({ 
      success: true, 
      verificationId: newVerification.id 
    });

  } catch (error) {
    console.error('[VERIFICATION] Error creating verification:', error);
    return NextResponse.json(
      { error: 'Failed to create verification' },
      { status: 500 }
    );
  }
} 