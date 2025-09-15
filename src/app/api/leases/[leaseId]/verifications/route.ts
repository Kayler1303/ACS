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
    
    // Debug Unit 310 lease specifically
    if (leaseId === 'f494ada1-b7c4-445b-98dd-2b9069e9bcbb') {
      console.log(`[UNIT 310 VERIFICATION DEBUG] Creating verification for Unit 310 lease`);
      console.log(`[UNIT 310 VERIFICATION DEBUG] Request body:`, body);
      console.log(`[UNIT 310 VERIFICATION DEBUG] User ID:`, session.user.id);
    }

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
      console.log(`[VERIFICATION] Lease ${leaseId} not found or access denied for user ${session.user.id}`);
      return NextResponse.json({ error: 'Lease not found or access denied' }, { status: 404 });
    }
    
    // Debug Unit 310 lease specifically
    if (leaseId === 'f494ada1-b7c4-445b-98dd-2b9069e9bcbb') {
      console.log(`[UNIT 310 VERIFICATION DEBUG] Lease found:`, {
        leaseId: lease.id,
        leaseName: lease.name,
        unitNumber: lease.Unit?.unitNumber,
        propertyId: lease.Unit?.Property?.id,
        propertyName: lease.Unit?.Property?.name
      });
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
    console.error('[VERIFICATION] Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    });
    return NextResponse.json(
      { error: 'Failed to create verification', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 