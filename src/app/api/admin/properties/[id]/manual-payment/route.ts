import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/admin/properties/[id]/manual-payment - Record a manual payment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id: propertyId } = await params;
    const {
      paymentMethod,
      paymentType,
      amount,
      referenceNumber,
      notes,
      paidDate,
      periodStart,
      periodEnd,
    } = await request.json();

    if (!paymentMethod || !paymentType || !amount || !paidDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify property exists
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        PropertySubscription: true
      }
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    // Create or update property subscription if it doesn't exist
    let subscription = property.PropertySubscription;
    if (!subscription) {
      subscription = await (prisma as any).propertySubscription.create({
        data: {
          propertyId,
          setupType: 'PENDING',
          subscriptionStatus: 'INACTIVE',
          isManualPayment: true,
        },
      });
    }

    // Record the manual payment
    const manualPayment = await (prisma as any).manualPayment.create({
      data: {
        propertySubscriptionId: subscription.id,
        paymentMethod,
        paymentType,
        amount,
        referenceNumber,
        notes,
        paidDate: new Date(paidDate),
        periodStart: periodStart ? new Date(periodStart) : null,
        periodEnd: periodEnd ? new Date(periodEnd) : null,
        recordedById: session.user.id,
      },
    });

    // Create corresponding transaction record
    await (prisma as any).paymentTransaction.create({
      data: {
        propertySubscriptionId: subscription.id,
        amount,
        transactionType: paymentType === 'SETUP_FEE' ? 'MANUAL_SETUP_FEE' : 'MANUAL_PAYMENT',
        status: 'SUCCEEDED',
        description: `Manual ${paymentType.toLowerCase().replace('_', ' ')} - ${paymentMethod}`,
        metadata: {
          paymentMethod,
          referenceNumber,
          recordedBy: session.user.id,
        },
      },
    });

    // Update subscription based on payment type
    const updateData: any = {
      isManualPayment: true,
      updatedAt: new Date(),
    };

    if (paymentType === 'SETUP_FEE') {
      updateData.setupFeePaid = true;
      updateData.setupFeeAmount = amount;
    }

    if (paymentType === 'MONTHLY_PAYMENT') {
      updateData.subscriptionStatus = 'ACTIVE';
      updateData.currentPeriodStart = periodStart ? new Date(periodStart) : new Date();
      updateData.currentPeriodEnd = periodEnd ? new Date(periodEnd) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
      
      // Calculate next payment due (end of current period + 1 day)
      const nextDue = periodEnd ? new Date(periodEnd) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      nextDue.setDate(nextDue.getDate() + 1);
      updateData.nextPaymentDue = nextDue;
    }

    await (prisma as any).propertySubscription.update({
      where: { id: subscription.id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      payment: manualPayment,
    });

  } catch (error) {
    console.error('Error recording manual payment:', error);
    return NextResponse.json(
      { error: 'Failed to record manual payment' },
      { status: 500 }
    );
  }
}
