import { prisma } from '@/lib/prisma';

/**
 * Check for unit count discrepancies and create discrepancy record if needed
 */
export async function checkUnitCountDiscrepancy(
  propertyId: string,
  actualUnitCount: number,
  rentRollId?: string
): Promise<{
  hasDiscrepancy: boolean;
  discrepancyId?: string;
  paymentDifference?: number;
  message?: string;
}> {
  try {
    // Get property with subscription info
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        PropertySubscription: true,
        UnitCountDiscrepancy: {
          where: { status: 'PENDING' },
          orderBy: { discoveredAt: 'desc' },
          take: 1
        }
      }
    });

    if (!property) {
      throw new Error('Property not found');
    }

    const declaredUnitCount = property.numberOfUnits;
    const subscription = property.PropertySubscription;

    // If no declared unit count or no subscription, no discrepancy to check
    if (!declaredUnitCount || !subscription) {
      return { hasDiscrepancy: false };
    }

    // If there's already a pending discrepancy, return it
    if (property.UnitCountDiscrepancy.length > 0) {
      const existingDiscrepancy = property.UnitCountDiscrepancy[0];
      return {
        hasDiscrepancy: true,
        discrepancyId: existingDiscrepancy.id,
        paymentDifference: Number(existingDiscrepancy.paymentDifference),
        message: `Existing unit count discrepancy: declared ${existingDiscrepancy.declaredUnitCount}, actual ${existingDiscrepancy.actualUnitCount}`
      };
    }

    // Check if actual count matches declared count
    if (actualUnitCount === declaredUnitCount) {
      return { hasDiscrepancy: false };
    }

    // We have a discrepancy - calculate payment difference
    const unitDifference = actualUnitCount - declaredUnitCount;
    
    // Only create discrepancy if actual count is HIGHER (underpayment)
    if (unitDifference <= 0) {
      return { hasDiscrepancy: false };
    }

    // Calculate payment difference based on setup type
    const setupType = subscription.setupType;
    const pricePerUnit = setupType === 'FULL_SERVICE' ? 10 : 2;
    const paymentDifference = unitDifference * pricePerUnit;

    // Create discrepancy record
    const discrepancy = await (prisma as any).unitCountDiscrepancy.create({
      data: {
        propertyId,
        declaredUnitCount,
        actualUnitCount,
        rentRollId,
        paymentDifference,
        setupType,
        status: 'PENDING',
      },
    });

    console.log(`🚨 Unit count discrepancy detected for property ${propertyId}:`, {
      declared: declaredUnitCount,
      actual: actualUnitCount,
      difference: unitDifference,
      paymentDifference,
      setupType
    });

    return {
      hasDiscrepancy: true,
      discrepancyId: discrepancy.id,
      paymentDifference,
      message: `Unit count discrepancy detected: declared ${declaredUnitCount}, actual ${actualUnitCount}. Additional payment of $${paymentDifference.toFixed(2)} required.`
    };

  } catch (error) {
    console.error('Error checking unit count discrepancy:', error);
    throw error;
  }
}

/**
 * Get unit count from rent roll data
 */
export function getUnitCountFromRentRollData(unitGroups: Record<string, any>): number {
  return Object.keys(unitGroups).length;
}

/**
 * Check if property has pending unit count discrepancy
 */
export async function hasUnitCountDiscrepancy(propertyId: string): Promise<boolean> {
  const discrepancy = await (prisma as any).unitCountDiscrepancy.findFirst({
    where: {
      propertyId,
      status: 'PENDING'
    }
  });

  return !!discrepancy;
}

/**
 * Resolve unit count discrepancy
 */
export async function resolveUnitCountDiscrepancy(
  discrepancyId: string,
  resolvedById: string,
  resolutionNotes?: string
): Promise<void> {
  await (prisma as any).unitCountDiscrepancy.update({
    where: { id: discrepancyId },
    data: {
      status: 'RESOLVED',
      resolvedAt: new Date(),
      resolvedById,
      resolutionNotes,
    },
  });
}

/**
 * Waive unit count discrepancy (admin decision)
 */
export async function waiveUnitCountDiscrepancy(
  discrepancyId: string,
  resolvedById: string,
  resolutionNotes?: string
): Promise<void> {
  await (prisma as any).unitCountDiscrepancy.update({
    where: { id: discrepancyId },
    data: {
      status: 'WAIVED',
      resolvedAt: new Date(),
      resolvedById,
      resolutionNotes,
    },
  });
}
