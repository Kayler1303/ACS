import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';

interface CreateAutoOverrideParams {
  type: 'INCOME_DISCREPANCY' | 'DOCUMENT_REVIEW';
  unitId?: string;
  residentId?: string;
  verificationId?: string;
  documentId?: string;
  userId: string;
  systemExplanation: string;
}

/**
 * Automatically create override requests for system-detected issues
 * This is called when the system detects discrepancies or review needs
 */
export async function createAutoOverrideRequest(params: CreateAutoOverrideParams) {
  const {
    type,
    unitId,
    residentId,
    verificationId,
    documentId,
    userId,
    systemExplanation
  } = params;

  try {
    // Check if a similar override request already exists and is pending
    const existingRequest = await (prisma as any).overrideRequest.findFirst({
      where: {
        type,
        status: 'PENDING',
        unitId: unitId || null,
        residentId: residentId || null,
        verificationId: verificationId || null,
        documentId: documentId || null,
      }
    });

    // Don't create duplicate requests
    if (existingRequest) {
      console.log(`Auto-override request already exists for ${type}:`, existingRequest.id);
      return existingRequest;
    }

    console.log(`Creating auto-override request for ${type}:`, {
      unitId,
      residentId,
      verificationId,
      documentId,
      systemExplanation
    });

    const overrideRequest = await (prisma as any).overrideRequest.create({
      data: {
        id: randomUUID(),
        type,
        userExplanation: systemExplanation,
        unitId: unitId || null,
        residentId: residentId || null,
        verificationId: verificationId || null,
        documentId: documentId || null,
        requesterId: userId,
        status: 'PENDING',
        updatedAt: new Date()
      },
      include: { 
        requester: { 
          select: { id: true, name: true, email: true, company: true } 
        } 
      }
    });

    console.log(`Auto-override request created:`, overrideRequest.id);
    return overrideRequest;

  } catch (error) {
    console.error('Error creating auto-override request:', error);
    throw error;
  }
} 