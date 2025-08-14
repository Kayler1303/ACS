import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';
import { DocumentStatus } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      type,
      userExplanation,
      unitId,
      residentId,
      verificationId,
      documentId,
      leaseId
    } = await request.json();

    // Validate required fields
    if (!type || !userExplanation) {
      return NextResponse.json({ error: 'Type and explanation are required' }, { status: 400 });
    }

    if (!['VALIDATION_EXCEPTION', 'INCOME_DISCREPANCY', 'DOCUMENT_REVIEW', 'DUPLICATE_DOCUMENT'].includes(type)) {
      return NextResponse.json({ error: 'Invalid override request type' }, { status: 400 });
    }

    if (userExplanation.trim().length < 20) {
      return NextResponse.json({ error: 'Explanation must be at least 20 characters' }, { status: 400 });
    }

    // Extract unitId from leaseId if not provided directly
    let finalUnitId = unitId;
    if (!finalUnitId && leaseId) {
      try {
        const lease = await prisma.lease.findUnique({
          where: { id: leaseId },
          select: { unitId: true }
        });
        finalUnitId = lease?.unitId || null;
      } catch (error) {
        console.warn('Could not extract unitId from leaseId:', error);
      }
    }

    // Try to determine propertyId for easier triage by admins
    let propertyId: string | null = null;
    try {
      if (verificationId) {
        const verification = await prisma.incomeVerification.findUnique({
          where: { id: verificationId },
          select: { Lease: { select: { Unit: { select: { propertyId: true } } } } }
        });
        propertyId = verification?.Lease?.Unit?.propertyId || null;
      } else if (finalUnitId) {
        const unit = await prisma.unit.findUnique({ where: { id: finalUnitId }, select: { propertyId: true } });
        propertyId = unit?.propertyId || null;
      } else if (documentId) {
        const doc = await prisma.incomeDocument.findUnique({
          where: { id: documentId },
          select: { IncomeVerification: { select: { Lease: { select: { Unit: { select: { propertyId: true } } } } } } }
        });
        propertyId = doc?.IncomeVerification?.Lease?.Unit?.propertyId || null;
      }
    } catch (e) {
      console.warn('Could not resolve propertyId for override request');
    }

    // Create the override request
    const overrideRequest = await (prisma as any).overrideRequest.create({
      data: {
        id: randomUUID(),
        type,
        userExplanation: userExplanation.trim(),
        unitId: finalUnitId || null,
        residentId: residentId || null,
        verificationId: verificationId || null,
        documentId: documentId || null,
        requesterId: session.user.id,
        status: 'PENDING',
        updatedAt: new Date(),
        propertyId: propertyId || undefined
      },
      include: {
        User_OverrideRequest_requesterIdToUser: {
          select: {
            id: true,
            name: true,
            email: true,
            company: true,
          }
        }
      }
    });

    // If the request is for a specific document review, mark the document as NEEDS_REVIEW
    if (type === 'DOCUMENT_REVIEW' && documentId) {
      try {
        await prisma.incomeDocument.update({
          where: { id: documentId },
          data: { status: DocumentStatus.NEEDS_REVIEW }
        });
      } catch (e) {
        console.warn('Failed to set document to NEEDS_REVIEW for user-initiated review', e);
      }
    }

    // TODO: In the future, we might want to:
    // 1. Send email notification to admins about the new request
    // 2. Create audit log entry
    // 3. Check for duplicate requests

    return NextResponse.json({
      success: true,
      request: overrideRequest
    });

  } catch (error) {
    console.error('Error creating override request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 